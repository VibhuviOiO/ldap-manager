"""
Tests for configuration validation.
"""

import pytest
from pydantic import ValidationError

from app.core.config_validator import (
    NodeConfig,
    FieldConfig,
    TableColumn,
    ClusterConfig,
    validate_config
)


class TestNodeConfig:
    """Test NodeConfig validation."""

    def test_valid_node_config(self):
        """Test valid node configuration."""
        node = NodeConfig(
            host="ldap1.example.com",
            port=389,
            name="primary"
        )

        assert node.host == "ldap1.example.com"
        assert node.port == 389
        assert node.name == "primary"

    def test_node_port_range_validation(self):
        """Test port must be in valid range."""
        # Port too low
        with pytest.raises(ValidationError):
            NodeConfig(host="ldap.example.com", port=0)

        # Port too high
        with pytest.raises(ValidationError):
            NodeConfig(host="ldap.example.com", port=65536)

        # Valid ports
        NodeConfig(host="ldap.example.com", port=1)  # Min
        NodeConfig(host="ldap.example.com", port=65535)  # Max

    def test_node_empty_host_invalid(self):
        """Test that empty host is invalid."""
        with pytest.raises(ValidationError):
            NodeConfig(host="", port=389)

        with pytest.raises(ValidationError):
            NodeConfig(host="   ", port=389)

    def test_node_name_optional(self):
        """Test that node name is optional."""
        node = NodeConfig(host="ldap.example.com", port=389)
        assert node.name is None


class TestFieldConfig:
    """Test FieldConfig validation."""

    def test_valid_field_config(self):
        """Test valid field configuration."""
        field = FieldConfig(
            name="username",
            label="Username",
            type="text",
            required=True,
            placeholder="Enter username"
        )

        assert field.name == "username"
        assert field.type == "text"
        assert field.required is True

    def test_field_type_validation(self):
        """Test that only valid field types are accepted."""
        valid_types = ["text", "email", "password", "number", "select", "textarea"]

        for field_type in valid_types:
            field = FieldConfig(
                name="test",
                label="Test",
                type=field_type
            )
            assert field.type == field_type

        # Invalid type
        with pytest.raises(ValidationError):
            FieldConfig(
                name="test",
                label="Test",
                type="invalid_type"
            )

    def test_field_select_requires_options(self):
        """Test that select fields can have options."""
        field = FieldConfig(
            name="department",
            label="Department",
            type="select",
            options=["IT", "HR", "Sales"]
        )

        assert field.options == ["IT", "HR", "Sales"]


class TestTableColumn:
    """Test TableColumn validation."""

    def test_valid_table_column(self):
        """Test valid table column configuration."""
        column = TableColumn(
            name="mail",
            label="Email",
            default_visible=True
        )

        assert column.name == "mail"
        assert column.default_visible is True

    def test_table_column_defaults(self):
        """Test table column default values."""
        column = TableColumn(
            name="cn",
            label="Common Name"
        )

        assert column.default_visible is True


class TestClusterConfig:
    """Test ClusterConfig validation."""

    def test_valid_single_node_cluster(self):
        """Test valid single-node cluster configuration."""
        cluster = ClusterConfig(
            name="test-cluster",
            host="ldap.example.com",
            port=389,
            bind_dn="cn=admin,dc=example,dc=com",
            base_dn="dc=example,dc=com"
        )

        assert cluster.name == "test-cluster"
        assert cluster.host == "ldap.example.com"
        assert cluster.nodes is None

    def test_valid_multi_node_cluster(self):
        """Test valid multi-node cluster configuration."""
        cluster = ClusterConfig(
            name="ha-cluster",
            nodes=[
                NodeConfig(host="ldap1.example.com", port=389),
                NodeConfig(host="ldap2.example.com", port=390),
            ],
            bind_dn="cn=admin,dc=example,dc=com",
            base_dn="dc=example,dc=com"
        )

        assert cluster.name == "ha-cluster"
        assert len(cluster.nodes) == 2
        assert cluster.host is None

    def test_cluster_requires_name(self):
        """Test that cluster name is required."""
        with pytest.raises(ValidationError):
            ClusterConfig(
                host="ldap.example.com",
                bind_dn="cn=admin,dc=example,dc=com"
            )

    def test_cluster_name_cannot_be_empty(self):
        """Test that cluster name cannot be empty string."""
        with pytest.raises(ValidationError):
            ClusterConfig(
                name="",
                host="ldap.example.com",
                bind_dn="cn=admin,dc=example,dc=com"
            )

    def test_cluster_requires_bind_dn(self):
        """Test that bind_dn is required."""
        with pytest.raises(ValidationError):
            ClusterConfig(
                name="test",
                host="ldap.example.com"
            )

    def test_cluster_cannot_have_both_host_and_nodes(self):
        """Test that cluster cannot specify both host and nodes."""
        with pytest.raises(ValidationError, match="both"):
            ClusterConfig(
                name="test",
                host="ldap.example.com",
                nodes=[NodeConfig(host="ldap2.example.com", port=389)],
                bind_dn="cn=admin,dc=example,dc=com"
            )

    def test_cluster_must_have_host_or_nodes(self):
        """Test that cluster must have either host or nodes."""
        with pytest.raises(ValidationError, match="either"):
            ClusterConfig(
                name="test",
                bind_dn="cn=admin,dc=example,dc=com"
            )

    def test_cluster_readonly_default_false(self):
        """Test that readonly defaults to False."""
        cluster = ClusterConfig(
            name="test",
            host="ldap.example.com",
            bind_dn="cn=admin,dc=example,dc=com"
        )

        assert cluster.readonly is False

    def test_cluster_base_dn_default_empty(self):
        """Test that base_dn defaults to empty string."""
        cluster = ClusterConfig(
            name="test",
            host="ldap.example.com",
            bind_dn="cn=admin,dc=example,dc=com"
        )

        assert cluster.base_dn == ""

    def test_cluster_with_user_creation_form(self):
        """Test cluster with custom user creation form."""
        cluster = ClusterConfig(
            name="test",
            host="ldap.example.com",
            bind_dn="cn=admin,dc=example,dc=com",
            user_creation_form={
                "base_ou": "ou=People,dc=example,dc=com",
                "fields": [
                    {"name": "uid", "label": "User ID", "type": "text", "required": True},
                    {"name": "mail", "label": "Email", "type": "email", "required": True},
                ],
            }
        )

        assert cluster.user_creation_form["base_ou"] == "ou=People,dc=example,dc=com"
        assert len(cluster.user_creation_form["fields"]) == 2

    def test_cluster_with_table_columns(self):
        """Test cluster with custom table columns."""
        cluster = ClusterConfig(
            name="test",
            host="ldap.example.com",
            bind_dn="cn=admin,dc=example,dc=com",
            table_columns={
                "users": [
                    TableColumn(name="uid", label="User ID"),
                    TableColumn(name="mail", label="Email"),
                ]
            }
        )

        assert "users" in cluster.table_columns
        assert len(cluster.table_columns["users"]) == 2

    def test_cluster_table_columns_invalid_key(self):
        """Test that invalid table_columns keys are rejected."""
        with pytest.raises(ValidationError, match="Invalid table_columns key"):
            ClusterConfig(
                name="test",
                host="ldap.example.com",
                bind_dn="cn=admin,dc=example,dc=com",
                table_columns={
                    "invalid_key": [
                        TableColumn(name="cn", label="Name")
                    ]
                }
            )

    def test_cluster_table_columns_valid_keys(self):
        """Test that users, groups, ous are valid table_columns keys."""
        cluster = ClusterConfig(
            name="test",
            host="ldap.example.com",
            bind_dn="cn=admin,dc=example,dc=com",
            table_columns={
                "users": [TableColumn(name="uid", label="UID")],
                "groups": [TableColumn(name="cn", label="Name")],
                "ous": [TableColumn(name="ou", label="OU")],
            }
        )

        assert len(cluster.table_columns) == 3


