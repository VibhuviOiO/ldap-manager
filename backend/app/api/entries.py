from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import Response
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from app.core.ldap_client import LDAPClient, LDAPConfig, tls_kwargs
from app.core.config import load_config
from app.core.credentials import resolve_password
from app.core.node_selector import NodeSelector, OperationType
import ldap
import ldap.filter
import logging

from app.core.rbac import require_readwrite

router = APIRouter()
logger = logging.getLogger(__name__)

# Attributes that must never leave the server in browse/export responses:
# password hashes, Kerberos keys, PKCS#12 private keys. A backup (LDIF) is the
# one place they intentionally still appear, and that path is admin-only.
SENSITIVE_ATTRIBUTES = {
    "userpassword",
    "sambantpassword",
    "sambalmpassword",
    "sambapasswordhistory",
    "sambalmhashhistory",
    "sambanthashhistory",
    "pwdhistory",
    "krb5key",
    "krb5keyversionnumber",
    "userpkcs12",
}


def _build_filter(filter_type: Optional[str], search: Optional[str]) -> str:
    """The LDAP filter used by both search and export."""
    ldap_filter = "(objectClass=*)"
    if filter_type == "users":
        ldap_filter = "(|(objectClass=inetOrgPerson)(objectClass=posixAccount)(objectClass=account))"
    elif filter_type == "groups":
        ldap_filter = "(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)(objectClass=posixGroup))"
    elif filter_type == "ous":
        ldap_filter = "(objectClass=organizationalUnit)"

    if search:
        escaped = ldap.filter.escape_filter_chars(search)
        search_filter = f"(|(uid=*{escaped}*)(cn=*{escaped}*)(mail=*{escaped}*)(sn=*{escaped}*))"
        ldap_filter = f"(&{ldap_filter}{search_filter})" if ldap_filter != "(objectClass=*)" else search_filter

    return ldap_filter


def _write_client(cluster_name: str):
    """Resolve a cluster and return (cluster_config, connected client) for writes."""
    clusters = load_config()
    cluster_config = next((c for c in clusters if c.name == cluster_name), None)
    if not cluster_config:
        raise HTTPException(status_code=404, detail="Cluster not found")
    if cluster_config.readonly:
        raise HTTPException(status_code=403, detail="Cluster is read-only")
    password = resolve_password(cluster_config)
    if not password:
        raise HTTPException(status_code=401, detail="Password not configured")

    host, port = NodeSelector.select_node(cluster_config, OperationType.WRITE)
    config = LDAPConfig(
        host=host,
        port=port,
        bind_dn=cluster_config.bind_dn,
        bind_password=password,
        base_dn=cluster_config.base_dn or "",
        **tls_kwargs(cluster_config),
    )
    client = LDAPClient(config)
    client.connect()
    return cluster_config, client

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

        password = resolve_password(cluster_config)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Select node for READ operation (uses last node with failover)
        host, port = NodeSelector.select_node(cluster_config, OperationType.READ)

        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or '',
            **tls_kwargs(cluster_config),
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/children")
async def get_children(
    cluster: str = Query(...),
    base_dn: Optional[str] = Query(None),
):
    """
    One level of the DIT, for a lazy-loading tree browser.

    Returns the immediate children of `base_dn` (defaults to the cluster's base
    DN), each annotated with a coarse type so the UI can pick an icon. The tree
    expands on demand, so there is no N+1 fan-out across the whole directory.
    """
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")

        password = resolve_password(cluster_config)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        base = (base_dn or cluster_config.base_dn or "").strip()
        if not base:
            raise HTTPException(status_code=400, detail="No base DN available for this cluster")

        host, port = NodeSelector.select_node(cluster_config, OperationType.READ)
        client = LDAPClient(
            LDAPConfig(
                host=host,
                port=port,
                bind_dn=cluster_config.bind_dn,
                bind_password=password,
                base_dn=base,
                **tls_kwargs(cluster_config),
            )
        )
        client.connect()
        try:
            rows, _, _ = client.search(
                base, "(objectClass=*)", scope=ldap.SCOPE_ONELEVEL, attrs=["objectClass"]
            )
        finally:
            client.disconnect()

        children = []
        for row in rows:
            dn = row.get("dn")
            if not dn:
                continue
            object_classes = row.get("objectClass") or []
            if isinstance(object_classes, str):
                object_classes = [object_classes]
            object_classes = list(object_classes)

            children.append(
                {
                    "dn": dn,
                    "rdn": dn.split(",", 1)[0],
                    "object_class": object_classes,
                    "is_user": any(
                        oc in object_classes
                        for oc in ("inetOrgPerson", "posixAccount", "account", "person")
                    ),
                    "is_group": any(
                        oc in object_classes
                        for oc in ("groupOfNames", "groupOfUniqueNames", "posixGroup")
                    ),
                    "is_ou": "organizationalUnit" in object_classes,
                }
            )

        # Sort so structural entries (OUs) come first, then people, then groups.
        children.sort(key=lambda c: (not c["is_ou"], not c["is_group"], c["rdn"].lower()))

        return {"base_dn": base, "children": children}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/get")
