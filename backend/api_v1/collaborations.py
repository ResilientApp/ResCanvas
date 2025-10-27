"""
API v1: Collaboration Endpoints

Unified collaboration API for canvas/resource sharing and invitations.
This consolidates the previously separate invite and share functionality
into a cohesive collaboration model.

All routes are prefixed with /api/v1/collaborations

Invitation Management:
- GET /api/v1/collaborations/invitations - List user's pending invitations
- POST /api/v1/collaborations/invitations/<id>/accept - Accept invitation
- POST /api/v1/collaborations/invitations/<id>/decline - Decline invitation
- DELETE /api/v1/collaborations/invitations/<id> - Cancel/delete invitation

Canvas Collaboration:
- POST /api/v1/collaborations/invite - Send collaboration invite
  (Body: {canvasId, usernames: [], role})
"""

from flask import Blueprint
from routes.rooms import (
    list_invites,
    accept_invite,
    decline_invite,
    invite_user
)

collaborations_v1_bp = Blueprint('collaborations_v1', __name__, url_prefix='/api/v1/collaborations')
collaborations_v1_bp.add_url_rule('/invitations', 'list_invitations', list_invites, methods=['GET'])
collaborations_v1_bp.add_url_rule('/invitations/<inviteId>/accept', 'accept_invitation', accept_invite, methods=['POST'])
collaborations_v1_bp.add_url_rule('/invitations/<inviteId>/decline', 'decline_invitation', decline_invite, methods=['POST'])

# Note: invite_user expects roomId as a route parameter, so we'll need a wrapper
# For now, keeping it under canvases endpoint for consistency
