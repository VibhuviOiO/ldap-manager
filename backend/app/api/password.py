from fastapi import APIRouter, HTTPException, Depends
from app.core.password_cache import get_password, clear_password, get_cache_status
from app.core.config import load_config
from app.core.auth import get_current_user, User
from app.core.rbac import viewer_required, admin_only

router = APIRouter()

@router.get("/check/{cluster_name}")
@viewer_required
async def check_password(cluster_name: str, user: User = Depends(get_current_user)):
    """Check if LDAP password is configured for the cluster (shared cache)"""
    clusters = load_config()
    cluster = next((c for c in clusters if c.name == cluster_name), None)

    if not cluster:
        return {"cached": False}

    # Check if password is configured (shared, not per-user)
    cached = get_password(cluster_name, cluster.bind_dn) is not None
    return {
        "cached": cached,
        "configured_by": "admin" if cached else None
    }

@router.get("/status/{cluster_name}")
@viewer_required
async def password_status(cluster_name: str, user: User = Depends(get_current_user)):
    """Get detailed cache status for the cluster (shared cache)"""
    clusters = load_config()
    cluster = next((c for c in clusters if c.name == cluster_name), None)

    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    # Get cache status (shared)
    status = get_cache_status(cluster_name, cluster.bind_dn)
    return status

@router.delete("/cache/{cluster_name}")
@admin_only
async def clear_password_cache(cluster_name: str, user: User = Depends(get_current_user)):
    """Clear cached LDAP password for cluster (ADMIN ONLY)"""
    try:
        clusters = load_config()
        cluster = next((c for c in clusters if c.name == cluster_name), None)
        if not cluster:
            raise HTTPException(status_code=404, detail="Cluster not found")

        # Clear password from shared cache (admin only)
        clear_password(cluster_name, cluster.bind_dn)

        return {
            "status": "success",
            "message": f"LDAP password cleared by admin {user.username}. Cluster needs to be reconfigured."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
