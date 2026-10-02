"""
Authentication endpoints.

    GET    /api/auth/status          public - drives the login screen / wizard
    POST   /api/auth/setup           first run only, mode=local
    POST   /api/auth/login
    POST   /api/auth/logout
    GET    /api/auth/me
    GET    /api/auth/users           admin
    POST   /api/auth/users           admin
    DELETE /api/auth/users/{name}    admin
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.core.auth import (
    AuthMode,
    Identity,
    Role,
    authenticate,
    hash_password,
    load_auth_settings,
    validate_new_password,
)
from app.core.rbac import SESSION_COOKIE, require_admin, resolve_identity
from app.core.secrets import issue_token, load_local_users, save_local_users

logger = logging.getLogger(__name__)

router = APIRouter()


class Credentials(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class NewUser(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)
    role: Role = Role.READONLY


class SetupRequest(BaseModel):
    users: List[NewUser] = Field(min_length=1)


def _cookie_secure(request: Request) -> bool:
    """Secure cookies when we are actually on HTTPS, including behind a proxy."""
    forwarded = request.headers.get("x-forwarded-proto", "")
    return forwarded.split(",")[0].strip() == "https" or request.url.scheme == "https"


def _set_session(request: Request, response: Response, identity: Identity, hours: int) -> None:
    response.set_cookie(
        key=SESSION_COOKIE,
        value=issue_token(identity.subject, identity.role.value, ttl=hours * 3600),
        httponly=True,
        samesite="lax",
        secure=_cookie_secure(request),
        max_age=hours * 3600,
        path="/",
    )


def _public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    """Never leak the hash."""
    return {"username": user.get("username"), "role": user.get("role")}


def _username_hint(settings) -> Optional[str]:
    """
    The attribute users should type, for the login label: "uid", "cn", ...

    Only the attribute name is exposed. The full DN template would reveal the
    directory structure to anyone who loads the login page, which they have not
    authenticated for yet.
    """
    if settings.mode is not AuthMode.LDAP:
        return None
    template = settings.ldap.user_dn_template or settings.ldap.bind_dn_template or ""
    if "=" in template:
        attribute = template.split("=", 1)[0].strip().lower()
        if attribute.isalnum():
            return attribute
    return "username"


@router.get("/status")
async def auth_status(request: Request) -> Dict[str, Any]:
    """
    Public. Tells the UI whether to show nothing, a login form, or the wizard.
    """
    settings = load_auth_settings()
    identity = resolve_identity(request)

    setup_required = settings.mode is AuthMode.LOCAL and not load_local_users()

    return {
        "mode": settings.mode.value,
        "default_role": settings.default_role.value,
        "setup_required": setup_required,
        "authenticated": identity.authenticated,
        "subject": identity.subject,
        "role": identity.role.value,
        "ldap_cluster": settings.ldap.cluster if settings.mode is AuthMode.LDAP else None,
        "ldap_username_hint": _username_hint(settings),
        "session_lifetime_hours": settings.session_lifetime_hours,
    }


@router.post("/setup")
async def setup(body: SetupRequest, request: Request, response: Response) -> Dict[str, Any]:
    """First-run wizard. Only valid for mode=local with no users yet."""
    settings = load_auth_settings()
    if settings.mode is not AuthMode.LOCAL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Setup applies to auth.mode 'local' (currently '{settings.mode.value}')",
        )
    if load_local_users():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Users already exist. Sign in as an admin to add more.",
        )
    if not any(u.role is Role.ADMIN for u in body.users):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one user must have the 'admin' role",
        )

    seen = set()
    users: List[Dict[str, Any]] = []
    for candidate in body.users:
        name = candidate.username.strip()
        if name in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate username '{name}'")
        seen.add(name)
        error = validate_new_password(candidate.password)
        if error:
            raise HTTPException(status_code=400, detail=f"{name}: {error}")
        users.append(
            {"username": name, "role": candidate.role.value, "password_hash": hash_password(candidate.password)}
        )

    save_local_users(users)
    logger.info("Initial users created: %s", ", ".join(sorted(seen)))

    admin = next(u for u in users if u["role"] == Role.ADMIN.value)
    identity = Identity(subject=admin["username"], role=Role.ADMIN, authenticated=True, method="local")
    _set_session(request, response, identity, settings.session_lifetime_hours)
    return {"ok": True, "identity": identity.to_dict(), "users": [_public_user(u) for u in users]}


@router.post("/login")
async def login(body: Credentials, request: Request, response: Response) -> Dict[str, Any]:
    settings = load_auth_settings()
    if settings.mode is AuthMode.NONE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Login is disabled (auth.mode is 'none'). Set it to 'local' or 'ldap'.",
        )

    identity = authenticate(body.username, body.password)
    if identity is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    _set_session(request, response, identity, settings.session_lifetime_hours)
    return {"ok": True, "identity": identity.to_dict()}


@router.post("/logout")
async def logout(response: Response) -> Dict[str, bool]:
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
async def me(request: Request) -> Dict[str, Any]:
    return resolve_identity(request).to_dict()


@router.get("/users", dependencies=[Depends(require_admin)])
async def list_users() -> Dict[str, Any]:
    settings = load_auth_settings()
    return {
        "mode": settings.mode.value,
        "users": [_public_user(u) for u in load_local_users()],
    }


@router.post("/users", dependencies=[Depends(require_admin)])
async def upsert_user(body: NewUser) -> Dict[str, Any]:
    settings = load_auth_settings()
    if settings.mode is not AuthMode.LOCAL:
        raise HTTPException(status_code=400, detail="Built-in users apply to auth.mode 'local'")

    error = validate_new_password(body.password)
    if error:
        raise HTTPException(status_code=400, detail=error)

    users = load_local_users()
    name = body.username.strip()
    entry = {"username": name, "role": body.role.value, "password_hash": hash_password(body.password)}

    for idx, existing in enumerate(users):
        if existing.get("username") == name:
            # Do not let the last admin demote themselves out of the app
            if existing.get("role") == Role.ADMIN.value and body.role is not Role.ADMIN:
                if sum(1 for u in users if u.get("role") == Role.ADMIN.value) <= 1:
                    raise HTTPException(status_code=400, detail="Cannot demote the only admin")
            users[idx] = entry
            break
    else:
        users.append(entry)

    save_local_users(users)
    return {"ok": True, "users": [_public_user(u) for u in users]}


@router.delete("/users/{username}", dependencies=[Depends(require_admin)])
async def delete_user(username: str) -> Dict[str, Any]:
    users = load_local_users()
    target = next((u for u in users if u.get("username") == username), None)
    if target is None:
        raise HTTPException(status_code=404, detail=f"No such user '{username}'")
    if target.get("role") == Role.ADMIN.value:
        if sum(1 for u in users if u.get("role") == Role.ADMIN.value) <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the only admin")

    users = [u for u in users if u.get("username") != username]
    save_local_users(users)
    return {"ok": True, "users": [_public_user(u) for u in users]}
