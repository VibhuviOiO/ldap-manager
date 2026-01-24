from fastapi import APIRouter, HTTPException
from app.core.password_cache import get_password, clear_password
from app.core.config import load_config

router = APIRouter()

@router.get("/check/{cluster_name}")
async def check_password(cluster_name: str):
    clusters = load_config()
    cluster = next((c for c in clusters if c.name == cluster_name), None)

    if not cluster:
        return {"cached": False}

    cached = get_password(cluster_name, cluster.bind_dn) is not None
    return {"cached": cached}

@router.delete("/cache/{cluster_name}")
async def clear_password_cache(cluster_name: str):
    """Clear cached password for a specific cluster"""
    try:
        clusters = load_config()
        cluster = next((c for c in clusters if c.name == cluster_name), None)
        if not cluster:
            raise HTTPException(status_code=404, detail="Cluster not found")

        # Clear password from cache
        clear_password(cluster_name, cluster.bind_dn)

        return {"status": "success", "message": "Password cache cleared"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