async def get_entry(
    cluster: str = Query(...),
    dn: str = Query(...),
):
    """Read a single entry, all user attributes, for the tree's detail panel."""
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")

        password = resolve_password(cluster_config)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        host, port = NodeSelector.select_node(cluster_config, OperationType.READ)
        client = LDAPClient(
            LDAPConfig(
                host=host,
                port=port,
                bind_dn=cluster_config.bind_dn,
                bind_password=password,
                base_dn=cluster_config.base_dn or "",
                **tls_kwargs(cluster_config),
            )
        )
        client.connect()
        try:
            rows, _, _ = client.search(dn, "(objectClass=*)", scope=ldap.SCOPE_BASE, attrs=None)
        finally:
            client.disconnect()

        if not rows:
            raise HTTPException(status_code=404, detail=f"Entry not found: {dn}")

        attributes = {
            k: v for k, v in rows[0].items()
            if k != "dn" and k.lower() not in SENSITIVE_ATTRIBUTES
        }
        return {"dn": dn, "attributes": attributes}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


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
        
        password = resolve_password(cluster_config)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")
        
        # Select node for READ operation (uses last node with failover)
        host, port = NodeSelector.select_node(cluster_config, OperationType.READ)
        
        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or '',
            **tls_kwargs(cluster_config),
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
    except HTTPException:
        raise
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

class EntryCreateRequest(BaseModel):
    cluster_name: str
    dn: str
    attributes: Dict

@router.post("/create", dependencies=[Depends(require_readwrite)])
async def create_entry(req: EntryCreateRequest):
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == req.cluster_name), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")
        
        if cluster_config.readonly:
            raise HTTPException(status_code=403, detail="Cluster is read-only")
        
        password = resolve_password(cluster_config)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Select node for WRITE operation (uses first node for consistency)
        host, port = NodeSelector.select_node(cluster_config, OperationType.WRITE)

        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or '',
            **tls_kwargs(cluster_config),
        )

        # Process auto-generated fields from form config
        form_config = cluster_config.user_creation_form
        if form_config:
            # LDAP attributes are lists, so compare the first value rather than
            # the list itself. Comparing a list to '' / 'auto' is always True,
            # which silently skipped every auto_generate template.
            def _current(name):
                value = req.attributes.get(name)
                if isinstance(value, list):
                    value = value[0] if value else ''
                return value

            # Auto-generate uidNumber if needed
            if 'uidNumber' not in req.attributes or _current('uidNumber') in ('', 'auto'):
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
                
                # Skip if the field already carries a real value
                if field_name in req.attributes and _current(field_name) not in ('', None, 'auto'):
                    continue
                
                if auto_gen:
                    if auto_gen == 'days_since_epoch':
                        from datetime import datetime
                        req.attributes[field_name] = str((datetime.now() - datetime(1970, 1, 1)).days)
                    elif '${uid}' in auto_gen:
                        # Attributes are lists; str.replace needs a string, so
                        # a form using "${uid}@example.com" used to crash here
                        # with "replace() argument 2 must be str, not list".
                        raw_uid = req.attributes.get('uid', '')
                        if isinstance(raw_uid, list):
                            raw_uid = raw_uid[0] if raw_uid else ''
                        uid = str(raw_uid or '')
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/update", dependencies=[Depends(require_readwrite)])
async def update_entry(req: EntryUpdateRequest):
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == req.cluster_name), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")
        
        if cluster_config.readonly:
            raise HTTPException(status_code=403, detail="Cluster is read-only")
        
        password = resolve_password(cluster_config)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Select node for WRITE operation (uses first node for consistency)
        host, port = NodeSelector.select_node(cluster_config, OperationType.WRITE)

        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or '',
            **tls_kwargs(cluster_config),
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
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/delete", dependencies=[Depends(require_readwrite)])
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

        password = resolve_password(cluster_config)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Select node for WRITE operation (uses first node for consistency)
        host, port = NodeSelector.select_node(cluster_config, OperationType.WRITE)

        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or '',
            **tls_kwargs(cluster_config),
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
    except HTTPException:
        raise
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

        password = resolve_password(cluster_config)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Select node for READ operation (uses last node with failover)
        host, port = NodeSelector.select_node(cluster_config, OperationType.READ)

        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or '',
            **tls_kwargs(cluster_config),
        )

        client = LDAPClient(config)
        client.connect()
        groups = client.get_all_groups(config.base_dn)
        client.disconnect()

        return {"groups": groups}
    except HTTPException:
        raise
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

        password = resolve_password(cluster_config)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Select node for READ operation (uses last node with failover)
        host, port = NodeSelector.select_node(cluster_config, OperationType.READ)

        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or '',
            **tls_kwargs(cluster_config),
        )

        client = LDAPClient(config)
        client.connect()
        groups = client.get_user_groups(user_dn, config.base_dn)
        client.disconnect()

        return {"user_dn": user_dn, "groups": groups}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/user/groups", dependencies=[Depends(require_readwrite)])
