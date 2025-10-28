
from functools import wraps
from flask import request, jsonify, g
import jwt
from datetime import datetime, timezone
from bson import ObjectId
from services.db import users_coll, rooms_coll, shares_coll
from config import JWT_SECRET


class AuthenticationError(Exception):
    pass


class AuthorizationError(Exception):
    pass


def extract_token_from_request():
    auth_header = request.headers.get('Authorization', '')
    if not auth_header:
        return None

    parts = auth_header.split()
    if len(parts) != 2 or parts[0].lower() != 'bearer':
        return None

    return parts[1]


def decode_and_verify_token(token):
    if not token:
        raise AuthenticationError("No token provided")

    try:
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
    return getattr(g, 'current_user', None)


def require_auth(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            token = extract_token_from_request()
            if not token:
                return jsonify({
                    "status": "error",
                    "message": "Authentication required",
                    "code": "NO_TOKEN"
                }), 401

            claims = decode_and_verify_token(token)

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

            g.current_user = user
            g.token_claims = claims

            return f(*args, **kwargs)

        except AuthenticationError as e:
            return jsonify({
                "status": "error",
                "message": str(e),
                "code": "AUTH_FAILED"
            }), 401
        except Exception as e:
            import logging
            logging.getLogger(__name__).exception("Unexpected auth error")
            return jsonify({
                "status": "error",
                "message": "Authentication failed",
                "code": "AUTH_ERROR"
            }), 401

    return decorated_function


def require_auth_optional(f):
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
                            pass
                except AuthenticationError:
                    pass

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

                user = getattr(g, 'current_user', None)
                if not user:
                    return jsonify({
                        "status": "error",
                        "message": "Authentication required - use @require_auth before @require_room_access",
                        "code": "AUTH_REQUIRED"
                    }), 401

                user_id_str = str(user['_id'])
                room_owner_id = room.get('ownerId')
                room_type = room.get('type', 'public')


                has_access = False

                if room_owner_id == user_id_str:
                    has_access = True
                elif room_type == 'public':
                    has_access = True
                elif shares_coll.find_one({"roomId": str(room["_id"]), "userId": user_id_str}):
                    has_access = True

                if not has_access:
                    return jsonify({
                        "status": "error",
                        "message": "Access denied to this room",
                        "code": "ACCESS_DENIED"
                    }), 403

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

                user_id_str = str(user['_id'])
                room_owner_id = room.get('ownerId')
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
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            data = request.get_json() or {}
            errors = {}

            for field, config in schema.items():
                value = data.get(field)

                if callable(config):
                    validator = config
                    required = False
                elif isinstance(config, dict):
                    validator = config.get("validator")
                    required = config.get("required", False)
                else:
                    return jsonify({
                        "status": "error",
                        "message": f"Invalid validator configuration for field '{field}'",
                        "code": "INVALID_VALIDATOR_CONFIG"
                    }), 500

                if required and value is None:
                    errors[field] = f"Field '{field}' is required"
                    continue

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

            g.validated_data = data

            return f(*args, **kwargs)

        return decorated_function
    return decorator
