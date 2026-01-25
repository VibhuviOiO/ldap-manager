from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Optional
from app.core.ldap_client import LDAPClient, LDAPConfig
from app.core.config import load_config
from app.core.password_cache import get_password
from app.core.node_selector import NodeSelector, OperationType
import ldap
import ldap.filter
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class SearchRequest(BaseModel):
    host: str
    port: int
    bind_dn: str
    bind_password: str
    base_dn: str
    filter: str = "(objectClass=*)"
    attributes: Optional[List[str]] = None

class EntryCreate(BaseModel):
    host: str
    port: int
    bind_dn: str
    bind_password: str
    dn: str
    attributes: Dict

class EntryUpdate(BaseModel):
    host: str
    port: int
    bind_dn: str
    bind_password: str
    dn: str
    changes: Dict

class EntryUpdateRequest(BaseModel):
    cluster_name: str
    dn: str
    modifications: Dict

@router.get("/stats")
async def get_entry_stats(cluster: str = Query(...)):
    """Get entry counts by object class without fetching full entries"""
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")

        password = get_password(cluster, cluster_config.bind_dn)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Select node for READ operation (uses last node with failover)
        host, port = NodeSelector.select_node(cluster_config, OperationType.READ)

        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or ''
        )

        client = LDAPClient(config)
        client.connect()

        # Perform lightweight count queries
        total = client.get_entry_count(client.config.base_dn)
        users = client.get_entry_count(
            client.config.base_dn,
            "(|(objectClass=inetOrgPerson)(objectClass=posixAccount)(objectClass=account))"
        )
        groups = client.get_entry_count(
            client.config.base_dn,
            "(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)(objectClass=posixGroup))"
        )
        ous = client.get_entry_count(
            client.config.base_dn,
            "(objectClass=organizationalUnit)"
        )

        client.disconnect()

        return {
            "total": total,
            "users": users,
            "groups": groups,
            "ous": ous,
            "other": total - users - groups - ous
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search")
async def search_by_cluster(
    cluster: str = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=10000),
    search: str = Query(None),
    filter_type: str = Query(None)
):
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")
        
        password = get_password(cluster, cluster_config.bind_dn)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")
        
        # Select node for READ operation (uses last node with failover)
        host, port = NodeSelector.select_node(cluster_config, OperationType.READ)
        
        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or ''
        )
        
        # Build LDAP filter
        ldap_filter = "(objectClass=*)"
        if filter_type == "users":
            ldap_filter = "(|(objectClass=inetOrgPerson)(objectClass=posixAccount)(objectClass=account))"
        elif filter_type == "groups":
            ldap_filter = "(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)(objectClass=posixGroup))"
        elif filter_type == "ous":
            ldap_filter = "(objectClass=organizationalUnit)"
        
        # Add search filter
        if search:
            # Escape user input to prevent LDAP injection
            escaped_search = ldap.filter.escape_filter_chars(search)
            search_filter = f"(|(uid=*{escaped_search}*)(cn=*{escaped_search}*)(mail=*{escaped_search}*)(sn=*{escaped_search}*))"
            if ldap_filter != "(objectClass=*)":
                ldap_filter = f"(&{ldap_filter}{search_filter})"
            else:
                ldap_filter = search_filter
        
        client = LDAPClient(config)
        client.connect()
        
        # Request operational attributes (+) along with regular attributes (*)
        attrs = ['*', '+']  # * = all user attributes, + = all operational attributes
        
        # Server-side pagination using LDAP cookies
        # LDAP pagination doesn't support random access, so we iterate through pages
        cookie = b''
        current_page = 1
        entries = []
        total = 0

        # Iterate through pages until we reach the desired page
        while current_page <= page:
            batch_entries, cookie, total = client.search(
                client.config.base_dn, ldap_filter, attrs=attrs,
                page_size=page_size, cookie=cookie
            )

            if current_page == page:
                # This is our target page
                entries = batch_entries
                break

            # Not our target page yet, continue to next page
            if not cookie:
                # No more pages available
                entries = []
                break

            current_page += 1

        next_cookie = cookie  # Preserve cookie for "has_more" check
        
        client.disconnect()
        
        return {
            "entries": entries,
            "total": total,
            "page": page,
            "page_size": page_size,
            "has_more": bool(next_cookie)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/search")
async def search_entries(req: SearchRequest):
    try:
        config = LDAPConfig(
            host=req.host,
            port=req.port,
            bind_dn=req.bind_dn,
            bind_password=req.bind_password,
            base_dn=req.base_dn
        )
        client = LDAPClient(config)
        client.connect()
        results = client.search(req.base_dn, req.filter, attrs=req.attributes)
        client.disconnect()
        return {"entries": results, "count": len(results)}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class EntryCreateRequest(BaseModel):
    cluster_name: str
    dn: str
    attributes: Dict

@router.post("/create")
async def create_entry(req: EntryCreateRequest):
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == req.cluster_name), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")
        
        if cluster_config.readonly:
            raise HTTPException(status_code=403, detail="Cluster is read-only")
        
        password = get_password(req.cluster_name, cluster_config.bind_dn)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Select node for WRITE operation (uses first node for consistency)
        host, port = NodeSelector.select_node(cluster_config, OperationType.WRITE)

        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or ''
        )

        # Process auto-generated fields from form config
        form_config = cluster_config.user_creation_form
        if form_config:
            # Auto-generate uidNumber if needed
            if 'uidNumber' not in req.attributes or req.attributes['uidNumber'] == 'auto':
                client_temp = LDAPClient(config)
                client_temp.connect()
                user_count = client_temp.get_entry_count(
                    form_config.get('base_ou', config.base_dn),
                    "(objectClass=posixAccount)"
                )
                client_temp.disconnect()
                req.attributes['uidNumber'] = str(2000 + user_count)
            
            # Process auto_generate templates
            for field in form_config.get('fields', []):
                field_name = field['name']
                auto_gen = field.get('auto_generate')
                
                # Skip if field has a real value (not empty/null)
                if field_name in req.attributes and req.attributes[field_name] not in ['', None, 'auto']:
                    continue
                
                if auto_gen:
                    if auto_gen == 'days_since_epoch':
                        from datetime import datetime
                        req.attributes[field_name] = str((datetime.now() - datetime(1970, 1, 1)).days)
                    elif '${uid}' in auto_gen:
                        uid = req.attributes.get('uid', '')
                        req.attributes[field_name] = auto_gen.replace('${uid}', uid)
        
        client = LDAPClient(config)
        client.connect()
        client.add(req.dn, req.attributes)
        client.disconnect()

        # Audit log
        logger.info(
            "LDAP entry created",
            extra={
                "cluster": req.cluster_name,
                "dn": req.dn,
                "operation": "CREATE",
                "object_classes": req.attributes.get("objectClass", [])
            }
        )

        return {"status": "success", "dn": req.dn}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/update")
