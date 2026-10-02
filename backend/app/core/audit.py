"""
Application-level audit log.

Who changed what, when - recorded at the point of the change, where the
authenticated identity is known. This is deliberately NOT a scrape of the
container's slapd log (that has no notion of the LDAP Manager user) and not the
aggregate counters in cn=Monitor.

Storage is append-only JSON Lines under the writable data directory, so it
survives restarts and can be shipped to a log pipeline by tailing the file.
"""

import json
import logging
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_lock = threading.Lock()

# Bounded so a long-lived instance cannot grow the log without limit.
DEFAULT_READ_LIMIT = 200
MAX_READ_LIMIT = 2000


def audit_path() -> Path:
    """Resolved per call so tests (and a relocated data dir) take effect."""
    override = os.getenv("LDAP_MANAGER_AUDIT_LOG")
    if override:
        return Path(override)
    from app.core import config as config_module

    return Path(config_module.DATA_DIR) / "audit.log"


def record(
    actor: Any,
    action: str,
    *,
    cluster: Optional[str] = None,
    target: Optional[str] = None,
    result: str = "ok",
    detail: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Append one audit entry. Never raises: auditing must not break the operation
    it is describing.
    """
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "actor": getattr(actor, "subject", None) or "system",
        "role": getattr(getattr(actor, "role", None), "value", None) or "system",
        "authenticated": bool(getattr(actor, "authenticated", False)),
        "action": action,
        "cluster": cluster,
        "target": target,
        "result": result,
        "detail": detail or {},
    }
    try:
        path = audit_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(entry, default=str)
        with _lock:
            with path.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
    except Exception as exc:  # noqa: BLE001 - auditing must never fail a request
        logger.warning("could not write audit entry for %s: %s", action, exc)
    return entry


def read(
    *,
    limit: int = DEFAULT_READ_LIMIT,
    actor: Optional[str] = None,
    action: Optional[str] = None,
    cluster: Optional[str] = None,
    since: Optional[str] = None,
    result: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Most recent entries first, optionally filtered."""
    path = audit_path()
    if not path.exists():
        return []

    limit = max(1, min(int(limit or DEFAULT_READ_LIMIT), MAX_READ_LIMIT))
    wanted_action = (action or "").strip().lower()
    wanted_actor = (actor or "").strip().lower()
    wanted_cluster = (cluster or "").strip().lower()

    entries: List[Dict[str, Any]] = []
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue  # a torn final line must not hide the rest
                if since and str(entry.get("ts", "")) < since:
                    continue
                if wanted_actor and wanted_actor not in str(entry.get("actor", "")).lower():
                    continue
                if wanted_cluster and wanted_cluster != str(entry.get("cluster", "")).lower():
                    continue
                if result and str(entry.get("result", "")) != result:
                    continue
                # prefix match so "entry." catches entry.create/update/delete
                if wanted_action and not str(entry.get("action", "")).lower().startswith(wanted_action):
                    continue
                entries.append(entry)
    except OSError as exc:
        logger.error("cannot read audit log %s: %s", path, exc)
        return []

    entries.reverse()
    return entries[:limit]


def summarise(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Counts by action and actor, for the UI header."""
    by_action: Dict[str, int] = {}
    by_actor: Dict[str, int] = {}
    failures = 0
    for entry in entries:
        action = str(entry.get("action", "unknown"))
        by_action[action] = by_action.get(action, 0) + 1
        actor = str(entry.get("actor", "unknown"))
        by_actor[actor] = by_actor.get(actor, 0) + 1
        if entry.get("result") not in (None, "ok"):
            failures += 1
    return {"total": len(entries), "by_action": by_action, "by_actor": by_actor, "failures": failures}
