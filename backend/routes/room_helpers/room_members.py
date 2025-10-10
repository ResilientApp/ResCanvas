from flask import jsonify, g, request
from bson import ObjectId
from datetime import datetime
import logging
import re
from services.db import rooms_coll, shares_coll, users_coll, notifications_coll
from services.socketio_service import push_to_user
from middleware.auth import require_auth, require_room_access, require_room_owner, validate_request_data
from middleware.validators import (
    validate_member_role,
    validate_share_users_array,
    validate_optional_string,
    validate_member_id,
    validate_username
)

logger = logging.getLogger(__name__)

@require_auth
@require_room_access(room_id_param="roomId")
@validate_request_data({
    "usernames": {"validator": validate_optional_string(), "required": False},
    "users": {"validator": validate_share_users_array, "required": False},
    "role": {"validator": validate_member_role, "required": False}
})
def share_room(roomId):
    """
    Share/invite users to a room. Body: {"usernames": ["alice"], "role":"editor"}
    or {"users": [{"username":"alice","role":"editor"}]}
    For private/secure rooms, create pending invites stored in invites_coll.
    For public rooms, add to shares_coll immediately.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room access required via @require_room_access
    - Input validation via @validate_request_data
    - Only owner/admin can share (checked below)
    """
    from .auth_helpers import notification_allowed_for
    from services.db import invites_coll
    
    user = g.current_user
    claims = g.token_claims
    room = g.current_room
    
    inviter_share = shares_coll.find_one({"roomId": str(room["_id"]), "userId": claims["sub"]})
    if not inviter_share or inviter_share.get("role") not in ("owner","admin"):
        return jsonify({"status":"error","message":"Forbidden: Only room owner or admin can share"}), 403

    data = request.get_json(force=True) or {}
    usernames = data.get("usernames") or []
    users_field = data.get("users")
    role = (data.get("role") or "editor").lower()
    normalized = []
    if users_field and isinstance(users_field, list) and len(users_field) > 0 and isinstance(users_field[0], dict):
        for u in users_field:
            un = (u.get("username") or "").strip()
            ur = (u.get("role") or role or "editor").lower()
            if un:
                normalized.append({"username": un, "role": ur})
    else:
        for un in (usernames or []):
            un = (un or "").strip()
            if un:
                normalized.append({"username": un, "role": role})
    allowed_roles = ("owner","admin","editor","viewer")
    if role not in allowed_roles:
        return jsonify({"status":"error","message":"Invalid role"}), 400
    if role == "owner":
        return jsonify({"status":"error","message":"Cannot invite as owner; use transfer endpoint"}), 400

    results = {"invited": [], "updated": [], "errors": []}
    for entry in normalized:
        uname = (entry.get("username") or "").strip()
        user_role = (entry.get("role") or "editor").lower()
        if not uname:
            continue
        user = users_coll.find_one({"username": uname})
        if not user:
            try:
                cursor = users_coll.find({"username": {"$regex": f"^{re.escape(uname)}", "$options": "i"}}, {"username": 1}).limit(10)
                suggs = [u.get("username") for u in cursor]
            except Exception:
                suggs = []
            results["errors"].append({"username": uname, "error": "user not found", "suggestions": suggs})
            continue
        uid = str(user["_id"])
        existing = shares_coll.find_one({"roomId": str(room["_id"]), "userId": uid})
        if existing:
            results["errors"].append({"username": uname, "error": "already shared with this user"})
            continue

        if room.get("type") in ("private", "secure"):
            invite = {
                "roomId": str(room["_id"]),
                "roomName": room.get("name"),
                "invitedUserId": uid,
                "invitedUsername": user["username"],
                "inviterId": claims["sub"],
                "inviterName": claims["username"],
                "role": user_role,
                "status": "pending",
                "createdAt": datetime.utcnow()
            }
            invites_coll.insert_one(invite)
            try:
                if notification_allowed_for(uid, 'invite', users_coll):
                    notifications_coll.insert_one({
                        "userId": uid,
                        "type": "invite",
                        "message": f"You were invited to join room '{room.get('name')}' as '{user_role}' by {claims['username']}",
                        "link": f"/rooms/{str(room['_id'])}",
                        "read": False,
                        "createdAt": datetime.utcnow()
                    })
                    try:
                        push_to_user(uid, 'notification', {
                            'type': 'invite',
                            'message': f"You were invited to join room '{room.get('name')}' as '{user_role}' by {claims['username']}",
                            'link': f"/rooms/{str(room['_id'])}",
                            'createdAt': datetime.utcnow()
                        })
                    except Exception:
                        pass
            except Exception:
                try:
                    notifications_coll.insert_one({
                        "userId": uid,
                        "type": "invite",
                        "message": f"You were invited to join room '{room.get('name')}' as '{user_role}' by {claims['username']}",
                        "link": f"/rooms/{str(room['_id'])}",
                        "read": False,
                        "createdAt": datetime.utcnow()
                    })
                except Exception:
                    pass
            results["invited"].append({"username": uname, "role": role})
        else:
            shares_coll.update_one(
                {"roomId": str(room["_id"]), "userId": uid},
                {"$set": {"roomId": str(room["_id"]), "userId": uid, "username": user["username"], "role": role}},
                upsert=True
            )
            try:
                doc = shares_coll.find_one({"roomId": str(room["_id"]), "userId": uid})
                logger.info("share_room: added share for uid=%s room=%s doc=%s", uid, str(room["_id"]), doc)
            except Exception:
                pass
            notifications_coll.insert_one({
                "userId": uid,
                "type": "share_added",
                "message": f"You were added to public room '{room.get('name')}' as '{user_role}' by {claims['username']}",
                "link": f"/rooms/{str(room['_id'])}",
                "read": False,
                "createdAt": datetime.utcnow()
            })
            try:
                if notification_allowed_for(uid, 'share_added', users_coll):
                    push_to_user(uid, 'notification', {
                        'type': 'share_added',
                        'message': f"You were added to public room '{room.get('name')}' as '{user_role}' by {claims['username']}",
                        'link': f"/rooms/{str(room['_id'])}",
                        'createdAt': datetime.utcnow()
                    })
            except Exception:
                pass
            results["updated"].append({"username": uname, "role": user_role, "note": "added to public room"})
    return jsonify({"status":"ok","results": results})

