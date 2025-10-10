# backend/middleware/__init__.py
"""
Authentication and authorization middleware for ResCanvas backend.
All security enforcement happens server-side.
"""

from .auth import require_auth, require_auth_optional, get_current_user, AuthenticationError, AuthorizationError

__all__ = [
    'require_auth',
    'require_auth_optional', 
    'get_current_user',
    'AuthenticationError',
    'AuthorizationError'
]
