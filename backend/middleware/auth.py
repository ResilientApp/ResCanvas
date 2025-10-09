# backend/middleware/auth.py
"""
Server-side authentication and authorization middleware.

This module enforces ALL security checks on the backend. Client-side validation
is purely for UX - the server is the source of truth for authentication and
authorization decisions.

Key principles:
1. Never trust client-sent data without validation
2. Always verify JWT signatures and expiration server-side
3. Validate user permissions for every protected resource
4. Return consistent error responses (401 for auth, 403 for authz)
"""

from functools import wraps
from flask import request, jsonify, g
import jwt
from datetime import datetime, timezone
from bson import ObjectId
from services.db import users_coll, rooms_coll, shares_coll
from config import JWT_SECRET


class AuthenticationError(Exception):
    """Raised when authentication fails (invalid/missing token)."""
    pass


class AuthorizationError(Exception):
    """Raised when user lacks permission for requested resource."""
    pass


def extract_token_from_request():
    """
    Extract JWT token from Authorization header.
    Returns token string or None if not present/malformed.
    """
    auth_header = request.headers.get('Authorization', '')
    if not auth_header:
        return None
    
    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        return None
    
    return parts[1]


def decode_and_verify_token(token):
    """
    Decode and verify JWT token server-side.
    
    Returns decoded claims dict if valid.
    Raises AuthenticationError if invalid/expired.
    
    Server-side validation includes:
    - Signature verification
    - Expiration check
    - Required claims presence
    """
    if not token:
        raise AuthenticationError("No token provided")
    
    try:
        # Verify signature, expiration, and required claims
        claims = jwt.decode(
            token, 
            JWT_SECRET, 
            algorithms=["HS256"],
            options={
                "require": ["exp", "sub", "username"],
                "verify_exp": True,
                "verify_signature": True
            }
        )
        
        # Additional server-side validation: check exp manually as defense in depth
        exp_timestamp = claims.get('exp')
        if exp_timestamp:
            exp_dt = datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
            if datetime.now(timezone.utc) >= exp_dt:
                raise AuthenticationError("Token expired")
        
        return claims
        
    except jwt.ExpiredSignatureError:
        raise AuthenticationError("Token expired")
    except jwt.InvalidTokenError as e:
        raise AuthenticationError(f"Invalid token: {str(e)}")
    except Exception as e:
        raise AuthenticationError(f"Token validation failed: {str(e)}")


def get_current_user():
    """
    Get the currently authenticated user from request context.
    
    Returns user dict if authenticated, None otherwise.
    Must be called after require_auth decorator has run.
    """
    return getattr(g, 'current_user', None)


def require_auth(f):
    """
    Decorator to enforce authentication on route handlers.
    
    Server-side enforcement:
    - Validates JWT token signature and expiration
    - Verifies user exists in database
    - Injects user object into Flask g.current_user
    
    Returns 401 if authentication fails.
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            # Extract token from request
            token = extract_token_from_request()
            if not token:
                return jsonify({
                    "status": "error",
                    "message": "Authentication required",
                    "code": "NO_TOKEN"
                }), 401
            
            # Decode and verify token server-side
            claims = decode_and_verify_token(token)
            
            # Server-side user existence check
            user_id = claims.get('sub')
            if not user_id:
                return jsonify({
                    "status": "error",
                    "message": "Invalid token claims",
                    "code": "INVALID_CLAIMS"
                }), 401
            
            try:
                user = users_coll.find_one({"_id": ObjectId(user_id)}, {"pwd": 0})
            except Exception:
                # Invalid ObjectId format
                return jsonify({
                    "status": "error",
                    "message": "Invalid user identifier",
                    "code": "INVALID_USER_ID"
                }), 401
            
            if not user:
                return jsonify({
                    "status": "error",
                    "message": "User not found",
                    "code": "USER_NOT_FOUND"
                }), 401
            
            # Inject authenticated user into request context
            g.current_user = user
            g.token_claims = claims
            
            # Call the protected route handler
            return f(*args, **kwargs)
            
        except AuthenticationError as e:
            return jsonify({
                "status": "error",
                "message": str(e),
                "code": "AUTH_FAILED"
            }), 401
        except Exception as e:
            # Log unexpected errors but don't leak details to client
            import logging
            logging.getLogger(__name__).exception("Unexpected auth error")
            return jsonify({
                "status": "error",
                "message": "Authentication failed",
                "code": "AUTH_ERROR"
            }), 401
    
    return decorated_function


def require_auth_optional(f):
    """
    Decorator for routes that work with or without authentication.
    
    If token is present and valid, injects user into g.current_user.
    If token is absent or invalid, continues without user (g.current_user = None).
    
    Useful for endpoints that have different behavior for authenticated vs
    anonymous users (e.g., public rooms listing).
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            token = extract_token_from_request()
            if token:
                try:
                    claims = decode_and_verify_token(token)
                    user_id = claims.get('sub')
                    if user_id:
                        try:
                            user = users_coll.find_one({"_id": ObjectId(user_id)}, {"pwd": 0})
                            if user:
                                g.current_user = user
                                g.token_claims = claims
                        except Exception:
                            pass  # Invalid ObjectId, continue as anonymous
                except AuthenticationError:
                    pass  # Invalid token, continue as anonymous
            
            # Ensure g.current_user exists (None if not authenticated)
            if not hasattr(g, 'current_user'):
                g.current_user = None
                g.token_claims = None
            
            return f(*args, **kwargs)
            
        except Exception as e:
            import logging
            logging.getLogger(__name__).exception("Error in optional auth")
            g.current_user = None
            g.token_claims = None
            return f(*args, **kwargs)
    
    return decorated_function


