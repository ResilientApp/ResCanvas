
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

rooms_v1_bp = Blueprint('rooms_v1', __name__, url_prefix='/api/v1/rooms')

rooms_v1_bp.add_url_rule('', 'create_room', create_room, methods=['POST'])
rooms_v1_bp.add_url_rule('', 'list_rooms', list_rooms, methods=['GET'])
rooms_v1_bp.add_url_rule('/<roomId>', 'get_room_details', get_room_details, methods=['GET'])
rooms_v1_bp.add_url_rule('/<roomId>', 'update_room', update_room, methods=['PATCH'])
rooms_v1_bp.add_url_rule('/<roomId>', 'delete_room', delete_room, methods=['DELETE'])

rooms_v1_bp.add_url_rule('/<roomId>/share', 'share_room', share_room, methods=['POST'])
rooms_v1_bp.add_url_rule('/<roomId>/members', 'get_room_members', get_room_members, methods=['GET'])
rooms_v1_bp.add_url_rule('/<roomId>/permissions', 'update_permissions', update_permissions, methods=['PATCH'])
rooms_v1_bp.add_url_rule('/<roomId>/transfer', 'transfer_ownership', transfer_ownership, methods=['POST'])
rooms_v1_bp.add_url_rule('/<roomId>/leave', 'leave_room', leave_room, methods=['POST'])
rooms_v1_bp.add_url_rule('/<roomId>/invite', 'invite_user', invite_user, methods=['POST'])

rooms_v1_bp.add_url_rule('/<roomId>/strokes', 'get_strokes', get_strokes, methods=['GET'])
rooms_v1_bp.add_url_rule('/<roomId>/strokes', 'post_stroke', post_stroke, methods=['POST'])

rooms_v1_bp.add_url_rule('/<roomId>/undo', 'room_undo', room_undo, methods=['POST'])
rooms_v1_bp.add_url_rule('/<roomId>/redo', 'room_redo', room_redo, methods=['POST'])
rooms_v1_bp.add_url_rule('/<roomId>/clear', 'room_clear', room_clear, methods=['POST'])
rooms_v1_bp.add_url_rule('/<roomId>/undo-redo-status', 'get_undo_redo_status', get_undo_redo_status, methods=['GET'])
rooms_v1_bp.add_url_rule('/<roomId>/reset-stacks', 'reset_my_stacks', reset_my_stacks, methods=['POST'])

rooms_v1_bp.add_url_rule('/suggest', 'suggest_rooms', suggest_rooms, methods=['GET'])

rooms_v1_bp.add_url_rule('/<roomId>/admin/fill-wrapped-key', 'admin_fill_wrapped_key', admin_fill_wrapped_key, methods=['POST'])
