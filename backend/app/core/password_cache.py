"""
Secure password caching with Fernet symmetric encryption.

Passwords are encrypted at rest with TTL expiration. Encryption key is generated
once and stored with 0600 permissions in /app/.secrets/
"""

import hashlib
import json
import os
import time
from pathlib import Path
from typing import Optional
from cryptography.fernet import Fernet
import logging

logger = logging.getLogger(__name__)

CACHE_DIR = Path("/app/.cache")
SECRETS_DIR = Path("/app/.secrets")

# Create directories only when needed (not at import time)
def _ensure_dirs():
    """Ensure cache and secrets directories exist."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    SECRETS_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)

# Default TTL: 1 hour (3600 seconds)
DEFAULT_TTL = 3600


def _get_encryption_key() -> bytes:
    """
    Get or generate encryption key for password storage.

    Key is generated once and stored in /app/.secrets/encryption.key
    with 0600 permissions (read/write for owner only).

    Returns:
        bytes: Fernet encryption key
    """
    _ensure_dirs()
    key_file = SECRETS_DIR / "encryption.key"

    if not key_file.exists():
        logger.info("Generating new encryption key")
        key = Fernet.generate_key()
        key_file.write_bytes(key)
        os.chmod(key_file, 0o600)  # Read/write for owner only
        logger.info(f"Encryption key stored at {key_file}")
    else:
        key = key_file.read_bytes()

    return key


# Lazy initialization of Fernet cipher
_fernet = None


def _get_fernet():
    """Get or initialize Fernet cipher (lazy initialization)."""
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_get_encryption_key())
    return _fernet


def _hash_key(cluster_name: str, bind_dn: str) -> str:
    """Create hash of cluster+bind_dn for cache filename"""
    key = f"{cluster_name}:{bind_dn}"
    return hashlib.sha256(key.encode()).hexdigest()


def save_password(cluster_name: str, bind_dn: str, password: str, ttl: int = DEFAULT_TTL):
    """
    Save password to encrypted cache file.

    Args:
        cluster_name: LDAP cluster name
        bind_dn: Bind DN (e.g., cn=admin,dc=example,dc=com)
        password: Plaintext password to encrypt and store
        ttl: Time-to-live in seconds (default: 3600 = 1 hour)
    """
    _ensure_dirs()
    cache_key = _hash_key(cluster_name, bind_dn)
    cache_file = CACHE_DIR / f"{cache_key}.json"

    # Encrypt password
    encrypted_password = _get_fernet().encrypt(password.encode()).decode('utf-8')

    cache_data = {
        "cluster": cluster_name,
        "bind_dn": bind_dn,
        "encrypted_password": encrypted_password,
        "timestamp": time.time(),
        "ttl": ttl
    }

    cache_file.write_text(json.dumps(cache_data))
    os.chmod(cache_file, 0o600)  # Read/write for owner only

    logger.info(f"Password cached for cluster '{cluster_name}' (TTL: {ttl}s)")


def get_password(cluster_name: str, bind_dn: str) -> Optional[str]:
    """
    Retrieve and decrypt password from cache.

    Args:
        cluster_name: LDAP cluster name
        bind_dn: Bind DN

    Returns:
        Decrypted password if found and not expired, None otherwise
    """
    cache_key = _hash_key(cluster_name, bind_dn)
    cache_file = CACHE_DIR / f"{cache_key}.json"

    if not cache_file.exists():
        return None

    try:
        data = json.loads(cache_file.read_text())

        # Check TTL expiration
        age = time.time() - data['timestamp']
        if age > data['ttl']:
            logger.info(f"Password cache expired for cluster '{cluster_name}' (age: {age:.0f}s, TTL: {data['ttl']}s)")
            cache_file.unlink()
            return None

        # Verify bind_dn matches
        if data['bind_dn'] != bind_dn:
            logger.warning(f"Bind DN mismatch for cluster '{cluster_name}'")
            return None

        # Decrypt password
        encrypted_password = data['encrypted_password'].encode('utf-8')
        decrypted_password = _get_fernet().decrypt(encrypted_password).decode('utf-8')

        return decrypted_password

    except Exception as e:
        logger.error(f"Failed to decrypt password for cluster '{cluster_name}': {e}")
        # Remove corrupted cache file
        if cache_file.exists():
            cache_file.unlink()
        return None


def clear_password(cluster_name: str, bind_dn: str):
    """
    Clear cached password for specific cluster and bind DN.

    Args:
        cluster_name: LDAP cluster name
        bind_dn: Bind DN
    """
    cache_key = _hash_key(cluster_name, bind_dn)
    cache_file = CACHE_DIR / f"{cache_key}.json"

    if cache_file.exists():
        cache_file.unlink()
        logger.info(f"Password cache cleared for cluster '{cluster_name}'")


def get_cache_status(cluster_name: str, bind_dn: str) -> dict:
    """
    Get cache status information without decrypting password.

    Args:
        cluster_name: LDAP cluster name
        bind_dn: Bind DN

    Returns:
        dict with cache status (exists, expired, age)
    """
    cache_key = _hash_key(cluster_name, bind_dn)
    cache_file = CACHE_DIR / f"{cache_key}.json"

    if not cache_file.exists():
        return {
            "cached": False,
            "expired": None,
            "age_seconds": None,
            "ttl": None
        }

    try:
        data = json.loads(cache_file.read_text())
        age = time.time() - data['timestamp']
        expired = age > data['ttl']

        return {
            "cached": True,
            "expired": expired,
            "age_seconds": int(age),
            "ttl": data['ttl']
        }
    except Exception:
        return {
            "cached": True,
            "expired": None,
            "age_seconds": None,
            "ttl": None,
            "error": "corrupted"
        }
