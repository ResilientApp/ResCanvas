
from flask import Blueprint

api_v1_bp = Blueprint('api_v1', __name__, url_prefix='/api/v1')

from .auth import auth_v1_bp
from .rooms import rooms_v1_bp
from .invites import invites_v1_bp
from .notifications import notifications_v1_bp
from .users import users_v1_bp

def register_v1_blueprints(app):
    app.register_blueprint(auth_v1_bp)
    app.register_blueprint(rooms_v1_bp)
    app.register_blueprint(invites_v1_bp)
    app.register_blueprint(notifications_v1_bp)
    app.register_blueprint(users_v1_bp)
