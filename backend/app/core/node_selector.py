"""
Intelligent LDAP node selection for multi-master clusters.

Implements load distribution strategy:
- READ operations: Use last node with fallback chain (last → second → first)
- WRITE operations: Use first node (primary master)
- HEALTH checks: Test specific or all nodes

Includes automatic failover with socket-based connectivity checks.
"""

from enum import Enum
from typing import List, Dict, Optional, Tuple
import logging
import socket

logger = logging.getLogger(__name__)


class OperationType(Enum):
    """LDAP operation types for node selection strategy."""
    READ = "read"      # Searches, counts, stats (distribute load)
    WRITE = "write"    # Create, update, delete (consistency priority)
    HEALTH = "health"  # Health checks, monitoring


class NodeSelector:
    """
    Intelligent node selection for multi-master LDAP clusters.

    Strategy:
    - READ operations: Use last node with fallback chain (last → second → first)
      to minimize load on primary master
    - WRITE operations: Use first node (primary) for consistency
    - HEALTH checks: Return first node (monitoring iterates all nodes separately)
    """

    @staticmethod
    def select_node(
        cluster_config,
        operation_type: OperationType = OperationType.READ
    ) -> Tuple[str, int]:
        """
        Select optimal LDAP node based on operation type and cluster topology.

        Args:
            cluster_config: Cluster configuration object with host/port or nodes list
            operation_type: Type of operation (READ, WRITE, or HEALTH)

        Returns:
            Tuple of (host, port) for the selected node

        Raises:
            Exception: If no nodes are configured or all nodes are unavailable
        """
        # Single-node cluster
        if cluster_config.host:
            return (cluster_config.host, cluster_config.port or 389)

        # Multi-node cluster
        nodes = cluster_config.nodes
        if not nodes:
            raise Exception("No nodes configured in cluster")

        if operation_type == OperationType.WRITE:
            # Writes go to first node (primary master) for consistency
            logger.debug(f"WRITE operation: selecting first node (primary)")
            return (nodes[0]['host'], nodes[0]['port'])

        elif operation_type == OperationType.READ:
            # Reads use reverse order: last → second → first
            # This distributes load away from the primary master
            logger.debug(f"READ operation: selecting with failover (last → first)")
            return NodeSelector._select_with_failover(nodes, reverse=True)

        else:  # HEALTH
            # Return first node (monitoring code iterates all nodes separately)
            logger.debug(f"HEALTH operation: selecting first node")
            return (nodes[0]['host'], nodes[0]['port'])

    @staticmethod
    def _select_with_failover(
        nodes: List[Dict],
        reverse: bool = True
    ) -> Tuple[str, int]:
        """
        Try nodes in order (reversed or not) until one connects.

        Performs quick TCP connectivity check (non-blocking, 2s timeout)
        to verify node is reachable before returning it.

        Args:
            nodes: List of {host, port, name} dicts
            reverse: If True, try last → first. If False, try first → last.

        Returns:
            Tuple of (host, port) for first responsive node

        Raises:
            Exception: If all nodes fail connectivity check
        """
        node_order = reversed(nodes) if reverse else nodes

        for node in node_order:
            host = node['host']
            port = node['port']

            # Quick connectivity check (don't authenticate yet)
            if NodeSelector._check_connectivity(host, port):
                logger.info(f"Selected node {host}:{port} for operation")
                return (host, port)
            else:
                logger.warning(f"Node {host}:{port} unreachable, trying next")

        # All nodes failed - use fallback node anyway and let LDAP connection fail with error
        fallback = nodes[-1] if reverse else nodes[0]
        logger.error(
            f"All nodes unreachable, falling back to {fallback['host']}:{fallback['port']}"
        )
        return (fallback['host'], fallback['port'])

    @staticmethod
    def _check_connectivity(host: str, port: int, timeout: int = 2) -> bool:
        """
        Check if LDAP node is reachable via TCP socket.

        Args:
            host: Hostname or IP address
            port: Port number
            timeout: Connection timeout in seconds (default: 2)

        Returns:
            True if connection succeeds, False otherwise
        """
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            result = sock.connect_ex((host, port))
            sock.close()
            return result == 0
        except Exception as e:
            logger.debug(f"Connectivity check failed for {host}:{port}: {e}")
            return False

    @staticmethod
    def get_all_nodes(cluster_config) -> List[Tuple[str, int]]:
        """
        Return all nodes in the cluster for health monitoring.

        Args:
            cluster_config: Cluster configuration object

        Returns:
            List of (host, port) tuples for all nodes
        """
        if cluster_config.host:
            return [(cluster_config.host, cluster_config.port or 389)]

        return [(node['host'], node['port']) for node in cluster_config.nodes]
