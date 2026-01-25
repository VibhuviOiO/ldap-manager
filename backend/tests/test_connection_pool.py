"""
Tests for LDAP connection pooling.
"""

import pytest
import time
from unittest.mock import Mock, patch, MagicMock
from freezegun import freeze_time

from app.core.connection_pool import ConnectionPool, get_pooled_connection
from app.core.ldap_client import LDAPConfig


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
def connection_pool():
    """Create fresh connection pool for testing."""
    return ConnectionPool(max_idle_time=300)


class TestConnectionPoolBasics:
    """Test basic connection pool functionality."""

    @patch('app.core.connection_pool.LDAPClient')
    def test_get_connection_creates_new(self, mock_client_class, connection_pool, ldap_config):
        """Test that first call creates new connection."""
        mock_client_instance = MagicMock()
        mock_client_class.return_value = mock_client_instance

        client = connection_pool.get_connection(ldap_config)

        assert client == mock_client_instance
        mock_client_instance.connect.assert_called_once()
        assert connection_pool.get_stats()["pool_size"] == 1

    @patch('app.core.connection_pool.LDAPClient')
    def test_get_connection_reuses_existing(self, mock_client_class, connection_pool, ldap_config):
        """Test that subsequent calls reuse connection."""
        mock_client_instance = MagicMock()
        mock_client_class.return_value = mock_client_instance

        # First call creates connection
        client1 = connection_pool.get_connection(ldap_config)

        # Second call should reuse
        client2 = connection_pool.get_connection(ldap_config)

        assert client1 == client2
        # connect() should only be called once
        assert mock_client_instance.connect.call_count == 1

    @patch('app.core.connection_pool.LDAPClient')
    def test_different_configs_different_connections(self, mock_client_class, connection_pool):
        """Test that different configs create separate connections."""
        mock_client_class.return_value = MagicMock()

        config1 = LDAPConfig(
            host="ldap1.example.com",
            port=389,
            bind_dn="cn=admin,dc=example,dc=com",
            bind_password="secret",
            base_dn="dc=example,dc=com"
        )

        config2 = LDAPConfig(
            host="ldap2.example.com",
            port=389,
            bind_dn="cn=admin,dc=example,dc=com",
            bind_password="secret",
            base_dn="dc=example,dc=com"
        )

        client1 = connection_pool.get_connection(config1)
        client2 = connection_pool.get_connection(config2)

        # Two different connections should exist
        assert connection_pool.get_stats()["pool_size"] == 2


class TestConnectionPoolTTL:
    """Test connection pool TTL (time-to-live) functionality."""

    @patch('app.core.connection_pool.LDAPClient')
    def test_connection_expires_after_max_idle(self, mock_client_class, ldap_config):
        """Test that connection expires after max_idle_time."""
        pool = ConnectionPool(max_idle_time=10)
        mock_client_instance = MagicMock()
        mock_client_class.return_value = mock_client_instance

        # Create connection
        with freeze_time("2024-01-01 12:00:00"):
            client1 = pool.get_connection(ldap_config)

        # Access before expiration (9 seconds later)
        with freeze_time("2024-01-01 12:00:09"):
            client2 = pool.get_connection(ldap_config)
            # Should be same connection
            assert client1 == client2
            assert mock_client_instance.connect.call_count == 1

        # Access after expiration (15 seconds later)
        with freeze_time("2024-01-01 12:00:15"):
            mock_client_class.return_value = MagicMock()
            client3 = pool.get_connection(ldap_config)
            # Should be new connection
            # Old connection should be disconnected
            mock_client_instance.disconnect.assert_called_once()

    @patch('app.core.connection_pool.LDAPClient')
    def test_connection_timestamp_updated_on_access(self, mock_client_class, connection_pool, ldap_config):
        """Test that accessing connection updates timestamp."""
        mock_client_instance = MagicMock()
        mock_client_class.return_value = mock_client_instance

        with freeze_time("2024-01-01 12:00:00"):
            connection_pool.get_connection(ldap_config)

        with freeze_time("2024-01-01 12:01:00"):
            connection_pool.get_connection(ldap_config)

        # Check stats - age should be from last access, not first
        with freeze_time("2024-01-01 12:02:00"):
            stats = connection_pool.get_stats()
            # Age should be 1 minute (from 12:01 to 12:02)
            assert stats["connections"][0]["age_seconds"] == 60


