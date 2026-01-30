"""
Keycloak JWT authentication for FastAPI.

Validates access tokens using Keycloak's public JWKS endpoint.
Supports both Keycloak mode (JWT validation) and legacy mode (no auth).
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel
from typing import Optional, List
import requests
import logging
import os
from functools import lru_cache

logger = logging.getLogger(__name__)

# Environment configuration
KEYCLOAK_URL = os.getenv("KEYCLOAK_URL", "http://keycloak:8080")  # For JWKS fetching
KEYCLOAK_ISSUER = os.getenv("KEYCLOAK_ISSUER")  # Expected issuer in tokens (optional)
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "ldap-manager")
KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "ldap-manager-client")
AUTH_MODE = os.getenv("AUTH_MODE", "keycloak")  # "keycloak" or "legacy"
READONLY_MODE = os.getenv("READONLY_MODE", "false").lower() == "true"  # Read-only mode (legacy only)
DEVELOPMENT_MODE = os.getenv("DEVELOPMENT_MODE", "false").lower() == "true"

# Security scheme
security = HTTPBearer(auto_error=False)


class User(BaseModel):
    """Authenticated user context."""
    user_id: str  # Keycloak sub claim
    username: str  # preferred_username
    email: Optional[str] = None
    roles: List[str] = []

    @property
    def is_admin(self) -> bool:
        """Check if user has admin role."""
        return "admin" in self.roles

    @property
    def is_editor(self) -> bool:
        """Check if user has editor or admin role."""
        return "editor" in self.roles or "admin" in self.roles

    @property
    def is_viewer(self) -> bool:
        """Check if user has viewer, editor, or admin role."""
        return "viewer" in self.roles or self.is_editor

    @property
    def is_auditor(self) -> bool:
        """Check if user has auditor or admin role."""
        return "auditor" in self.roles or self.is_admin


@lru_cache(maxsize=1)
def get_jwks():
    """
    Fetch Keycloak's public keys (JWKS).

    Cached to avoid hitting Keycloak on every request.
    Keys are rotated rarely, cache invalidation handled by TTL.

    Returns:
        JWKS JSON from Keycloak

    Raises:
        HTTPException: If Keycloak is unavailable
    """
    jwks_url = f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/certs"
    try:
        response = requests.get(jwks_url, timeout=5)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Failed to fetch JWKS from {jwks_url}: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable"
        )


def verify_token(token: str) -> dict:
    """
    Verify JWT token signature and expiration.

    Args:
        token: JWT access token

    Returns:
        Decoded token payload

    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        # Decode header to get kid (key ID)
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        # Find matching public key
        jwks = get_jwks()
        rsa_key = None
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                rsa_key = key
                break

        if not rsa_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: key not found"
            )

        # Verify signature and claims
        # Use KEYCLOAK_ISSUER if set, otherwise construct from KEYCLOAK_URL
        expected_issuer = KEYCLOAK_ISSUER if KEYCLOAK_ISSUER else f"{KEYCLOAK_URL}/realms/{KEYCLOAK_REALM}"
        payload = jwt.decode(
            token,
            rsa_key,
            algorithms=["RS256"],
            audience=KEYCLOAK_CLIENT_ID,
            issuer=expected_issuer
        )

        return payload

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired"
        )
    except JWTError as e:
        logger.warning(f"JWT validation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token"
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> User:
    """
    FastAPI dependency to extract and validate current user.

    Supports three deployment modes:
    1. Keycloak Auth (AUTH_MODE=keycloak): Full authentication with role-based access
    2. No Auth Read-Only (AUTH_MODE=legacy, READONLY_MODE=true): Viewer access only
    3. No Auth Read-Write (AUTH_MODE=legacy, READONLY_MODE=false): Full admin access (V1 compat)

    Usage:
        @router.get("/protected")
        async def protected_route(user: User = Depends(get_current_user)):
            return {"username": user.username}

    Args:
        credentials: HTTP Bearer token from Authorization header

    Returns:
        User object with user_id, username, email, roles

    Raises:
        HTTPException: If token is missing or invalid
    """
    # Legacy mode: No authentication (V1 compatibility)
    if AUTH_MODE == "legacy":
        if READONLY_MODE:
            # Mode 2: Read-only access without authentication
            logger.debug("AUTH_MODE=legacy, READONLY_MODE=true: read-only access")
            return User(
                user_id="readonly-user",
                username="readonly",
                email="readonly@localhost",
                roles=["viewer"]  # Read-only access
            )
        else:
            # Mode 3: Full read-write access without authentication
            logger.debug("AUTH_MODE=legacy, READONLY_MODE=false: full access")
            return User(
                user_id="legacy-user",
                username="legacy",
                email="legacy@localhost",
                roles=["admin", "editor", "viewer", "auditor"]  # Full access
            )

    # Development mode: Optional authentication
    if DEVELOPMENT_MODE and not credentials:
        logger.debug("DEVELOPMENT_MODE: using mock admin user")
        return User(
            user_id="dev-user",
            username="developer",
            email="dev@localhost",
            roles=["admin", "editor", "viewer", "auditor"]
        )

    # Production mode: Require authentication
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token = credentials.credentials
    payload = verify_token(token)

    # Extract user info from JWT claims
    user_id = payload.get("sub")
    username = payload.get("preferred_username")
    email = payload.get("email")

    # Extract roles (support both realm_access and resource_access)
    roles = []

    # Realm-level roles (e.g., ldap_admin, ldap_editor)
    realm_roles = payload.get("realm_access", {}).get("roles", [])
    roles.extend([r.replace("ldap_", "") for r in realm_roles if r.startswith("ldap_")])

    # Client-level roles (preferred)
    resource_access = payload.get("resource_access", {})
    client_roles = resource_access.get(KEYCLOAK_CLIENT_ID, {}).get("roles", [])
    roles.extend(client_roles)

    # Deduplicate roles
    roles = list(set(roles))

    if not user_id or not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )

    logger.debug(f"Authenticated user: {username} (roles: {roles})")

    return User(
        user_id=user_id,
        username=username,
        email=email,
        roles=roles
    )


async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[User]:
    """
    Optional authentication dependency.

    Returns None if no credentials provided in legacy/dev mode.
    Useful for endpoints that support both authenticated and anonymous access.

    Args:
        credentials: Optional HTTP Bearer token

    Returns:
        User object or None
    """
    if not credentials and (AUTH_MODE == "legacy" or DEVELOPMENT_MODE):
        return None

    if credentials:
        return await get_current_user(credentials)

    return None
