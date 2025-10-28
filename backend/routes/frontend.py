
from flask import Blueprint, send_from_directory, make_response, jsonify, g, request
from pathlib import Path
import os
import logging
from middleware.auth import require_auth, require_auth_optional

logger = logging.getLogger(__name__)
frontend_bp = Blueprint("frontend", __name__)

FRONTEND_BUILD_DIR = Path(__file__).parent.parent.parent / "frontend" / "build"

PUBLIC_ROUTES = {
    '/login',
    '/register',
    '/blog',
    '/metrics',
    '/',}


def is_public_route(path):
    if path in PUBLIC_ROUTES:
        return True

    if path.startswith('/static/'):
        return True

    if path.endswith('.json') or path.endswith('.txt') or path.endswith('.ico'):
        return True

    return False


@frontend_bp.route('/', defaults={'path': ''})
@frontend_bp.route('/<path:path>')
def serve_frontend(path=''):

    request_path = '/' + path if path else '/'

    if not is_public_route(request_path):
        auth_header = request.headers.get('Authorization', '')
        token = None
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1]

        cookie_token = request.cookies.get('access_token')
        if not token and cookie_token:
            token = cookie_token

        if not token:
            if request.headers.get('Accept', '').find('application/json') >= 0:
                return jsonify({
                    "status": "error",
                    "message": "Authentication required",
                    "code": "AUTH_REQUIRED",
                    "redirectTo": "/login"
                }), 401
            else:
                try:
                    return send_from_directory(FRONTEND_BUILD_DIR, 'index.html')
                except Exception:
                    return jsonify({
                        "status": "error",
                        "message": "Frontend not built"
                    }), 500

        try:
            import jwt
            from config import JWT_SECRET
            from datetime import datetime, timezone

            claims = jwt.decode(
                token,
                JWT_SECRET,
                algorithms=["HS256"],
                options={"require": ["exp", "sub"], "verify_exp": True}
            )

            exp_timestamp = claims.get('exp')
            if exp_timestamp:
                exp_dt = datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
                if datetime.now(timezone.utc) >= exp_dt:
                    if request.headers.get('Accept', '').find('application/json') >= 0:
                        return jsonify({
                            "status": "error",
                            "message": "Token expired",
                            "code": "TOKEN_EXPIRED",
                            "redirectTo": "/login"
                        }), 401
                    else:
                        return send_from_directory(FRONTEND_BUILD_DIR, 'index.html')

            logger.info(f"Serving protected route {request_path} to user {claims.get('sub')}")

        except jwt.ExpiredSignatureError:
            logger.warning(f"Expired token for protected route {request_path}")
            if request.headers.get('Accept', '').find('application/json') >= 0:
                return jsonify({
                    "status": "error",
                    "message": "Token expired",
                    "code": "TOKEN_EXPIRED",
                    "redirectTo": "/login"
                }), 401
            else:
                return send_from_directory(FRONTEND_BUILD_DIR, 'index.html')

        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token for protected route {request_path}: {e}")
            if request.headers.get('Accept', '').find('application/json') >= 0:
                return jsonify({
                    "status": "error",
                    "message": "Invalid token",
                    "code": "INVALID_TOKEN",
                    "redirectTo": "/login"
                }), 401
            else:
                return send_from_directory(FRONTEND_BUILD_DIR, 'index.html')

    try:
        file_path = FRONTEND_BUILD_DIR / path
        if file_path.is_file():
            return send_from_directory(FRONTEND_BUILD_DIR, path)

        return send_from_directory(FRONTEND_BUILD_DIR, 'index.html')

    except Exception as e:
        logger.exception(f"Error serving frontend path {path}")
        return jsonify({
            "status": "error",
            "message": "Resource not found"
        }), 404


@frontend_bp.route('/api/auth/check', methods=['GET'])
@require_auth_optional
def check_auth():
    user = g.current_user

    if user:
        return jsonify({
            "status": "ok",
            "authenticated": True,
            "user": {
                "id": str(user['_id']),
                "username": user.get('username'),
                "walletPubKey": user.get('walletPubKey')
            }
        })
    else:
        return jsonify({
            "status": "ok",
            "authenticated": False
        })
