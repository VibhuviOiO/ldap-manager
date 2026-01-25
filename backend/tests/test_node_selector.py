"""
Tests for NodeSelector load balancing and failover logic.
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
import socket

from app.core.node_selector import NodeSelector, OperationType


@pytest.fixture
def single_node_config():
    """Single-node cluster configuration."""
    config = Mock()
    config.host = "ldap.example.com"
    config.port = 389
    config.nodes = None
    return config


@pytest.fixture
def multi_node_config():
    """Multi-node cluster configuration."""
    config = Mock()
    config.host = None
    config.port = None
    config.nodes = [
        {"host": "ldap1.example.com", "port": 389, "name": "node1"},
        {"host": "ldap2.example.com", "port": 390, "name": "node2"},
        {"host": "ldap3.example.com", "port": 391, "name": "node3"},
    ]
    return config


class TestSingleNodeSelection:
    """Test node selection for single-node clusters."""

    def test_single_node_read_operation(self, single_node_config):
        """Test READ operation on single-node cluster."""
        host, port = NodeSelector.select_node(single_node_config, OperationType.READ)

        assert host == "ldap.example.com"
        assert port == 389

    def test_single_node_write_operation(self, single_node_config):
        """Test WRITE operation on single-node cluster."""
        host, port = NodeSelector.select_node(single_node_config, OperationType.WRITE)

        assert host == "ldap.example.com"
        assert port == 389

    def test_single_node_health_operation(self, single_node_config):
        """Test HEALTH operation on single-node cluster."""
        host, port = NodeSelector.select_node(single_node_config, OperationType.HEALTH)

        assert host == "ldap.example.com"
        assert port == 389


class TestMultiNodeReadOperations:
    """Test READ operation node selection strategy (last -> first)."""

    @patch('app.core.node_selector.NodeSelector._check_connectivity')
    def test_read_uses_last_node_when_available(self, mock_connectivity, multi_node_config):
        """Test that READ operations prefer last node."""
        mock_connectivity.return_value = True

        host, port = NodeSelector.select_node(multi_node_config, OperationType.READ)

        # Should try last node first
        assert host == "ldap3.example.com"
        assert port == 391

    @patch('app.core.node_selector.NodeSelector._check_connectivity')
    def test_read_falls_back_to_second_node(self, mock_connectivity, multi_node_config):
        """Test READ failover to second node when last fails."""
        # Last node fails, second succeeds
        mock_connectivity.side_effect = [False, True]

        host, port = NodeSelector.select_node(multi_node_config, OperationType.READ)

        assert host == "ldap2.example.com"
        assert port == 390
        assert mock_connectivity.call_count == 2

    @patch('app.core.node_selector.NodeSelector._check_connectivity')
    def test_read_falls_back_to_first_node(self, mock_connectivity, multi_node_config):
        """Test READ failover to first node when last two fail."""
        # Last two nodes fail, first succeeds
        mock_connectivity.side_effect = [False, False, True]

        host, port = NodeSelector.select_node(multi_node_config, OperationType.READ)

        assert host == "ldap1.example.com"
        assert port == 389
        assert mock_connectivity.call_count == 3

    @patch('app.core.node_selector.NodeSelector._check_connectivity')
    def test_read_returns_last_node_when_all_fail(self, mock_connectivity, multi_node_config):
        """Test READ returns last node as fallback when all fail."""
        # All nodes fail connectivity check
        mock_connectivity.return_value = False

        host, port = NodeSelector.select_node(multi_node_config, OperationType.READ)

        # Should return last node anyway (let LDAP connection fail properly)
        assert host == "ldap3.example.com"
        assert port == 391
        assert mock_connectivity.call_count == 3


class TestMultiNodeWriteOperations:
    """Test WRITE operation node selection strategy (always first)."""

    def test_write_uses_first_node(self, multi_node_config):
        """Test that WRITE operations always use first node."""
        host, port = NodeSelector.select_node(multi_node_config, OperationType.WRITE)

        assert host == "ldap1.example.com"
        assert port == 389

    @patch('app.core.node_selector.NodeSelector._check_connectivity')
    def test_write_no_connectivity_check(self, mock_connectivity, multi_node_config):
        """Test that WRITE operations don't perform connectivity checks."""
        host, port = NodeSelector.select_node(multi_node_config, OperationType.WRITE)

        # Should not check connectivity for writes
        mock_connectivity.assert_not_called()
        assert host == "ldap1.example.com"
        assert port == 389


