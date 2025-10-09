# backend/routes/frontend.py
"""
Frontend serving routes with server-side authentication enforcement.

This module ensures that sensitive routes are protected server-side,
preventing unauthorized access to the application shell and pre-rendered pages.
"""

from flask import Blueprint, send_from_directory, make_response, jsonify, g, request
from pathlib import Path
import os
import logging
from middleware.auth import require_auth, require_auth_optional

logger = logging.getLogger(__name__)
frontend_bp = Blueprint("frontend", __name__)

# Path to built frontend files
FRONTEND_BUILD_DIR = Path(__file__).parent.parent.parent / "frontend" / "build"

# Public routes that don't require authentication
PUBLIC_ROUTES = {
    '/login',
    '/register',
    '/blog',
    '/metrics',
    '/',  # Landing page redirects based on auth
}


def is_public_route(path):
    """Check if a route should be publicly accessible."""
    # Exact match
    if path in PUBLIC_ROUTES:
        return True
    
    # Static assets are always public
    if path.startswith('/static/'):
        return True
    
    # Manifest and other build artifacts
    if path.endswith('.json') or path.endswith('.txt') or path.endswith('.ico'):
        return True
    
    return False


@frontend_bp.route('/', defaults={'path': ''})
@frontend_bp.route('/<path:path>')
def serve_frontend(path=''):
    """
    Serve frontend application with optional server-side JWT enforcement for protected routes.
    Public assets remain accessible; protected SPA routes require a valid JWT.
    """
    
    # Normalize path
    request_path = '/' + path if path else '/'
    
    # Check if this is a public route
    if not is_public_route(request_path):
        # Protected route - require authentication
        # Extract and validate JWT token
        auth_header = request.headers.get('Authorization', '')
        token = None
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1]
        
        # Also check cookie-based auth for browser navigation
        cookie_token = request.cookies.get('access_token')
        if not token and cookie_token:
            token = cookie_token
        
        if not token:
            # No token provided - return 401 with JSON for API calls,
            # or redirect to login for browser navigation
            if request.headers.get('Accept', '').find('application/json') >= 0:
                return jsonify({
                    "status": "error",
                    "message": "Authentication required",
                    "code": "AUTH_REQUIRED",
                    "redirectTo": "/login"
                }), 401
            else:
                # Browser navigation - serve login page
                try:
                    return send_from_directory(FRONTEND_BUILD_DIR, 'index.html')
                except Exception:
                    return jsonify({
                        "status": "error",
                        "message": "Frontend not built"
                    }), 500
        
        # Validate token server-side
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
            
            # Additional expiration check (defense in depth)
            exp_timestamp = claims.get('exp')
            if exp_timestamp:
                exp_dt = datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
                if datetime.now(timezone.utc) >= exp_dt:
                    # Token expired
                    if request.headers.get('Accept', '').find('application/json') >= 0:
                        return jsonify({
                            "status": "error",
                            "message": "Token expired",
                            "code": "TOKEN_EXPIRED",
                            "redirectTo": "/login"
                        }), 401
                    else:
                        return send_from_directory(FRONTEND_BUILD_DIR, 'index.html')
            
            # Token is valid - serve the protected frontend
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
    
    # Serve the requested file or index.html for SPA routing
    try:
        # Try to serve the exact file requested
        file_path = FRONTEND_BUILD_DIR / path
        if file_path.is_file():
            return send_from_directory(FRONTEND_BUILD_DIR, path)
        
        # For SPA routes, serve index.html
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
    """
    Server-side authentication check endpoint.
    
    Returns current authentication status and user info if authenticated.
    Client can call this to verify token validity server-side.
    """
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