async def update_user_groups(req: GroupMembershipRequest):
    """Add or remove user from groups"""
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == req.cluster_name), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")

        if cluster_config.readonly:
            raise HTTPException(status_code=403, detail="Cluster is read-only")

        password = resolve_password(cluster_config)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        # Select node for WRITE operation (uses first node for consistency)
        host, port = NodeSelector.select_node(cluster_config, OperationType.WRITE)

        config = LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.bind_dn,
            bind_password=password,
            base_dn=cluster_config.base_dn or '',
            **tls_kwargs(cluster_config),
        )

        client = LDAPClient(config)
        client.connect()

        errors = []

        # Add user to new groups
        for group_dn in req.groups_to_add:
            try:
                client.add_member_to_group(group_dn, req.user_dn)
            except HTTPException:
                raise
            except Exception as e:
                errors.append(f"Failed to add to {group_dn}: {str(e)}")

        # Remove user from groups
        for group_dn in req.groups_to_remove:
            try:
                client.remove_member_from_group(group_dn, req.user_dn)
            except HTTPException:
                raise
            except Exception as e:
                errors.append(f"Failed to remove from {group_dn}: {str(e)}")

        client.disconnect()

        if errors:
            return {"status": "partial", "user_dn": req.user_dn, "errors": errors}

        return {"status": "success", "user_dn": req.user_dn}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# --------------------------------------------------------------------- bulk --

class BulkUpdateRequest(BaseModel):
    cluster_name: str
    dns: List[str]
    modifications: Dict[str, Any]


class BulkGroupRequest(BaseModel):
    cluster_name: str
    dns: List[str]
    group_dn: str
    action: str


class BulkDeleteRequest(BaseModel):
    cluster_name: str
    dns: List[str]