@require_auth
@require_room_access(room_id_param="roomId")
def get_room_members(roomId):
    """
    Return a list of members (usernames) for the given roomId.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room access required via @require_room_access
    """
    user = g.current_user
    claims = g.token_claims
    room = g.current_room
    try:
        cursor = shares_coll.find({"roomId": str(room["_id"])}, {"username": 1, "userId": 1, "role": 1})
        members = []
        for m in cursor:
            if not m: continue
            members.append({
                "username": m.get("username"),
                "userId": m.get("userId"),
                "role": m.get("role") or "editor"
            })
    except Exception:
        members = []
    return jsonify({"status":"ok","members": members})

@require_auth
@require_room_owner(room_id_param="roomId")
@validate_request_data({
    "userId": {"validator": validate_member_id, "required": True},
    "role": {"validator": validate_optional_string, "required": False}
})
def update_permissions(roomId):
    """
    Owner can change a member's role. Body: {"userId":"<id>", "role":"editor"}.
    To remove a member, set "role": null.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room ownership required via @require_room_owner
    - Input validation via @validate_request_data
    """
    from .auth_helpers import notification_allowed_for
    
    user = g.current_user
    claims = g.token_claims
    room = g.current_room
    
    caller_role = None
    try:
        if str(room.get("ownerId")) == claims["sub"]:
            caller_role = "owner"
        else:
            caller_role = (shares_coll.find_one({"roomId": str(room["_id"]), "$or": [{"userId": claims["sub"]}, {"username": claims["sub"]}]}) or {}).get("role")
    except Exception:
        caller_role = None
    if caller_role not in ("owner", "editor", "admin"):
        return jsonify({"status":"error","message":"Forbidden"}), 403
    data = request.get_json() or {}
    target_user_id = data.get("userId")
    if not target_user_id:
        return jsonify({"status":"error","message":"Missing userId"}), 400
    if "role" not in data or data.get("role") is None:
        if target_user_id == room.get("ownerId"):
            return jsonify({"status":"error","message":"Cannot remove owner"}), 400
        shares_coll.delete_one({"roomId": str(room["_id"]), "userId": target_user_id})
        try:
            if notification_allowed_for(target_user_id, 'removed', users_coll):
                notifications_coll.insert_one({
                    "userId": target_user_id,
                    "type": "removed",
                    "message": f"You were removed from room '{room.get('name')}'",
                    "link": f"/rooms/{roomId}",
                    "read": False,
                    "createdAt": datetime.utcnow()
                })
                try:
                    push_to_user(target_user_id, 'notification', {
                        'type': 'removed',
                        'message': f"You were removed from room '{room.get('name')}'",
                        'link': f"/rooms/{roomId}",
                        'createdAt': datetime.utcnow()
                    })
                except Exception:
                    pass
        except Exception:
            try:
                notifications_coll.insert_one({
                    "userId": target_user_id,
                    "type": "removed",
                    "message": f"You were removed from room '{room.get('name')}'",
                    "link": f"/rooms/{roomId}",
                    "read": False,
                    "createdAt": datetime.utcnow()
                })
            except Exception:
                pass
        return jsonify({"status":"ok","removed": target_user_id})
    role = (data.get("role") or "").lower()
    if role not in ("admin","editor","viewer"):
        return jsonify({"status":"error","message":"Invalid role"}), 400
    if target_user_id == room.get("ownerId"):
        return jsonify({"status":"error","message":"Cannot change owner role"}), 400
    if role == "admin" and caller_role != "owner":
        return jsonify({"status":"error","message":"Only owner may assign admin role"}), 403
    shares_coll.update_one({"roomId": str(room["_id"]), "userId": target_user_id}, {"$set": {"role": role}}, upsert=False)
    try:
        if notification_allowed_for(target_user_id, 'role_changed', users_coll):
            notifications_coll.insert_one({
                "userId": target_user_id,
                "type": "role_changed",
                "message": f"Your role in room '{room.get('name')}' was changed to '{role}'",
                "link": f"/rooms/{roomId}",
                "read": False,
                "createdAt": datetime.utcnow()
            })
    except Exception:
        pass
    if role == 'owner':
        try:
            if notification_allowed_for(target_user_id, 'ownership_transfer', users_coll):
                push_to_user(target_user_id, 'notification', {
                    'type': 'ownership_transfer',
                    'message': f"You are now the owner of room '{room.get('name')}'",
                    'link': f"/rooms/{roomId}",
                    'createdAt': datetime.utcnow()
                })
        except Exception:
            pass
    return jsonify({"status":"ok","userId": target_user_id, "role": role})

