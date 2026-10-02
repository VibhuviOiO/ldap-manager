"""
Configuration validation, runnable before you start the app.

    python -m app.cli validate
    python -m app.cli validate --config /path/to/config.yml
    python -m app.cli validate --check-connections
    python -m app.cli validate --json

Exit code is 0 when there are no errors and 1 otherwise, so it works in CI and
as a pre-flight check in a Compose file. Warnings never fail the run.

This is where `config_validator.validate_config` is actually used - it was
defined but never called, and it used to reject the project's own
config.example.yml.
"""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml

from app.core.auth import Role
from app.core.credentials import VALID_SOURCES, env_var_name

VALID_MODES = ("none", "local", "ldap")
VALID_ROLES = tuple(r.value for r in Role)


class Report:
    """Collects errors and warnings so everything is reported, not just the first."""

    def __init__(self) -> None:
        self.errors: List[str] = []
        self.warnings: List[str] = []
        self.infos: List[str] = []

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    def info(self, message: str) -> None:
        self.infos.append(message)

    @property
    def ok(self) -> bool:
        return not self.errors


def _load_yaml(path: Path, report: Report) -> Optional[Dict[str, Any]]:
    if not path.exists():
        report.error(f"Config file not found: {path}")
        return None
    try:
        raw = path.read_text()
    except OSError as exc:
        report.error(f"Cannot read {path}: {exc}")
        return None
    try:
        data = yaml.safe_load(raw)
    except yaml.YAMLError as exc:
        report.error(f"Invalid YAML: {exc}")
        return None
    if not isinstance(data, dict):
        report.error("Config must be a YAML mapping with a top-level 'clusters:' key")
        return None
    return data


def _check_clusters(data: Dict[str, Any], report: Report) -> List[Dict[str, Any]]:
    clusters = data.get("clusters")
    if not clusters:
        report.error("No 'clusters:' key, or it is empty. Nothing would be manageable.")
        return []
    if not isinstance(clusters, list):
        report.error("'clusters' must be a list")
        return []

    # Structural validation via the Pydantic models
    try:
        from app.core.config_validator import validate_config

        validate_config(clusters)
        report.info(f"{len(clusters)} cluster(s) passed schema validation")
    except Exception as exc:  # noqa: BLE001
        report.error(f"{exc}")

    seen: set = set()
    for idx, cluster in enumerate(clusters, start=1):
        label = cluster.get("name") or f"#{idx}"
        if not isinstance(cluster, dict):
            report.error(f"Cluster {label}: must be a mapping")
            continue

        name = cluster.get("name")
        if name in seen:
            report.error(f"Cluster '{name}': duplicate name")
        seen.add(name)

        has_host = cluster.get("host") is not None
        has_nodes = bool(cluster.get("nodes"))
        if has_host and has_nodes:
            report.error(f"Cluster '{label}': set either 'host' or 'nodes', not both")
        if not has_host and not has_nodes:
            report.error(f"Cluster '{label}': needs 'host' (single) or 'nodes' (multi)")

        for node in cluster.get("nodes") or []:
            if not isinstance(node, dict) or not node.get("host"):
                report.error(f"Cluster '{label}': every node needs a 'host'")
                continue
            port = node.get("port")
            if port is not None and not (isinstance(port, int) and 1 <= port <= 65535):
                report.error(f"Cluster '{label}': node port must be 1-65535, got {port!r}")

        if not cluster.get("base_dn"):
            report.warn(f"Cluster '{label}': no 'base_dn' - browsing and backup will need one")

        if not isinstance(cluster.get("readonly", False), bool):
            report.error(f"Cluster '{label}': 'readonly' must be true or false")

        form = cluster.get("user_creation_form")
        if form is not None:
            if not isinstance(form, dict):
                report.error(f"Cluster '{label}': 'user_creation_form' must be a mapping")
            else:
                if not form.get("base_ou"):
                    report.warn(f"Cluster '{label}': user_creation_form has no 'base_ou'")
                fields = form.get("fields") or []
                if not fields:
                    report.warn(f"Cluster '{label}': user_creation_form has no 'fields'")
                # Reuse the documented field model rather than ad-hoc key checks,
                # so the reported problems match the schema exactly.
                from app.core.config_validator import FieldConfig

                for index, field in enumerate(fields, start=1):
                    if not isinstance(field, dict):
                        report.error(f"Cluster '{label}': form field #{index} must be a mapping")
                        continue
                    try:
                        FieldConfig(**field)
                    except Exception as exc:  # noqa: BLE001
                        first = str(exc).splitlines()[0]
                        report.error(f"Cluster '{label}': form field #{index}: {first}")

    return clusters


