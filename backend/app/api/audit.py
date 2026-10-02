"""
Audit trail: who changed what, when.

Admin-only, because it names the people who performed changes.
"""

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query

from app.core import audit
from app.core.rbac import require_admin

router = APIRouter()


@router.get("", dependencies=[Depends(require_admin)])
async def get_audit_log(
    limit: int = Query(audit.DEFAULT_READ_LIMIT, ge=1, le=audit.MAX_READ_LIMIT),
    actor: Optional[str] = Query(None, description="substring match on the actor"),
    action: Optional[str] = Query(None, description="prefix match, e.g. 'entry.'"),
    cluster: Optional[str] = Query(None),
    result: Optional[str] = Query(None, description="ok | error"),
    since: Optional[str] = Query(None, description="ISO timestamp lower bound"),
) -> Dict[str, Any]:
    entries = audit.read(
        limit=limit, actor=actor, action=action, cluster=cluster, result=result, since=since
    )
    return {
        "entries": entries,
        "summary": audit.summarise(entries),
        "filters": {
            "limit": limit, "actor": actor, "action": action,
            "cluster": cluster, "result": result, "since": since,
        },
    }


@router.get("/actions", dependencies=[Depends(require_admin)])
async def list_actions() -> Dict[str, Any]:
    """Distinct action names seen so far, for the filter dropdown."""
    seen = sorted({str(e.get("action", "")) for e in audit.read(limit=audit.MAX_READ_LIMIT)})
    return {"actions": [a for a in seen if a]}