@router.post("/bulk/update", dependencies=[Depends(require_readwrite)])
async def bulk_update(req: BulkUpdateRequest):
    """Apply the same modification(s) to many entries at once."""
    if not req.dns:
        raise HTTPException(status_code=400, detail="No entries selected")
    try:
        _cluster, client = _write_client(req.cluster_name)
        succeeded: List[str] = []
        errors: List[dict] = []
        for dn in req.dns:
            try:
                client.modify(dn, req.modifications)
                succeeded.append(dn)
            except Exception as exc:
                errors.append({"dn": dn, "error": str(exc)})
        client.disconnect()

        logger.info(
            "Bulk update",
            extra={
                "cluster": req.cluster_name,
                "succeeded": len(succeeded),
                "failed": len(errors),
                "attributes": list(req.modifications.keys()),
            },
        )
        return {
            "status": "success" if not errors else "partial",
            "succeeded": succeeded,
            "errors": errors,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/bulk/group", dependencies=[Depends(require_readwrite)])
async def bulk_group(req: BulkGroupRequest):
    """Assign (or remove) many users to a single group in one step."""
    if not req.dns:
        raise HTTPException(status_code=400, detail="No entries selected")
    if req.action not in ("add", "remove"):
        raise HTTPException(status_code=400, detail="action must be 'add' or 'remove'")
    try:
        _cluster, client = _write_client(req.cluster_name)
        succeeded: List[str] = []
        errors: List[dict] = []
        for dn in req.dns:
            try:
                if req.action == "add":
                    client.add_member_to_group(req.group_dn, dn)
                else:
                    client.remove_member_from_group(req.group_dn, dn)
                succeeded.append(dn)
            except Exception as exc:
                errors.append({"dn": dn, "error": str(exc)})
        client.disconnect()

        logger.info(
            "Bulk group %s", req.action,
            extra={
                "cluster": req.cluster_name,
                "group": req.group_dn,
                "succeeded": len(succeeded),
                "failed": len(errors),
            },
        )
        return {
            "status": "success" if not errors else "partial",
            "succeeded": succeeded,
            "errors": errors,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/bulk/delete", dependencies=[Depends(require_readwrite)])
async def bulk_delete(req: BulkDeleteRequest):
    """Delete many entries at once."""
    if not req.dns:
        raise HTTPException(status_code=400, detail="No entries selected")
    try:
        _cluster, client = _write_client(req.cluster_name)
        succeeded: List[str] = []
        errors: List[dict] = []
        for dn in req.dns:
            try:
                client.delete(dn)
                succeeded.append(dn)
            except Exception as exc:
                errors.append({"dn": dn, "error": str(exc)})
        client.disconnect()

        logger.warning(
            "Bulk delete",
            extra={"cluster": req.cluster_name, "succeeded": len(succeeded), "failed": len(errors)},
        )
        return {
            "status": "success" if not errors else "partial",
            "succeeded": succeeded,
            "errors": errors,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


# -------------------------------------------------------------------- export --

def _entries_to_csv(entries: List[Dict[str, Any]]) -> str:
    import csv
    import io

    keys = ["dn"]
    seen = {"dn"}
    for entry in entries:
        for key in entry.keys():
            if key not in seen and key.lower() not in SENSITIVE_ATTRIBUTES:
                seen.add(key)
                keys.append(key)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(keys)
    for entry in entries:
        row = []
        for key in keys:
            value = entry.get(key, "")
            if isinstance(value, list):
                value = "; ".join(str(item) for item in value)
            row.append(value)
        writer.writerow(row)
    return buffer.getvalue()


@router.get("/export")
async def export_entries(
    cluster: str = Query(...),
    filter_type: str = Query(None),
    search: str = Query(None),
    format: str = Query("csv", pattern="^(csv|json)$"),
):
    """Export the current view (or the whole directory) as CSV or JSON."""
    try:
        clusters = load_config()
        cluster_config = next((c for c in clusters if c.name == cluster), None)
        if not cluster_config:
            raise HTTPException(status_code=404, detail="Cluster not found")

        password = resolve_password(cluster_config)
        if not password:
            raise HTTPException(status_code=401, detail="Password not configured")

        host, port = NodeSelector.select_node(cluster_config, OperationType.READ)
        base_dn = cluster_config.base_dn or ""
        client = LDAPClient(
            LDAPConfig(
                host=host,
                port=port,
                bind_dn=cluster_config.bind_dn,
                bind_password=password,
                base_dn=base_dn,
                **tls_kwargs(cluster_config),
            )
        )
        client.connect()

        ldap_filter = _build_filter(filter_type, search)
        all_entries: List[Dict[str, Any]] = []
        cookie = b""
        while True:
            batch, cookie, _total = client.search(
                base_dn, ldap_filter, attrs=["*", "+"], page_size=1000, cookie=cookie
            )
            all_entries.extend(batch)
            if not cookie:
                break
        client.disconnect()

        if format == "json":
            return {"count": len(all_entries), "entries": all_entries}

        csv_text = _entries_to_csv(all_entries)
        label = filter_type or "all"
        return Response(
            content=csv_text,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{cluster}-{label}.csv"',
                "X-Entry-Count": str(len(all_entries)),
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
