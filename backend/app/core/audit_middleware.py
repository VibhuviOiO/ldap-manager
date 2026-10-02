"""
Audit middleware: one place that sees every mutating request.

Recording centrally means a new write endpoint cannot be added without being
audited, which per-handler calls cannot guarantee. The actor comes from the same
identity resolution the routes use, and the request body is teed rather than
consumed.

Written as raw ASGI on purpose: BaseHTTPMiddleware runs the app behind its own
receive channel, so wrapping `request._receive` there never sees the body and
can corrupt it. Here the `receive` callable handed to the app is wrapped
directly.
"""

import json
import logging
from typing import Any, Dict, Optional, Tuple

from starlette.requests import Request

from app.core import audit

logger = logging.getLogger(__name__)

# (method, exact path) -> action
ROUTES: Tuple[Tuple[str, str, str], ...] = (
    ("POST", "/api/entries/create", "entry.create"),
    ("PUT", "/api/entries/update", "entry.update"),
    ("DELETE", "/api/entries/delete", "entry.delete"),
    ("POST", "/api/entries/bulk/update", "entry.bulk_update"),
    ("POST", "/api/entries/bulk/group", "entry.group_add"),
    ("POST", "/api/entries/bulk/delete", "entry.bulk_delete"),
    ("POST", "/api/ldif/import", "ldif.apply"),
    ("POST", "/api/auth/login", "auth.login"),
    ("POST", "/api/auth/setup", "auth.setup"),
    ("POST", "/api/auth/logout", "auth.logout"),
)

# (method, path prefix) -> action
PREFIX_ROUTES: Tuple[Tuple[str, str, str], ...] = (
    ("POST", "/api/schema/", "schema.add"),
    ("DELETE", "/api/schema/", "schema.remove"),
    ("POST", "/api/aci/", "aci.add"),
    ("DELETE", "/api/aci/", "aci.remove"),
)


def _match(method: str, path: str) -> Optional[str]:
    cleaned = path.rstrip("/")
    for verb, exact, action in ROUTES:
        if method == verb and cleaned == exact:
            return action
    for verb, prefix, action in PREFIX_ROUTES:
        if method == verb and path.startswith(prefix):
            if "definitions" in path:
                return f"{action}_definition"
            return action
    return None


class AuditMiddleware:
    """Pure ASGI middleware so the request body can be teed safely."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            return await self.app(scope, receive, send)

        action = _match(scope.get("method", ""), scope.get("path", ""))
        if action is None:
            return await self.app(scope, receive, send)

        chunks: list[bytes] = []

        async def receive_wrapper():
            message = await receive()
            if message.get("type") == "http.request":
                chunk = message.get("body", b"")
                if chunk:
                    chunks.append(chunk)
            return message

        status = {"code": 500}

        async def send_wrapper(message):
            if message.get("type") == "http.response.start":
                status["code"] = message.get("status", 500)
            await send(message)

        try:
            await self.app(scope, receive_wrapper, send_wrapper)
        finally:
            try:
                self._record(scope, action, b"".join(chunks), status["code"])
            except Exception as exc:  # noqa: BLE001 - never break the request
                logger.warning("audit middleware failed for %s: %s", action, exc)

    @staticmethod
    def _record(scope: Dict[str, Any], action: str, body: bytes, status_code: int) -> None:
        from app.core.rbac import resolve_identity

        payload: Dict[str, Any] = {}
        if body:
            try:
                parsed = json.loads(body)
                if isinstance(parsed, dict):
                    payload = parsed
            except (json.JSONDecodeError, UnicodeDecodeError):
                payload = {}

        # A dry run changes nothing, so it is not an audit event.
        if action == "ldif.apply" and payload.get("dry_run"):
            return

        request = Request(scope)
        params = request.query_params
        cluster = (
            payload.get("cluster_name")
            or params.get("cluster")
            or params.get("cluster_name")
        )

        # Name the target where one is available, without storing whole payloads.
        target = params.get("dn") or payload.get("dn") or payload.get("group_dn")
        if not target and isinstance(payload.get("ldif"), str):
            # The DNs live inside the LDIF text, not in a field.
            dns = [
                line.split(":", 1)[1].strip()
                for line in payload["ldif"].splitlines()
                if line.lower().startswith("dn:")
            ]
            if len(dns) == 1:
                target = dns[0]
            elif dns:
                target = f"{len(dns)} records" 
        if not target and isinstance(payload.get("dns"), list):
            dns = payload["dns"]
            target = dns[0] if len(dns) == 1 else f"{len(dns)} entries"
        if not target and payload.get("name"):
            target = str(payload["name"])
        if not target and payload.get("username"):
            target = str(payload["username"])

        detail: Dict[str, Any] = {}
        for key in ("added", "modified", "deleted", "kind", "schema_name", "index", "rule"):
            if key in payload:
                detail[key] = payload[key]

        audit.record(
            resolve_identity(request),
            action,
            cluster=cluster,
            target=target,
            result="ok" if status_code < 400 else f"error {status_code}",
            detail=detail,
        )