async def update_entry(req: EntryUpdateRequest):
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == req.cluster_name), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")
        
        if cluster_config.readonly:
            raise HTTPException(status_code=403, detail="Cluster is read-only")
        
        password = get_password(req.cluster_name, cluster_config.bind_dn)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Select node for WRITE operation (uses first node for consistency)
        host, port = NodeSelector.select_node(cluster_config, OperationType.WRITE)

        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or ''
        )

        # If password is being changed, update shadowLastChange (only if user has shadowAccount objectClass)
        if 'userPassword' in req.modifications:
            # Check if user has shadowAccount objectClass
            client_temp = LDAPClient(config)
            client_temp.connect()
            try:
                user_entry, _, _ = client_temp.search(req.dn, "(objectClass=*)", scope=ldap.SCOPE_BASE, attrs=['objectClass'])
                if user_entry and 'objectClass' in user_entry[0]:
                    object_classes = user_entry[0]['objectClass']
                    if isinstance(object_classes, str):
                        object_classes = [object_classes]
                    if 'shadowAccount' in object_classes:
                        from datetime import datetime
                        days_since_epoch = (datetime.now() - datetime(1970, 1, 1)).days
                        req.modifications['shadowLastChange'] = str(days_since_epoch)
            except:
                pass  # If we can't check, don't add shadowLastChange
            finally:
                client_temp.disconnect()
        
        client = LDAPClient(config)
        client.connect()
        client.modify(req.dn, req.modifications)
        client.disconnect()

        # Audit log
        logger.info(
            "LDAP entry updated",
            extra={
                "cluster": req.cluster_name,
                "dn": req.dn,
                "operation": "UPDATE",
                "modified_attributes": list(req.modifications.keys())
            }
        )

        return {"status": "success", "dn": req.dn}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/delete")
