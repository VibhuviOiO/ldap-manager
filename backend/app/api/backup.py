"""
Backup / download of a cluster directory as LDIF.

    GET /api/backup/{cluster_name}            full subtree, all user attributes
    GET /api/backup/{cluster_name}?operational=true   include operational attrs
    GET /api/backup/{cluster_name}?scope=one&base_dn=ou=People,dc=x,dc=com

Admin only: a full directory dump is the most sensitive read the app offers.

The raw python-ldap connection is used rather than LDAPClient.search because the
latter decodes attribute values with str() on failure, which mangles binary
attributes (jpegPhoto, userCertificate). LDIF requires those base64-encoded, and
LDIFWriter does that correctly when handed the original bytes.
"""

import io
import logging
from datetime import datetime, timezone
from typing import List, Optional, Tuple

import ldap
import ldif
from ldap.controls import SimplePagedResultsControl
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.core.config import load_config
from app.core.credentials import resolve_password
from app.core.ldap_client import LDAPClient, LDAPConfig, tls_kwargs
from app.core.node_selector import NodeSelector, OperationType
from app.core.rbac import require_admin

logger = logging.getLogger(__name__)

router = APIRouter()

PAGE_SIZE = 1000
SCOPES = {"base": ldap.SCOPE_BASE, "one": ldap.SCOPE_ONELEVEL, "sub": ldap.SCOPE_SUBTREE}


def _paged_search(conn, base: str, scope: int, filter_str: str, attrs):
    """Search everything, following paged results so large directories work."""
    results: List[Tuple[str, dict]] = []
    cookie = b""
    while True:
        control = SimplePagedResultsControl(True, size=PAGE_SIZE, cookie=cookie)
        msgid = conn.search_ext(base, scope, filter_str, attrs, serverctrls=[control])
        _rtype, data, _rmsgid, serverctrls = conn.result3(msgid)
        results.extend(data)

        cookies = [c for c in serverctrls if c.controlType == SimplePagedResultsControl.controlType]
        if not cookies or not cookies[0].cookie:
            break
        cookie = cookies[0].cookie
    return results


def _to_ldif(entries) -> str:
    """Serialize (dn, attrs) pairs. LDIFWriter handles folding and base64."""
    buffer = io.StringIO()
    writer = ldif.LDIFWriter(buffer)
    for dn, attrs in entries:
        if not dn:
            continue
        record = sorted(attrs.items(), key=lambda item: item[0].lower())
        writer.unparse(dn, record)

    # The writer annotates each record with `changetype: add`, which belongs to
    # a modification request. A plain export should not carry it.
    lines = [
        line for line in buffer.getvalue().splitlines()
        if line.strip().lower() != "changetype: add"
    ]
    return "\n".join(lines) + "\n"


@router.get("/{cluster_name}", dependencies=[Depends(require_admin)])
async def download_backup(
    cluster_name: str,
    base_dn: Optional[str] = Query(None, description="Defaults to the cluster's base_dn"),
    scope: str = Query("sub", pattern="^(base|one|sub)$"),
    operational: bool = Query(False, description="Include operational attributes"),
):
    """Stream an LDIF export of the cluster's directory."""
    clusters = load_config()
    cluster = next((c for c in clusters if c.name == cluster_name), None)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")

    password = resolve_password(cluster)
    if not password:
        raise HTTPException(
            status_code=401,
            detail="No credential available for this cluster. Configure it first.",
        )

    root = base_dn or cluster.base_dn
    if not root:
        raise HTTPException(
            status_code=400,
            detail="No base DN to export. Set base_dn on the cluster or pass ?base_dn=",
        )

    host, port = NodeSelector.select_node(cluster, OperationType.READ)
    client = LDAPClient(
        LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster.bind_dn,
            bind_password=password,
            base_dn=root,
            **tls_kwargs(cluster),
        )
    )

    try:
        client.connect()
        # "*" is every user attribute; "+" adds operational ones.
        attrs = ["*", "+"] if operational else None
        entries = _paged_search(client.conn, root, SCOPES[scope], "(objectClass=*)", attrs)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        logger.error("Backup of cluster '%s' failed: %s", cluster_name, exc)
        raise HTTPException(status_code=502, detail=f"Could not export: {exc}")
    finally:
        try:
            client.disconnect()
        except Exception:  # noqa: BLE001
            pass

    if not entries:
        raise HTTPException(
            status_code=404,
            detail=f"Nothing to export under '{root}' (check the base DN and bind DN rights)",
        )

    payload = _to_ldif(entries)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    logger.info("Exported %d entries from cluster '%s'", len(entries), cluster_name)

    return Response(
        content=payload,
        media_type="text/ldif",
        headers={
            "Content-Disposition": f'attachment; filename="{cluster_name}-{stamp}.ldif"',
            "X-Entry-Count": str(len(entries)),
        },
    )
