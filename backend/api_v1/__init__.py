"""
ResCanvas API v1

Versioned API layer for external application compatibility.

This module provides a stable, versioned interface to ResCanvas functionality.

All endpoints under /api/v1/* are intended for external consumption and follow
strict versioning semantics.
"""

from flask import Blueprint

api_v1_bp = Blueprint('api_v1', __name__, url_prefix='/api/v1')

from .auth import auth_v1_bp
from .canvases import canvases_v1_bp
from .collaborations import collaborations_v1_bp
from .notifications import notifications_v1_bp
from .users import users_v1_bp

def register_v1_blueprints(app):
    """Register all v1 API blueprints to the Flask app"""
    app.register_blueprint(auth_v1_bp)
    app.register_blueprint(canvases_v1_bp)
    app.register_blueprint(collaborations_v1_bp)
    app.register_blueprint(notifications_v1_bp)
    app.register_blueprint(users_v1_bp)
