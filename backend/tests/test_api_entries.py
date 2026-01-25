"""
Tests for entries API endpoints.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from starlette.testclient import TestClient

from app.main import app
from app.core.ldap_client import LDAPConfig


client = TestClient(app)


@pytest.fixture
def mock_load_config():
    """Mock configuration loader."""
    with patch('app.api.entries.load_config') as mock:
        cluster = Mock()
        cluster.name = "test-cluster"
        cluster.host = "ldap.example.com"
        cluster.port = 389
        cluster.nodes = None
        cluster.bind_dn = "cn=admin,dc=example,dc=com"
        cluster.base_dn = "dc=example,dc=com"
        cluster.readonly = False
        cluster.user_creation_form = None
        cluster.table_columns = None
        mock.return_value = [cluster]
        yield mock


@pytest.fixture
def mock_password_cache():
    """Mock password cache."""
    with patch('app.api.entries.get_password') as mock:
        mock.return_value = "cached-password"
        yield mock


@pytest.fixture
def mock_ldap_client():
    """Mock LDAP client."""
    with patch('app.api.entries.LDAPClient') as mock:
        client_instance = MagicMock()
        mock.return_value = client_instance
        yield client_instance


class TestStatsEndpoint:
    """Test /api/entries/stats endpoint."""

    def test_stats_success(self, mock_load_config, mock_password_cache, mock_ldap_client):
        """Test successful stats retrieval."""
        # Mock entry counts
        mock_ldap_client.get_entry_count.side_effect = [100, 50, 20, 10]  # total, users, groups, ous

        response = client.get("/api/entries/stats?cluster=test-cluster")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 100
        assert data["users"] == 50
        assert data["groups"] == 20
        assert data["ous"] == 10

    def test_stats_cluster_not_found(self, mock_load_config, mock_password_cache):
        """Test stats with non-existent cluster."""
        mock_load_config.return_value = []

        response = client.get("/api/entries/stats?cluster=nonexistent")

        assert response.status_code == 404
        assert "Cluster not found" in response.json()["detail"]

    def test_stats_no_password(self, mock_load_config):
        """Test stats when password not cached."""
        with patch('app.api.entries.get_password', return_value=None):
            response = client.get("/api/entries/stats?cluster=test-cluster")

        assert response.status_code == 401
        assert "Password not configured" in response.json()["detail"]


class TestSearchEndpoint:
    """Test /api/entries/search endpoint."""

    def test_search_first_page(self, mock_load_config, mock_password_cache, mock_ldap_client):
        """Test search first page."""
        # Mock search results
        mock_ldap_client.search.return_value = (
            [
                {"dn": "cn=user1,dc=example,dc=com", "attributes": {"cn": "user1"}},
                {"dn": "cn=user2,dc=example,dc=com", "attributes": {"cn": "user2"}},
            ],
            b'next_cookie',
            10
        )

        response = client.get(
            "/api/entries/search",
            params={"cluster": "test-cluster", "page": 1, "page_size": 10}
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["entries"]) == 2
        assert data["total"] == 10
        assert data["page"] == 1
        assert data["has_more"] is True

    def test_search_with_filter_type(self, mock_load_config, mock_password_cache, mock_ldap_client):
        """Test search with filter_type parameter."""
        mock_ldap_client.search.return_value = ([], b'', 0)

        response = client.get(
            "/api/entries/search",
            params={
                "cluster": "test-cluster",
                "page": 1,
                "page_size": 10,
                "filter_type": "users"
            }
        )

        assert response.status_code == 200

        # Verify correct filter was used
        call_args = mock_ldap_client.search.call_args
        filter_str = call_args[0][1]
        assert "inetOrgPerson" in filter_str or "posixAccount" in filter_str

    def test_search_with_text_search(self, mock_load_config, mock_password_cache, mock_ldap_client):
        """Test search with text search parameter."""
        mock_ldap_client.search.return_value = ([], b'', 0)

        response = client.get(
            "/api/entries/search",
            params={
                "cluster": "test-cluster",
                "page": 1,
                "page_size": 10,
                "search": "john"
            }
        )

        assert response.status_code == 200

        # Verify search filter was applied
        call_args = mock_ldap_client.search.call_args
        filter_str = call_args[0][1]
        assert "john" in filter_str.lower() or "*(john)" in filter_str.lower()

    def test_search_ldap_injection_protected(self, mock_load_config, mock_password_cache, mock_ldap_client):
        """Test that search is protected against LDAP injection."""
        mock_ldap_client.search.return_value = ([], b'', 0)

        # Attempt LDAP injection
        response = client.get(
            "/api/entries/search",
            params={
                "cluster": "test-cluster",
                "page": 1,
                "page_size": 10,
                "search": "*)(objectClass=*"
            }
        )

        assert response.status_code == 200

        # Verify that special characters were escaped
        call_args = mock_ldap_client.search.call_args
        filter_str = call_args[0][1]
        # After escaping, the filter should not contain unescaped parentheses
        assert filter_str.count('(') == filter_str.count(')')


class TestCreateEntryEndpoint:
    """Test /api/entries/create endpoint."""

    def test_create_entry_success(self, mock_load_config, mock_password_cache, mock_ldap_client):
        """Test successful entry creation."""
        response = client.post(
            "/api/entries/create",
            json={
                "cluster_name": "test-cluster",
                "dn": "cn=newuser,dc=example,dc=com",
                "attributes": {
                    "objectClass": ["inetOrgPerson"],
                    "cn": "newuser",
                    "sn": "User",
                    "mail": "newuser@example.com"
                }
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["dn"] == "cn=newuser,dc=example,dc=com"

        # Verify LDAP client was called
        mock_ldap_client.connect.assert_called_once()
        mock_ldap_client.add.assert_called_once()

    def test_create_entry_readonly_cluster(self, mock_load_config, mock_password_cache):
        """Test creating entry on readonly cluster."""
        # Make cluster readonly
        mock_load_config.return_value[0].readonly = True

        response = client.post(
            "/api/entries/create",
            json={
                "cluster_name": "test-cluster",
                "dn": "cn=newuser,dc=example,dc=com",
                "attributes": {"cn": "newuser"}
            }
        )

        assert response.status_code == 403
        assert "read-only" in response.json()["detail"].lower()

    def test_create_entry_no_password(self, mock_load_config):
        """Test creating entry when password not cached."""
        with patch('app.api.entries.get_password', return_value=None):
            response = client.post(
                "/api/entries/create",
                json={
                    "cluster_name": "test-cluster",
                    "dn": "cn=newuser,dc=example,dc=com",
                    "attributes": {"cn": "newuser"}
                }
            )

        assert response.status_code == 401


class TestUpdateEntryEndpoint:
    """Test /api/entries/update endpoint."""

    def test_update_entry_success(self, mock_load_config, mock_password_cache, mock_ldap_client):
        """Test successful entry update."""
        response = client.put(
            "/api/entries/update",
            json={
                "cluster_name": "test-cluster",
                "dn": "cn=user1,dc=example,dc=com",
                "modifications": {
                    "mail": "newemail@example.com",
                    "description": "Updated description"
                }
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"

        # Verify modify was called
        mock_ldap_client.modify.assert_called_once()

    def test_update_entry_readonly_cluster(self, mock_load_config, mock_password_cache):
        """Test updating entry on readonly cluster."""
        mock_load_config.return_value[0].readonly = True

        response = client.put(
            "/api/entries/update",
            json={
                "cluster_name": "test-cluster",
                "dn": "cn=user1,dc=example,dc=com",
                "modifications": {"mail": "new@example.com"}
            }
        )

        assert response.status_code == 403

    def test_update_password_updates_shadow_last_change(
        self, mock_load_config, mock_password_cache, mock_ldap_client
    ):
        """Test that updating password also updates shadowLastChange."""
        # Mock user has shadowAccount objectClass
        mock_ldap_client.search.return_value = (
            [{"objectClass": ["inetOrgPerson", "shadowAccount"]}],
            b'',
            1
        )

        response = client.put(
            "/api/entries/update",
            json={
                "cluster_name": "test-cluster",
                "dn": "cn=user1,dc=example,dc=com",
                "modifications": {
                    "userPassword": "newpassword"
                }
            }
        )

        assert response.status_code == 200

        # Verify shadowLastChange was added to modifications
        modify_call = mock_ldap_client.modify.call_args
        modifications = modify_call[0][1]
        assert "shadowLastChange" in modifications


class TestDeleteEntryEndpoint:
    """Test /api/entries/delete endpoint."""

    def test_delete_entry_success(self, mock_load_config, mock_password_cache, mock_ldap_client):
        """Test successful entry deletion."""
        response = client.delete(
            "/api/entries/delete",
            params={
                "cluster_name": "test-cluster",
                "dn": "cn=user1,dc=example,dc=com"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"

        # Verify delete was called
        mock_ldap_client.delete.assert_called_once_with("cn=user1,dc=example,dc=com")

    def test_delete_entry_readonly_cluster(self, mock_load_config, mock_password_cache):
        """Test deleting entry on readonly cluster."""
        mock_load_config.return_value[0].readonly = True

        response = client.delete(
            "/api/entries/delete",
            params={
                "cluster_name": "test-cluster",
                "dn": "cn=user1,dc=example,dc=com"
            }
        )

        assert response.status_code == 403


class TestGroupMembershipEndpoints:
    """Test group membership endpoints."""

    def test_get_all_groups(self, mock_load_config, mock_password_cache, mock_ldap_client):
        """Test getting all groups."""
        mock_ldap_client.search.return_value = (
            [
                {"dn": "cn=admins,ou=groups,dc=example,dc=com", "attributes": {"cn": "admins"}},
                {"dn": "cn=users,ou=groups,dc=example,dc=com", "attributes": {"cn": "users"}},
            ],
            b'',
            2
        )

        response = client.get(
            "/api/entries/groups/all",
            params={"cluster": "test-cluster"}
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["groups"]) == 2

    def test_get_user_groups(self, mock_load_config, mock_password_cache, mock_ldap_client):
        """Test getting groups for specific user."""
        mock_ldap_client.search.return_value = (
            [
                {
                    "dn": "cn=admins,ou=groups,dc=example,dc=com",
                    "attributes": {
                        "cn": "admins",
                        "uniqueMember": ["cn=user1,ou=users,dc=example,dc=com"]
                    }
                },
            ],
            b'',
            1
        )

        response = client.get(
            "/api/entries/user/groups",
            params={
                "cluster": "test-cluster",
                "user_dn": "cn=user1,ou=users,dc=example,dc=com"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["groups"]) == 1

    def test_update_user_groups(self, mock_load_config, mock_password_cache, mock_ldap_client):
        """Test updating user's group memberships."""
        response = client.put(
            "/api/entries/user/groups",
            json={
                "cluster_name": "test-cluster",
                "user_dn": "cn=user1,ou=users,dc=example,dc=com",
                "group_operations": [
                    {
                        "group_dn": "cn=admins,ou=groups,dc=example,dc=com",
                        "action": "add"
                    },
                    {
                        "group_dn": "cn=users,ou=groups,dc=example,dc=com",
                        "action": "remove"
                    }
                ]
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"

        # Verify both operations were performed
        assert mock_ldap_client.add_member_to_group.called
        assert mock_ldap_client.remove_member_from_group.called


class TestNodeSelection:
    """Test that endpoints use correct node selection strategy."""

    @patch('app.api.entries.NodeSelector')
    def test_stats_uses_read_operation(self, mock_node_selector, mock_load_config, mock_password_cache, mock_ldap_client):
        """Test that stats endpoint uses READ operation type."""
        from app.core.node_selector import OperationType

        mock_node_selector.select_node.return_value = ("ldap.example.com", 389)
        mock_ldap_client.get_entry_count.return_value = 10

        response = client.get("/api/entries/stats?cluster=test-cluster")

        # Verify NodeSelector was called with READ operation
        mock_node_selector.select_node.assert_called()
        call_args = mock_node_selector.select_node.call_args
        assert call_args[0][1] == OperationType.READ

    @patch('app.api.entries.NodeSelector')
    def test_create_uses_write_operation(self, mock_node_selector, mock_load_config, mock_password_cache, mock_ldap_client):
        """Test that create endpoint uses WRITE operation type."""
        from app.core.node_selector import OperationType

        mock_node_selector.select_node.return_value = ("ldap.example.com", 389)

        response = client.post(
            "/api/entries/create",
            json={
                "cluster_name": "test-cluster",
                "dn": "cn=test,dc=example,dc=com",
                "attributes": {"cn": "test"}
            }
        )

        # Verify NodeSelector was called with WRITE operation
        call_args = mock_node_selector.select_node.call_args
        assert call_args[0][1] == OperationType.WRITE
