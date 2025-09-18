# routes/rooms.py
from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
import json, time, traceback, logging
from services.db import rooms_coll, shares_coll, users_coll, strokes_coll, redis_client, invites_coll, notifications_coll
from services.socketio import socketio
from services.crypto_service import wrap_room_key, unwrap_room_key, encrypt_for_room, decrypt_for_room
from services.graphql_service import commit_transaction_via_graphql
from config import SIGNER_PUBLIC_KEY, SIGNER_PRIVATE_KEY, RECIPIENT_PUBLIC_KEY
import jwt
from config import JWT_SECRET

logger = logging.getLogger(__name__)
rooms_bp = Blueprint("rooms", __name__)

def _authed_user():
    # Prefer JWT in Authorization header (production / correct flow)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        token = auth.split(" ", 1)[1]
        try:
            return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        except Exception:
            # invalid token -> treat as not authed (fallthrough to fallback)
            pass

    # Development/dev-convenience fallback:
    # Accept ?user=username|timestamp or JSON body {"user": "username|ts"} when no valid JWT present.
    # This is intentionally permissive to support the current frontend flows that pass a
    # username string instead of a token. **Do not** rely on this for production.
    try:
        # query param 'user' (this is what your browser logs showed)
        u = request.args.get("user") or None
        if not u:
            body = request.get_json(silent=True) or {}
            u = body.get("user")
        if u:
            # user strings in the frontend look like "appleseed|1755717958030"
            username = u.split("|", 1)[0] if "|" in u else u
            return {"sub": username, "username": username}
    except Exception:
        pass

    # No valid auth
    return None

def _ensure_member(user_id:str, room):
    if room["ownerId"] == user_id: return True
    return shares_coll.find_one({"roomId": str(room["_id"]), "userId": user_id}) is not None

@rooms_bp.route("/rooms", methods=["POST"])
def create_room():
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip() or "Untitled"
    rtype = (data.get("type") or "public").lower()
    if rtype not in ("public","private","secure"):
        return jsonify({"status":"error","message":"Invalid type"}), 400

    # Generate per-room key and wrap with master for storage (for private/secure)
    wrapped = None
    if rtype in ("private","secure"):
        import os
        raw = os.urandom(32)
        wrapped = wrap_room_key(raw)

    # optional fields
    description = (data.get("description") or "").strip() or None
    retention_days = data.get("retentionDays")
    try:
        retention_days = int(retention_days) if retention_days is not None else None
    except Exception:
        retention_days = None

    room = {
        "name": name,
        "type": rtype,
        "description": description,
        "archived": False,
        "retentionDays": retention_days,
        "ownerId": claims["sub"],
        "ownerName": claims["username"],
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
        "wrappedKey": wrapped  # None for public
    }
    rooms_coll.insert_one(room)
    # owner membership record (present implicitly for quick queries)
    shares_coll.update_one(
        {"roomId": str(room["_id"]), "userId": claims["sub"]},
        {"$set": {"roomId": str(room["_id"]), "userId": claims["sub"], "username": claims["username"], "role":"owner"}},
        upsert=True
    )
    return jsonify({"status":"ok","room":{"id":str(room["_id"]), "name":name, "type":rtype}}), 201


@rooms_bp.route("/rooms", methods=["GET"])
def list_rooms():
    """
    List rooms visible to the current user.
    Query param:
      - archived=1 to include archived rooms; default is to exclude archived rooms.
    """
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401

    include_archived = request.args.get("archived", "0") in ("1", "true", "True", "yes")

    # owned rooms
    if include_archived:
        owned = list(rooms_coll.find({"ownerId": claims["sub"]}))
        shared = list(rooms_coll.find({"_id": {"$in": [ObjectId(r["roomId"]) for r in shares_coll.find({'userId': claims['sub']})]}}))
    else:
        owned = list(rooms_coll.find({"ownerId": claims["sub"], "archived": {"$ne": True}}))
        # find roomIds shared with user and not archived
        shared_room_ids = [r["roomId"] for r in shares_coll.find({"userId": claims["sub"]})]
        shared = []
        if shared_room_ids:
            # roomId in shares is stored as string, convert to ObjectId
            oids = []
            for rid in shared_room_ids:
                try:
                    oids.append(ObjectId(rid))
                except Exception:
                    pass
            if oids:
                shared = list(rooms_coll.find({"_id": {"$in": oids}, "archived": {"$ne": True}}))
    # format
    def _fmt_single(r):
        return {"id": str(r["_id"]), "name": r.get("name"), "type": r.get("type"), "ownerName": r.get("ownerName"), "description": r.get("description"), "archived": bool(r.get("archived", False)), "retentionDays": r.get("retentionDays"), "createdAt": r.get("createdAt"), "updatedAt": r.get("updatedAt")}
    ids = set()
    items = []
    for r in owned + shared:
        rid = str(r["_id"])
        if rid in ids:
            continue
        ids.add(rid)
        items.append(_fmt_single(r))
    return jsonify({"status":"ok","rooms": items})