class TestConnectionPoolCleanup:
    """Test connection pool cleanup functionality."""

    @patch('app.core.connection_pool.LDAPClient')
    def test_cleanup_removes_stale_connections(self, mock_client_class, ldap_config):
        """Test that cleanup removes stale connections."""
        pool = ConnectionPool(max_idle_time=10)
        mock_client_instance = MagicMock()
        mock_client_class.return_value = mock_client_instance

        # Create connection
        with freeze_time("2024-01-01 12:00:00"):
            pool.get_connection(ldap_config)

        assert pool.get_stats()["pool_size"] == 1

        # Run cleanup after expiration
        with freeze_time("2024-01-01 12:00:15"):
            pool.cleanup()

        # Connection should be removed
        assert pool.get_stats()["pool_size"] == 0
        mock_client_instance.disconnect.assert_called_once()

    @patch('app.core.connection_pool.LDAPClient')
    def test_cleanup_keeps_fresh_connections(self, mock_client_class, ldap_config):
        """Test that cleanup keeps fresh connections."""
        pool = ConnectionPool(max_idle_time=60)
        mock_client_instance = MagicMock()
        mock_client_class.return_value = mock_client_instance

        # Create connection
        with freeze_time("2024-01-01 12:00:00"):
            pool.get_connection(ldap_config)

        # Run cleanup before expiration
        with freeze_time("2024-01-01 12:00:30"):
            pool.cleanup()

        # Connection should still be there
        assert pool.get_stats()["pool_size"] == 1
        mock_client_instance.disconnect.assert_not_called()

    @patch('app.core.connection_pool.LDAPClient')
    def test_cleanup_handles_disconnect_errors(self, mock_client_class, ldap_config):
        """Test that cleanup handles disconnect errors gracefully."""
        pool = ConnectionPool(max_idle_time=10)
        mock_client_instance = MagicMock()
        mock_client_instance.disconnect.side_effect = Exception("Disconnect failed")
        mock_client_class.return_value = mock_client_instance

        # Create connection
        with freeze_time("2024-01-01 12:00:00"):
            pool.get_connection(ldap_config)

        # Cleanup should not raise exception
        with freeze_time("2024-01-01 12:00:15"):
            pool.cleanup()  # Should not raise

        # Connection should still be removed despite error
        assert pool.get_stats()["pool_size"] == 0


class TestConnectionPoolOperations:
    """Test connection pool operations."""

    @patch('app.core.connection_pool.LDAPClient')
    def test_release_connection(self, mock_client_class, connection_pool, ldap_config):
        """Test releasing connection back to pool."""
        mock_client_instance = MagicMock()
        mock_client_class.return_value = mock_client_instance

        connection_pool.get_connection(ldap_config)
        connection_pool.release_connection(ldap_config)

        # Connection should remain in pool
        assert connection_pool.get_stats()["pool_size"] == 1

    @patch('app.core.connection_pool.LDAPClient')
    def test_close_connection(self, mock_client_class, connection_pool, ldap_config):
        """Test explicitly closing connection."""
        mock_client_instance = MagicMock()
        mock_client_class.return_value = mock_client_instance

        connection_pool.get_connection(ldap_config)
        connection_pool.close_connection(ldap_config)

        # Connection should be removed
        assert connection_pool.get_stats()["pool_size"] == 0
        mock_client_instance.disconnect.assert_called_once()

    @patch('app.core.connection_pool.LDAPClient')
    def test_clear_pool(self, mock_client_class, connection_pool):
        """Test clearing entire pool."""
        mock_client_class.return_value = MagicMock()

        # Create multiple connections
        config1 = LDAPConfig(host="ldap1.example.com", port=389, bind_dn="cn=admin", bind_password="pwd", base_dn="")
        config2 = LDAPConfig(host="ldap2.example.com", port=389, bind_dn="cn=admin", bind_password="pwd", base_dn="")

        connection_pool.get_connection(config1)
        connection_pool.get_connection(config2)

        assert connection_pool.get_stats()["pool_size"] == 2

        # Clear pool
        connection_pool.clear()

        assert connection_pool.get_stats()["pool_size"] == 0


class TestConnectionPoolStats:
    """Test connection pool statistics."""

    @patch('app.core.connection_pool.LDAPClient')
    def test_get_stats_empty_pool(self, mock_client_class, connection_pool):
        """Test stats for empty pool."""
        stats = connection_pool.get_stats()

        assert stats["pool_size"] == 0
        assert stats["max_idle_time"] == 300
        assert len(stats["connections"]) == 0

    @patch('app.core.connection_pool.LDAPClient')
    def test_get_stats_with_connections(self, mock_client_class, connection_pool, ldap_config):
        """Test stats with active connections."""
        mock_client_class.return_value = MagicMock()

        with freeze_time("2024-01-01 12:00:00"):
            connection_pool.get_connection(ldap_config)

        with freeze_time("2024-01-01 12:05:00"):
            stats = connection_pool.get_stats()

        assert stats["pool_size"] == 1
        assert len(stats["connections"]) == 1
        assert stats["connections"][0]["age_seconds"] == 300  # 5 minutes
        assert stats["connections"][0]["is_stale"] is False

    @patch('app.core.connection_pool.LDAPClient')
    def test_get_stats_shows_stale_connections(self, mock_client_class, ldap_config):
        """Test that stats correctly identifies stale connections."""
        pool = ConnectionPool(max_idle_time=60)
        mock_client_class.return_value = MagicMock()

        with freeze_time("2024-01-01 12:00:00"):
            pool.get_connection(ldap_config)

        # Check after expiration
        with freeze_time("2024-01-01 12:02:00"):
            stats = pool.get_stats()

        assert stats["connections"][0]["age_seconds"] == 120
        assert stats["connections"][0]["is_stale"] is True


class TestGlobalPoolInstance:
    """Test global pool instance."""

    @patch('app.core.connection_pool.LDAPClient')
    def test_get_pooled_connection_uses_global_pool(self, mock_client_class, ldap_config):
        """Test that get_pooled_connection uses global pool."""
        mock_client_instance = MagicMock()
        mock_client_class.return_value = mock_client_instance

        client = get_pooled_connection(ldap_config)

        assert client == mock_client_instance
        mock_client_instance.connect.assert_called_once()
