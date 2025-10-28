
from flask import Blueprint
from routes.auth import users_search
from routes.rooms import suggest_users

users_v1_bp = Blueprint('users_v1', __name__, url_prefix='/api/v1/users')

users_v1_bp.add_url_rule('/search', 'users_search', users_search, methods=['GET'])
users_v1_bp.add_url_rule('/suggest', 'suggest_users', suggest_users, methods=['GET'])
