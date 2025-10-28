# backend/middleware/rate_limit.py
"""
Comprehensive rate limiting middleware for ResCanvas API.

This module provides multi-tier rate limiting to protect against:
- DoS/DDoS attacks
- Brute force login attempts
- Resource exhaustion
- API abuse

Rate limits are enforced at multiple levels:
1. Global limits (per IP)
2. Endpoint-specific limits
3. User-specific limits (for authenticated users)
4. Burst protection

The middleware integrates with Redis for distributed rate limit counters,
ensuring limits work across multiple backend instances.
"""

from functools import wraps
from flask import request, jsonify, g, current_app
import jwt
import logging
from datetime import datetime, timezone

# Try to import flask_limiter, but allow graceful degradation if not available
try:
    from flask_limiter import Limiter
    from flask_limiter.util import get_remote_address
    FLASK_LIMITER_AVAILABLE = True
except ImportError:
    FLASK_LIMITER_AVAILABLE = False
    # Provide a dummy get_remote_address function
    def get_remote_address():
        return request.remote_addr if request else "unknown"

from config import (
    JWT_SECRET,
    RATE_LIMIT_STORAGE_URI,
    RATE_LIMIT_ENABLED,
    RATE_LIMIT_GLOBAL_HOURLY,
    RATE_LIMIT_GLOBAL_AUTH_HOURLY,
)

logger = logging.getLogger(__name__)

# Global limiter instance (initialized in app.py)
limiter = None


def get_user_identifier():
    """
    Get unique identifier for rate limiting.
    
    Returns:
        - User ID (for authenticated users)
        - IP address (for anonymous users)
    
    This allows different rate limits for authenticated vs anonymous users.
    """
    # Try to extract user from JWT token
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1]
        try:
            claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            user_id = claims.get('sub')
            if user_id:
                return f"user:{user_id}"
        except Exception:
            pass
    
    # Fallback to IP address for anonymous users
    return f"ip:{get_remote_address()}"


def get_authenticated_user_id():
    """
    Get user ID if authenticated, otherwise None.
    Used for user-specific rate limits.
    """
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1]
        try:
            claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
            return claims.get('sub')
        except Exception:
            pass
    return None


def is_authenticated():
    """Check if the current request is from an authenticated user."""
    return get_authenticated_user_id() is not None


def get_dynamic_global_limit():
    """
    Return different global limits based on authentication status.
    Authenticated users get higher limits.
    """
    if is_authenticated():
        return f"{RATE_LIMIT_GLOBAL_AUTH_HOURLY} per hour"
    return f"{RATE_LIMIT_GLOBAL_HOURLY} per hour"


def rate_limit_error_handler(e):
    """
    Custom error handler for rate limit exceeded (429) responses.
    
    Returns a JSON response with rate limit details and standard format
    matching ResCanvas API error conventions.
    """
    # Extract rate limit info from the limiter exception
    limit_info = {
        "status": "error",
        "error": "rate_limit_exceeded",
        "message": str(e.description) or "Rate limit exceeded. Please try again later.",
    }
    
    # Add rate limit headers to help clients
    response = jsonify(limit_info)
    response.status_code = 429
    
    # Add standard rate limit headers
    # These are automatically added by Flask-Limiter, but we ensure they're present
    if hasattr(e, 'limit'):
        response.headers['X-RateLimit-Limit'] = str(e.limit.amount)
    if hasattr(e, 'remaining'):
        response.headers['X-RateLimit-Remaining'] = str(e.remaining)
    if hasattr(e, 'reset_at'):
        response.headers['X-RateLimit-Reset'] = str(int(e.reset_at))
        # Calculate seconds until reset for Retry-After header
        now = datetime.now(timezone.utc).timestamp()
        retry_after = max(1, int(e.reset_at - now))
        response.headers['Retry-After'] = str(retry_after)
    
    # Log rate limit violations for monitoring
    user_id = get_authenticated_user_id()
    ip_address = get_remote_address()
    logger.warning(
        f"Rate limit exceeded: user_id={user_id}, ip={ip_address}, "
        f"endpoint={request.endpoint}, method={request.method}"
    )
    
    return response


