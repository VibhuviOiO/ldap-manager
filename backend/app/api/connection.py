from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from app.core.ldap_client import LDAPClient, LDAPConfig
from app.core.password_cache import save_password, get_password
from app.core.config import load_config
from app.core.node_selector import NodeSelector, OperationType
from app.core.auth import get_current_user, User
from app.core.rbac import admin_only
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class ConnectionRequest(BaseModel):
    cluster_name: str
    bind_password: str

class ConnectionResponse(BaseModel):
    status: str
    message: str
    base_dn: str

@router.post("/connect", response_model=ConnectionResponse)
@admin_only
async def connect(req: ConnectionRequest, user: User = Depends(get_current_user)):
    """
    Configure LDAP connection (ADMIN ONLY).

    Admin enters LDAP password once, then all users can access the cluster.
    Non-admin users never see or enter the LDAP password.
    """
    try:
        clusters = load_config()
        cluster = next((c for c in clusters if c.name == req.cluster_name), None)
        if not cluster:
            raise HTTPException(status_code=404, detail="Cluster not found")

        # Use cached password if available, otherwise use provided
        cached_pwd = get_password(req.cluster_name, cluster.bind_dn)
        password = cached_pwd or req.bind_password

        if not password:
            raise HTTPException(status_code=400, detail="Password required")

        # Select node for HEALTH check (connection test)
        host, port = NodeSelector.select_node(cluster, OperationType.HEALTH)

        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster.bind_dn,
            bind_password=password,
            base_dn=cluster.base_dn or ''
        )

        client = LDAPClient(config)
        client.connect()
        base_dn = client.config.base_dn
        client.disconnect()

        # Save password to SHARED cache on successful connection (admin configured)
        if not cached_pwd:
            save_password(req.cluster_name, cluster.bind_dn, password)
            logger.info(f"LDAP connection configured by admin {user.username} for cluster {req.cluster_name}")

        return ConnectionResponse(
            status="success",
            message=f"Cluster configured by admin {user.username}. All users can now access this cluster.",
            base_dn=base_dn
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/status")
async def status():
    return {"status": "ready"}
