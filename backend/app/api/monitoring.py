from fastapi import APIRouter, HTTPException, Query
from app.core.ldap_client import LDAPClient, LDAPConfig
from app.core.config import load_config
from app.core.password_cache import get_password
from app.core.node_selector import NodeSelector
import ldap
import time
import random

router = APIRouter()

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

        # Get all nodes for health monitoring
        all_nodes = NodeSelector.get_all_nodes(cluster_config)

        results = []
        for host, port in all_nodes:
            try:
                config = LDAPConfig(
                    host=host,
                    port=port,
                    bind_dn=cluster_config.bind_dn,
                    bind_password=password,
                    base_dn=cluster_config.base_dn or ''
                )
                
                client = LDAPClient(config)
                
                # Measure response time
                import time
                start_time = time.time()
                client.connect()
                response_time = int((time.time() - start_time) * 1000)  # ms
                
                total = client.get_entry_count(client.config.base_dn)
                users = client.get_entry_count(client.config.base_dn, "(|(objectClass=inetOrgPerson)(objectClass=posixAccount)(objectClass=account))")
                groups = client.get_entry_count(client.config.base_dn, "(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)(objectClass=posixGroup))")
                ous = client.get_entry_count(client.config.base_dn, "(objectClass=organizationalUnit)")
                
                # Get contextCSN (multi-master has multiple values)
                context_csn = ""
                sync_age_seconds = None
                try:
                    csn_results, _, _ = client.search(client.config.base_dn, "(objectClass=*)", 
                                               scope=ldap.SCOPE_BASE, attrs=["contextCSN"])
                    if csn_results and len(csn_results) > 0:
                        csn_values = csn_results[0].get("contextCSN", [])
                        # Get the latest contextCSN (highest timestamp)
                        if csn_values:
                            context_csn = max(csn_values) if isinstance(csn_values, list) else csn_values
                            
                            # Calculate sync age
                            if context_csn:
                                from datetime import datetime
                                # Parse: 20260119194719.531790Z#000000#001#000000
                                timestamp_str = context_csn.split('#')[0].rstrip('Z')
                                csn_time = datetime.strptime(timestamp_str[:14], '%Y%m%d%H%M%S')
                                sync_age_seconds = int((datetime.utcnow() - csn_time).total_seconds())
                except Exception as csn_err:
                    print(f"Failed to get contextCSN for {host}:{port}: {csn_err}")

                client.disconnect()

                results.append({
                    "node": f"{host}:{port}",
                    "total": total,
                    "users": users,
                    "groups": groups,
                    "ous": ous,
                    "status": "healthy",
                    "contextCSN": context_csn,
                    "responseTime": response_time,
                    "syncAge": sync_age_seconds
                })
            except Exception as e:
                results.append({
                    "node": f"{host}:{port}",
                    "total": 0,
                    "users": 0,
                    "groups": 0,
                    "ous": 0,
                    "status": "error",
                    "contextCSN": "",
                    "responseTime": None,
                    "syncAge": None,
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

@router.get("/topology")
async def get_replication_topology(cluster: str = Query(...)):
    """Get replication topology from syncrepl configuration"""
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")
        
        password = get_password(cluster, cluster_config.bind_dn)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Get all nodes for topology analysis
        all_nodes = NodeSelector.get_all_nodes(cluster_config)

        if len(all_nodes) <= 1:
            return {"topology": []}

        topology = []
        for host, port in all_nodes:
            try:
                config = LDAPConfig(
                    host=host,
                    port=port,
                    bind_dn="cn=config",
                    bind_password=password,
                    base_dn=''
                )
                
                client = LDAPClient(config)
                client.connect()
                
                # Query syncrepl configuration
                server_id = None
                peers = []
                
                try:
                    # Get server ID
                    results, _, _ = client.search(
                        "cn=config",
                        "(objectClass=olcGlobal)",
                        scope=ldap.SCOPE_BASE,
                        attrs=["olcServerID"]
                    )
                    if results and "olcServerID" in results[0]:
                        sid = results[0]["olcServerID"]
                        server_id = (sid[0] if isinstance(sid, list) else sid).split()[0]
                    
                    # Find database with syncrepl config (search all mdb databases)
                    results, _, _ = client.search(
                        "cn=config",
                        "(&(objectClass=olcDatabaseConfig)(olcSyncrepl=*))",
                        scope=ldap.SCOPE_ONELEVEL,
                        attrs=["olcSyncrepl"]
                    )
                    
                    if results and "olcSyncrepl" in results[0]:
                        syncrepl_configs = results[0]["olcSyncrepl"]
                        if not isinstance(syncrepl_configs, list):
                            syncrepl_configs = [syncrepl_configs]
                        
                        for config_str in syncrepl_configs:
                            if "provider=" in config_str and "rid=" in config_str:
                                # Extract RID
                                rid = config_str.split("rid=")[1].split()[0]
                                # Extract provider
                                provider = config_str.split("provider=")[1].split()[0]
                                if "://" in provider:
                                    host_part = provider.split("://")[1].split(":")[0]
                                    peers.append({"host": host_part, "rid": rid})
                except Exception as e:
                    print(f"Syncrepl query error for {host}: {e}")

                client.disconnect()

                topology.append({
                    "node": f"{host}:{port}",
                    "server_id": server_id,
                    "reads_from": peers
                })
            except Exception as e:
                print(f"Node connection error for {host}: {e}")
                topology.append({
                    "node": f"{host}:{port}",
                    "server_id": None,
                    "reads_from": []
                })
        
        return {"topology": topology}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/test-replication")
async def test_replication(cluster: str = Query(...)):
    """Test replication by creating entry on first node and checking other nodes"""
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")
        
        password = get_password(cluster, cluster_config.bind_dn)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Get all nodes for replication test
        all_nodes = NodeSelector.get_all_nodes(cluster_config)

        if len(all_nodes) < 2:
            return {"success": False, "message": "Need at least 2 nodes for replication test"}

        # Create test entry on first node (using WRITE operation type)
        test_id = f"repl-test-{int(time.time())}-{random.randint(1000, 9999)}"
        test_dn = f"cn={test_id},{cluster_config.base_dn}"

        first_host, first_port = all_nodes[0]
        config = LDAPConfig(
            host=first_host,
            port=first_port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or ''
        )
        
        client = LDAPClient(config)
        client.connect()
        
        # Add test entry
        try:
            client.add(test_dn, {
                "objectClass": ["organizationalRole"],
                "cn": test_id,
                "description": "Replication health check"
            })
        except Exception as e:
            client.disconnect()
            return {"success": False, "message": f"Failed to create test entry: {str(e)}"}
        
        client.disconnect()
        
        # Wait for replication
        time.sleep(2)
        
        # Check other nodes (skip first node)
        replication_results = []
        for host, port in all_nodes[1:]:
            try:
                config = LDAPConfig(
                    host=host,
                    port=port,
                    bind_dn=cluster_config.bind_dn,
                    bind_password=password,
                    base_dn=cluster_config.base_dn or ''
                )

                client = LDAPClient(config)
                client.connect()

                # Search for test entry
                results, _, _ = client.search(test_dn, "(objectClass=*)", scope=ldap.SCOPE_BASE)

                if results and len(results) > 0:
                    replication_results.append({
                        "node": f"{host}:{port}",
                        "replicated": True
                    })
                else:
                    replication_results.append({
                        "node": f"{host}:{port}",
                        "replicated": False
                    })

                client.disconnect()
            except Exception as e:
                replication_results.append({
                    "node": f"{host}:{port}",
                    "replicated": False,
                    "error": str(e)
                })
        
        # Cleanup test entry
        try:
            config = LDAPConfig(
                host=first_host,
                port=first_port,
                bind_dn=cluster_config.bind_dn,
                bind_password=password,
                base_dn=cluster_config.base_dn or ''
            )
            client = LDAPClient(config)
            client.connect()
            client.delete(test_dn)
            client.disconnect()
        except:
            pass
        
        all_replicated = all(r["replicated"] for r in replication_results)
        
        return {
            "success": all_replicated,
            "message": "Replication working" if all_replicated else "Replication failed on some nodes",
            "results": replication_results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