@rooms_bp.route("/rooms/<roomId>/share", methods=["POST"])


def share_room(roomId):
    """
    Share/invite users to a room. Body: {"usernames": ["alice"], "role":"editor"}
    For private/secure rooms, create pending invites stored in invites_coll.
    For public rooms, add to shares_coll immediately.
    """
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room:
        return jsonify({"status":"error","message":"Room not found"}), 404

    # only owner or admin can share
    inviter_share = shares_coll.find_one({"roomId": str(room["_id"]), "userId": claims["sub"]})
    if not inviter_share or inviter_share.get("role") not in ("owner","admin"):
        return jsonify({"status":"error","message":"Forbidden"}), 403

    data = request.get_json(force=True) or {}
    usernames = data.get("usernames") or []
    role = (data.get("role") or "editor").lower()
    allowed_roles = ("owner","admin","editor","viewer")
    if role not in allowed_roles:
        return jsonify({"status":"error","message":"Invalid role"}), 400
    if role == "owner":
        return jsonify({"status":"error","message":"Cannot invite as owner; use transfer endpoint"}), 400

    results = {"invited": [], "updated": [], "errors": []}
    for uname in usernames:
        uname = (uname or "").strip()
        if not uname:
            continue
        user = users_coll.find_one({"username": uname})
        if not user:
            results["errors"].append({"username": uname, "error": "user not found"})
            continue
        uid = str(user["_id"])
        # check existing share
        existing = shares_coll.find_one({"roomId": str(room["_id"]), "userId": uid})
        if existing:
            # update role if different
            if existing.get("role") != role:
                shares_coll.update_one({"roomId": str(room["_id"]), "userId": uid}, {"$set": {"role": role}})
                notifications_coll.insert_one({
                    "userId": uid,
                    "type": "role_changed",
                    "message": f"Your role in room '{room.get('name')}' was changed to '{role}'",
                    "link": f"/rooms/{str(room['_id'])}",
                    "read": False,
                    "createdAt": datetime.utcnow()
                })
                results["updated"].append({"username": uname, "role": role})
            else:
                results["updated"].append({"username": uname, "role": role, "note": "unchanged"})
            continue

        # For private/secure rooms create pending invite; for public, add share immediately
        if room.get("type") in ("private", "secure"):
            invite = {
                "roomId": str(room["_id"]),
                "roomName": room.get("name"),
                "invitedUserId": uid,
                "invitedUsername": user["username"],
                "inviterId": claims["sub"],
                "inviterName": claims["username"],
                "role": role,
                "status": "pending",
                "createdAt": datetime.utcnow()
            }
            invites_coll.insert_one(invite)
            
    try:
        socketio.emit('notification', {'type':'invite','roomId': invite.get('roomId'), 'roomName': invite.get('roomName'), 'message': f\"You were invited to join room '{invite.get('roomName')}' as '{invite.get('role')}' by {invite.get('inviterName')}\", 'link': f\"/rooms/{invite.get('roomId')}\"}, room=f\"user:{invite.get('invitedUserId')}\")
    except Exception:
        pass
notifications_coll.insert_one({
                "userId": uid,
                "type": "invite",
                "message": f"You were invited to join room '{room.get('name')}' as '{role}' by {claims['username']}",
                "link": f"/rooms/{str(room['_id'])}",
                "read": False,
                "createdAt": datetime.utcnow()
            })
            results["invited"].append({"username": uname, "role": role})
        else:
            # public room -> add share immediately
            shares_coll.update_one(
                {"roomId": str(room["_id"]), "userId": uid},
                {"$set": {"roomId": str(room["_id"]), "userId": uid, "username": user["username"], "role": role}},
                upsert=True
            )
            notifications_coll.insert_one({
                "userId": uid,
                "type": "share_added",
                "message": f"You were added to public room '{room.get('name')}' as '{role}' by {claims['username']}",
                "link": f"/rooms/{str(room['_id'])}",
                "read": False,
                "createdAt": datetime.utcnow()
            })
            results["updated"].append({"username": uname, "role": role, "note": "added to public room"})
    return jsonify({"status":"ok","results": results})
@rooms_bp.route("/rooms/<roomId>/strokes", methods=["POST"])
def post_stroke(roomId):
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room: return jsonify({"status":"error","message":"Room not found"}), 404
    if not _ensure_member(claims["sub"], room): return jsonify({"status":"error","message":"Forbidden"}), 403

    payload = request.get_json(force=True)  # {stroke:{...}, signature?, signerPubKey?}
    stroke = payload["stroke"]
    stroke["roomId"] = roomId
    stroke["user"]   = claims["username"]
    stroke["ts"]     = int(time.time() * 1000)

    # Secure rooms must include wallet signature
    if room["type"] == "secure":
        sig = payload.get("signature"); spk = payload.get("signerPubKey")
        if not (sig and spk):
            return jsonify({"status":"error","message":"Signature required for secure room"}), 400
        # Verify signature (ed25519)
        try:
            import nacl.signing, nacl.encoding
            vk = nacl.signing.VerifyKey(spk, encoder=nacl.encoding.HexEncoder)
            # Canonical message = JSON with stable key order
            msg = json.dumps({
                "roomId": roomId, "user": stroke["user"], "color": stroke["color"],
                "lineWidth": stroke["lineWidth"], "pathData": stroke["pathData"], "timestamp": stroke.get("timestamp", stroke["ts"])
            }, separators=(',', ':'), sort_keys=True).encode()
            vk.verify(msg, bytes.fromhex(sig))
        except Exception:
            return jsonify({"status":"error","message":"Bad signature"}), 400
        stroke["walletSignature"] = sig
        stroke["walletPubKey"]    = spk

    # Encrypt content for private & secure rooms
    asset_data = {}
    if room["type"] in ("private","secure"):
        rk = unwrap_room_key(room["wrappedKey"])
        enc = encrypt_for_room(rk, json.dumps(stroke).encode())
        asset_data = {"roomId": roomId, "type": room["type"], "encrypted": enc}
        # keep a small Mongo cache for quick reloads
        strokes_coll.insert_one({"roomId": roomId, "ts": stroke["ts"], "blob": enc})
    try:
        # broadcast to room channel
        try:
            payload = locals().get('line_doc') or locals().get('stroke') or locals().get('_doc') or None
        except Exception:
            payload = None
        if payload is None:
            payload = {}
        socketio.emit('stroke', payload, room=f\"room:{roomId}\")
    except Exception:
        pass

    else:
        asset_data = {"roomId": roomId, "type": "public", "stroke": stroke}
        strokes_coll.insert_one({"roomId": roomId, "ts": stroke["ts"], "stroke": stroke})

    # Commit to ResilientDB via GraphQL using server operator key
    prep = {
        "operation": "CREATE",
        "amount": 1,
        "signerPublicKey": SIGNER_PUBLIC_KEY,
        "signerPrivateKey": SIGNER_PRIVATE_KEY,
        "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
        "asset": { "data": asset_data }
    }
    commit_transaction_via_graphql(prep)

    # Room-scoped undo stack in Redis
    key_base = f"{roomId}:{claims['sub']}"
    redis_client.lpush(f"{key_base}:undo", json.dumps(stroke))
    redis_client.delete(f"{key_base}:redo")

    return jsonify({"status":"ok"})

@rooms_bp.route("/rooms/<roomId>/strokes", methods=["GET"])
def get_strokes(roomId):
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room: return jsonify({"status":"error","message":"Room not found"}), 404
    if not _ensure_member(claims["sub"], room): return jsonify({"status":"error","message":"Forbidden"}), 403

    items = list(strokes_coll.find({"roomId": roomId}).sort("ts", 1))
    if room["type"] in ("private","secure"):
        rk = unwrap_room_key(room["wrappedKey"])
        out=[]
        for it in items:
            blob = it["blob"]
            raw = decrypt_for_room(rk, blob)
            out.append(json.loads(raw.decode()))
        return jsonify({"status":"ok","strokes": out})
    else:
        return jsonify({"status":"ok","strokes": [it["stroke"] for it in items]})

@rooms_bp.route("/rooms/<roomId>/undo", methods=["POST"])
def room_undo(roomId):
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    key_base = f"{roomId}:{claims['sub']}"
    last = redis_client.lpop(f"{key_base}:undo")
    if not last: return jsonify({"status":"noop"})
    redis_client.lpush(f"{key_base}:redo", last)
    return jsonify({"status":"ok"})

@rooms_bp.route("/rooms/<roomId>/redo", methods=["POST"])
def room_redo(roomId):
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    key_base = f"{roomId}:{claims['sub']}"
    last = redis_client.lpop(f"{key_base}:redo")
    if not last: return jsonify({"status":"noop"})
    # In a full implementation we'd re-commit the stroke; you already have redo logic elsewhere.
    redis_client.lpush(f"{key_base}:undo", last)
    return jsonify({"status":"ok"})

@rooms_bp.route("/rooms/<roomId>/clear", methods=["POST"])
def room_clear(roomId):
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room: return jsonify({"status":"error","message":"Room not found"}), 404
    if not _ensure_member(claims["sub"], room): return jsonify({"status":"error","message":"Forbidden"}), 403
    strokes_coll.delete_many({"roomId": roomId})
    # (Optional) Commit a “clear” event to chain if desired
    return jsonify({"status":"ok"})



@rooms_bp.route("/rooms/<roomId>", methods=["GET"])
def get_room_details(roomId):
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room:
        return jsonify({"status":"error","message":"Room not found"}), 404
    # ensure member or public
    if room.get("type") in ("private","secure"):
        if not _ensure_member(claims["sub"], room):
            return jsonify({"status":"error","message":"Forbidden"}), 403
    # return details
    return jsonify({"status":"ok","room":{
        "id": str(room["_id"]),
        "name": room.get("name"),
        "type": room.get("type"),
        "description": room.get("description"),
        "ownerId": room.get("ownerId"),
        "ownerName": room.get("ownerName"),
        "archived": bool(room.get("archived", False)),
        "retentionDays": room.get("retentionDays"),
        "createdAt": room.get("createdAt"),
        "updatedAt": room.get("updatedAt")
    }})


@rooms_bp.route("/rooms/<roomId>/permissions", methods=["PATCH"])
def update_permissions(roomId):
    """
    Owner can change a member's role. Body: {"userId":"<id>", "role":"editor"}.
    To remove a member, set "role": null.
    """
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room:
        return jsonify({"status":"error","message":"Room not found"}), 404
    # only owner may change permissions
    if str(room.get("ownerId")) != claims["sub"]:
        return jsonify({"status":"error","message":"Forbidden"}), 403
    data = request.get_json() or {}
    target_user_id = data.get("userId")
    if not target_user_id:
        return jsonify({"status":"error","message":"Missing userId"}), 400
    # if role not provided or null -> remove member
    if "role" not in data or data.get("role") is None:
        shares_coll.delete_one({"roomId": str(room["_id"]), "userId": target_user_id})
        notifications_coll.insert_one({
            "userId": target_user_id,
            "type": "removed",
            "message": f"You were removed from room '{room.get('name')}'",
            "link": f"/rooms/{roomId}",
            "read": False,
            "createdAt": datetime.utcnow()
        })
        return jsonify({"status":"ok","removed": target_user_id})
    role = (data.get("role") or "").lower()
    if role not in ("admin","editor","viewer"):
        return jsonify({"status":"error","message":"Invalid role"}), 400
    shares_coll.update_one({"roomId": str(room["_id"]), "userId": target_user_id}, {"$set": {"role": role}}, upsert=False)
    notifications_coll.insert_one({
        "userId": target_user_id,
        "type": "role_changed",
        "message": f"Your role in room '{room.get('name')}' was changed to '{role}'",
        "link": f"/rooms/{roomId}",
        "read": False,
        "createdAt": datetime.utcnow()
    })
    return jsonify({"status":"ok","userId": target_user_id, "role": role})
# -----------------------------
# Invitation endpoints
# -----------------------------

@rooms_bp.route("/rooms/<roomId>", methods=["PATCH"])
def update_room(roomId):
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room:
        return jsonify({"status":"error","message":"Room not found"}), 404
    # only owner may update
    if str(room.get("ownerId")) != claims["sub"]:
        return jsonify({"status":"error","message":"Forbidden"}), 403
    data = request.get_json() or {}
    updates = {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"status":"error","message":"Invalid name"}), 400
        updates["name"] = name
    if "description" in data:
        updates["description"] = (data.get("description") or "").strip() or None
    if "retentionDays" in data:
        rd = data.get("retentionDays")
        try:
            updates["retentionDays"] = int(rd) if rd is not None else None
        except Exception:
            return jsonify({"status":"error","message":"Invalid retentionDays"}), 400
    if "archived" in data:
        updates["archived"] = bool(data.get("archived"))
    if not updates:
        return jsonify({"status":"error","message":"No valid fields to update"}), 400
    updates["updatedAt"] = datetime.utcnow()
    rooms_coll.update_one({"_id": ObjectId(roomId)}, {"$set": updates})
    return jsonify({"status":"ok","updated": updates})

@rooms_bp.route("/rooms/<roomId>/transfer", methods=["POST"])
def transfer_ownership(roomId):
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    data = request.get_json() or {}
    target_username = (data.get("username") or "").strip()
    if not target_username:
        return jsonify({"status":"error","message":"Missing target username"}), 400
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room:
        return jsonify({"status":"error","message":"Room not found"}), 404
    # only current owner may transfer
    if str(room.get("ownerId")) != claims["sub"]:
        return jsonify({"status":"error","message":"Forbidden"}), 403
    target_user = users_coll.find_one({"username": target_username})
    if not target_user:
        return jsonify({"status":"error","message":"Target user not found"}), 404
    # ensure target is a member
    member = shares_coll.find_one({"roomId": str(room["_id"]), "userId": str(target_user["_id"])})
    if not member:
        return jsonify({"status":"error","message":"Target user is not a member of the room"}), 400
    # perform transfer: update room ownerId/ownerName
    rooms_coll.update_one({"_id": ObjectId(roomId)}, {"$set": {"ownerId": str(target_user["_id"]), "ownerName": target_user["username"], "updatedAt": datetime.utcnow()}})
    # update shares: set target role to owner, downgrade previous owner to editor
    shares_coll.update_one({"roomId": str(room["_id"]), "userId": str(target_user["_id"])}, {"$set": {"role": "owner"}})
    shares_coll.update_one({"roomId": str(room["_id"]), "userId": claims["sub"]}, {"$set": {"role": "editor"}})
    # notifications: notify both parties
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

@rooms_bp.route("/rooms/<roomId>/leave", methods=["POST"])
def leave_room(roomId):
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room:
        return jsonify({"status":"error","message":"Room not found"}), 404
    user_id = claims["sub"]
    # check membership
    share = shares_coll.find_one({"roomId": str(room["_id"]), "userId": user_id})
    if not share:
        return jsonify({"status":"error","message":"Not a member"}), 400
    # if owner tries to leave without transferring ownership -> forbid
    if share.get("role") == "owner":
        return jsonify({"status":"error","message":"Owner must transfer ownership before leaving"}), 400
    # remove share entry
    shares_coll.delete_one({"roomId": str(room["_id"]), "userId": user_id})
    # notify owner
    notifications_coll.insert_one({
        "userId": room.get("ownerId"),
        "type": "member_left",
        "message": f"{claims.get('username')} left room '{room.get('name')}'",
        "link": f"/rooms/{roomId}",
        "read": False,
        "createdAt": datetime.utcnow()
    })
    return jsonify({"status":"ok"})
@rooms_bp.route("/rooms/<roomId>/invite", methods=["POST"])
def invite_user(roomId):
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room:
        return jsonify({"status":"error","message":"Room not found"}), 404
    # ensure inviter is owner or admin
    inviter_share = shares_coll.find_one({"roomId": str(room["_id"]), "userId": claims["sub"]})
    if not inviter_share or inviter_share.get("role") not in ("owner", "admin"):
        return jsonify({"status":"error","message":"Forbidden"}), 403
    data = request.get_json() or {}
    invited_username = (data.get("username") or "").strip()
    role = (data.get("role") or "editor").lower()
    if role not in ("owner","admin","editor","viewer"):
        return jsonify({"status":"error","message":"Invalid role"}), 400
    if role == "owner":
        return jsonify({"status":"error","message":"Cannot invite as owner. Use transfer ownership."}), 400
    invited_user = users_coll.find_one({"username": invited_username})
    if not invited_user:
        return jsonify({"status":"error","message":"Invited user not found"}), 404
    invite = {
        "roomId": str(room["_id"]),
        "roomName": room.get("name"),
        "invitedUserId": str(invited_user["_id"]),
        "invitedUsername": invited_user["username"],
        "inviterId": claims["sub"],
        "inviterName": claims["username"],
        "role": role,
        "status": "pending",
        "createdAt": datetime.utcnow()
    }
    invites_coll.insert_one(invite)
    
    try:
        socketio.emit('notification', {'type':'invite','roomId': invite.get('roomId'), 'roomName': invite.get('roomName'), 'message': f\"You were invited to join room '{invite.get('roomName')}' as '{invite.get('role')}' by {invite.get('inviterName')}\", 'link': f\"/rooms/{invite.get('roomId')}\"}, room=f\"user:{invite.get('invitedUserId')}\")
    except Exception:
        pass
# create notification for invitee
    notifications_coll.insert_one({
        "userId": str(invited_user["_id"]),
        "type": "invite",
        "message": f"You were invited to join room '{room.get('name')}' by {claims['username']}",
        "link": f"/rooms/{str(room['_id'])}",
        "read": False,
        "createdAt": datetime.utcnow()
    })
    return jsonify({"status":"ok","inviteId": str(invite.get("_id"))}), 201

@rooms_bp.route("/invites", methods=["GET"])
def list_invites():
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    items = []
    for inv in invites_coll.find({"invitedUserId": claims["sub"], "status":"pending"}).sort("createdAt", -1):
        items.append({
            "id": str(inv["_id"]),
            "roomId": inv["roomId"],
            "roomName": inv.get("roomName"),
            "inviterName": inv.get("inviterName"),
            "role": inv.get("role"),
            "status": inv.get("status"),
            "createdAt": inv.get("createdAt")
        })
    return jsonify({"status":"ok","invites": items})

@rooms_bp.route("/invites/<inviteId>/accept", methods=["POST"])
def accept_invite(inviteId):
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    inv = invites_coll.find_one({"_id": ObjectId(inviteId)})
    if not inv:
        return jsonify({"status":"error","message":"Invite not found"}), 404
    if inv.get("invitedUserId") != claims["sub"]:
        return jsonify({"status":"error","message":"Forbidden"}), 403
    if inv.get("status") != "pending":
        return jsonify({"status":"error","message":"Invite not pending"}), 400
    # add to shares
    shares_coll.update_one(
        {"roomId": inv["roomId"], "userId": inv["invitedUserId"]},
        {"$set": {"roomId": inv["roomId"], "userId": inv["invitedUserId"], "username": inv["invitedUsername"], "role": inv["role"]}},
        upsert=True
    )
    invites_coll.update_one({"_id": ObjectId(inviteId)}, {"$set": {"status":"accepted", "respondedAt": datetime.utcnow()}})
    # notify inviter
    notifications_coll.insert_one({
        "userId": inv["inviterId"],
        "type": "invite_response",
        "message": f"{inv['invitedUsername']} accepted your invite to room '{inv.get('roomName')}'",
        "link": f"/rooms/{inv['roomId']}",
        "read": False,
        "createdAt": datetime.utcnow()
    })
    return jsonify({"status":"ok"})

@rooms_bp.route("/invites/<inviteId>/decline", methods=["POST"])
def decline_invite(inviteId):
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    inv = invites_coll.find_one({"_id": ObjectId(inviteId)})
    if not inv:
        return jsonify({"status":"error","message":"Invite not found"}), 404
    if inv.get("invitedUserId") != claims["sub"]:
        return jsonify({"status":"error","message":"Forbidden"}), 403
    if inv.get("status") != "pending":
        return jsonify({"status":"error","message":"Invite not pending"}), 400
    invites_coll.update_one({"_id": ObjectId(inviteId)}, {"$set": {"status":"declined", "respondedAt": datetime.utcnow()}})
    # notify inviter
    notifications_coll.insert_one({
        "userId": inv["inviterId"],
        "type": "invite_response",
        "message": f"{inv['invitedUsername']} declined your invite to room '{inv.get('roomName')}'",
        "link": f"/rooms/{inv['roomId']}",
        "read": False,
        "createdAt": datetime.utcnow()
    })
    return jsonify({"status":"ok"})

# -----------------------------
# Notifications endpoints
# -----------------------------
@rooms_bp.route("/notifications", methods=["GET"])
def list_notifications():
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    items=[]
    for n in notifications_coll.find({"userId": claims["sub"]}).sort("createdAt", -1).limit(200):
        items.append({
            "id": str(n["_id"]),
            "type": n.get("type"),
            "message": n.get("message"),
            "link": n.get("link"),
            "read": bool(n.get("read", False)),
            "createdAt": n.get("createdAt")
        })
    return jsonify({"status":"ok","notifications": items})

@rooms_bp.route("/notifications/<nid>/mark_read", methods=["POST"])
def mark_notification_read(nid):
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    notifications_coll.update_one({"_id": ObjectId(nid), "userId": claims["sub"]}, {"$set":{"read": True}})
    return jsonify({"status":"ok"})