def _check_credentials(clusters: List[Dict[str, Any]], report: Report) -> None:
    for cluster in clusters:
        name = cluster.get("name", "?")
        block = cluster.get("credential") or {}
        if not isinstance(block, dict):
            report.error(f"Cluster '{name}': 'credential' must be a mapping")
            continue

        source = str(block.get("source", "env")).lower()
        if source not in VALID_SOURCES:
            report.error(
                f"Cluster '{name}': credential.source '{source}' is not one of {VALID_SOURCES}"
            )
            continue

        if source == "env":
            var = block.get("env") or f"LDAP_MANAGER_CLUSTER_{_safe(name)}_PASSWORD"
            if not os.getenv(var):
                report.warn(f"Cluster '{name}': ${var} is not set in this environment")
            else:
                report.info(f"Cluster '{name}': password from ${var}")
        elif source == "file":
            target = block.get("file")
            if not target:
                report.error(f"Cluster '{name}': credential.source is 'file' but no 'file:' given")
            elif not Path(str(target)).exists():
                report.error(f"Cluster '{name}': secret file not found: {target}")
            else:
                try:
                    content = Path(str(target)).read_text().strip()
                    if not content:
                        report.warn(f"Cluster '{name}': secret file {target} is empty")
                    else:
                        report.info(f"Cluster '{name}': password from {target}")
                except OSError as exc:
                    report.error(f"Cluster '{name}': cannot read {target}: {exc}")
        elif source == "config":
            if not block.get("bind_password"):
                report.error(f"Cluster '{name}': source 'config' needs 'bind_password'")
            report.warn(
                f"Cluster '{name}': password stored in PLAINTEXT in config.yml - "
                "prefer 'env' or 'file'"
            )


def _safe(name: str) -> str:
    import re

    return re.sub(r"[^A-Za-z0-9]+", "_", str(name)).upper()


def _check_auth(data: Dict[str, Any], clusters: List[Dict[str, Any]], report: Report) -> None:
    auth = data.get("auth")

    if auth is None:
        report.warn(
            "No 'auth:' block - running with mode 'none' and default_role 'readonly', "
            "so the app is VIEW-ONLY. Add auth.default_role: admin to allow changes, "
            "or auth.mode: local|ldap for sign-in."
        )
        return
    if not isinstance(auth, dict):
        report.error("'auth' must be a mapping")
        return

    mode = str(auth.get("mode", "none")).lower()
    mode_ok = mode in VALID_MODES
    if mode_ok:
        report.info(f"auth.mode = {mode}")
    else:
        report.error(f"auth.mode '{mode}' is not one of {VALID_MODES}")

    default_role = str(auth.get("default_role", "readonly")).lower()
    if default_role not in VALID_ROLES:
        report.error(f"auth.default_role '{default_role}' is not one of {VALID_ROLES}")

    if mode_ok and mode == "none" and default_role == "readonly":
        report.warn(
            "auth.mode is 'none' with default_role 'readonly': the app is READ-ONLY. "
            "Set auth.default_role: admin to allow changes behind your proxy."
        )

    session = auth.get("session") or {}
    hours = session.get("lifetime_hours", 12)
    if not isinstance(hours, int) or isinstance(hours, bool) or hours <= 0:
        report.error(f"auth.session.lifetime_hours must be a positive integer, got {hours!r}")

    if mode_ok and mode == "local":
        try:
            from app.core.secrets import users_configured

            if users_configured():
                report.info("Built-in accounts exist")
            else:
                report.info(
                    "No built-in accounts yet - the first-run wizard appears on first load"
                )
        except Exception:  # noqa: BLE001 - store may not be readable yet
            report.info("No built-in accounts yet - the first-run wizard appears on first load")

    # Validated whenever present, not only in ldap mode: a typo in auth.mode
    # should not hide a broken ldap block.
    ldap_block = auth.get("ldap")
    if isinstance(ldap_block, dict) and ldap_block:
        if mode_ok and mode != "ldap":
            report.warn(f"auth.ldap is configured but auth.mode is '{mode}', so it is ignored")

        target = ldap_block.get("cluster")
        names = [c.get("name") for c in clusters]
        if not target:
            report.error("auth.ldap.cluster is required - name the authenticating cluster")
        elif target not in names:
            report.error(
                f"auth.ldap.cluster '{target}' is not one of the configured clusters: {names}"
            )
        elif names:
            report.info(
                f"Cluster '{target}' authenticates users; the other {len(names) - 1} are managed"
            )

        if not ldap_block.get("user_dn_template") and not ldap_block.get("user_base_dn"):
            report.error(
                "auth.ldap needs 'user_dn_template' (e.g. uid={username},ou=People,dc=x,dc=com) "
                "or 'user_base_dn' to locate users"
            )

        role_map = ldap_block.get("role_map")
        if role_map is not None and not isinstance(role_map, dict):
            report.error("auth.ldap.role_map must be a mapping")
        elif isinstance(role_map, dict):
            mapped_default = str(role_map.get("default", "readonly")).lower()
            if mapped_default not in VALID_ROLES:
                report.error(
                    f"auth.ldap.role_map.default '{mapped_default}' is not one of {VALID_ROLES}"
                )
            groups = role_map.get("groups") or {}
            if not isinstance(groups, dict):
                report.error("auth.ldap.role_map.groups must be a mapping of group DN -> role")
            elif not groups:
                report.warn(
                    "auth.ldap.role_map.groups is empty - every user gets the default role "
                    f"'{mapped_default}'"
                )
            else:
                for dn, role in groups.items():
                    if str(role).lower() not in VALID_ROLES:
                        report.error(
                            f"auth.ldap.role_map: group '{dn}' maps to unknown role '{role}'"
                        )
    elif mode_ok and mode == "ldap":
        report.error("auth.mode is 'ldap' but there is no 'auth.ldap' block")


