"""
API v1: Canvas Management Endpoints

Generic canvas API for external applications. Provides a flexible canvas/collection
model that can be adapted to various use cases.

All routes are prefixed with /api/v1/canvases

Core Canvas Endpoints:
- POST /api/v1/canvases - Create new canvas
- GET /api/v1/canvases - List accessible canvases
- GET /api/v1/canvases/<id> - Get canvas details
- PATCH /api/v1/canvases/<id> - Update canvas
- DELETE /api/v1/canvases/<id> - Delete canvas

Canvas Sharing & Access:
- POST /api/v1/canvases/<id>/share - Share canvas with users
- GET /api/v1/canvases/<id>/members - Get canvas members
- PATCH /api/v1/canvases/<id>/members/<userId> - Update member permissions
- DELETE /api/v1/canvases/<id>/members/<userId> - Remove member
- POST /api/v1/canvases/<id>/transfer - Transfer ownership
- POST /api/v1/canvases/<id>/leave - Leave canvas

Drawing Operations:
- GET /api/v1/canvases/<id>/strokes - Get drawing strokes
- POST /api/v1/canvases/<id>/strokes - Submit new stroke
- DELETE /api/v1/canvases/<id>/strokes - Clear all strokes

History Operations:
- POST /api/v1/canvases/<id>/history/undo - Undo last stroke
- POST /api/v1/canvases/<id>/history/redo - Redo undone stroke
- GET /api/v1/canvases/<id>/history/status - Get undo/redo status
- POST /api/v1/canvases/<id>/history/reset - Reset undo/redo stacks

Utilities:
- GET /api/v1/canvases/suggest - Suggest canvases (autocomplete)
- POST /api/v1/canvases/<id>/invite - Invite users to canvas

Note: The API uses canvas terminology while the underlying data model uses "room"
internally. The adapter layer handles parameter translation transparently.
"""

from flask import Blueprint
from .adapters import adapt_canvas_to_room, adapt_member_param
from routes.rooms import (
    create_room,
    list_rooms,
    get_room_details,
    update_room,
    delete_room,
    share_room,
    get_room_members,
    update_permissions,
    transfer_ownership,
    leave_room,
    get_strokes,
    post_stroke,
    room_undo,
    room_redo,
    room_clear,
    get_undo_redo_status,
    reset_my_stacks,
    suggest_rooms,
    invite_user
)

canvases_v1_bp = Blueprint('canvases_v1', __name__, url_prefix='/api/v1/canvases')

canvases_v1_bp.add_url_rule('', 'create_canvas', create_room, methods=['POST'])
canvases_v1_bp.add_url_rule('', 'list_canvases', list_rooms, methods=['GET'])
canvases_v1_bp.add_url_rule('/<canvasId>', 'get_canvas_details', 
                            adapt_canvas_to_room(get_room_details), methods=['GET'])
canvases_v1_bp.add_url_rule('/<canvasId>', 'update_canvas', 
                            adapt_canvas_to_room(update_room), methods=['PATCH'])
canvases_v1_bp.add_url_rule('/<canvasId>', 'delete_canvas', 
                            adapt_canvas_to_room(delete_room), methods=['DELETE'])

canvases_v1_bp.add_url_rule('/<canvasId>/share', 'share_canvas', 
                            adapt_canvas_to_room(share_room), methods=['POST'])
canvases_v1_bp.add_url_rule('/<canvasId>/members', 'get_canvas_members', 
                            adapt_canvas_to_room(get_room_members), methods=['GET'])
canvases_v1_bp.add_url_rule('/<canvasId>/members/<userId>', 'update_member_permissions', 
                            adapt_member_param(adapt_canvas_to_room(update_permissions)), methods=['PATCH'])
canvases_v1_bp.add_url_rule('/<canvasId>/members/<userId>', 'remove_member', 
                            adapt_member_param(adapt_canvas_to_room(update_permissions)), methods=['DELETE'])
canvases_v1_bp.add_url_rule('/<canvasId>/transfer', 'transfer_canvas_ownership', 
                            adapt_canvas_to_room(transfer_ownership), methods=['POST'])
canvases_v1_bp.add_url_rule('/<canvasId>/leave', 'leave_canvas', 
                            adapt_canvas_to_room(leave_room), methods=['POST'])

canvases_v1_bp.add_url_rule('/<canvasId>/strokes', 'get_strokes', 
                            adapt_canvas_to_room(get_strokes), methods=['GET'])
canvases_v1_bp.add_url_rule('/<canvasId>/strokes', 'post_stroke', 
                            adapt_canvas_to_room(post_stroke), methods=['POST'])
canvases_v1_bp.add_url_rule('/<canvasId>/strokes', 'clear_strokes', 
                            adapt_canvas_to_room(room_clear), methods=['DELETE'])

canvases_v1_bp.add_url_rule('/<canvasId>/history/undo', 'canvas_undo', 
                            adapt_canvas_to_room(room_undo), methods=['POST'])
canvases_v1_bp.add_url_rule('/<canvasId>/history/redo', 'canvas_redo', 
                            adapt_canvas_to_room(room_redo), methods=['POST'])
canvases_v1_bp.add_url_rule('/<canvasId>/history/status', 'get_history_status', 
                            adapt_canvas_to_room(get_undo_redo_status), methods=['GET'])
canvases_v1_bp.add_url_rule('/<canvasId>/history/reset', 'reset_history', 
                            adapt_canvas_to_room(reset_my_stacks), methods=['POST'])

canvases_v1_bp.add_url_rule('/<canvasId>/invite', 'invite_to_canvas', 
                            adapt_canvas_to_room(invite_user), methods=['POST'])

canvases_v1_bp.add_url_rule('/suggest', 'suggest_canvases', suggest_rooms, methods=['GET'])
