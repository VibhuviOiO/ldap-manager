"""
Dashboard summary.

One request that describes every cluster, so the home page does not fan out to
N clusters from the browser. Counts come from lightweight LDAP searches run in
parallel, with a short deadline: a slow or unreachable cluster must not hold up
the page, it just reports itself as such.
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

import ldap
from fastapi import APIRouter, Depends

from app.core.config import load_config
from app.core.credentials import resolve_password
from app.core.ldap_client import LDAPClient, LDAPConfig, tls_kwargs
from app.core.node_selector import NodeSelector, OperationType
from app.core.rbac import require_readonly

router = APIRouter()
logger = logging.getLogger(__name__)

# Short cache: the home page is the most-hit screen, and these counts move
# slowly. Keeps a page refresh from turning into a burst of LDAP searches.
CACHE_TTL_SECONDS = 10
_PER_CLUSTER_DEADLINE = 6.0
_cache: Dict[str, Any] = {"at": 0.0, "payload": None}


def _counts(cluster_config) -> Dict[str, int]:
    password = resolve_password(cluster_config)
    if not password:
        raise PermissionError("password not configured")

    host, port = NodeSelector.select_node(cluster_config, OperationType.READ)
    client = LDAPClient(
        LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or "",
            **tls_kwargs(cluster_config),
        )
    )
    client.connect()
    try:
        base = client.config.base_dn
        total = client.get_entry_count(base)
        users = client.get_entry_count(base, "(objectClass=inetOrgPerson)")
        groups = client.get_entry_count(
            base,
            "(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)(objectClass=posixGroup))",
        )
        ous = client.get_entry_count(base, "(objectClass=organizationalUnit)")
    finally:
        client.disconnect()

    return {
        "total": total,
        "users": users,
        "groups": groups,
        "ous": ous,
        # base DN, admin entry, service accounts, etc.
        "other": max(0, total - users - groups - ous),
    }


def _describe(cluster_config) -> Dict[str, Any]:
    """Never raises: every failure becomes a status the UI can render."""
    entry: Dict[str, Any] = {
        "name": cluster_config.name,
        "description": cluster_config.description or "",
        "host": cluster_config.host,
        "port": cluster_config.port,
        "nodes": len(cluster_config.nodes or []),
        "readonly": bool(cluster_config.readonly),
        "tls_mode": getattr(cluster_config, "tls_mode", "none"),
        "replicated": len(cluster_config.nodes or []) > 1,
        "status": "ok",
        "total": 0,
        "users": 0,
        "groups": 0,
        "ous": 0,
        "other": 0,
    }

    if not resolve_password(cluster_config):
        entry["status"] = "password_required"
        return entry

    try:
        entry.update(_counts(cluster_config))
    except PermissionError:
        entry["status"] = "password_required"
    except Exception as exc:  # noqa: BLE001 - the dashboard must always render
        entry["status"] = "unreachable"
        entry["error"] = str(exc)[:200]
        logger.info("dashboard: cluster %s unavailable: %s", cluster_config.name, exc)
    return entry


@router.get("/summary", dependencies=[Depends(require_readonly)])
async def dashboard_summary(refresh: bool = False) -> Dict[str, Any]:
    """Counts per cluster plus totals, cached briefly."""
    now = time.time()
    if not refresh and _cache["payload"] and (now - _cache["at"]) < CACHE_TTL_SECONDS:
        return {**_cache["payload"], "cached": True}

    clusters = load_config()
    if not clusters:
        return {"clusters": [], "totals": _totals([]), "cached": False}

    described: List[Dict[str, Any]] = []
    # Parallel, because these are independent network round-trips.
    with ThreadPoolExecutor(max_workers=min(8, len(clusters))) as pool:
        futures = {pool.submit(_describe, c): c for c in clusters}
        for future, cluster_config in futures.items():
            try:
                described.append(future.result(timeout=_PER_CLUSTER_DEADLINE))
            except Exception:  # noqa: BLE001 - a timeout is just another status
                described.append(
                    {
                        "name": cluster_config.name,
                        "description": cluster_config.description or "",
                        "host": cluster_config.host,
                        "port": cluster_config.port,
                        "nodes": len(cluster_config.nodes or []),
                        "readonly": bool(cluster_config.readonly),
                        "tls_mode": getattr(cluster_config, "tls_mode", "none"),
                        "replicated": len(cluster_config.nodes or []) > 1,
                        "status": "slow",
                        "total": 0, "users": 0, "groups": 0, "ous": 0, "other": 0,
                    }
                )

    # Healthy clusters first, then by size, so the page opens on what matters.
    described.sort(key=lambda c: (c["status"] != "ok", -c["total"], c["name"].lower()))

    payload = {"clusters": described, "totals": _totals(described), "cached": False}
    _cache["at"] = time.time()
    _cache["payload"] = payload
    return payload


def _totals(clusters: List[Dict[str, Any]]) -> Dict[str, int]:
    def total(key: str) -> int:
        return sum(int(c.get(key) or 0) for c in clusters)

    return {
        "clusters": len(clusters),
        "healthy": sum(1 for c in clusters if c.get("status") == "ok"),
        "needs_attention": sum(1 for c in clusters if c.get("status") != "ok"),
        "readonly": sum(1 for c in clusters if c.get("readonly")),
        "replicated": sum(1 for c in clusters if c.get("replicated")),
        "entries": total("total"),
        "users": total("users"),
        "groups": total("groups"),
        "ous": total("ous"),
    }
