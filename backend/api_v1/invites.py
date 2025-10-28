
from flask import Blueprint
from routes.rooms import (
    list_invites,
    accept_invite,
    decline_invite
)

invites_v1_bp = Blueprint('invites_v1', __name__, url_prefix='/api/v1/invites')

invites_v1_bp.add_url_rule('', 'list_invites', list_invites, methods=['GET'])
invites_v1_bp.add_url_rule('/<inviteId>/accept', 'accept_invite', accept_invite, methods=['POST'])
invites_v1_bp.add_url_rule('/<inviteId>/decline', 'decline_invite', decline_invite, methods=['POST'])
