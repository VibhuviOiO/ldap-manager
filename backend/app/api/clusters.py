from fastapi import APIRouter, HTTPException
from app.core.config import load_config
from app.core.ldap_client import LDAPClient, LDAPConfig
from app.core.password_cache import get_password
from pathlib import Path
import ldap

router = APIRouter()

@router.get("/list")
async def list_clusters():
    config_path = Path("/app/config.yml")
    if not config_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Configuration file not found. Please create /app/config.yml from config.example.yml"
        )
    
    try:
        clusters = load_config()
        if not clusters:
            raise HTTPException(
                status_code=404,
                detail="No clusters configured. Please add clusters to config.yml"
            )
        return {
            "clusters": [
                {
                    "name": c.name,
                    "host": c.host,
                    "port": c.port,
                    "nodes": c.nodes,
                    "base_dn": c.base_dn,
                    "bind_dn": c.bind_dn,
                    "readonly": c.readonly,
                    "description": c.description
                }
                for c in clusters
            ]
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to load configuration: {str(e)}"
        )

@router.get("/health/{cluster_name}")
async def check_cluster_health(cluster_name: str):
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster_name), None)
        if not cluster_config:
            return {
                "status": "error",
                "message": f"Cluster '{cluster_name}' not found in configuration"
            }
        
        password = get_password(cluster_name, cluster_config.bind_dn)
        if not password:
            return {
                "status": "warning",
                "message": "Password not configured. Please enter password to connect."
            }

        # For multi-node clusters, always use first node's explicit host and port
        # For single-node clusters, use cluster host and port
        if cluster_config.nodes:
            host = cluster_config.nodes[0]['host']
            port = cluster_config.nodes[0]['port']
        else:
            host = cluster_config.host
            port = cluster_config.port or 389
        
        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or ''
        )
        
        client = LDAPClient(config)
        try:
            client.connect()
            client.disconnect()
            return {
                "status": "healthy",
                "message": f"Successfully connected to {host}:{port}"
            }
        except ldap.SERVER_DOWN:
            return {
                "status": "error",
                "message": f"Cannot connect to LDAP server at {host}:{port}. Please verify the server is running and accessible."
            }
        except ldap.INVALID_CREDENTIALS:
            return {
                "status": "error",
                "message": "Invalid credentials. Please check bind DN and password."
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Connection failed: {str(e)}"
            }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Health check failed: {str(e)}"
        }

@router.get("/form/{cluster_name}")
async def get_user_creation_form(cluster_name: str):
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster_name), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail=f"Cluster '{cluster_name}' not found")
        
        form_config = cluster_config.user_creation_form
        if not form_config:
            raise HTTPException(status_code=404, detail=f"No user creation form configured for '{cluster_name}'")
        
        return form_config
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load form config: {str(e)}")

@router.get("/columns/{cluster_name}")
async def get_table_columns(cluster_name: str):
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster_name), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail=f"Cluster '{cluster_name}' not found")
        
        return cluster_config.table_columns or {}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load columns config: {str(e)}")

@router.get("/password-policy/{cluster_name}")
async def get_password_policy(cluster_name: str):
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster_name), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail=f"Cluster '{cluster_name}' not found")
        
        # Default policy if not configured
        default_policy = {
            "min_length": 0,
            "require_confirmation": True
        }
        return cluster_config.password_policy or default_policy
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load password policy: {str(e)}")
