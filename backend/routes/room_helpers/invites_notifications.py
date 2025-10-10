from flask import request, jsonify
from bson import ObjectId
from datetime import datetime, timezone
from . import auth_helpers

def invite_user(rooms_collection, shares_collection, invites_collection, users_collection, notifications_collection, socketio):
    user = auth_helpers.authed_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401

    room_id_str = request.json.get("roomId")
    invitee_email = request.json.get("email")
    permission = request.json.get("permission", "viewer")

    if not room_id_str or not invitee_email:
        return jsonify({"error": "roomId and email required"}), 400
    if permission not in ["viewer", "editor", "admin"]:
        return jsonify({"error": "Invalid permission"}), 400

    try:
        room_id = ObjectId(room_id_str)
    except:
        return jsonify({"error": "Invalid room ID"}), 400

    room = rooms_collection.find_one({"_id": room_id})
    if not room:
        return jsonify({"error": "Room not found"}), 404

    user_id = ObjectId(user["_id"])
    share = shares_collection.find_one({"room_id": room_id, "user_id": user_id})
    if not share or share.get("permission") not in ["admin", "owner"]:
        return jsonify({"error": "Insufficient permissions to invite"}), 403

    invitee = users_collection.find_one({"email": invitee_email})
    if not invitee:
        return jsonify({"error": "User not found"}), 404

    invitee_id = invitee["_id"]
    existing_share = shares_collection.find_one({"room_id": room_id, "user_id": invitee_id})
    if existing_share:
        return jsonify({"error": "User already has access"}), 400

    existing_invite = invites_collection.find_one({
        "room_id": room_id,
        "invitee_id": invitee_id,
        "status": "pending"
    })
    if existing_invite:
        return jsonify({"error": "Invite already pending"}), 400

    invite = {
        "room_id": room_id,
        "inviter_id": user_id,
        "invitee_id": invitee_id,
        "permission": permission,
        "status": "pending",
        "created_at": datetime.now(timezone.utc)
    }
    result = invites_collection.insert_one(invite)

    notif = {
        "user_id": invitee_id,
        "type": "room_invite",
        "message": f"{user['username']} invited you to room '{room['name']}'",
        "read": False,
        "created_at": datetime.now(timezone.utc),
        "related_id": str(result.inserted_id)
    }
    notifications_collection.insert_one(notif)

    from services.socketio_service import push_to_user
    push_to_user(socketio, str(invitee_id), "notification", notif)

    return jsonify({"message": "Invite sent", "inviteId": str(result.inserted_id)}), 200

def list_invites(invites_collection, rooms_collection, users_collection):
    user = auth_helpers.authed_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401

    user_id = ObjectId(user["_id"])
    invites = list(invites_collection.find({"invitee_id": user_id, "status": "pending"}))
    
    for inv in invites:
        inv["_id"] = str(inv["_id"])
        inv["room_id"] = str(inv["room_id"])
        inv["inviter_id"] = str(inv["inviter_id"])
        inv["invitee_id"] = str(inv["invitee_id"])
        room = rooms_collection.find_one({"_id": ObjectId(inv["room_id"])})
        inv["room_name"] = room["name"] if room else "Unknown"
        inviter = users_collection.find_one({"_id": ObjectId(inv["inviter_id"])})
        inv["inviter_username"] = inviter["username"] if inviter else "Unknown"

    return jsonify(invites), 200

def accept_invite(invites_collection, shares_collection, rooms_collection, notifications_collection, socketio):
    user = auth_helpers.authed_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401

    invite_id_str = request.json.get("inviteId")
    if not invite_id_str:
        return jsonify({"error": "inviteId required"}), 400

    try:
        invite_id = ObjectId(invite_id_str)
    except:
        return jsonify({"error": "Invalid invite ID"}), 400

    invite = invites_collection.find_one({"_id": invite_id, "invitee_id": ObjectId(user["_id"])})
    if not invite:
        return jsonify({"error": "Invite not found"}), 404
    if invite["status"] != "pending":
        return jsonify({"error": "Invite already processed"}), 400

    share = {
        "room_id": invite["room_id"],
        "user_id": invite["invitee_id"],
        "permission": invite["permission"],
        "created_at": datetime.now(timezone.utc)
    }
    shares_collection.insert_one(share)

    invites_collection.update_one({"_id": invite_id}, {"$set": {"status": "accepted"}})

    room = rooms_collection.find_one({"_id": invite["room_id"]})
    notif = {
        "user_id": invite["inviter_id"],
        "type": "invite_accepted",
        "message": f"{user['username']} accepted your invite to room '{room['name']}'",
        "read": False,
        "created_at": datetime.now(timezone.utc)
    }
    notifications_collection.insert_one(notif)

    from services.socketio_service import push_to_user
    push_to_user(socketio, str(invite["inviter_id"]), "notification", notif)

    return jsonify({"message": "Invite accepted"}), 200

