"""
Schema browser: attribute types and object classes from cn=schema.

Reading cn=config needs the config admin credential, which the data bind DN
usually cannot use, so this uses the cluster's `config:` block (see
credentials.resolve_config_password). Read-only for now: editing schema live
can break a running directory, so that is a separate, guarded step.
"""

import logging
import re
from typing import Any, Dict, List, Optional

import ldap
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.config import load_config
from app.core.credentials import config_is_configured, resolve_config_password
from app.core.ldap_client import LDAPClient, LDAPConfig, tls_kwargs
from app.core.node_selector import NodeSelector, OperationType
from app.core.rbac import require_admin, require_readonly

router = APIRouter()
logger = logging.getLogger(__name__)


def _parse_definition(definition: str) -> Dict[str, Any]:
    """Lightly parse an olcAttributeTypes / olcObjectClasses value.

    The raw value is the full RFC 4512 definition, e.g.
        ( 1.3.6.1.4.1.99999.1.1 NAME 'kingdom' EQUALITY caseIgnoreMatch ... )
    The frontend only needs the interesting bits; the whole string is kept too.
    """
    text = (definition or "").strip()
    if text.startswith("("):
        text = text[1:]
    if text.endswith(")"):
        text = text[:-1]

    parts = text.split()
    oid = parts[0] if parts else ""

    def quoted(pattern: str) -> str:
        match = re.search(pattern, text)
        return match.group(1) if match else ""

    sup_match = re.search(r"\bSUP\s+(?:\(\s*)?([^ )]+)", text)
    syntax_match = re.search(r"SYNTAX\s+([^ ]+)", text)
    equality_match = re.search(r"EQUALITY\s+([^ ]+)", text)

    return {
        "oid": oid,
        "name": quoted(r"NAME\s+'([^']*)'"),
        "sup": (sup_match.group(1) or "").rstrip("$") if sup_match else "",
        "syntax": syntax_match.group(1) if syntax_match else "",
        "equality": equality_match.group(1) if equality_match else "",
        "single_value": "SINGLE-VALUE" in text,
        "definition": definition or "",
    }


def _as_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    return list(value)


def _clean_name(dn: str, cn: Any) -> str:
    if isinstance(cn, list):
        cn = cn[0] if cn else ""
    name = str(cn or dn)
    # cn looks like "cn={4}MahabharataCharacter"; the schema name is after '='
    if "=" in name:
        name = name.split("=", 1)[-1]
    return re.sub(r"^\{\d+\}", "", name)


@router.get("/{cluster}", dependencies=[Depends(require_readonly)])
async def get_schema(cluster: str):
    """Return every schema's attribute types and object classes."""
    clusters = load_config()
    cluster_config = next((c for c in clusters if c.name == cluster), None)
    if not cluster_config:
        raise HTTPException(status_code=404, detail="Cluster not found")

    if not config_is_configured(cluster_config):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cluster '{cluster}' has no cn=config credential. "
                "Add a 'config:' block to this cluster with bind_dn 'cn=config' "
                "and a credential (env/file/stored), then try again."
            ),
        )

    password = resolve_config_password(cluster_config)
    host, port = NodeSelector.select_node(cluster_config, OperationType.READ)
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
    try:
        base = f"cn=schema,{cluster_config.config_base_dn or 'cn=config'}"
        rows, _, _ = client.search(
            base,
            "(objectClass=olcSchemaConfig)",
            scope=ldap.SCOPE_ONELEVEL,
            attrs=["cn", "olcAttributeTypes", "olcObjectClasses"],
        )
    finally:
        client.disconnect()

    schemas = []
    total_attribute_types = 0
    total_object_classes = 0
    for row in rows:
        dn = row.get("dn", "")
        attribute_types = [_parse_definition(v) for v in _as_list(row.get("olcAttributeTypes"))]
        object_classes = [_parse_definition(v) for v in _as_list(row.get("olcObjectClasses"))]
        total_attribute_types += len(attribute_types)
        total_object_classes += len(object_classes)
        schemas.append(
            {
                "dn": dn,
                "name": _clean_name(dn, row.get("cn")),
                "attribute_types": attribute_types,
                "object_classes": object_classes,
            }
        )

    schemas.sort(key=lambda s: s["name"].lower())
    return {
        "cluster": cluster,
        "schemas": schemas,
        "counts": {
            "schemas": len(schemas),
            "attribute_types": total_attribute_types,
            "object_classes": total_object_classes,
        },
    }


# ------------------------------------------------------------- schema edits --
# Editing cn=schema is powerful and reversible (a bad definition is rejected by
# the server, unlike a bad olcAccess). Admin only, and validated before write.


class SchemaDefinitionInput(BaseModel):
    schema_name: str
    kind: str = "attribute_type"  # attribute_type | object_class
    definition: str


def _attr_for_kind(kind: str) -> str:
    if kind == "object_class":
        return "olcObjectClasses"
    return "olcAttributeTypes"


def _resolve_schema_dn(cluster_config, client, schema_name: str) -> str:
    """The dn of cn={N}<schema>,cn=schema,cn=config matching schema_name."""
    base = f"cn=schema,{cluster_config.config_base_dn or 'cn=config'}"
    rows, _, _ = client.search(
        base, "(objectClass=olcSchemaConfig)", scope=ldap.SCOPE_ONELEVEL, attrs=["cn"]
    )
    wanted = schema_name.strip()
    for row in rows:
        if _clean_name(row.get("dn", ""), row.get("cn")) == wanted:
            return row["dn"]
    raise HTTPException(status_code=404, detail=f"Schema '{schema_name}' not found")