@require_auth
@require_room_owner(room_id_param="roomId")
@validate_request_data({
    "username": {"validator": validate_username, "required": True}
})
def transfer_ownership(roomId):
    """
    Transfer room ownership to another member.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room ownership required via @require_room_owner
    - Input validation via @validate_request_data
    - Target must be an existing member
    """
    user = g.current_user
    claims = g.token_claims
    room = g.current_room
    
    data = request.get_json() or {}
    target_username = data.get("username")
    target_user = users_coll.find_one({"username": target_username})
    if not target_user:
        return jsonify({"status":"error","message":"Target user not found"}), 404
    member = shares_coll.find_one({"roomId": str(room["_id"]), "userId": str(target_user["_id"])})
    if not member:
        return jsonify({"status":"error","message":"Target user is not a member of the room"}), 400
    rooms_coll.update_one({"_id": ObjectId(roomId)}, {"$set": {"ownerId": str(target_user["_id"]), "ownerName": target_user["username"], "updatedAt": datetime.utcnow()}})
    shares_coll.update_one({"roomId": str(room["_id"]), "userId": str(target_user["_id"])}, {"$set": {"role": "owner"}})
    shares_coll.update_one({"roomId": str(room["_id"]), "userId": claims["sub"]}, {"$set": {"role": "editor"}})
    notifications_coll.insert_one({
        "userId": str(target_user["_id"]),
        "type": "ownership_transfer",
        "message": f"You are now the owner of room '{room.get('name')}'",
        "link": f"/rooms/{roomId}",
        "read": False,
        "createdAt": datetime.utcnow()
    })
    notifications_coll.insert_one({
        "userId": claims["sub"],
        "type": "ownership_transfer",
        "message": f"You transferred ownership of room '{room.get('name')}' to {target_user['username']}",
        "link": f"/rooms/{roomId}",
        "read": False,
        "createdAt": datetime.utcnow()
    })
    return jsonify({"status":"ok"})
