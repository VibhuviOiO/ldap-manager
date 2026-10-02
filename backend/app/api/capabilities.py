"""
Which optional server features this cluster actually has, and how to enable the
ones it does not. Read-only.
"""

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.core.capabilities import probe
from app.core.config import load_config
from app.core.rbac import require_readonly

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/{cluster}", dependencies=[Depends(require_readonly)])
async def get_capabilities(cluster: str) -> Dict[str, Any]:
    cluster_config = next((c for c in load_config() if c.name == cluster), None)
    if not cluster_config:
        raise HTTPException(status_code=404, detail="Cluster not found")
    capabilities = probe(cluster_config)
    return {
        "cluster": cluster,
        "capabilities": capabilities,
        "missing": [c["id"] for c in capabilities if c["status"] == "missing"],
    }
