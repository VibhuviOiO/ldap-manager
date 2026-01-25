"""
Tests for encrypted password cache functionality.
"""

import pytest
import json
import time
from pathlib import Path
from unittest.mock import patch, MagicMock
from cryptography.fernet import Fernet
from freezegun import freeze_time

from app.core.password_cache import (
    save_password,
    get_password,
    clear_password,
    get_cache_status,
    _get_encryption_key,
    _hash_key
)


@pytest.fixture
def temp_cache_dir(tmp_path):
    """Create temporary cache directory for testing."""
    with patch('app.core.password_cache.CACHE_DIR', tmp_path / '.cache'):
        with patch('app.core.password_cache.SECRETS_DIR', tmp_path / '.secrets'):
            yield tmp_path


@pytest.fixture
def cleanup_cache(temp_cache_dir):
    """Cleanup cache files after each test."""
    yield
    cache_dir = temp_cache_dir / '.cache'
    secrets_dir = temp_cache_dir / '.secrets'

    if cache_dir.exists():
        for file in cache_dir.iterdir():
            file.unlink()

    if secrets_dir.exists():
        for file in secrets_dir.iterdir():
            file.unlink()


class TestPasswordEncryption:
    """Test password encryption functionality."""

    def test_encryption_key_generation(self, temp_cache_dir):
        """Test that encryption key is generated on first access."""
        secrets_dir = temp_cache_dir / '.secrets'
        secrets_dir.mkdir(parents=True, exist_ok=True)

        key_file = secrets_dir / "encryption.key"
        assert not key_file.exists()

        key = _get_encryption_key()

        assert key_file.exists()
        assert len(key) > 0
        assert isinstance(key, bytes)

    def test_encryption_key_reuse(self, temp_cache_dir):
        """Test that same encryption key is reused on subsequent calls."""
        secrets_dir = temp_cache_dir / '.secrets'
        secrets_dir.mkdir(parents=True, exist_ok=True)

        key1 = _get_encryption_key()
        key2 = _get_encryption_key()

        assert key1 == key2

    def test_save_password_encrypts_content(self, temp_cache_dir, cleanup_cache):
        """Test that saved password is encrypted, not plaintext."""
        cache_dir = temp_cache_dir / '.cache'
        cache_dir.mkdir(parents=True, exist_ok=True)

        cluster_name = "test-cluster"
        bind_dn = "cn=admin,dc=test,dc=com"
        password = "super-secret-password"

        save_password(cluster_name, bind_dn, password)

        # Read cache file directly
        cache_key = _hash_key(cluster_name, bind_dn)
        cache_file = cache_dir / f"{cache_key}.json"

        assert cache_file.exists()

        with open(cache_file) as f:
            data = json.load(f)

        # Verify password is NOT in plaintext
        assert "encrypted_password" in data
        assert data["encrypted_password"] != password
        assert "password" not in data  # Old plaintext field should not exist

        # Verify structure
        assert data["cluster"] == cluster_name
        assert data["bind_dn"] == bind_dn
        assert "timestamp" in data
        assert "ttl" in data

    def test_get_password_decrypts_correctly(self, temp_cache_dir, cleanup_cache):
        """Test that get_password returns decrypted password."""
        cache_dir = temp_cache_dir / '.cache'
        cache_dir.mkdir(parents=True, exist_ok=True)

        cluster_name = "test-cluster"
        bind_dn = "cn=admin,dc=test,dc=com"
        password = "my-password-123"

        save_password(cluster_name, bind_dn, password)
        retrieved_password = get_password(cluster_name, bind_dn)

        assert retrieved_password == password

    def test_get_password_returns_none_if_not_exists(self, temp_cache_dir, cleanup_cache):
        """Test that get_password returns None for non-existent cache."""
        cache_dir = temp_cache_dir / '.cache'
        cache_dir.mkdir(parents=True, exist_ok=True)

        result = get_password("nonexistent", "cn=admin,dc=test,dc=com")
        assert result is None


class TestPasswordCacheTTL:
    """Test TTL (time-to-live) expiration functionality."""

    def test_password_expires_after_ttl(self, temp_cache_dir, cleanup_cache):
        """Test that password cache expires after TTL."""
        cache_dir = temp_cache_dir / '.cache'
        cache_dir.mkdir(parents=True, exist_ok=True)

        cluster_name = "test-cluster"
        bind_dn = "cn=admin,dc=test,dc=com"
        password = "password123"

        # Save with 10 second TTL
        with freeze_time("2024-01-01 12:00:00"):
            save_password(cluster_name, bind_dn, password, ttl=10)

        # Retrieve before expiration
        with freeze_time("2024-01-01 12:00:05"):
            result = get_password(cluster_name, bind_dn)
            assert result == password

        # Retrieve after expiration
        with freeze_time("2024-01-01 12:00:15"):
            result = get_password(cluster_name, bind_dn)
            assert result is None

    def test_password_not_expired_within_ttl(self, temp_cache_dir, cleanup_cache):
        """Test that password cache is valid within TTL."""
        cache_dir = temp_cache_dir / '.cache'
        cache_dir.mkdir(parents=True, exist_ok=True)

        cluster_name = "test-cluster"
        bind_dn = "cn=admin,dc=test,dc=com"
        password = "password123"

        with freeze_time("2024-01-01 12:00:00"):
            save_password(cluster_name, bind_dn, password, ttl=3600)

        # Check after 30 minutes (still valid)
        with freeze_time("2024-01-01 12:30:00"):
            result = get_password(cluster_name, bind_dn)
            assert result == password

    def test_custom_ttl(self, temp_cache_dir, cleanup_cache):
        """Test saving password with custom TTL."""
        cache_dir = temp_cache_dir / '.cache'
        cache_dir.mkdir(parents=True, exist_ok=True)

        cluster_name = "test-cluster"
        bind_dn = "cn=admin,dc=test,dc=com"
        password = "password123"

        custom_ttl = 7200  # 2 hours
        save_password(cluster_name, bind_dn, password, ttl=custom_ttl)

        cache_key = _hash_key(cluster_name, bind_dn)
        cache_file = cache_dir / f"{cache_key}.json"

        with open(cache_file) as f:
            data = json.load(f)

        assert data["ttl"] == custom_ttl


