
from flask import Blueprint
from routes.auth import (
    register,
    login,
    refresh,
    logout,
    me,
    change_password
)

auth_v1_bp = Blueprint('auth_v1', __name__, url_prefix='/api/v1/auth')

auth_v1_bp.add_url_rule('/register', 'register', register, methods=['POST'])
auth_v1_bp.add_url_rule('/login', 'login', login, methods=['POST'])
auth_v1_bp.add_url_rule('/refresh', 'refresh', refresh, methods=['POST'])
auth_v1_bp.add_url_rule('/logout', 'logout', logout, methods=['POST'])
auth_v1_bp.add_url_rule('/me', 'me', me, methods=['GET'])
auth_v1_bp.add_url_rule('/change-password', 'change_password', change_password, methods=['POST'])