def decline_invite(invites_collection, rooms_collection, notifications_collection, socketio):
    user = auth_helpers.authed_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401

    invite_id_str = request.json.get("inviteId")
    if not invite_id_str:
        return jsonify({"error": "inviteId required"}), 400

    try:
        invite_id = ObjectId(invite_id_str)
    except:
        return jsonify({"error": "Invalid invite ID"}), 400

    invite = invites_collection.find_one({"_id": invite_id, "invitee_id": ObjectId(user["_id"])})
    if not invite:
        return jsonify({"error": "Invite not found"}), 404
    if invite["status"] != "pending":
        return jsonify({"error": "Invite already processed"}), 400

    invites_collection.update_one({"_id": invite_id}, {"$set": {"status": "declined"}})

    room = rooms_collection.find_one({"_id": invite["room_id"]})
    notif = {
        "user_id": invite["inviter_id"],
        "type": "invite_declined",
        "message": f"{user['username']} declined your invite to room '{room['name']}'",
        "read": False,
        "created_at": datetime.now(timezone.utc)
    }
    notifications_collection.insert_one(notif)

    from services.socketio_service import push_to_user
    push_to_user(socketio, str(invite["inviter_id"]), "notification", notif)

    return jsonify({"message": "Invite declined"}), 200

def list_notifications(notifications_collection):
    user = auth_helpers.authed_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401

    user_id = ObjectId(user["_id"])
    notifs = list(notifications_collection.find({"user_id": user_id}).sort("created_at", -1))
    
    for n in notifs:
        n["_id"] = str(n["_id"])
        n["user_id"] = str(n["user_id"])

    return jsonify(notifs), 200

def mark_notification_read(notifications_collection):
    user = auth_helpers.authed_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401

    notif_id_str = request.json.get("notificationId")
    if not notif_id_str:
        return jsonify({"error": "notificationId required"}), 400

    try:
        notif_id = ObjectId(notif_id_str)
    except:
        return jsonify({"error": "Invalid notification ID"}), 400

    result = notifications_collection.update_one(
        {"_id": notif_id, "user_id": ObjectId(user["_id"])},
        {"$set": {"read": True}}
    )
    if result.matched_count == 0:
        return jsonify({"error": "Notification not found"}), 404

    return jsonify({"message": "Notification marked as read"}), 200

def delete_notification(notifications_collection):
    user = auth_helpers.authed_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401

    notif_id_str = request.json.get("notificationId")
    if not notif_id_str:
        return jsonify({"error": "notificationId required"}), 400

    try:
        notif_id = ObjectId(notif_id_str)
    except:
        return jsonify({"error": "Invalid notification ID"}), 400

    result = notifications_collection.delete_one({"_id": notif_id, "user_id": ObjectId(user["_id"])})
    if result.deleted_count == 0:
        return jsonify({"error": "Notification not found"}), 404

    return jsonify({"message": "Notification deleted"}), 200

def clear_notifications(notifications_collection):
    user = auth_helpers.authed_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401

    notifications_collection.delete_many({"user_id": ObjectId(user["_id"])})
    return jsonify({"message": "All notifications cleared"}), 200

def notification_preferences(notifications_collection):
    user = auth_helpers.authed_user()
    if not user:
        return jsonify({"error": "Authentication required"}), 401

    if request.method == "GET":
        prefs = notifications_collection.find_one({"user_id": ObjectId(user["_id"]), "type": "preferences"})
        if not prefs:
            prefs = {
                "room_invite": True,
                "invite_accepted": True,
                "invite_declined": True,
                "member_joined": True,
                "member_left": True,
                "permission_changed": True
            }
        else:
            prefs.pop("_id", None)
            prefs.pop("user_id", None)
            prefs.pop("type", None)
        return jsonify(prefs), 200
    else:
        new_prefs = request.json
        if not auth_helpers.notification_allowed_for(user, "preferences", notifications_collection):
            return jsonify({"error": "Notification preferences disabled"}), 403

        notifications_collection.update_one(
            {"user_id": ObjectId(user["_id"]), "type": "preferences"},
            {"$set": new_prefs},
            upsert=True
        )
        return jsonify({"message": "Preferences updated"}), 200
