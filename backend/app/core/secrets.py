"""
Session signing and the built-in user store.

Everything secret lives under /app/.secrets with 0600 permissions:

    encryption.key   Fernet key - encrypts the built-in user store
    session.key      HMAC key for signing session tokens
    users.enc        Fernet-encrypted built-in users (mode: local)

This is only about `auth.mode: local` login accounts, which has nothing to do
with cluster bind credentials: those come from config.yml (env/file/config)
and are never written here.

No new dependencies: Fernet comes from `cryptography` (already required), the
token is HMAC-SHA256 over a compact JSON payload using stdlib hmac/hashlib.
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import secrets as _secrets
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

SECRETS_DIR = Path("/app/.secrets")
USERS_FILE = SECRETS_DIR / "users.enc"
SESSION_KEY_FILE = SECRETS_DIR / "session.key"

SESSION_TTL_SECONDS = 12 * 3600


def _ensure_dirs() -> None:
    SECRETS_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)


# Lazy Fernet cipher for the built-in user store.
_fernet: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    """
    Fernet cipher for the built-in user store.

    The key lives in /app/.secrets/encryption.key. It used to be shared with the
    removed cluster password cache; the file name and format are unchanged so an
    existing users.enc still decrypts after upgrading.
    """
    global _fernet
    if _fernet is None:
        _ensure_dirs()
        key_file = SECRETS_DIR / "encryption.key"
        if key_file.exists():
            key = key_file.read_bytes()
        else:
            key = Fernet.generate_key()
            key_file.write_bytes(key)
            os.chmod(key_file, 0o600)
            logger.info("Generated user-store encryption key at %s", key_file)
        _fernet = Fernet(key)
    return _fernet


def get_signing_key() -> bytes:
    """
    HMAC key for session tokens.

    Taken from LDAP_MANAGER_SECRET_KEY when set - that is the option for
    deployments that want the key managed outside the container. Otherwise a
    random key is generated once and persisted, which is what makes sessions
    survive a restart.
    """
    env_key = os.getenv("LDAP_MANAGER_SECRET_KEY", "").strip()
    if env_key:
        return hashlib.sha256(env_key.encode()).digest()

    _ensure_dirs()
    if not SESSION_KEY_FILE.exists():
        SESSION_KEY_FILE.write_bytes(_secrets.token_bytes(32))
        os.chmod(SESSION_KEY_FILE, 0o600)
        logger.info("Generated session signing key at %s", SESSION_KEY_FILE)
    return SESSION_KEY_FILE.read_bytes()


# ---------------------------------------------------------------- sessions --


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def issue_token(subject: str, role: str, ttl: int = SESSION_TTL_SECONDS) -> str:
    """Sign a session token. Compact, stateless, verifiable without a store."""
    payload = {
        "sub": subject,
        "role": role,
        "iat": int(time.time()),
        "exp": int(time.time()) + int(ttl),
    }
    body = _b64e(json.dumps(payload, separators=(",", ":")).encode())
    sig = hmac.new(get_signing_key(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{_b64e(sig)}"


def verify_token(token: Optional[str]) -> Optional[Dict[str, Any]]:
    """Return the payload, or None when the token is absent, forged or expired."""
    if not token or "." not in token:
        return None
    body, _, sig = token.partition(".")
    expected = hmac.new(get_signing_key(), body.encode(), hashlib.sha256).digest()
    try:
        if not hmac.compare_digest(expected, _b64d(sig)):
            return None
        payload = json.loads(_b64d(body))
    except Exception:
        return None
    if int(payload.get("exp", 0)) < time.time():
        return None
    return payload


# ----------------------------------------------------------- built-in users --


def load_local_users() -> List[Dict[str, Any]]:
    """Decrypted built-in users. Empty list when none have been created yet."""
    if not USERS_FILE.exists():
        return []
    try:
        raw = _get_fernet().decrypt(USERS_FILE.read_bytes())
        data = json.loads(raw.decode())
        return data.get("users", []) if isinstance(data, dict) else []
    except (InvalidToken, ValueError, OSError) as exc:
        logger.error("Could not read the built-in user store: %s", exc)
        return []


def save_local_users(users: List[Dict[str, Any]]) -> None:
    _ensure_dirs()
    blob = _get_fernet().encrypt(json.dumps({"users": users}).encode())
    USERS_FILE.write_bytes(blob)
    os.chmod(USERS_FILE, 0o600)
    logger.info("Saved %d built-in user(s)", len(users))


def users_configured() -> bool:
    """True once at least one built-in user exists - drives the first-run wizard."""
    return len(load_local_users()) > 0
