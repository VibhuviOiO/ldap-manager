from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Optional
from app.core.ldap_client import LDAPClient, LDAPConfig
from app.core.config import load_config
from app.core.password_cache import get_password
import ldap

router = APIRouter()

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
        
        host = cluster_config.host or cluster_config.nodes[0]['host']
        port = cluster_config.port or cluster_config.nodes[0]['port']
        
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
            search_filter = f"(|(uid=*{search}*)(cn=*{search}*)(mail=*{search}*)(sn=*{search}*))"
            if ldap_filter != "(objectClass=*)":
                ldap_filter = f"(&{ldap_filter}{search_filter})"
            else:
                ldap_filter = search_filter
        
        client = LDAPClient(config)
        client.connect()
        
        # Request operational attributes (+) along with regular attributes (*)
        attrs = ['*', '+']  # * = all user attributes, + = all operational attributes
        
        # Calculate pagination
        cookie = b''
        skip = (page - 1) * page_size
        
        # For first page, get paginated results
        if page == 1:
            entries, next_cookie, total = client.search(
                client.config.base_dn, ldap_filter, attrs=attrs,
                page_size=page_size, cookie=cookie
            )
        else:
            # For subsequent pages, need to iterate through pages
            # This is a limitation - LDAP pagination doesn't support random access
            entries, next_cookie, total = client.search(
                client.config.base_dn, ldap_filter, attrs=attrs,
                page_size=0, cookie=b''
            )
            # Client-side pagination for pages > 1
            start = skip
            end = skip + page_size
            entries = entries[start:end]
            next_cookie = b'' if end >= total else b'more'
        
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
        
        host = cluster_config.host or cluster_config.nodes[0]['host']
        port = cluster_config.port or cluster_config.nodes[0]['port']
        
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
        
        host = cluster_config.host or cluster_config.nodes[0]['host']
        port = cluster_config.port or cluster_config.nodes[0]['port']
        
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
        client.delete(dn)
        client.disconnect()
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