def init_limiter(app):
    """
    Initialize the Flask-Limiter with the Flask app.
    
    This should be called from app.py after the app is created.
    """
    global limiter
    
    # If flask_limiter is not available, limiter remains None (tests will use safe_limit)
    if not FLASK_LIMITER_AVAILABLE:
        logger.warning("flask_limiter not available - rate limiting disabled")
        limiter = None
        return limiter
    
    if not RATE_LIMIT_ENABLED:
        logger.info("Rate limiting is DISABLED via configuration")
        # Create a no-op limiter that doesn't enforce limits
        limiter = Limiter(
            app=app,
            key_func=get_user_identifier,
            enabled=False
        )
        return limiter
    
    limiter = Limiter(
        app=app,
        key_func=get_user_identifier,
        storage_uri=RATE_LIMIT_STORAGE_URI,
        storage_options={
            "socket_connect_timeout": 5,
            "socket_timeout": 5,
        },
        # Default limits applied to all routes (can be overridden)
        default_limits=[get_dynamic_global_limit],
        # Add rate limit headers to all responses
        headers_enabled=True,
        # Retry-After header for 429 responses
        retry_after="http-date",
        # Custom error handler
        on_breach=rate_limit_error_handler,
        # Swallow errors (don't break app if Redis is down)
        swallow_errors=True,
    )
    
    logger.info(f"Rate limiting ENABLED: storage={RATE_LIMIT_STORAGE_URI}")
    return limiter


def room_specific_limit(limit_value):
    """
    Decorator for room-specific rate limits.
    
    Example: @room_specific_limit("5/minute")
    This limits operations to 5 per minute per room (not per user).
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            # Extract roomId from URL params or request body
            room_id = kwargs.get('roomId') or request.view_args.get('roomId')
            if not room_id:
                data = request.get_json(silent=True) or {}
                room_id = data.get('roomId')
            
            if room_id:
                # Use room-specific key for limit
                key = f"room:{room_id}"
                # Apply limit using the limiter
                limiter.limit(limit_value, key_func=lambda: key)(f)(*args, **kwargs)
            else:
                # Fallback to default limit if no room identified
                return f(*args, **kwargs)
        return wrapper
    return decorator


def exempt_from_limits(f):
    """
    Decorator to exempt a route from rate limiting.
    Use sparingly - only for health checks, static assets, etc.
    """
    if limiter:
        return limiter.exempt(f)
    return f


# Pre-configured decorators for common use cases
def auth_rate_limit(limit_str):
    """Apply rate limit to authentication endpoints."""
    def decorator(f):
        if limiter:
            return limiter.limit(limit_str, key_func=get_remote_address)(f)
        return f
    return decorator


def user_rate_limit(limit_str):
    """Apply rate limit per authenticated user."""
    def decorator(f):
        if limiter:
            return limiter.limit(limit_str, key_func=get_user_identifier)(f)
        return f
    return decorator


def burst_protection(f):
    """Apply burst protection (10 requests/second)."""
    if limiter:
        return limiter.limit("10/second", key_func=get_user_identifier)(f)
    return f


def safe_limit(limit_str, key_func=None):
    """
    Safe rate limit decorator that handles when limiter is not initialized.
    
    This is needed because route decorators are applied at import time,
    but limiter is initialized later in app.py. During testing, limiter
    may be None when blueprints are imported.
    
    Args:
        limit_str: Rate limit string (e.g., "5/minute")
        key_func: Optional function to generate rate limit key
    
    Returns:
        A decorator that applies rate limiting if limiter is available,
        otherwise returns the function unchanged (no-op).
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            # If limiter is initialized and enabled, apply the limit
            if limiter is not None:
                # Get the actual limit decorator from limiter
                if key_func:
                    limit_decorator = limiter.limit(limit_str, key_func=key_func)
                else:
                    limit_decorator = limiter.limit(limit_str)
                # Apply it to the function and call it
                return limit_decorator(f)(*args, **kwargs)
            # If limiter is None (e.g., during tests or before init), just call the function
            return f(*args, **kwargs)
        return wrapper
    return decorator
