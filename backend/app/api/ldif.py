"""
LDIF import.

Export already lives at /api/backup/{cluster}; this adds the write half so the
editor round-trips. The standard changetypes are supported: add, modify (with
add:/replace:/delete: directives) and delete. modrdn is not supported yet.

We parse by hand instead of reusing ldif.LDIFRecordList because that parser
flattens modify directives into a flat dict and loses their meaning.
"""

import base64
import logging
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.config import load_config
from app.core.credentials import resolve_password
from app.core.ldap_client import LDAPClient, LDAPConfig, tls_kwargs
from app.core.node_selector import NodeSelector, OperationType
from app.core.auth import Identity, Role
from app.core.rbac import require_readwrite

router = APIRouter()
logger = logging.getLogger(__name__)

ADD = "add"
MODIFY = "modify"
DELETE = "delete"


class LdifImportRequest(BaseModel):
    cluster_name: str
    ldif: str
    dry_run: bool = False


def _decode_value(rest: str) -> Any:
    """The part after the first colon of an attribute line.

    ' value' is a plain string; ':: base64' or ': base64' decodes to bytes so
    binary attributes survive the round-trip.
    """
    if rest.startswith(":"):
        return base64.b64decode(rest[1:].strip())
    return rest[1:] if rest.startswith(" ") else rest


def _unfold(lines: List[str]) -> List[str]:
    """Join continuation lines (RFC 2849: a leading space continues the value)."""
    logical: List[str] = []
    current = ""
    for line in lines:
        if line.startswith(" "):
            current += line[1:]
        else:
            if current:
                logical.append(current)
            current = line
    if current:
        logical.append(current)
    return logical


def _split_attr(line: str) -> Tuple[str, Any]:
    index = line.find(":")
    return line[:index].strip(), _decode_value(line[index + 1:])


def _parse_block(lines: List[str]) -> Dict[str, Any]:
    dn: Optional[str] = None
    changetype = ADD
    attributes: Dict[str, List[Any]] = {}
    mods: List[Tuple[str, str, List[Any]]] = []
    current_op: Optional[str] = None
    current_attr: Optional[str] = None
    current_values: List[Any] = []

    def flush() -> None:
        nonlocal current_op, current_attr, current_values
        if current_op and current_attr is not None:
            mods.append((current_op, current_attr, current_values))
        current_op = None
        current_attr = None
        current_values = []

    for line in _unfold(lines):
        if line.lstrip().startswith("#") or ":" not in line:
            continue
        if line.strip() == "-":
            flush()
            continue

        attr, value = _split_attr(line)
        key = attr.lower()

        if key == "dn":
            dn = value
        elif key == "changetype":
            text = value.decode() if isinstance(value, bytes) else value
            changetype = str(text).strip().lower()
        elif changetype == MODIFY and key in ("add", "replace", "delete"):
            flush()
            current_op = key
            current_attr = value.decode() if isinstance(value, bytes) else value
            current_values = []
        elif changetype == MODIFY and current_op is not None:
            current_values.append(value)
        else:
            attributes.setdefault(key, []).append(value)

    flush()
    return {"dn": dn, "changetype": changetype, "attributes": attributes, "mods": mods}


def parse_ldif(text: str) -> List[Dict[str, Any]]:
    """Split LDIF text into parsed records (blank line separated)."""
    records: List[Dict[str, Any]] = []
    block: List[str] = []
    for raw in text.split("\n"):
        line = raw.rstrip("\r")
        if line.strip() == "":
            if block:
                records.append(_parse_block(block))
                block = []
        else:
            block.append(line)
    if block:
        records.append(_parse_block(block))
    return records


@router.post("/import")
async def import_ldif(req: LdifImportRequest, identity: Identity = Depends(require_readwrite)):
    """
    Apply LDIF to a cluster. dry_run parses and plans without writing.

    Dry runs need readwrite; the actual apply needs admin. A single LDIF
    payload can rewrite any entry the bind DN can reach, which is a far wider
    blast radius than the per-entry write endpoints.
    """
    if not req.dry_run and not identity.role.allows(Role.ADMIN):
        raise HTTPException(
            status_code=403,
            detail="Applying LDIF requires the admin role (readwrite may Validate only)",
        )
    clusters = load_config()
    cluster_config = next((c for c in clusters if c.name == req.cluster_name), None)
    if not cluster_config:
        raise HTTPException(status_code=404, detail="Cluster not found")
    if cluster_config.readonly:
        raise HTTPException(status_code=403, detail="Cluster is read-only")

    password = resolve_password(cluster_config)
    if not password:
        raise HTTPException(status_code=401, detail="Password not configured")

    try:
        records = parse_ldif(req.ldif)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid LDIF: {exc}")

    if not records:
        raise HTTPException(status_code=400, detail="No LDIF records found")

    if req.dry_run:
        return {
            "dry_run": True,
            "records": len(records),
            "plan": [
                {"dn": r.get("dn"), "changetype": r.get("changetype")}
                for r in records
            ],
        }

    host, port = NodeSelector.select_node(cluster_config, OperationType.WRITE)
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

    added = modified = deleted = 0
    errors: List[Dict[str, str]] = []
    for record in records:
        dn = record.get("dn") or "(missing dn)"
        changetype = record.get("changetype")
        try:
            if changetype == DELETE:
                client.delete(dn)
                deleted += 1
            elif changetype == MODIFY:
                client.modify_ops(dn, record.get("mods", []))
                modified += 1
            elif changetype == "modrdn":
                errors.append({"dn": dn, "changetype": changetype, "error": "modrdn is not supported"})
            else:
                client.add(dn, record.get("attributes", {}))
                added += 1
        except Exception as exc:  # noqa: BLE001
            errors.append({"dn": dn, "changetype": changetype, "error": str(exc)})

    client.disconnect()
    logger.info(
        "LDIF import",
        extra={
            "cluster": req.cluster_name,
            "added": added,
            "modified": modified,
            "deleted": deleted,
            "failed": len(errors),
        },
    )
    return {
        "status": "success" if not errors else "partial",
        "added": added,
        "modified": modified,
        "deleted": deleted,
        "errors": errors,
    }