class TestValidateConfig:
    """Test validate_config function."""

    def test_validate_single_cluster(self):
        """Test validation of single cluster configuration."""
        config_data = [
            {
                "name": "test-cluster",
                "host": "ldap.example.com",
                "port": 389,
                "bind_dn": "cn=admin,dc=example,dc=com",
                "base_dn": "dc=example,dc=com"
            }
        ]

        clusters = validate_config(config_data)

        assert len(clusters) == 1
        assert clusters[0].name == "test-cluster"

    def test_validate_multiple_clusters(self):
        """Test validation of multiple cluster configurations."""
        config_data = [
            {
                "name": "cluster1",
                "host": "ldap1.example.com",
                "bind_dn": "cn=admin,dc=example,dc=com"
            },
            {
                "name": "cluster2",
                "host": "ldap2.example.com",
                "bind_dn": "cn=admin,dc=test,dc=com"
            }
        ]

        clusters = validate_config(config_data)

        assert len(clusters) == 2
        assert clusters[0].name == "cluster1"
        assert clusters[1].name == "cluster2"

    def test_validate_rejects_duplicate_names(self):
        """Test that duplicate cluster names are rejected."""
        config_data = [
            {
                "name": "duplicate",
                "host": "ldap1.example.com",
                "bind_dn": "cn=admin,dc=example,dc=com"
            },
            {
                "name": "duplicate",
                "host": "ldap2.example.com",
                "bind_dn": "cn=admin,dc=example,dc=com"
            }
        ]

        with pytest.raises(ValueError, match="Duplicate cluster names"):
            validate_config(config_data)

    def test_validate_provides_error_with_cluster_index(self):
        """Test that validation errors include cluster index."""
        config_data = [
            {
                "name": "valid-cluster",
                "host": "ldap.example.com",
                "bind_dn": "cn=admin,dc=example,dc=com"
            },
            {
                # Missing name - invalid
                "host": "ldap2.example.com",
                "bind_dn": "cn=admin,dc=example,dc=com"
            }
        ]

        with pytest.raises(ValueError, match="Cluster #2"):
            validate_config(config_data)

    def test_validate_empty_list(self):
        """Test validation of empty configuration list."""
        clusters = validate_config([])
        assert len(clusters) == 0

    def test_validate_preserves_optional_fields(self):
        """Test that optional fields are preserved during validation."""
        config_data = [
            {
                "name": "test-cluster",
                "host": "ldap.example.com",
                "bind_dn": "cn=admin,dc=example,dc=com",
                "description": "Test LDAP Server",
                "readonly": True
            }
        ]

        clusters = validate_config(config_data)

        assert clusters[0].description == "Test LDAP Server"
        assert clusters[0].readonly is True

class TestFieldConfigCheckbox:
    """The UI renders type 'checkbox' as a boolean input (TRUE/FALSE), so the
    validator must accept it - the custom boolean attributes rely on it."""

    def test_checkbox_type_is_accepted(self):
        field = FieldConfig(name="isWarrior", label="Warrior", type="checkbox")
        assert field.type == "checkbox"

    def test_select_options_may_be_objects(self):
        field = FieldConfig(
            name="role", label="Role", type="select",
            options=[{"value": "king", "label": "King"}, "Queen"],
        )
        assert len(field.options) == 2

    def test_unknown_type_is_still_rejected(self):
        with pytest.raises(ValidationError):
            FieldConfig(name="x", label="X", type="not-a-real-type")
