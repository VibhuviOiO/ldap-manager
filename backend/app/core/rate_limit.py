"""
Rate limiting with slowapi.

Protects against abuse with per-IP and per-user rate limits.
Supports both in-memory (single instance) and Redis (distributed) backends.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address
from fastapi import Request
import os
import logging

logger = logging.getLogger(__name__)

# Redis URL from environment (use memory:// for single instance)
REDIS_URL = os.getenv("REDIS_URL", "memory://")


def get_user_id(request: Request) -> str:
    """
    Extract user ID from request for user-based rate limiting.

    Falls back to IP address if user is not authenticated.

    Args:
        request: FastAPI request object

    Returns:
        User ID from JWT token or IP address
    """
    try:
        # Try to get user from request state (set by auth middleware)
        if hasattr(request.state, 'user') and request.state.user:
            return f"user:{request.state.user.user_id}"
    except Exception:
        pass

    # Fallback to IP address
    return f"ip:{get_remote_address(request)}"


# Initialize rate limiter
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=REDIS_URL,
    strategy="fixed-window"
)

logger.info(f"Rate limiter initialized with storage: {REDIS_URL}")


# Rate limit decorators for common use cases
def ip_rate_limit(calls: int = 100, period: str = "1 minute"):
    """
    Rate limit by IP address.

    Args:
        calls: Number of calls allowed
        period: Time period (e.g., "1 minute", "1 hour")

    Usage:
        @router.get("/endpoint")
        @ip_rate_limit(100, "1 minute")
        async def endpoint():
            ...
    """
    return limiter.limit(f"{calls}/{period}")


def user_rate_limit(calls: int = 1000, period: str = "1 hour"):
    """
    Rate limit by user ID (from JWT token).

    Falls back to IP if user not authenticated.

    Args:
        calls: Number of calls allowed
        period: Time period (e.g., "1 hour", "1 day")

    Usage:
        @router.get("/endpoint")
        @user_rate_limit(1000, "1 hour")
        async def endpoint():
            ...
    """
    return limiter.limit(f"{calls}/{period}", key_func=get_user_id)
