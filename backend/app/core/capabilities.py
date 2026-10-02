"""
Optional OpenLDAP server capabilities.

This app talks plain LDAP, so it works against anyone's OpenLDAP. But a few
features lean on optional server-side configuration that a stock
`apt install slapd` does not enable. Rather than erroring, each one is probed:
when it is missing the UI explains what is unavailable and shows the exact
steps to enable it on the operator's OWN server.

The snippets live here so the API and the docs describe the same thing.
"""

import logging
from typing import Any, Dict, List, Optional

import ldap

logger = logging.getLogger(__name__)


def _enable_accesslog(data_database_dn: str, log_directory: str = "/var/lib/ldap/accesslog") -> str:
    """
    accesslog writes change records into an LDAP database, so unlike the
    file-based auditlog overlay they can be read over the network - which is
    what makes this work against a remote or managed server.
    """
    return f"""# 1. Load the accesslog schema, then the module
dn: cn=module{{0}},cn=config
changetype: modify
add: olcModuleLoad
olcModuleLoad: accesslog

# 2. Create the log database
dn: olcDatabase={{3}}mdb,cn=config
changetype: add
objectClass: olcDatabaseConfig
objectClass: olcMdbConfig
olcDatabase: {{3}}mdb
olcSuffix: cn=log
olcDbDirectory: {log_directory}
olcRootDN: cn=admin,cn=log
olcAccess: to * by dn.base="gidNumber=0+uidNumber=0,cn=peercred,cn=external,cn=auth" read
  by dn.base="cn=admin,cn=log" write

# 3. Attach it to your data database ({data_database_dn})
dn: olcOverlay=accesslog,{data_database_dn}
changetype: add
objectClass: olcOverlayConfig
objectClass: olcAccessLogConfig
olcOverlay: accesslog
olcAccessLogDB: cn=log
olcAccessLogOps: writes
olcAccessLogSuccess: TRUE
olcAccessLogPurge: 07+00:00 01+00:00
"""


ENABLE_MONITOR = """# Enable the monitor backend (needed for the Monitoring page)
dn: cn=module{0},cn=config
changetype: modify
add: olcModuleLoad
olcModuleLoad: back_monitor

dn: olcDatabase={1}monitor,cn=config
changetype: modify
add: olcAccess
olcAccess: to * by dn.exact="cn=Manager,dc=example,dc=com" read by * none
"""

ENABLE_CONFIG_ACCESS = """# Give this app a cn=config credential.
# Simplest: use the config admin that already exists.
#   config:
#     bind_dn: "cn=config"
#     credential:
#       source: env        # LDAP_MANAGER_CONFIG_<CLUSTER>_PASSWORD
#
# Or grant a dedicated DN read access to cn=config:
dn: cn=config
changetype: modify
add: olcAccess
olcAccess: to * by dn.exact="cn=ldap-manager,dc=example,dc=com" read by * none
"""


def _find_data_database(client) -> Optional[str]:
    """The mdb database DN that holds the directory, for the overlay snippet."""
    try:
        rows, _, _ = client.search(
            "cn=config", "(objectClass=olcMdbConfig)", scope=ldap.SCOPE_SUBTREE, attrs=["olcSuffix"]
        )
    except Exception:  # noqa: BLE001 - detection must never raise
        return None
    for row in rows:
        dn = row.get("dn", "")
        if "olcDatabase=" in dn and "cn=config" in dn and "cn=log" not in dn:
            return dn
    return None