class TestMultiNodeHealthOperations:
    """Test HEALTH operation node selection."""

    def test_health_uses_first_node(self, multi_node_config):
        """Test that HEALTH operations use first node."""
        host, port = NodeSelector.select_node(multi_node_config, OperationType.HEALTH)

        assert host == "ldap1.example.com"
        assert port == 389

    def test_get_all_nodes_single_node(self, single_node_config):
        """Test get_all_nodes for single-node cluster."""
        nodes = NodeSelector.get_all_nodes(single_node_config)

        assert len(nodes) == 1
        assert nodes[0] == ("ldap.example.com", 389)

    def test_get_all_nodes_multi_node(self, multi_node_config):
        """Test get_all_nodes for multi-node cluster."""
        nodes = NodeSelector.get_all_nodes(multi_node_config)

        assert len(nodes) == 3
        assert nodes[0] == ("ldap1.example.com", 389)
        assert nodes[1] == ("ldap2.example.com", 390)
        assert nodes[2] == ("ldap3.example.com", 391)


class TestConnectivityChecks:
    """Test socket connectivity check functionality."""

    @patch('socket.socket')
    def test_connectivity_check_success(self, mock_socket):
        """Test successful connectivity check."""
        # Mock successful connection
        mock_sock_instance = MagicMock()
        mock_sock_instance.connect_ex.return_value = 0
        mock_socket.return_value = mock_sock_instance

        result = NodeSelector._check_connectivity("ldap.example.com", 389)

        assert result is True
        mock_sock_instance.connect_ex.assert_called_once_with(("ldap.example.com", 389))
        mock_sock_instance.close.assert_called_once()

    @patch('socket.socket')
    def test_connectivity_check_failure(self, mock_socket):
        """Test failed connectivity check."""
        # Mock failed connection
        mock_sock_instance = MagicMock()
        mock_sock_instance.connect_ex.return_value = 1  # Connection refused
        mock_socket.return_value = mock_sock_instance

        result = NodeSelector._check_connectivity("ldap.example.com", 389)

        assert result is False

    @patch('socket.socket')
    def test_connectivity_check_timeout(self, mock_socket):
        """Test connectivity check timeout."""
        # Mock socket timeout
        mock_sock_instance = MagicMock()
        mock_sock_instance.connect_ex.side_effect = socket.timeout
        mock_socket.return_value = mock_sock_instance

        result = NodeSelector._check_connectivity("ldap.example.com", 389)

        assert result is False

    @patch('socket.socket')
    def test_connectivity_check_exception(self, mock_socket):
        """Test connectivity check handles exceptions."""
        # Mock socket exception
        mock_sock_instance = MagicMock()
        mock_sock_instance.connect_ex.side_effect = Exception("Network error")
        mock_socket.return_value = mock_sock_instance

        result = NodeSelector._check_connectivity("ldap.example.com", 389)

        assert result is False

    @patch('socket.socket')
    def test_connectivity_check_uses_timeout(self, mock_socket):
        """Test that connectivity check sets timeout."""
        mock_sock_instance = MagicMock()
        mock_sock_instance.connect_ex.return_value = 0
        mock_socket.return_value = mock_sock_instance

        NodeSelector._check_connectivity("ldap.example.com", 389, timeout=5)

        mock_sock_instance.settimeout.assert_called_once_with(5)


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_empty_nodes_list_raises_error(self):
        """Test that empty nodes list raises exception."""
        config = Mock()
        config.host = None
        config.nodes = []

        with pytest.raises(Exception, match="No nodes configured"):
            NodeSelector.select_node(config, OperationType.READ)

    def test_none_nodes_raises_error(self):
        """Test that None nodes raises exception."""
        config = Mock()
        config.host = None
        config.nodes = None

        with pytest.raises(Exception, match="No nodes configured"):
            NodeSelector.select_node(config, OperationType.READ)

    def test_two_node_cluster_read_strategy(self):
        """Test READ strategy with 2-node cluster."""
        config = Mock()
        config.host = None
        config.nodes = [
            {"host": "ldap1.example.com", "port": 389},
            {"host": "ldap2.example.com", "port": 390},
        ]

        with patch('app.core.node_selector.NodeSelector._check_connectivity', return_value=True):
            host, port = NodeSelector.select_node(config, OperationType.READ)

        # Should use last node (node2)
        assert host == "ldap2.example.com"
        assert port == 390

    def test_single_node_in_multi_node_config(self):
        """Test cluster with only one node in nodes list."""
        config = Mock()
        config.host = None
        config.nodes = [
            {"host": "ldap1.example.com", "port": 389},
        ]

        with patch('app.core.node_selector.NodeSelector._check_connectivity', return_value=True):
            # READ should use the only node
            host, port = NodeSelector.select_node(config, OperationType.READ)
            assert host == "ldap1.example.com"

            # WRITE should also use the only node
            host, port = NodeSelector.select_node(config, OperationType.WRITE)
            assert host == "ldap1.example.com"