async def delete_entry(
    cluster_name: str = Query(...),
    dn: str = Query(...)
):
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster_name), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")

        if cluster_config.readonly:
            raise HTTPException(status_code=403, detail="Cluster is read-only")

        password = get_password(cluster_name, cluster_config.bind_dn)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Select node for WRITE operation (uses first node for consistency)
        host, port = NodeSelector.select_node(cluster_config, OperationType.WRITE)

        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or ''
        )

        client = LDAPClient(config)
        client.connect()
        client.delete(dn)
        client.disconnect()

        # Audit log
        logger.warning(
            "LDAP entry deleted",
            extra={
                "cluster": cluster_name,
                "dn": dn,
                "operation": "DELETE"
            }
        )

        return {"status": "success", "dn": dn}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# Group membership management models and endpoints

class GroupMembershipRequest(BaseModel):
    cluster_name: str
    user_dn: str
    groups_to_add: List[str]
    groups_to_remove: List[str]


@router.get("/groups/all")
async def get_all_groups(cluster: str = Query(...)):
    """Get all available groups in the cluster"""
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")

        password = get_password(cluster, cluster_config.bind_dn)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Select node for READ operation (uses last node with failover)
        host, port = NodeSelector.select_node(cluster_config, OperationType.READ)

        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or ''
        )

        client = LDAPClient(config)
        client.connect()
        groups = client.get_all_groups(config.base_dn)
        client.disconnect()

        return {"groups": groups}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/user/groups")
async def get_user_groups(
    cluster: str = Query(...),
    user_dn: str = Query(...)
):
    """Get all groups that a user belongs to"""
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")

        password = get_password(cluster, cluster_config.bind_dn)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Select node for READ operation (uses last node with failover)
        host, port = NodeSelector.select_node(cluster_config, OperationType.READ)

        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or ''
        )

        client = LDAPClient(config)
        client.connect()
        groups = client.get_user_groups(user_dn, config.base_dn)
        client.disconnect()

        return {"user_dn": user_dn, "groups": groups}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/user/groups")
async def update_user_groups(req: GroupMembershipRequest):
    """Add or remove user from groups"""
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == req.cluster_name), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")

        if cluster_config.readonly:
            raise HTTPException(status_code=403, detail="Cluster is read-only")

        password = get_password(req.cluster_name, cluster_config.bind_dn)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Select node for WRITE operation (uses first node for consistency)
        host, port = NodeSelector.select_node(cluster_config, OperationType.WRITE)

        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or ''
        )

        client = LDAPClient(config)
        client.connect()

        errors = []

        # Add user to new groups
        for group_dn in req.groups_to_add:
            try:
                client.add_member_to_group(group_dn, req.user_dn)
            except Exception as e:
                errors.append(f"Failed to add to {group_dn}: {str(e)}")

        # Remove user from groups
        for group_dn in req.groups_to_remove:
            try:
                client.remove_member_from_group(group_dn, req.user_dn)
            except Exception as e:
                errors.append(f"Failed to remove from {group_dn}: {str(e)}")

        client.disconnect()

        if errors:
            return {"status": "partial", "user_dn": req.user_dn, "errors": errors}

        return {"status": "success", "user_dn": req.user_dn}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
