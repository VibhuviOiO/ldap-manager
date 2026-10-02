"""
Configuration validation using Pydantic models.

Validates config.yml structure and constraints before loading.
"""

from pydantic import BaseModel, validator, Field, model_validator
from typing import List, Dict, Optional, Any


class NodeConfig(BaseModel):
    """Single LDAP node configuration."""
    host: str = Field(..., min_length=1, description="LDAP server hostname or IP")
    port: int = Field(..., ge=1, le=65535, description="LDAP server port (1-65535)")
    name: Optional[str] = Field(None, description="Optional node name")

    @validator('host')
    def validate_host(cls, v):
        """Validate host is not empty after stripping."""
        if not v or not v.strip():
            raise ValueError('Host cannot be empty')
        return v.strip()


class FieldConfig(BaseModel):
    """
    A field in the no-code user creation form.

    `default` is Any, not str: gidNumber/shadowMax/shadowWarning legitimately use
    numbers in config.example.yml, and typing it as str made this reject them.
    """
    name: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    # 'checkbox' is what the UI renders as a boolean input (TRUE/FALSE), which
    # is how the custom boolean attributes such as isWarrior/isAdmin are set.
    type: str = Field(..., pattern='^(text|email|password|number|select|textarea|checkbox)$')
    required: bool = False
    default: Optional[Any] = None
    auto_generate: Optional[str] = None
    options: Optional[List[Any]] = None
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    readonly: bool = False

    class Config:
        extra = "allow"


class TableColumn(BaseModel):
    """
    A column in the directory table.

    config.yml uses {name, label, default_visible}. This previously required
    {attribute, visible, sortable}, so the validator rejected the project's own
    config.example.yml. Extra keys are allowed for forward compatibility.
    """
    name: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    default_visible: bool = True

    class Config:
        extra = "allow"


class ClusterConfig(BaseModel):
    """LDAP cluster configuration."""
    name: str = Field(..., min_length=1, description="Cluster identifier")
    description: Optional[str] = None

    # Single-node configuration
    host: Optional[str] = Field(None, min_length=1)
    port: Optional[int] = Field(None, ge=1, le=65535)

    # Multi-node configuration
    nodes: Optional[List[NodeConfig]] = None

    # Authentication and directory base
    bind_dn: str = Field(..., min_length=1, description="Bind DN for authentication")
    base_dn: str = Field(default="", description="Directory base DN")

    # Feature flags
    readonly: bool = False

    @model_validator(mode="after")
    def _require_host_or_nodes(self):
        """A cluster with neither cannot be dialled, so reject it early."""
        if not self.host and not self.nodes:
            raise ValueError("A cluster needs either 'host' (single node) or 'nodes' (multi-node)")
        return self

    # UI customization
    # user_creation_form is a MAPPING in config.yml ({base_ou, object_classes,
    # fields}). It was typed as a list here, which made this validator reject the
    # project's own config.example.yml. Kept permissive; app.cli checks the
    # inner shape and reports it as a warning rather than refusing to load.
    user_creation_form: Optional[Dict[str, Any]] = None
    table_columns: Optional[Dict[str, List[TableColumn]]] = None

    # How the bind password is supplied. Checked in detail by app.cli.
    credential: Optional[Dict[str, Any]] = None

    @validator('name')
    def validate_name(cls, v):
        """Validate cluster name is not empty."""
        if not v or not v.strip():
            raise ValueError('Cluster name cannot be empty')
        return v.strip()

    @validator('bind_dn')
    def validate_bind_dn(cls, v):
        """Validate bind_dn is not empty."""
        if not v or not v.strip():
            raise ValueError('Bind DN cannot be empty')
        return v.strip()

    @validator('nodes')
    def validate_nodes_xor_host(cls, v, values):
        """Ensure either 'host' or 'nodes' is specified, not both."""
        has_host = values.get('host') is not None
        has_nodes = v is not None and len(v) > 0

        if has_host and has_nodes:
            raise ValueError('Cannot specify both "host" and "nodes" - choose one')

        if not has_host and not has_nodes:
            raise ValueError('Must specify either "host" or "nodes"')

        return v

    @validator('table_columns')
    def validate_table_columns(cls, v):
        """Validate table_columns structure."""
        if v:
            valid_keys = {'users', 'groups', 'ous'}
            for key in v.keys():
                if key not in valid_keys:
                    raise ValueError(f'Invalid table_columns key: {key}. Must be one of: {valid_keys}')
        return v


def validate_config(config_data: List[Dict[str, Any]]) -> List[ClusterConfig]:
    """
    Validate configuration data against schema.

    Args:
        config_data: List of cluster configuration dictionaries

    Returns:
        List of validated ClusterConfig objects

    Raises:
        ValidationError: If configuration is invalid
    """
    validated_clusters = []

    for idx, cluster_data in enumerate(config_data):
        try:
            cluster = ClusterConfig(**cluster_data)
            validated_clusters.append(cluster)
        except Exception as e:
            raise ValueError(f"Cluster #{idx + 1} validation failed: {str(e)}")

    # Check for duplicate cluster names
    cluster_names = [c.name for c in validated_clusters]
    duplicates = [name for name in cluster_names if cluster_names.count(name) > 1]
    if duplicates:
        raise ValueError(f"Duplicate cluster names found: {set(duplicates)}")

    return validated_clusters