def probe(cluster_config) -> List[Dict[str, Any]]:
    """
    Report each optional capability. Never raises: an unreachable server just
    means every capability reads as unknown.
    """
    from app.core.credentials import config_is_configured, resolve_config_password, resolve_password
    from app.core.ldap_client import LDAPClient, LDAPConfig, tls_kwargs
    from app.core.node_selector import NodeSelector, OperationType

    results: List[Dict[str, Any]] = []

    # --- cn=config reachable? (a prerequisite for the schema/ACI editors and
    #     for detecting the others) ---
    config_ready = config_is_configured(cluster_config)
    results.append({
        "id": "config",
        "title": "cn=config access",
        "why": "The Schema and ACI editors read cn=config. The data bind DN usually cannot.",
        "status": "ok" if config_ready else "missing",
        "enable_ldif": None if config_ready else ENABLE_CONFIG_ACCESS,
    })

    # --- data bind: monitor backend + accesslog overlay ---
    password = resolve_password(cluster_config)
    if not password:
        for cid, title, why in (
            ("monitor", "Monitoring backend (cn=Monitor)",
             "Per-node stats and the replication view read cn=Monitor."),
            ("accesslog", "Server-side change log (accesslog)",
             "Without it, changes made by scripts, ldapmodify or replication are invisible."),
        ):
            results.append({"id": cid, "title": title, "why": why, "status": "unknown",
                            "enable_ldif": None})
        return results

    host, port = NodeSelector.select_node(cluster_config, OperationType.READ)
    client = LDAPClient(LDAPConfig(
        host=host, port=port,
        bind_dn=cluster_config.bind_dn,
        bind_password=password,
        base_dn=cluster_config.base_dn or "",
        **tls_kwargs(cluster_config),
    ))
    try:
        client.connect()

        # cn=Monitor present?
        try:
            rows, _, _ = client.search("cn=Monitor", "(objectClass=*)", scope=ldap.SCOPE_BASE, attrs=["cn"])
            monitor_ok = bool(rows)
        except Exception:  # noqa: BLE001
            monitor_ok = False
        results.append({
            "id": "monitor",
            "title": "Monitoring backend (cn=Monitor)",
            "why": "Per-node stats and the replication view read cn=Monitor.",
            "status": "ok" if monitor_ok else "missing",
            "enable_ldif": None if monitor_ok else ENABLE_MONITOR,
        })

        # accesslog: an overlay under the data database, or a cn=log database.
        accesslog_ok = False
        if config_ready:
            try:
                config_password = resolve_config_password(cluster_config)
                cclient = LDAPClient(LDAPConfig(
                    host=host, port=port,
                    bind_dn=cluster_config.config_bind_dn,
                    bind_password=config_password,
                    base_dn=cluster_config.config_base_dn or "cn=config",
                    **tls_kwargs(cluster_config),
                ))
                cclient.connect()
                try:
                    rows, _, _ = cclient.search(
                        cluster_config.config_base_dn or "cn=config",
                        "(objectClass=olcOverlayConfig)",
                        scope=ldap.SCOPE_SUBTREE, attrs=["olcOverlay"],
                    )
                    for row in rows:
                        values = row.get("olcOverlay") or []
                        if isinstance(values, str):
                            values = [values]
                        if any(str(v).lower() == "accesslog" for v in values):
                            accesslog_ok = True
                            break
                    data_db = _find_data_database(cclient)
                finally:
                    cclient.disconnect()
            except Exception as exc:  # noqa: BLE001
                logger.info("capability probe: accesslog check failed for %s: %s", cluster_config.name, exc)
                data_db = None
        else:
            data_db = None

        if accesslog_ok:
            status, snippet = "ok", None
        elif config_ready:
            status = "missing"
            snippet = _enable_accesslog(data_db or "olcDatabase={2}mdb,cn=config")
        else:
            # We cannot see cn=config, so we genuinely do not know.
            status, snippet = "unknown", None

        results.append({
            "id": "accesslog",
            "title": "Server-side change log (accesslog)",
            "why": "Without it, changes made by scripts, ldapmodify or replication are invisible.",
            "status": status,
            "enable_ldif": snippet,
        })
    except Exception as exc:  # noqa: BLE001
        logger.info("capability probe failed for %s: %s", cluster_config.name, exc)
        results.append({"id": "monitor", "title": "Monitoring backend (cn=Monitor)",
                        "why": "Per-node stats and the replication view read cn=Monitor.",
                        "status": "unknown", "enable_ldif": None})
        results.append({"id": "accesslog", "title": "Server-side change log (accesslog)",
                        "why": "Without it, changes made by scripts, ldapmodify or replication are invisible.",
                        "status": "unknown", "enable_ldif": None})
    finally:
        try:
            client.disconnect()
        except Exception:  # noqa: BLE001
            pass

    return results
