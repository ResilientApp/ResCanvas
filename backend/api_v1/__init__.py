"""
ResCanvas API v1

Versioned API layer for external application compatibility.

This module provides a stable, versioned interface to ResCanvas functionality
with proper deprecation policies and backward compatibility guarantees.

All endpoints under /api/v1/* are intended for external consumption and follow
strict versioning semantics.
"""

from flask import Blueprint

# Create main v1 blueprint with url_prefix
api_v1_bp = Blueprint('api_v1', __name__, url_prefix='/api/v1')

# Import all v1 sub-blueprints
from .auth import auth_v1_bp
from .rooms import rooms_v1_bp
from .invites import invites_v1_bp
from .notifications import notifications_v1_bp
from .users import users_v1_bp

# Register all sub-blueprints under /api/v1
def register_v1_blueprints(app):
    """Register all v1 API blueprints to the Flask app"""
    app.register_blueprint(auth_v1_bp)
    app.register_blueprint(rooms_v1_bp)
    app.register_blueprint(invites_v1_bp)
    app.register_blueprint(notifications_v1_bp)
    app.register_blueprint(users_v1_bp)