def _check_connections(clusters: List[Dict[str, Any]], report: Report) -> None:
    """Actually bind to each cluster. Opt-in because it needs network access."""
    from app.core.credentials import resolve_password
    from app.core.ldap_client import LDAPClient, LDAPConfig, tls_kwargs
    from app.core.config import LDAPClusterConfig
    from app.core.node_selector import NodeSelector, OperationType

    for raw in clusters:
        name = raw.get("name", "?")
        cluster = LDAPClusterConfig(raw)
        password = resolve_password(cluster)
        if not password:
            report.warn(f"Cluster '{name}': no credential available, connection not tested")
            continue
        try:
            host, port = NodeSelector.select_node(cluster, OperationType.HEALTH)
            client = LDAPClient(
                LDAPConfig(
                    host=host,
                    port=port,
                    bind_dn=cluster.bind_dn,
                    bind_password=password,
                    base_dn=cluster.base_dn or "",
                    **tls_kwargs(cluster),
                )
            )
            client.connect()
            client.disconnect()
            report.info(f"Cluster '{name}': connected to {host}:{port}")
        except Exception as exc:  # noqa: BLE001
            report.error(f"Cluster '{name}': connection failed - {exc}")


def cmd_validate(args: argparse.Namespace) -> int:
    path = Path(args.config or os.getenv("LDAP_MANAGER_CONFIG", "/app/config.yml"))
    report = Report()

    data = _load_yaml(path, report)
    clusters: List[Dict[str, Any]] = []
    if data is not None:
        clusters = _check_clusters(data, report)
        _check_credentials(clusters, report)
        _check_auth(data, clusters, report)
        if args.check_connections:
            _check_connections(clusters, report)

    if args.json:
        print(json.dumps(
            {
                "config": str(path),
                "ok": report.ok,
                "errors": report.errors,
                "warnings": report.warnings,
                "info": report.infos,
                "clusters": [c.get("name") for c in clusters],
            },
            indent=2,
        ))
        return 0 if report.ok else 1

    print(f"Validating {path}")
    print()
    for message in report.infos:
        print(f"  ok    {message}")
    for message in report.warnings:
        print(f"  warn  {message}")
    for message in report.errors:
        print(f"  ERROR {message}")
    print()
    if report.ok:
        print(f"VALID - {len(report.warnings)} warning(s)" if report.warnings else "VALID")
        return 0
    print(f"INVALID - {len(report.errors)} error(s)")
    return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.cli",
        description="LDAP Manager command line tools",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    validate = sub.add_parser("validate", help="Validate config.yml before starting the app")
    validate.add_argument("--config", help="Path to config.yml (default $LDAP_MANAGER_CONFIG or /app/config.yml)")
    validate.add_argument("--check-connections", action="store_true", help="Also bind to each cluster")
    validate.add_argument("--json", action="store_true", help="Machine-readable output")
    validate.set_defaults(func=cmd_validate)

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
