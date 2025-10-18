"""
API v1: Invitation Endpoints

Versioned invitation API for external applications.
All routes are prefixed with /api/v1/invites

Endpoints:
- GET /api/v1/invites - List user's invitations
- POST /api/v1/invites/<id>/accept - Accept invitation
- POST /api/v1/invites/<id>/decline - Decline invitation
"""

from flask import Blueprint
from routes.rooms import (
    list_invites,
    accept_invite,
    decline_invite
)

# Create v1 invites blueprint with /api/v1/invites prefix
invites_v1_bp = Blueprint('invites_v1', __name__, url_prefix='/api/v1/invites')

# Invitation management
invites_v1_bp.add_url_rule('', 'list_invites', list_invites, methods=['GET'])
invites_v1_bp.add_url_rule('/<inviteId>/accept', 'accept_invite', accept_invite, methods=['POST'])
invites_v1_bp.add_url_rule('/<inviteId>/decline', 'decline_invite', decline_invite, methods=['POST'])
