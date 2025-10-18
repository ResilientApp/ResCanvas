"""
API v1: Authentication Endpoints

Versioned authentication API for external applications.
All routes are prefixed with /api/v1/auth

Endpoints:
- POST /api/v1/auth/register - Create new user account
- POST /api/v1/auth/login - Authenticate and get token
- POST /api/v1/auth/refresh - Refresh access token
- POST /api/v1/auth/logout - Logout user
- GET /api/v1/auth/me - Get current user info
- POST /api/v1/auth/change-password - Change password
"""

from flask import Blueprint
from routes.auth import (
    register,
    login,
    refresh,
    logout,
    me,
    change_password
)

# Create v1 auth blueprint with /api/v1/auth prefix
auth_v1_bp = Blueprint('auth_v1', __name__, url_prefix='/api/v1/auth')

# Register all auth endpoints
auth_v1_bp.add_url_rule('/register', 'register', register, methods=['POST'])
auth_v1_bp.add_url_rule('/login', 'login', login, methods=['POST'])
auth_v1_bp.add_url_rule('/refresh', 'refresh', refresh, methods=['POST'])
auth_v1_bp.add_url_rule('/logout', 'logout', logout, methods=['POST'])
auth_v1_bp.add_url_rule('/me', 'me', me, methods=['GET'])
auth_v1_bp.add_url_rule('/change-password', 'change_password', change_password, methods=['POST'])