def _assert_valid_definition(kind: str, definition: str) -> Dict[str, Any]:
    parsed = _parse_definition(definition)
    # OIDs look like 1.3.6.1.4.1.x or 2.5.4.3; anything else means the
    # definition is malformed (e.g. "( NAME 'x' )" parses "NAME" as the oid).
    if not re.match(r"^[\d.]+$", parsed["oid"] or ""):
        raise HTTPException(
            status_code=400,
            detail="Definition must start with a numeric OID, e.g. "
                   "'( 1.3.6.1.4.1.99999.1.99 NAME ... )'",
        )
    if not parsed["name"]:
        raise HTTPException(status_code=400, detail="Definition must include a NAME")
    if kind == "object_class" and not parsed["sup"] and parsed["name"] != "top":
        raise HTTPException(
            status_code=400,
            detail="Object classes need a SUP (superclass), e.g. SUP top or SUP inetOrgPerson",
        )
    return parsed


@router.post("/{cluster}/definitions", dependencies=[Depends(require_admin)])
async def add_schema_definition(cluster: str, payload: SchemaDefinitionInput):
    """Add an attribute type or object class to a schema (cn=config)."""
    clusters = load_config()
    cluster_config = next((c for c in clusters if c.name == cluster), None)
    if not cluster_config:
        raise HTTPException(status_code=404, detail="Cluster not found")
    if not config_is_configured(cluster_config):
        raise HTTPException(status_code=400, detail="No cn=config credential configured for this cluster")

    if payload.kind not in ("attribute_type", "object_class"):
        raise HTTPException(status_code=400, detail="kind must be 'attribute_type' or 'object_class'")

    parsed = _assert_valid_definition(payload.kind, payload.definition)

    password = resolve_config_password(cluster_config)
    host, port = NodeSelector.select_node(cluster_config, OperationType.WRITE)
    client = LDAPClient(
        LDAPConfig(
            host=host, port=port,
            bind_dn=cluster_config.config_bind_dn,
            bind_password=password,
            base_dn=cluster_config.config_base_dn or "cn=config",
            **tls_kwargs(cluster_config),
        )
    )
    client.connect()
    try:
        schema_dn = _resolve_schema_dn(cluster_config, client, payload.schema_name)
        attr = _attr_for_kind(payload.kind)

        # Reject a duplicate name before writing.
        rows, _, _ = client.search(schema_dn, "(objectClass=olcSchemaConfig)", scope=ldap.SCOPE_BASE, attrs=[attr])
        existing = _as_list(rows[0].get(attr)) if rows else []
        for value in existing:
            if _parse_definition(value)["name"] == parsed["name"]:
                raise HTTPException(
                    status_code=409,
                    detail=f"{payload.kind} '{parsed['name']}' already exists in {payload.schema_name}",
                )

        client.conn.modify_s(schema_dn, [(ldap.MOD_ADD, attr, [payload.definition.encode()])])
    finally:
        client.disconnect()

    return {"status": "created", "schema": payload.schema_name, "kind": payload.kind, "name": parsed["name"]}


@router.delete("/{cluster}/definitions/{name}", dependencies=[Depends(require_admin)])
async def remove_schema_definition(
    cluster: str,
    name: str,
    schema_name: str = Query(...),
    kind: str = Query("attribute_type"),
):
    """Remove an attribute type or object class by name (exact stored value)."""
    clusters = load_config()
    cluster_config = next((c for c in clusters if c.name == cluster), None)
    if not cluster_config:
        raise HTTPException(status_code=404, detail="Cluster not found")
    if not config_is_configured(cluster_config):
        raise HTTPException(status_code=400, detail="No cn=config credential configured for this cluster")
    if kind not in ("attribute_type", "object_class"):
        raise HTTPException(status_code=400, detail="kind must be 'attribute_type' or 'object_class'")

    password = resolve_config_password(cluster_config)
    host, port = NodeSelector.select_node(cluster_config, OperationType.WRITE)
    client = LDAPClient(
        LDAPConfig(
            host=host, port=port,
            bind_dn=cluster_config.config_bind_dn,
            bind_password=password,
            base_dn=cluster_config.config_base_dn or "cn=config",
            **tls_kwargs(cluster_config),
        )
    )
    client.connect()
    try:
        schema_dn = _resolve_schema_dn(cluster_config, client, schema_name)
        attr = _attr_for_kind(kind)

        rows, _, _ = client.search(schema_dn, "(objectClass=olcSchemaConfig)", scope=ldap.SCOPE_BASE, attrs=[attr])
        values = _as_list(rows[0].get(attr)) if rows else []
        target = next((v for v in values if _parse_definition(v)["name"] == name), None)
        if target is None:
            raise HTTPException(status_code=404, detail=f"{kind} '{name}' not found in {schema_name}")

        # MOD_DELETE needs the exact stored value.
        client.conn.modify_s(schema_dn, [(ldap.MOD_DELETE, attr, [target.encode()])])
    finally:
        client.disconnect()

    return {"status": "deleted", "schema": schema_name, "kind": kind, "name": name}
