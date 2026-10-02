"""
Cluster bind passwords, supplied from outside the app only.

Per cluster, in config.yml:

    clusters:
      - name: prod
        ...
        credential:
          source: env      # env | file | config

  env      Read from an environment variable, so the secret never touches disk.
           Defaults to LDAP_MANAGER_CLUSTER_<NAME>_PASSWORD.
  file     Read from a mounted secret file (Docker/Compose/Kubernetes secret).
  config   Plaintext `bind_password` in config.yml. Convenient for a lab, and
           logs a warning because the secret is then in the config file.

The app never stores a password: there is no runtime cache and no write path.
`env` is the default because a cluster with no credential block then fails
closed with a clear "the environment variable is not set" warning instead of
silently having nowhere to look.

Each entry point calls resolve_password(cluster); nothing reads a secret store.
"""

import logging
import os
import re
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

SOURCE_ENV = "env"
SOURCE_FILE = "file"
SOURCE_CONFIG = "config"

VALID_SOURCES = (SOURCE_ENV, SOURCE_FILE, SOURCE_CONFIG)


def source_of(cluster: Any) -> str:
    source = str(getattr(cluster, "credential_source", SOURCE_ENV) or SOURCE_ENV).lower()
    if source not in VALID_SOURCES:
        logger.warning(
            "Cluster '%s': unknown credential source %r - falling back to '%s'",
            getattr(cluster, "name", "?"), source, SOURCE_ENV,
        )
        return SOURCE_ENV
    return source


def env_var_name(cluster: Any) -> str:
    """Explicit `credential.env`, else a predictable name derived from the cluster."""
    configured = getattr(cluster, "credential_env", None)
    if configured:
        return str(configured)
    safe = re.sub(r"[^A-Za-z0-9]+", "_", str(getattr(cluster, "name", "cluster"))).upper()
    return f"LDAP_MANAGER_CLUSTER_{safe}_PASSWORD"


def resolve_password(cluster: Any) -> Optional[str]:
    """The bind password for this cluster, or None when it is not configured."""
    source = source_of(cluster)
    name = str(getattr(cluster, "name", ""))

    if source == SOURCE_ENV:
        value = os.getenv(env_var_name(cluster))
        if not value:
            logger.warning(
                "Cluster '%s' expects its password in $%s, which is not set",
                name, env_var_name(cluster),
            )
        return value or None

    if source == SOURCE_FILE:
        path = getattr(cluster, "credential_file", None)
        if not path:
            logger.error("Cluster '%s' uses source 'file' but credential.file is not set", name)
            return None
        try:
            value = Path(str(path)).read_text().strip()
            return value or None
        except OSError as exc:
            logger.error("Cluster '%s': cannot read %s: %s", name, path, exc)
            return None

    if source == SOURCE_CONFIG:
        value = getattr(cluster, "bind_password", None)
        if value:
            logger.warning(
                "Cluster '%s' reads its password in plaintext from config.yml. "
                "Use source 'env' or 'file' instead.",
                name,
            )
        return value or None

    return None


def describe(cluster: Any) -> Dict[str, Any]:
    """Non-secret description of where this cluster's password comes from."""
    source = source_of(cluster)
    detail: Dict[str, Any] = {
        "source": source,
        "available": resolve_password(cluster) is not None,
    }
    if source == SOURCE_ENV:
        detail["env_var"] = env_var_name(cluster)
    elif source == SOURCE_FILE:
        detail["file"] = getattr(cluster, "credential_file", None)
    elif source == SOURCE_CONFIG:
        detail["hint"] = "Plaintext in config.yml."
    return detail


# ------------------------------------------------------------------ cn=config --
# The schema and ACI editors need cn=config, which the data bind DN usually
# cannot read. This is a separate credential with the same source model.


def config_source_of(cluster: Any) -> str:
    source = str(getattr(cluster, "config_credential_source", SOURCE_ENV) or SOURCE_ENV).lower()
    if source not in VALID_SOURCES:
        return SOURCE_ENV
    return source


def config_env_var_name(cluster: Any) -> str:
    configured = getattr(cluster, "config_credential_env", None)
    if configured:
        return str(configured)
    safe = re.sub(r"[^A-Za-z0-9]+", "_", str(getattr(cluster, "name", "cluster"))).upper()
    return f"LDAP_MANAGER_CONFIG_{safe}_PASSWORD"


def resolve_config_password(cluster: Any) -> Optional[str]:
    """The cn=config admin password for this cluster, or None."""
    source = config_source_of(cluster)
    name = str(getattr(cluster, "name", ""))

    if source == SOURCE_ENV:
        value = os.getenv(config_env_var_name(cluster))
        if not value:
            logger.warning(
                "Cluster '%s' expects its config password in $%s, which is not set",
                name, config_env_var_name(cluster),
            )
        return value or None
    if source == SOURCE_FILE:
        path = getattr(cluster, "config_credential_file", None)
        if not path:
            return None
        try:
            return Path(str(path)).read_text().strip() or None
        except OSError as exc:
            logger.error("Cluster '%s': cannot read config secret %s: %s", name, path, exc)
            return None
    if source == SOURCE_CONFIG:
        value = getattr(cluster, "config_bind_password", None)
        if value:
            logger.warning(
                "Cluster '%s' reads its cn=config password in plaintext from config.yml. "
                "Use source 'env' or 'file' instead.",
                name,
            )
        return value or None

    return None


def config_is_configured(cluster: Any) -> bool:
    """True when the config credential can be resolved right now."""
    return resolve_config_password(cluster) is not None
