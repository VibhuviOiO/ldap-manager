"""
Role enforcement for API routes.

Usage:

    from app.core.rbac import require_readwrite, require_admin

    @router.post("/...", dependencies=[Depends(require_admin)])
    async def thing(): ...

    # or, when the handler needs to know who is asking:
    async def thing(identity: Identity = Depends(require_readwrite)): ...

Behaviour:

  * auth.mode = none  -> no login. The visitor gets auth.default_role
                         (readonly unless the operator widened it), so a direct
                         hit on the app cannot change anything by default.
  * auth.mode = local | ldap -> signing in is required. Anonymous requests get
                         401, and an authenticated role below the requirement
                         gets 403.
"""

import logging
from typing import Optional

from fastapi import HTTPException, Request, status

from app.core.auth import (
    AuthMode,
    Identity,
    Role,
    anonymous_identity,
    load_auth_settings,
)
from app.core.secrets import verify_token

logger = logging.getLogger(__name__)

SESSION_COOKIE = "ldap_manager_session"


def _token_from_request(request: Request) -> Optional[str]:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return request.cookies.get(SESSION_COOKIE)


def resolve_identity(request: Request) -> Identity:
    """Identity for this request: a valid session, else the anonymous default."""
    payload = verify_token(_token_from_request(request))
    if payload:
        try:
            return Identity(
                subject=str(payload.get("sub", "unknown")),
                role=Role(str(payload.get("role", "readonly"))),
                authenticated=True,
                method="session",
            )
        except ValueError:
            logger.warning("Session carried an unknown role: %r", payload.get("role"))

    return anonymous_identity()


def require_role(minimum: Role):
    """Dependency factory: enforce a minimum role."""

    async def _dependency(request: Request) -> Identity:
        settings = load_auth_settings()
        identity = resolve_identity(request)

        if settings.mode is not AuthMode.NONE and not identity.authenticated:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not identity.role.allows(minimum):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This action requires the '{minimum.value}' role "
                       f"(you have '{identity.role.value}')",
            )

        return identity

    return _dependency


require_readonly = require_role(Role.READONLY)
require_readwrite = require_role(Role.READWRITE)
require_admin = require_role(Role.ADMIN)
