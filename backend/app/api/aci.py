"""
ACI editor: olcAccess rules on cn=config database entries.

olcAccess decides who may read and write the directory. A wrong rule can lock
everyone out of a database, so this is admin-only, write operations are
validated, and the UI warns before applying. Reads use the cluster's `config:`
credential (the data bind DN normally cannot see cn=config).
"""

import logging
import re
from typing import Any, Dict, List, Optional

import ldap
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.config import load_config
from app.core.credentials import config_is_configured, resolve_config_password
from app.core.ldap_client import LDAPClient, LDAPConfig, tls_kwargs
from app.core.node_selector import NodeSelector, OperationType
from app.core.rbac import require_admin, require_readonly

router = APIRouter()
logger = logging.getLogger(__name__)

OLC_ACCESS = "olcAccess"


class AccessRuleInput(BaseModel):
    database_dn: str
    rule: str
    # Insert before this position; None appends at the end.
    position: Optional[int] = None


def _as_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    return [v for v in value]


def _first(value: Any) -> str:
    values = _as_list(value)
    return values[0] if values else ""


def _parse_rule(raw: str) -> Dict[str, Any]:
    """'{0}to * by * read' -> index 0, rule 'to * by * read'."""
    match = re.match(r"^\{(\d+)\}(.*)$", raw or "", re.DOTALL)
    if match:
        return {"index": int(match.group(1)), "rule": match.group(2).strip(), "raw": raw}
    return {"index": None, "rule": (raw or "").strip(), "raw": raw}


def _load_cluster(cluster: str):
    clusters = load_config()
    cluster_config = next((c for c in clusters if c.name == cluster), None)
    if not cluster_config:
        raise HTTPException(status_code=404, detail="Cluster not found")
    if not config_is_configured(cluster_config):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cluster '{cluster}' has no cn=config credential. "
                "Add a 'config:' block with bind_dn 'cn=config' and a credential."
            ),
        )
    return cluster_config


def _config_client(cluster_config, operation=OperationType.READ) -> LDAPClient:
    password = resolve_config_password(cluster_config)
    host, port = NodeSelector.select_node(cluster_config, operation)
    client = LDAPClient(
        LDAPConfig(
            host=host,
            port=port,
            bind_dn=cluster_config.config_bind_dn,
            bind_password=password,
            base_dn=cluster_config.config_base_dn or "cn=config",
            **tls_kwargs(cluster_config),
        )
    )
    client.connect()
    return client


@router.get("/{cluster}", dependencies=[Depends(require_readonly)])
async def get_acis(cluster: str):
    """Every cn=config database with its olcAccess rules."""
    cluster_config = _load_cluster(cluster)
    client = _config_client(cluster_config)
    try:
        rows, _, _ = client.search(
            cluster_config.config_base_dn or "cn=config",
            "(objectClass=olcDatabaseConfig)",
            scope=ldap.SCOPE_SUBTREE,
            attrs=["olcDatabase", "olcSuffix", "olcAccess"],
        )
    finally:
        client.disconnect()

    databases = []
    for row in rows:
        database = _first(row.get("olcDatabase"))
        databases.append(
            {
                "dn": row.get("dn", ""),
                "database": database,
                "suffix": _first(row.get("olcSuffix")),
                # The {N} index decides evaluation order: first match wins.
                "kind": database.split("}")[-1] if "}" in database else database,
                "access": [_parse_rule(v) for v in _as_list(row.get(OLC_ACCESS))],
            }
        )

    databases.sort(key=lambda d: d["dn"])
    return {
        "cluster": cluster,
        "databases": databases,
        "rule_count": sum(len(d["access"]) for d in databases),
    }


@router.post("/{cluster}/access", dependencies=[Depends(require_admin)])
async def add_access_rule(cluster: str, payload: AccessRuleInput):
    """Append (or insert at `position`) an olcAccess rule on a database."""
    cluster_config = _load_cluster(cluster)
    rule = (payload.rule or "").strip()
    if not rule:
        raise HTTPException(status_code=400, detail="Rule must not be empty")
    # olcAccess rules are written as "to <what> by <who> <access>".
    if not rule.lower().startswith("to "):
        raise HTTPException(status_code=400, detail="An olcAccess rule must start with 'to ', e.g. 'to * by * read'")
    if " by " not in rule.lower():
        raise HTTPException(status_code=400, detail="An olcAccess rule needs at least one 'by <who> <access>' clause")

    client = _config_client(cluster_config, OperationType.WRITE)
    try:
        rows, _, _ = client.search(
            payload.database_dn, "(objectClass=olcDatabaseConfig)",
            scope=ldap.SCOPE_BASE, attrs=[OLC_ACCESS],
        )
        if not rows:
            raise HTTPException(status_code=404, detail=f"Database not found: {payload.database_dn}")

        value = f"{{{payload.position}}}{rule}" if payload.position is not None else rule
        client.conn.modify_s(payload.database_dn, [(ldap.MOD_ADD, OLC_ACCESS, [value.encode()])])
    finally:
        client.disconnect()

    logger.warning("olcAccess rule added to %s (%s)", payload.database_dn, rule)
    return {"status": "created", "database_dn": payload.database_dn, "rule": rule}


@router.delete("/{cluster}/access", dependencies=[Depends(require_admin)])
async def remove_access_rule(
    cluster: str,
    database_dn: str = Query(...),
    index: int = Query(...),
):
    """Remove the olcAccess rule at `index` (the {N} order prefix)."""
    cluster_config = _load_cluster(cluster)
    client = _config_client(cluster_config, OperationType.WRITE)
    try:
        rows, _, _ = client.search(
            database_dn, "(objectClass=olcDatabaseConfig)", scope=ldap.SCOPE_BASE, attrs=[OLC_ACCESS],
        )
        if not rows:
            raise HTTPException(status_code=404, detail=f"Database not found: {database_dn}")

        values = _as_list(rows[0].get(OLC_ACCESS))
        target = next((v for v in values if _parse_rule(v)["index"] == index), None)
        if target is None:
            raise HTTPException(status_code=404, detail=f"No olcAccess rule at index {index}")

        client.conn.modify_s(database_dn, [(ldap.MOD_DELETE, OLC_ACCESS, [target.encode()])])
        removed = _parse_rule(target)["rule"]
    finally:
        client.disconnect()

    logger.warning("olcAccess rule removed from %s (index %s): %s", database_dn, index, removed)
    return {"status": "deleted", "database_dn": database_dn, "index": index, "rule": removed}