def require_room_access(room_id_param='id'):
    """
    Decorator to enforce room access permissions.
    
    Server-side enforcement:
    - Verifies user is authenticated (via require_auth)
    - Validates room exists
    - Checks user has permission to access room (owner or member)
    
    Args:
        room_id_param: Name of the route parameter containing room ID
    
    Returns 403 if user lacks permission, 404 if room not found.
    
    Usage:
        @require_auth
        @require_room_access('id')
        def get_room(id):
            room = g.current_room  # Injected by decorator
            ...
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                # Get room ID from route parameters
                room_id = kwargs.get(room_id_param)
                if not room_id:
                    return jsonify({
                        "status": "error",
                        "message": "Room ID required",
                        "code": "NO_ROOM_ID"
                    }), 400
                
                # Server-side room existence check
                from bson import ObjectId
                from bson.errors import InvalidId
                try:
                    room = rooms_coll.find_one({"_id": ObjectId(room_id)})
                except InvalidId:
                    return jsonify({
                        "status": "error",
                        "message": "Invalid room identifier",
                        "code": "INVALID_ROOM_ID"
                    }), 400
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).exception(f"Error fetching room {room_id}")
                    return jsonify({
                        "status": "error",
                        "message": "Database error",
                        "code": "DB_ERROR"
                    }), 500
                
                if not room:
                    return jsonify({
                        "status": "error",
                        "message": "Room not found",
                        "code": "ROOM_NOT_FOUND"
                    }), 404
                
                # Server-side permission check
                # Get user from Flask g context (should be set by @require_auth)
                user = getattr(g, 'current_user', None)
                if not user:
                    return jsonify({
                        "status": "error",
                        "message": "Authentication required - use @require_auth before @require_room_access",
                        "code": "AUTH_REQUIRED"
                    }), 401
                
                user_id_str = str(user['_id'])
                room_owner_id = room.get('ownerId')  # Changed from 'owner' to 'ownerId'
                room_type = room.get('type', 'public')
                
                # Access control logic (server-side enforcement)
                # Check ownership, membership via shares_coll, or public access
                has_access = False
                
                # Owner always has access
                if room_owner_id == user_id_str:
                    has_access = True
                # Public rooms are accessible to all authenticated users
                elif room_type == 'public':
                    has_access = True
                # Check membership in shares collection
                elif shares_coll.find_one({"roomId": str(room["_id"]), "userId": user_id_str}):
                    has_access = True
                
                if not has_access:
                    return jsonify({
                        "status": "error",
                        "message": "Access denied to this room",
                        "code": "ACCESS_DENIED"
                    }), 403
                
                # Inject room into request context for handler use
                g.current_room = room
                
                return f(*args, **kwargs)
                
            except Exception as e:
                import logging
                import traceback
                error_logger = logging.getLogger(__name__)
                error_logger.error(f"Unexpected room access error: {e}")
                error_logger.error(f"Traceback: {traceback.format_exc()}")
                error_logger.error(f"Room ID param: {room_id_param}, kwargs: {kwargs}")
                return jsonify({
                    "status": "error",
                    "message": f"Authorization failed: {str(e)}",
                    "code": "AUTHZ_ERROR"
                }), 403
        
        return decorated_function
    return decorator


def require_room_owner(room_id_param='id'):
    """
    Decorator to enforce room ownership.
    
    Server-side enforcement:
    - Verifies user is authenticated
    - Validates room exists
    - Checks user is the room owner (not just a member)
    
    Returns 403 if user is not owner.
    
    Usage:
        @require_auth
        @require_room_owner('id')
        def delete_room(id):
            ...
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            try:
                room_id = kwargs.get(room_id_param)
                if not room_id:
                    return jsonify({
                        "status": "error",
                        "message": "Room ID required",
                        "code": "NO_ROOM_ID"
                    }), 400
                
                from bson import ObjectId
                from bson.errors import InvalidId
                try:
                    room = rooms_coll.find_one({"_id": ObjectId(room_id)})
                except InvalidId:
                    return jsonify({
                        "status": "error",
                        "message": "Invalid room identifier",
                        "code": "INVALID_ROOM_ID"
                    }), 400
                except Exception:
                    return jsonify({
                        "status": "error",
                        "message": "Database error",
                        "code": "DB_ERROR"
                    }), 500
                
                if not room:
                    return jsonify({
                        "status": "error",
                        "message": "Room not found",
                        "code": "ROOM_NOT_FOUND"
                    }), 404
                
                user = g.current_user
                if not user:
                    return jsonify({
                        "status": "error",
                        "message": "Authentication required",
                        "code": "AUTH_REQUIRED"
                    }), 401
                
                # Server-side ownership check
                user_id_str = str(user['_id'])
                room_owner_id = room.get('ownerId')  # Changed from 'owner' to 'ownerId'
                
                if room_owner_id != user_id_str:
                    return jsonify({
                        "status": "error",
                        "message": "Only room owner can perform this action",
                        "code": "OWNER_REQUIRED"
                    }), 403
                
                g.current_room = room
                return f(*args, **kwargs)
                
            except Exception as e:
                import logging
                logging.getLogger(__name__).exception("Unexpected room owner check error")
                return jsonify({
                    "status": "error",
                    "message": "Authorization failed",
                    "code": "AUTHZ_ERROR"
                }), 403
        
        return decorated_function
    return decorator


