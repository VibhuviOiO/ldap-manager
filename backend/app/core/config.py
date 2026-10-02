import os
import yaml
from pathlib import Path
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

# Single source of truth for the config location. LDAP_MANAGER_CONFIG lets a
# deployment (or a test) point somewhere other than the default mount.
CONFIG_PATH = Path(os.getenv("LDAP_MANAGER_CONFIG", "/app/config.yml"))

# Writable app directory, used for the audit log. config.yml itself is
# operator-owned and is never written to.
DATA_DIR = Path(os.getenv("LDAP_MANAGER_DATA", "/app/.data"))

class LDAPClusterConfig:
    def __init__(self, data: Dict[str, Any]):
        self.name = data.get("name")
        self.host = data.get("host")
        # Only set default port for single-node clusters
        # For multi-node clusters, port should be None so connection logic uses node ports
        self.port = data.get("port") if data.get("nodes") else data.get("port", 389)
        self.nodes = data.get("nodes", [])
        self.base_dn = data.get("base_dn")
        self.bind_dn = data.get("bind_dn")
        self.bind_password = data.get("bind_password")
        self.readonly = data.get("readonly", False)
        self.description = data.get("description", "")
        self.user_creation_form = data.get("user_creation_form")
        self.table_columns = data.get("table_columns")

        # How the bind password for this cluster is supplied. See
        # app/core/credentials.py - the operator picks per cluster:
        #   env    (default) read from an environment variable
        #   file              read from a mounted secret file
        #   config            plaintext `bind_password` in config.yml (lab only)
        credential = data.get("credential") or {}
        if not isinstance(credential, dict):
            logger.warning(
                "Cluster '%s': 'credential' must be a mapping - using 'env'", self.name
            )
            credential = {}
        self.credential_source = str(credential.get("source", "env")).lower()
        self.credential_env = credential.get("env")
        self.credential_file = credential.get("file")
        self.credential_optional = bool(credential.get("optional", False))

        # Optional connection to cn=config, for the schema and ACI editors. The
        # data bind DN usually cannot read cn=config, so this is a separate
        # credential. Defaults to the OpenLDAP convention (cn=config admin).
        config_block = data.get("config") or {}
        if not isinstance(config_block, dict):
            logger.warning(
                "Cluster '%s': 'config' must be a mapping - ignoring it", self.name
            )
            config_block = {}
        self.config_bind_dn = str(config_block.get("bind_dn", "cn=config"))
        self.config_base_dn = str(config_block.get("base_dn", "cn=config"))
        config_credential = config_block.get("credential") or {}
        if not isinstance(config_credential, dict):
            config_credential = {}
        self.config_credential_source = str(config_credential.get("source", "env")).lower()
        self.config_credential_env = config_credential.get("env")
        self.config_credential_file = config_credential.get("file")
        self.config_bind_password = config_credential.get("bind_password")

        # TLS for this cluster's connections.
        #   mode: none (default) | ldaps | starttls
        #   ca_file / cert_file / key_file: paths readable inside the container
        #   verify: true (default) checks the server certificate against ca_file;
        #           false accepts any certificate - lab use only.
        tls_block = data.get("tls") or {}
        if not isinstance(tls_block, dict):
            logger.warning("Cluster '%s': 'tls' must be a mapping - ignoring it", self.name)
            tls_block = {}
        mode = str(tls_block.get("mode", "none")).lower()
        if mode not in ("none", "ldaps", "starttls"):
            logger.warning(
                "Cluster '%s': unknown tls.mode '%s' - falling back to 'none'", self.name, mode
            )
            mode = "none"
        self.tls_mode = mode
        self.tls_ca_file = tls_block.get("ca_file")
        self.tls_cert_file = tls_block.get("cert_file")
        self.tls_key_file = tls_block.get("key_file")
        self.tls_verify = bool(tls_block.get("verify", True))


def _cluster_data_from_file() -> List[Dict[str, Any]]:
    """Clusters declared in config.yml. Raises on malformed input."""
    if not CONFIG_PATH.exists():
        logger.warning(f"Config file not found at {CONFIG_PATH}")
        return []

    try:
        with open(CONFIG_PATH) as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        logger.error(f"YAML parsing error: {e}")
        raise Exception(f"Invalid YAML in config.yml: {str(e)}")

    if not data or "clusters" not in data:
        logger.error("Invalid config.yml: 'clusters' key not found")
        raise Exception("Invalid config.yml: 'clusters' key required")

    clusters_data = data.get("clusters") or []

    for idx, cluster in enumerate(clusters_data):
        if not cluster.get("name"):
            raise Exception(f"Cluster #{idx + 1} missing required field 'name'")
        if not cluster.get("bind_dn"):
            raise Exception(f"Cluster '{cluster.get('name')}' missing required field 'bind_dn'")

        has_host = cluster.get("host") is not None
        has_nodes = bool(cluster.get("nodes"))
        if has_host == has_nodes:
            raise Exception(
                f"Cluster '{cluster.get('name')}' must have either 'host' or 'nodes', not both"
            )

    return clusters_data


def load_config() -> List[LDAPClusterConfig]:
    """
    Every cluster declared in config.yml, exactly as declared there.

    config.yml is read on each call, so an edit on the host takes effect on the
    next request - no restart. There is no other source: the app never creates
    or stores a cluster at runtime.
    """
    clusters = [LDAPClusterConfig(cluster) for cluster in _cluster_data_from_file()]
    logger.info("Loaded %d cluster(s) from %s", len(clusters), CONFIG_PATH)
    return clusters
