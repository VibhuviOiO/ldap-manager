"""
Tests for LDAP client functionality.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock, call
import ldap
from ldap.controls import SimplePagedResultsControl

from app.core.ldap_client import LDAPClient, LDAPConfig


@pytest.fixture
def ldap_config():
    """Basic LDAP configuration."""
    return LDAPConfig(
        host="ldap.example.com",
        port=389,
        bind_dn="cn=admin,dc=example,dc=com",
        bind_password="secret",
        base_dn="dc=example,dc=com"
    )


@pytest.fixture
def mock_ldap_connection():
    """Mock LDAP connection."""
    with patch('ldap.initialize') as mock_init:
        mock_conn = MagicMock()
        mock_init.return_value = mock_conn
        yield mock_conn


class TestLDAPConnection:
    """Test LDAP connection establishment."""

    def test_connect_success(self, ldap_config, mock_ldap_connection):
        """Test successful LDAP connection."""
        client = LDAPClient(ldap_config)
        result = client.connect()

        assert result is True
        mock_ldap_connection.simple_bind_s.assert_called_once_with(
            "cn=admin,dc=example,dc=com",
            "secret"
        )

    def test_connect_sets_timeouts(self, ldap_config, mock_ldap_connection):
        """Test that connect() sets network and operation timeouts."""
        client = LDAPClient(ldap_config)
        client.connect()

        # Verify timeout options were set
        calls = mock_ldap_connection.set_option.call_args_list
        assert call(ldap.OPT_NETWORK_TIMEOUT, 30) in calls
        assert call(ldap.OPT_TIMEOUT, 30) in calls

    def test_connect_invalid_credentials(self, ldap_config, mock_ldap_connection):
        """Test connection with invalid credentials."""
        mock_ldap_connection.simple_bind_s.side_effect = ldap.INVALID_CREDENTIALS

        client = LDAPClient(ldap_config)

        with pytest.raises(Exception, match="LDAP connection failed"):
            client.connect()

    def test_connect_server_down(self, ldap_config, mock_ldap_connection):
        """Test connection when server is down."""
        mock_ldap_connection.simple_bind_s.side_effect = ldap.SERVER_DOWN

        client = LDAPClient(ldap_config)

        with pytest.raises(Exception, match="LDAP connection failed"):
            client.connect()

    def test_disconnect(self, ldap_config, mock_ldap_connection):
        """Test disconnect closes connection."""
        client = LDAPClient(ldap_config)
        client.connect()
        client.disconnect()

        mock_ldap_connection.unbind_s.assert_called_once()

    def test_disconnect_when_not_connected(self, ldap_config):
        """Test disconnect when no connection exists."""
        client = LDAPClient(ldap_config)
        # Should not raise exception
        client.disconnect()


class TestLDAPSearch:
    """Test LDAP search operations."""

    def test_search_without_pagination(self, ldap_config, mock_ldap_connection):
        """Test basic search without pagination."""
        # Mock search results
        mock_ldap_connection.search_s.return_value = [
            ('cn=user1,dc=example,dc=com', {'cn': [b'user1'], 'mail': [b'user1@example.com']}),
            ('cn=user2,dc=example,dc=com', {'cn': [b'user2'], 'mail': [b'user2@example.com']}),
        ]

        client = LDAPClient(ldap_config)
        client.connect()

        entries, cookie, total = client.search(
            "dc=example,dc=com",
            "(objectClass=*)",
            page_size=0
        )

        assert len(entries) == 2
        assert cookie == b''
        assert total == 2

        # Verify search was called correctly
        mock_ldap_connection.search_s.assert_called_once()

    def test_search_with_pagination(self, ldap_config, mock_ldap_connection):
        """Test paginated search."""
        # Mock paginated search
        mock_ldap_connection.search_ext.return_value = 1
        mock_ldap_connection.result3.return_value = (
            ldap.RES_SEARCH_RESULT,
            [('cn=user1,dc=example,dc=com', {'cn': [b'user1']})],
            None,
            [SimplePagedResultsControl(True, size=10, cookie=b'next_page')]
        )

        # Mock count query
        mock_ldap_connection.search_s.return_value = [
            ('cn=user1,dc=example,dc=com', {}),
            ('cn=user2,dc=example,dc=com', {}),
        ]

        client = LDAPClient(ldap_config)
        client.connect()

        entries, cookie, total = client.search(
            "dc=example,dc=com",
            "(objectClass=*)",
            page_size=10
        )

        assert len(entries) == 1
        assert cookie == b'next_page'
        assert total == 2  # From count query

    def test_search_with_filter(self, ldap_config, mock_ldap_connection):
        """Test search with specific filter."""
        mock_ldap_connection.search_s.return_value = [
            ('cn=admin,dc=example,dc=com', {'cn': [b'admin']}),
        ]

        client = LDAPClient(ldap_config)
        client.connect()

        client.search(
            "dc=example,dc=com",
            "(uid=admin)",
            page_size=0
        )

        # Verify filter was passed
        call_args = mock_ldap_connection.search_s.call_args
        assert call_args[0][2] == "(uid=admin)"

    def test_search_with_attributes(self, ldap_config, mock_ldap_connection):
        """Test search with specific attributes."""
        mock_ldap_connection.search_s.return_value = []

        client = LDAPClient(ldap_config)
        client.connect()

        client.search(
            "dc=example,dc=com",
            "(objectClass=*)",
            attrs=['cn', 'mail'],
            page_size=0
        )

        # Verify attributes were requested
        call_args = mock_ldap_connection.search_s.call_args
        assert call_args[0][3] == ['cn', 'mail']


class TestLDAPModifyOperations:
    """Test LDAP modify operations (add, modify, delete)."""

    def test_add_entry(self, ldap_config, mock_ldap_connection):
        """Test adding LDAP entry."""
        client = LDAPClient(ldap_config)
        client.connect()

        attrs = {
            'objectClass': ['inetOrgPerson'],
            'cn': 'testuser',
            'sn': 'User',
            'mail': 'test@example.com'
        }

        client.add('cn=testuser,dc=example,dc=com', attrs)

        mock_ldap_connection.add_s.assert_called_once()

    def test_add_entry_already_exists(self, ldap_config, mock_ldap_connection):
        """Test adding entry that already exists."""
        mock_ldap_connection.add_s.side_effect = ldap.ALREADY_EXISTS

        client = LDAPClient(ldap_config)
        client.connect()

        with pytest.raises(Exception):
            client.add('cn=testuser,dc=example,dc=com', {'cn': 'testuser'})

    def test_modify_entry(self, ldap_config, mock_ldap_connection):
        """Test modifying LDAP entry."""
        client = LDAPClient(ldap_config)
        client.connect()

        modifications = {
            'mail': 'newemail@example.com',
            'description': 'Updated description'
        }

        client.modify('cn=testuser,dc=example,dc=com', modifications)

        mock_ldap_connection.modify_s.assert_called_once()

    def test_modify_nonexistent_entry(self, ldap_config, mock_ldap_connection):
        """Test modifying non-existent entry."""
        mock_ldap_connection.modify_s.side_effect = ldap.NO_SUCH_OBJECT

        client = LDAPClient(ldap_config)
        client.connect()

        with pytest.raises(Exception):
            client.modify('cn=nonexistent,dc=example,dc=com', {'mail': 'test@example.com'})

    def test_delete_entry(self, ldap_config, mock_ldap_connection):
        """Test deleting LDAP entry."""
        client = LDAPClient(ldap_config)
        client.connect()

        client.delete('cn=testuser,dc=example,dc=com')

        mock_ldap_connection.delete_s.assert_called_once_with('cn=testuser,dc=example,dc=com')

    def test_delete_nonexistent_entry(self, ldap_config, mock_ldap_connection):
        """Test deleting non-existent entry."""
        mock_ldap_connection.delete_s.side_effect = ldap.NO_SUCH_OBJECT

        client = LDAPClient(ldap_config)
        client.connect()

        with pytest.raises(Exception):
            client.delete('cn=nonexistent,dc=example,dc=com')


class TestLDAPGroupOperations:
    """Test LDAP group operations."""

    def test_add_member_to_group(self, ldap_config, mock_ldap_connection):
        """Test adding member to group."""
        client = LDAPClient(ldap_config)
        client.connect()

        client.add_member_to_group(
            'cn=admins,ou=groups,dc=example,dc=com',
            'cn=user1,ou=users,dc=example,dc=com'
        )

        mock_ldap_connection.modify_s.assert_called_once()

    def test_add_member_already_in_group(self, ldap_config, mock_ldap_connection):
        """Test adding member that's already in group."""
        # TYPE_OR_VALUE_EXISTS should be handled gracefully
        mock_ldap_connection.modify_s.side_effect = ldap.TYPE_OR_VALUE_EXISTS

        client = LDAPClient(ldap_config)
        client.connect()

        # Should not raise exception (idempotent operation)
        client.add_member_to_group(
            'cn=admins,ou=groups,dc=example,dc=com',
            'cn=user1,ou=users,dc=example,dc=com'
        )

    def test_remove_member_from_group(self, ldap_config, mock_ldap_connection):
        """Test removing member from group."""
        client = LDAPClient(ldap_config)
        client.connect()

        client.remove_member_from_group(
            'cn=admins,ou=groups,dc=example,dc=com',
            'cn=user1,ou=users,dc=example,dc=com'
        )

        mock_ldap_connection.modify_s.assert_called_once()

    def test_remove_member_not_in_group(self, ldap_config, mock_ldap_connection):
        """Test removing member not in group."""
        mock_ldap_connection.modify_s.side_effect = ldap.NO_SUCH_ATTRIBUTE

        client = LDAPClient(ldap_config)
        client.connect()

        # Should handle gracefully
        client.remove_member_from_group(
            'cn=admins,ou=groups,dc=example,dc=com',
            'cn=user1,ou=users,dc=example,dc=com'
        )

    def test_remove_last_member_from_group(self, ldap_config, mock_ldap_connection):
        """Test removing last member from group (should fail)."""
        mock_ldap_connection.modify_s.side_effect = ldap.OBJECT_CLASS_VIOLATION

        client = LDAPClient(ldap_config)
        client.connect()

        with pytest.raises(Exception, match="Cannot remove last member"):
            client.remove_member_from_group(
                'cn=admins,ou=groups,dc=example,dc=com',
                'cn=user1,ou=users,dc=example,dc=com'
            )


