import yaml
from pathlib import Path
from typing import List, Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)

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

def load_config() -> List[LDAPClusterConfig]:
    """
    Load and validate LDAP cluster configuration from config.yml.

    Returns:
        List of LDAPClusterConfig objects

    Raises:
        Exception: If config file is invalid or missing required fields
    """
    config_path = Path("/app/config.yml")
    if not config_path.exists():
        logger.warning("Config file not found at /app/config.yml")
        return []

    try:
        with open(config_path) as f:
            data = yaml.safe_load(f)

        if not data or "clusters" not in data:
            logger.error("Invalid config.yml: 'clusters' key not found")
            raise Exception("Invalid config.yml: 'clusters' key required")

        clusters_data = data.get("clusters", [])

        # Basic validation
        for idx, cluster in enumerate(clusters_data):
            if not cluster.get("name"):
                raise Exception(f"Cluster #{idx + 1} missing required field 'name'")
            if not cluster.get("bind_dn"):
                raise Exception(f"Cluster '{cluster.get('name')}' missing required field 'bind_dn'")

            # Validate host/nodes XOR
            has_host = cluster.get("host") is not None
            has_nodes = cluster.get("nodes") and len(cluster.get("nodes", [])) > 0
            if has_host == has_nodes:  # Both true or both false
                raise Exception(f"Cluster '{cluster.get('name')}' must have either 'host' or 'nodes', not both")

        logger.info(f"Loaded configuration with {len(clusters_data)} cluster(s)")
        return [LDAPClusterConfig(cluster) for cluster in clusters_data]

    except yaml.YAMLError as e:
        logger.error(f"YAML parsing error: {e}")
        raise Exception(f"Invalid YAML in config.yml: {str(e)}")
    except Exception as e:
        logger.error(f"Configuration loading failed: {e}")
        raise