def validate_request_data(schema):
    """
    Decorator to validate request JSON data against a schema.
    
    Server-side data validation to ensure all inputs are properly validated
    before processing, regardless of client-side validation.
    
    Args:
        schema: Dict with field names as keys and validator functions as values
                Validator should return (is_valid, error_message) tuple
    
    Example:
        def validate_username(value):
            if not value or len(value) < 3:
                return False, "Username must be at least 3 characters"
            return True, None
        
        @validate_request_data({'username': validate_username})
        def create_user():
            ...
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            data = request.get_json() or {}
            errors = {}
            
            for field, config in schema.items():
                value = data.get(field)
                
                # Support both direct validator functions and config dicts
                if callable(config):
                    # Old style: direct validator function
                    validator = config
                    required = False
                elif isinstance(config, dict):
                    # New style: dict with "validator" and "required" keys
                    validator = config.get("validator")
                    required = config.get("required", False)
                else:
                    # Invalid config
                    return jsonify({
                        "status": "error",
                        "message": f"Invalid validator configuration for field '{field}'",
                        "code": "INVALID_VALIDATOR_CONFIG"
                    }), 500
                
                # Check required fields
                if required and value is None:
                    errors[field] = f"Field '{field}' is required"
                    continue
                
                # Skip validation if field is not required and not provided
                if value is None and not required:
                    continue
                
                is_valid, error_msg = validator(value)
                if not is_valid:
                    errors[field] = error_msg
            
            if errors:
                return jsonify({
                    "status": "error",
                    "message": "Validation failed",
                    "errors": errors,
                    "code": "VALIDATION_ERROR"
                }), 400
            
            # Store validated data in g for handler access
            g.validated_data = data
            
            return f(*args, **kwargs)
        
        return decorated_function
    return decorator
