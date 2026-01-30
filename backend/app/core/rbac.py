"""
Role-Based Access Control for endpoints.

Defines 4 roles:
- admin: Full access (read, write, delete, user management)
- editor: Read + write (CRUD operations)
- viewer: Read-only (search, stats, monitoring)
- auditor: Read logs only

Usage:
    from app.core.auth import get_current_user, User
    from app.core.rbac import require_roles

    @router.post("/entries/create")
    @require_roles(["admin", "editor"])
    async def create_entry(user: User = Depends(get_current_user)):
        # Only admin or editor can access
        ...
"""

from fastapi import HTTPException, status
from functools import wraps
from app.core.auth import User
from typing import Callable, List
import logging

logger = logging.getLogger(__name__)


def require_roles(allowed_roles: List[str]):
    """
    Decorator to enforce role-based access control.

    Args:
        allowed_roles: List of role names that can access the endpoint

    Returns:
        Decorated function that checks user roles

    Raises:
        HTTPException 403: If user doesn't have required role

    Example:
        @router.post("/entries/create")
        @require_roles(["admin", "editor"])
        async def create_entry(user: User = Depends(get_current_user)):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, user: User, **kwargs):
            # Check if user has any of the allowed roles
            if not any(role in user.roles for role in allowed_roles):
                logger.warning(
                    f"Access denied for user {user.username}",
                    extra={
                        "user_id": user.user_id,
                        "username": user.username,
                        "required_roles": allowed_roles,
                        "user_roles": user.roles,
                        "endpoint": func.__name__
                    }
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access denied. Requires one of: {', '.join(allowed_roles)}"
                )

            logger.debug(
                f"Access granted for user {user.username}",
                extra={
                    "user_id": user.user_id,
                    "username": user.username,
                    "endpoint": func.__name__,
                    "user_roles": user.roles
                }
            )

            return await func(*args, user=user, **kwargs)

        return wrapper
    return decorator


def admin_only(func: Callable):
    """
    Decorator to restrict endpoint to admin role only.

    Example:
        @router.delete("/entries/delete")
        @admin_only
        async def delete_entry(user: User = Depends(get_current_user)):
            ...
    """
    return require_roles(["admin"])(func)


def editor_required(func: Callable):
    """
    Decorator to require editor or admin role.

    Example:
        @router.post("/entries/create")
        @editor_required
        async def create_entry(user: User = Depends(get_current_user)):
            ...
    """
    return require_roles(["admin", "editor"])(func)


def viewer_required(func: Callable):
    """
    Decorator to require viewer, editor, or admin role.

    Example:
        @router.get("/entries/search")
        @viewer_required
        async def search_entries(user: User = Depends(get_current_user)):
            ...
    """
    return require_roles(["admin", "editor", "viewer"])(func)


def auditor_required(func: Callable):
    """
    Decorator to require auditor or admin role.

    Example:
        @router.get("/logs/activity")
        @auditor_required
        async def get_logs(user: User = Depends(get_current_user)):
            ...
    """
    return require_roles(["admin", "auditor"])(func)
