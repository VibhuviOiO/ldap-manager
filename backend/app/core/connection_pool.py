"""
LDAP connection pooling for performance optimization.

Maintains a pool of active LDAP connections with TTL-based expiration
to reduce per-request connection overhead.
"""

import threading
import time
import logging
from typing import Dict, Tuple, Optional
from app.core.ldap_client import LDAPClient, LDAPConfig

logger = logging.getLogger(__name__)


class ConnectionPool:
    """
    Thread-safe LDAP connection pool with automatic cleanup.

    Connections are keyed by (host, port, bind_dn) tuple and expire
    after max_idle_time seconds of inactivity.
    """

    def __init__(self, max_idle_time: int = 300):
        """
        Initialize connection pool.

        Args:
            max_idle_time: Maximum idle time in seconds before connection is closed (default: 5 minutes)
        """
        self.pool: Dict[str, Tuple[LDAPClient, float]] = {}
        self.lock = threading.Lock()
        self.max_idle_time = max_idle_time
        logger.info(f"Connection pool initialized (max_idle_time: {max_idle_time}s)")

    def _get_pool_key(self, config: LDAPConfig) -> str:
        """Generate unique pool key for connection config."""
        return f"{config.host}:{config.port}:{config.bind_dn}"

    def get_connection(self, config: LDAPConfig) -> LDAPClient:
        """
        Get or create LDAP connection from pool.

        Args:
            config: LDAP configuration for connection

        Returns:
            Active LDAPClient instance (connected and ready to use)

        Raises:
            Exception: If connection fails
        """
        key = self._get_pool_key(config)

        with self.lock:
            # Check if connection exists and is still fresh
            if key in self.pool:
                client, timestamp = self.pool[key]
                age = time.time() - timestamp

                if age < self.max_idle_time:
                    # Connection still fresh - update timestamp and return
                    self.pool[key] = (client, time.time())
                    logger.debug(f"Reusing pooled connection for {key} (age: {age:.1f}s)")
                    return client
                else:
                    # Stale connection - disconnect and remove
                    logger.info(f"Connection stale for {key} (age: {age:.1f}s), reconnecting")
                    try:
                        client.disconnect()
                    except Exception as e:
                        logger.warning(f"Error disconnecting stale connection: {e}")
                    del self.pool[key]

            # Create new connection
            logger.info(f"Creating new pooled connection for {key}")
            client = LDAPClient(config)
            client.connect()
            self.pool[key] = (client, time.time())
            return client

    def release_connection(self, config: LDAPConfig):
        """
        Release (do not disconnect) a connection back to pool.

        This is a no-op in the current implementation since connections
        remain in the pool. Call this for API consistency.

        Args:
            config: LDAP configuration
        """
        # Connection remains in pool - just update timestamp
        key = self._get_pool_key(config)
        with self.lock:
            if key in self.pool:
                client, _ = self.pool[key]
                self.pool[key] = (client, time.time())

    def close_connection(self, config: LDAPConfig):
        """
        Explicitly close and remove connection from pool.

        Args:
            config: LDAP configuration
        """
        key = self._get_pool_key(config)

        with self.lock:
            if key in self.pool:
                client, _ = self.pool[key]
                try:
                    client.disconnect()
                    logger.info(f"Closed pooled connection for {key}")
                except Exception as e:
                    logger.warning(f"Error closing connection {key}: {e}")
                finally:
                    del self.pool[key]

    def cleanup(self):
        """
        Remove stale connections from pool.

        Should be called periodically to prevent memory leaks.
        """
        with self.lock:
            now = time.time()
            stale_keys = []

            for key, (client, timestamp) in self.pool.items():
                age = now - timestamp
                if age > self.max_idle_time:
                    stale_keys.append(key)
                    try:
                        client.disconnect()
                        logger.info(f"Cleaned up stale connection {key} (age: {age:.1f}s)")
                    except Exception as e:
                        logger.warning(f"Error during cleanup of {key}: {e}")

            for key in stale_keys:
                del self.pool[key]

            if stale_keys:
                logger.info(f"Cleanup: removed {len(stale_keys)} stale connections")

    def get_stats(self) -> dict:
        """
        Get connection pool statistics.

        Returns:
            dict with pool size and connection details
        """
        with self.lock:
            now = time.time()
            connections = []

            for key, (client, timestamp) in self.pool.items():
                age = now - timestamp
                connections.append({
                    "key": key,
                    "age_seconds": int(age),
                    "is_stale": age > self.max_idle_time
                })

            return {
                "pool_size": len(self.pool),
                "max_idle_time": self.max_idle_time,
                "connections": connections
            }

    def clear(self):
        """
        Close all connections and clear the pool.

        Useful for cleanup during shutdown.
        """
        with self.lock:
            logger.info(f"Clearing connection pool ({len(self.pool)} connections)")
            for key, (client, _) in self.pool.items():
                try:
                    client.disconnect()
                except Exception as e:
                    logger.warning(f"Error disconnecting {key}: {e}")

            self.pool.clear()


# Global connection pool instance
pool = ConnectionPool(max_idle_time=300)  # 5 minutes


def get_pooled_connection(config: LDAPConfig) -> LDAPClient:
    """
    Convenience function to get connection from global pool.

    Args:
        config: LDAP configuration

    Returns:
        Active LDAPClient instance
    """
    return pool.get_connection(config)