class TestPasswordCacheOperations:
    """Test cache operations (clear, status)."""

    def test_clear_password_removes_cache(self, temp_cache_dir, cleanup_cache):
        """Test that clear_password removes cached password."""
        cache_dir = temp_cache_dir / '.cache'
        cache_dir.mkdir(parents=True, exist_ok=True)

        cluster_name = "test-cluster"
        bind_dn = "cn=admin,dc=test,dc=com"
        password = "password123"

        save_password(cluster_name, bind_dn, password)
        assert get_password(cluster_name, bind_dn) == password

        clear_password(cluster_name, bind_dn)
        assert get_password(cluster_name, bind_dn) is None

    def test_clear_password_nonexistent_cache(self, temp_cache_dir, cleanup_cache):
        """Test that clearing non-existent cache doesn't raise error."""
        cache_dir = temp_cache_dir / '.cache'
        cache_dir.mkdir(parents=True, exist_ok=True)

        # Should not raise exception
        clear_password("nonexistent", "cn=admin,dc=test,dc=com")

    def test_get_cache_status_cached(self, temp_cache_dir, cleanup_cache):
        """Test get_cache_status for cached password."""
        cache_dir = temp_cache_dir / '.cache'
        cache_dir.mkdir(parents=True, exist_ok=True)

        cluster_name = "test-cluster"
        bind_dn = "cn=admin,dc=test,dc=com"

        with freeze_time("2024-01-01 12:00:00"):
            save_password(cluster_name, bind_dn, "password", ttl=3600)

        with freeze_time("2024-01-01 12:10:00"):
            status = get_cache_status(cluster_name, bind_dn)

        assert status["cached"] is True
        assert status["expired"] is False
        assert status["age_seconds"] == 600  # 10 minutes
        assert status["ttl"] == 3600

    def test_get_cache_status_not_cached(self, temp_cache_dir, cleanup_cache):
        """Test get_cache_status for non-existent cache."""
        cache_dir = temp_cache_dir / '.cache'
        cache_dir.mkdir(parents=True, exist_ok=True)

        status = get_cache_status("nonexistent", "cn=admin,dc=test,dc=com")

        assert status["cached"] is False
        assert status["expired"] is None
        assert status["age_seconds"] is None
        assert status["ttl"] is None

    def test_get_cache_status_expired(self, temp_cache_dir, cleanup_cache):
        """Test get_cache_status for expired cache."""
        cache_dir = temp_cache_dir / '.cache'
        cache_dir.mkdir(parents=True, exist_ok=True)

        cluster_name = "test-cluster"
        bind_dn = "cn=admin,dc=test,dc=com"

        with freeze_time("2024-01-01 12:00:00"):
            save_password(cluster_name, bind_dn, "password", ttl=600)

        with freeze_time("2024-01-01 12:15:00"):
            status = get_cache_status(cluster_name, bind_dn)

        assert status["cached"] is True
        assert status["expired"] is True
        assert status["age_seconds"] == 900  # 15 minutes
        assert status["ttl"] == 600


class TestPasswordCacheSecurity:
    """Test security aspects of password cache."""

    def test_bind_dn_mismatch_returns_none(self, temp_cache_dir, cleanup_cache):
        """Test that wrong bind_dn doesn't return password."""
        cache_dir = temp_cache_dir / '.cache'
        cache_dir.mkdir(parents=True, exist_ok=True)

        cluster_name = "test-cluster"
        bind_dn1 = "cn=admin,dc=test,dc=com"
        bind_dn2 = "cn=user,dc=test,dc=com"
        password = "password123"

        save_password(cluster_name, bind_dn1, password)

        # Try to get with different bind_dn
        result = get_password(cluster_name, bind_dn2)
        assert result is None

    def test_corrupted_cache_file_handled(self, temp_cache_dir, cleanup_cache):
        """Test that corrupted cache file is handled gracefully."""
        cache_dir = temp_cache_dir / '.cache'
        cache_dir.mkdir(parents=True, exist_ok=True)

        cluster_name = "test-cluster"
        bind_dn = "cn=admin,dc=test,dc=com"

        # Create corrupted cache file
        cache_key = _hash_key(cluster_name, bind_dn)
        cache_file = cache_dir / f"{cache_key}.json"
        cache_file.write_text("invalid json{{{")

        # Should return None instead of crashing
        result = get_password(cluster_name, bind_dn)
        assert result is None

        # Corrupted file should be removed
        assert not cache_file.exists()

    def test_different_passwords_for_different_clusters(self, temp_cache_dir, cleanup_cache):
        """Test that different clusters can have different passwords."""
        cache_dir = temp_cache_dir / '.cache'
        cache_dir.mkdir(parents=True, exist_ok=True)

        bind_dn = "cn=admin,dc=test,dc=com"

        save_password("cluster1", bind_dn, "password1")
        save_password("cluster2", bind_dn, "password2")

        assert get_password("cluster1", bind_dn) == "password1"
        assert get_password("cluster2", bind_dn) == "password2"
