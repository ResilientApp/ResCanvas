"""
API v1: Room Management Endpoints

Versioned room API for external applications.
All routes are prefixed with /api/v1/rooms

Endpoints:
- POST /api/v1/rooms - Create new room
- GET /api/v1/rooms - List accessible rooms
- GET /api/v1/rooms/<id> - Get room details
- PATCH /api/v1/rooms/<id> - Update room
- DELETE /api/v1/rooms/<id> - Delete room
- POST /api/v1/rooms/<id>/share - Share room with users
- GET /api/v1/rooms/<id>/members - Get room members
- PATCH /api/v1/rooms/<id>/permissions - Update member permissions
- POST /api/v1/rooms/<id>/transfer - Transfer ownership
- POST /api/v1/rooms/<id>/leave - Leave room
- GET /api/v1/rooms/<id>/strokes - Get drawing strokes
- POST /api/v1/rooms/<id>/strokes - Submit new stroke
- POST /api/v1/rooms/<id>/undo - Undo last stroke
- POST /api/v1/rooms/<id>/redo - Redo undone stroke
- POST /api/v1/rooms/<id>/clear - Clear all strokes
- GET /api/v1/rooms/<id>/undo-redo-status - Get undo/redo status
- POST /api/v1/rooms/<id>/reset-stacks - Reset undo/redo stacks
- POST /api/v1/rooms/<id>/invite - Invite user to room
- GET /api/v1/rooms/suggest - Suggest rooms (autocomplete)
"""

from flask import Blueprint
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
    invite_user,
    suggest_rooms,
    admin_fill_wrapped_key
)

# Create v1 rooms blueprint with /api/v1/rooms prefix
rooms_v1_bp = Blueprint('rooms_v1', __name__, url_prefix='/api/v1/rooms')

# Room CRUD
rooms_v1_bp.add_url_rule('', 'create_room', create_room, methods=['POST'])
rooms_v1_bp.add_url_rule('', 'list_rooms', list_rooms, methods=['GET'])
rooms_v1_bp.add_url_rule('/<roomId>', 'get_room_details', get_room_details, methods=['GET'])
rooms_v1_bp.add_url_rule('/<roomId>', 'update_room', update_room, methods=['PATCH'])
rooms_v1_bp.add_url_rule('/<roomId>', 'delete_room', delete_room, methods=['DELETE'])

# Room sharing and members
rooms_v1_bp.add_url_rule('/<roomId>/share', 'share_room', share_room, methods=['POST'])
rooms_v1_bp.add_url_rule('/<roomId>/members', 'get_room_members', get_room_members, methods=['GET'])
rooms_v1_bp.add_url_rule('/<roomId>/permissions', 'update_permissions', update_permissions, methods=['PATCH'])
rooms_v1_bp.add_url_rule('/<roomId>/transfer', 'transfer_ownership', transfer_ownership, methods=['POST'])
rooms_v1_bp.add_url_rule('/<roomId>/leave', 'leave_room', leave_room, methods=['POST'])
rooms_v1_bp.add_url_rule('/<roomId>/invite', 'invite_user', invite_user, methods=['POST'])

# Drawing data
rooms_v1_bp.add_url_rule('/<roomId>/strokes', 'get_strokes', get_strokes, methods=['GET'])
rooms_v1_bp.add_url_rule('/<roomId>/strokes', 'post_stroke', post_stroke, methods=['POST'])

# Undo/Redo operations
rooms_v1_bp.add_url_rule('/<roomId>/undo', 'room_undo', room_undo, methods=['POST'])
rooms_v1_bp.add_url_rule('/<roomId>/redo', 'room_redo', room_redo, methods=['POST'])
rooms_v1_bp.add_url_rule('/<roomId>/clear', 'room_clear', room_clear, methods=['POST'])
rooms_v1_bp.add_url_rule('/<roomId>/undo-redo-status', 'get_undo_redo_status', get_undo_redo_status, methods=['GET'])
rooms_v1_bp.add_url_rule('/<roomId>/reset-stacks', 'reset_my_stacks', reset_my_stacks, methods=['POST'])

# Utilities
rooms_v1_bp.add_url_rule('/suggest', 'suggest_rooms', suggest_rooms, methods=['GET'])

# Admin endpoints (internal use only, but exposed for compatibility)
rooms_v1_bp.add_url_rule('/<roomId>/admin/fill-wrapped-key', 'admin_fill_wrapped_key', admin_fill_wrapped_key, methods=['POST'])
