from fastapi import APIRouter, HTTPException, Query
from app.core.ldap_client import LDAPClient, LDAPConfig
from app.core.config import load_config
from app.core.password_cache import get_password
import ldap

router = APIRouter()

@router.get("/stats")
async def get_stats(cluster: str = Query(...)):
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster), None)
        if not cluster_config:
            return {"total": 0, "users": 0, "groups": 0}
        
        password = get_password(cluster, cluster_config.bind_dn)
        if not password:
            return {"total": 0, "users": 0, "groups": 0}
        
        host = cluster_config.host or cluster_config.nodes[0]['host']
        port = cluster_config.port or cluster_config.nodes[0]['port']
        
        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or ''
        )
        
        client = LDAPClient(config)
        client.connect()
        
        total = client.get_entry_count(client.config.base_dn)
        users = client.get_entry_count(client.config.base_dn, "(|(objectClass=inetOrgPerson)(objectClass=posixAccount)(objectClass=account))")
        groups = client.get_entry_count(client.config.base_dn, "(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)(objectClass=posixGroup))")
        
        client.disconnect()
        
        return {"total": total, "users": users, "groups": groups}
    except Exception as e:
        return {"total": 0, "users": 0, "groups": 0}

@router.get("/nodes")
async def get_node_sync_stats(cluster: str = Query(...)):
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")
        
        password = get_password(cluster, cluster_config.bind_dn)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")
        
        nodes = []
        if cluster_config.host:
            nodes = [{"host": cluster_config.host, "port": cluster_config.port}]
        else:
            nodes = cluster_config.nodes
        
        results = []
        for node in nodes:
            try:
                config = LDAPConfig(
                    host=node['host'],
                    port=node['port'],
                    bind_dn=cluster_config.bind_dn,
                    bind_password=password,
                    base_dn=cluster_config.base_dn or ''
                )
                
                client = LDAPClient(config)
                client.connect()
                
                total = client.get_entry_count(client.config.base_dn)
                users = client.get_entry_count(client.config.base_dn, "(|(objectClass=inetOrgPerson)(objectClass=posixAccount)(objectClass=account))")
                groups = client.get_entry_count(client.config.base_dn, "(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)(objectClass=posixGroup))")
                
                # Get contextCSN in UTC
                context_csn = ""
                try:
                    csn_results = client.search(client.config.base_dn, "(objectClass=*)", 
                                               scope=ldap.SCOPE_BASE, attrs=["contextCSN"])
                    if csn_results:
                        context_csn = csn_results[0]["attributes"].get("contextCSN", [b""])[0].decode()
                except:
                    pass
                
                client.disconnect()
                
                results.append({
                    "node": f"{node['host']}:{node['port']}",
                    "total": total,
                    "users": users,
                    "groups": groups,
                    "status": "healthy",
                    "contextCSN": context_csn
                })
            except Exception as e:
                results.append({
                    "node": f"{node['host']}:{node['port']}",
                    "total": 0,
                    "users": 0,
                    "groups": 0,
                    "status": "error",
                    "contextCSN": "",
                    "error": str(e)
                })
        
        # Check if all nodes are in sync
        healthy_nodes = [r for r in results if r["status"] == "healthy"]
        in_sync = len(set(r["total"] for r in healthy_nodes)) <= 1 if healthy_nodes else False
        
        return {
            "nodes": results,
            "in_sync": in_sync
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
