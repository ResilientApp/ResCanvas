"""
API v1: User Endpoints

Versioned user API for external applications.
All routes are prefixed with /api/v1/users

Endpoints:
- GET /api/v1/users/search - Search users (from auth.py)
- GET /api/v1/users/suggest - Suggest users for autocomplete (from rooms.py)
"""

from flask import Blueprint
from routes.auth import users_search
from routes.rooms import suggest_users

# Create v1 users blueprint with /api/v1/users prefix
users_v1_bp = Blueprint('users_v1', __name__, url_prefix='/api/v1/users')

# User search and suggestions
users_v1_bp.add_url_rule('/search', 'users_search', users_search, methods=['GET'])
users_v1_bp.add_url_rule('/suggest', 'suggest_users', suggest_users, methods=['GET'])