class TestLDAPUtilities:
    """Test LDAP utility functions."""

    def test_get_entry_count(self, ldap_config, mock_ldap_connection):
        """Test counting entries."""
        mock_ldap_connection.search_s.return_value = [
            ('cn=user1,dc=example,dc=com', {}),
            ('cn=user2,dc=example,dc=com', {}),
            ('cn=user3,dc=example,dc=com', {}),
        ]

        client = LDAPClient(ldap_config)
        client.connect()

        count = client.get_entry_count("dc=example,dc=com")

        assert count == 3

    def test_get_entry_count_with_filter(self, ldap_config, mock_ldap_connection):
        """Test counting entries with filter."""
        mock_ldap_connection.search_s.return_value = [
            ('cn=user1,dc=example,dc=com', {}),
        ]

        client = LDAPClient(ldap_config)
        client.connect()

        count = client.get_entry_count(
            "dc=example,dc=com",
            "(objectClass=inetOrgPerson)"
        )

        assert count == 1

        # Verify filter was used
        call_args = mock_ldap_connection.search_s.call_args
        assert call_args[0][2] == "(objectClass=inetOrgPerson)"

    def test_discover_base_dn(self, ldap_config, mock_ldap_connection):
        """Test auto-discovery of base DN."""
        # Mock rootDSE query
        mock_ldap_connection.search_s.return_value = [
            ('', {'namingContexts': [b'dc=example,dc=com', b'cn=config']})
        ]

        # Create config without base_dn
        config = LDAPConfig(
            host="ldap.example.com",
            port=389,
            bind_dn="cn=admin,dc=example,dc=com",
            bind_password="secret",
            base_dn=""
        )

        client = LDAPClient(config)
        client.connect()

        # Should auto-discover and set base_dn
        assert client.config.base_dn == "dc=example,dc=com"
