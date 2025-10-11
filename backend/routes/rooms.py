from flask import Blueprint
from services.db import (
    rooms_coll as rooms_collection,
    shares_coll as shares_collection, 
    users_coll as users_collection,
    strokes_coll as strokes_collection,
    invites_coll as invites_collection,
    notifications_coll as notifications_collection,
    redis_client
)
from services.socketio_service import socketio
from middleware.auth import require_auth, require_auth_optional, require_room_access, require_room_owner

from .room_helpers import (
    room_crud,
    room_strokes,
    room_undo_redo,
    room_members,
    invites_notifications
)

rooms_bp = Blueprint("rooms", __name__)

@rooms_bp.route("/rooms", methods=["POST"])
@require_auth
def create_room():
    return room_crud.create_room()

@rooms_bp.route("/rooms", methods=["GET"])
@require_auth
def list_rooms():
    return room_crud.list_rooms()

@rooms_bp.route("/users/suggest", methods=["GET"])
@require_auth
def suggest_users():
    return room_crud.suggest_users()

@rooms_bp.route("/rooms/suggest", methods=["GET"])
@require_auth
def suggest_rooms():
    return room_crud.suggest_rooms()

@rooms_bp.route("/rooms/<roomId>", methods=["GET"])
@require_auth
@require_room_access(room_id_param="roomId")
def get_room(roomId):
    return room_crud.get_room_details(roomId)

@rooms_bp.route("/rooms/<roomId>", methods=["PATCH"])
@require_auth
@require_room_access(room_id_param="roomId")
def update_room(roomId):
    return room_crud.update_room(roomId)

@rooms_bp.route("/rooms/<roomId>/leave", methods=["POST"])
@require_auth
@require_room_access(room_id_param="roomId")
def leave_room(roomId):
    return room_crud.leave_room(roomId)

@rooms_bp.route("/rooms/<roomId>", methods=["DELETE"])
@require_auth
@require_room_owner(room_id_param="roomId")
def delete_room(roomId):
    return room_crud.delete_room(roomId)

@rooms_bp.route("/rooms/<roomId>/admin/fill_wrapped_key", methods=["POST"])
@require_auth
def admin_fill_wrapped_key(roomId):
    return room_crud.admin_fill_wrapped_key(roomId)

@rooms_bp.route("/rooms/<roomId>/strokes", methods=["POST"])
@require_auth
@require_room_access(room_id_param="roomId")
def post_stroke(roomId):
    return room_strokes.post_stroke(roomId)

@rooms_bp.route("/rooms/<roomId>/strokes", methods=["GET"])
@require_auth_optional
def get_strokes(roomId):
    return room_strokes.get_strokes(roomId)

@rooms_bp.route("/rooms/<roomId>/clear", methods=["POST"])
@require_auth
@require_room_access(room_id_param="roomId")
def clear_room(roomId):
    return room_strokes.room_clear(roomId)

@rooms_bp.route("/rooms/<roomId>/undo", methods=["POST"])
@require_auth
@require_room_access(room_id_param="roomId")
def undo(roomId):
    return room_undo_redo.room_undo(roomId)

@rooms_bp.route("/rooms/<roomId>/redo", methods=["POST"])
@require_auth
@require_room_access(room_id_param="roomId")
def redo(roomId):
    return room_undo_redo.room_redo(roomId)

@rooms_bp.route("/rooms/<roomId>/undo_redo_status", methods=["GET"])
@require_auth
@require_room_access(room_id_param="roomId")
def undo_redo_status(roomId):
    return room_undo_redo.get_undo_redo_status(roomId)

@rooms_bp.route("/rooms/<roomId>/reset_my_stacks", methods=["POST"])
@require_auth
@require_room_access(room_id_param="roomId")
def reset_stacks(roomId):
    return room_undo_redo.reset_my_stacks(roomId)

@rooms_bp.route("/rooms/<roomId>/share", methods=["POST"])
@require_auth
@require_room_access(room_id_param="roomId")
def share_room(roomId):
    return room_members.share_room(roomId)

@rooms_bp.route("/rooms/<roomId>/members", methods=["GET"])
@require_auth
@require_room_access(room_id_param="roomId")
def get_members(roomId):
    return room_members.get_room_members(roomId)

@rooms_bp.route("/rooms/<roomId>/permissions", methods=["PATCH"])
@require_auth
@require_room_access(room_id_param="roomId")
def update_permissions(roomId):
    return room_members.update_permissions(roomId)

@rooms_bp.route("/rooms/<roomId>/transfer", methods=["POST"])
@require_auth
@require_room_owner(room_id_param="roomId")
def transfer_ownership(roomId):
    return room_members.transfer_ownership(roomId)

@rooms_bp.route("/rooms/<roomId>/invite", methods=["POST"])
@require_auth
def invite_user(roomId):
    return invites_notifications.invite_user(rooms_collection, shares_collection, invites_collection, users_collection, notifications_collection, socketio)

@rooms_bp.route("/invites", methods=["GET"])
@require_auth
def list_invites():
    return invites_notifications.list_invites(invites_collection, rooms_collection, users_collection)

@rooms_bp.route("/invites/<inviteId>/accept", methods=["POST"])
@require_auth
def accept_invite(inviteId):
    return invites_notifications.accept_invite(invites_collection, shares_collection, rooms_collection, notifications_collection, socketio)

@rooms_bp.route("/invites/<inviteId>/decline", methods=["POST"])
@require_auth
def decline_invite(inviteId):
    return invites_notifications.decline_invite(invites_collection, rooms_collection, notifications_collection, socketio)

@rooms_bp.route("/notifications", methods=["GET"])
@require_auth
def list_notifications():
    return invites_notifications.list_notifications(notifications_collection)

@rooms_bp.route("/notifications/<nid>/mark_read", methods=["POST"])
@require_auth
def mark_notification_read(nid):
    return invites_notifications.mark_notification_read(notifications_collection)

@rooms_bp.route("/notifications/<nid>", methods=["DELETE"])
@require_auth
def delete_notification(nid):
    return invites_notifications.delete_notification(notifications_collection)
    
@rooms_bp.route("/notifications", methods=["DELETE"])
@require_auth
def clear_notifications():
    return invites_notifications.clear_notifications(notifications_collection)

@rooms_bp.route("/users/me/notification_preferences", methods=["GET","PATCH"])
@require_auth
def notification_preferences():
    return invites_notifications.notification_preferences(notifications_collection, users_collection)
