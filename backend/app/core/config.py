import yaml
from pathlib import Path
from typing import List, Optional, Dict, Any

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
    config_path = Path("/app/config.yml")
    if not config_path.exists():
        return []
    
    with open(config_path) as f:
        data = yaml.safe_load(f)
    
    return [LDAPClusterConfig(cluster) for cluster in data.get("clusters", [])]
