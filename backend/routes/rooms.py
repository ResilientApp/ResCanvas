# routes/rooms.py
from flask import Blueprint, request, jsonify, g
from bson import ObjectId
from bson.errors import InvalidId
from datetime import datetime
import json, time, traceback, logging
import re
from services.db import rooms_coll, shares_coll, users_coll, strokes_coll, redis_client, invites_coll, notifications_coll
from services.socketio_service import push_to_user, push_to_room
from services.crypto_service import wrap_room_key, unwrap_room_key, encrypt_for_room, decrypt_for_room
from services.graphql_service import commit_transaction_via_graphql, GraphQLService
import os
from config import (
    SIGNER_PUBLIC_KEY, SIGNER_PRIVATE_KEY, RECIPIENT_PUBLIC_KEY, JWT_SECRET,
    RATE_LIMIT_ROOM_CREATE_HOURLY, RATE_LIMIT_ROOM_UPDATE_MINUTE, 
    RATE_LIMIT_SEARCH_MINUTE, RATE_LIMIT_STROKE_MINUTE, RATE_LIMIT_UNDO_REDO_MINUTE
)
import jwt
from middleware.auth import require_auth, require_auth_optional, require_room_access, require_room_owner, validate_request_data
from middleware.validators import (
    validate_room_name, 
    validate_room_type, 
    validate_optional_string,
    validate_member_role,
    validate_share_users_array,
    validate_usernames_array,
    validate_stroke_payload,
    validate_color,
    validate_line_width,
    validate_member_id,
    validate_username
)
from middleware.rate_limit import limiter, user_rate_limit
try:
    from routes.get_canvas_data import get_strokes_from_mongo
except Exception:
    get_strokes_from_mongo = None

logger = logging.getLogger(__name__)
rooms_bp = Blueprint("rooms", __name__)

def _authed_user():
    """
    Authenticate user via JWT token in Authorization header.
    Returns decoded JWT payload if valid, None otherwise.
    
    SECURITY: This function ONLY accepts JWT tokens. All fallback authentication
    methods have been removed to prevent security loopholes.
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    
    token = auth.split(" ", 1)[1]
    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return decoded
    except jwt.ExpiredSignatureError:
        logger.warning("Expired JWT token attempt")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token: {e}")
        return None
    except Exception as e:
        logger.error(f"JWT validation error: {e}")
        return None

def _ensure_member(user_id:str, room):
    """Return True if the given authenticated identity corresponds to a member.

    Historically the app accepted a permissive fallback auth where `sub` was a
    username (e.g. "alice") while the modern JWT `sub` is the user's ObjectId
    string. Membership documents were created under both schemes, so check both
    forms (userId and username) to remain backward-compatible.
    """
    if room.get("ownerId") == user_id:
        return True
    try:
        if shares_coll.find_one({"roomId": str(room["_id"]), "$or": [{"userId": user_id}, {"username": user_id}] } ):
            return True
    except Exception:
        try:
            return shares_coll.find_one({"roomId": str(room["_id"]), "userId": user_id}) is not None
        except Exception:
            return False
    return False

def _notification_allowed_for(user_identifier, ntype: str):
    """Check the user's notification preferences. user_identifier may be a userId (string) or username.
    If the user has no preferences saved, default to allowing all notifications.
    """
    try:
        query = None
        if isinstance(user_identifier, str) and len(user_identifier) == 24:
            try:
                query = {"_id": ObjectId(user_identifier)}
            except Exception:
                query = {"username": user_identifier}
        else:
            query = {"username": user_identifier}
        user = users_coll.find_one(query, {"notificationPreferences": 1})
        if not user:
            return True
        prefs = user.get("notificationPreferences") or {}
        return bool(prefs.get(ntype, True))
    except Exception:
        return True

@rooms_bp.route("/rooms", methods=["POST"])
@require_auth
@limiter.limit(f"{RATE_LIMIT_ROOM_CREATE_HOURLY}/hour")
@validate_request_data({
    'name': validate_room_name,
    'type': validate_room_type,
    'description': validate_optional_string(500)
})
def create_room():
    """
    Create a new room. Server-side enforcement of:
    - Authentication (via @require_auth)
    - Input validation (via @validate_request_data)
    - Business rules (room key generation for private/secure)
    """
    user = g.current_user
    claims = g.token_claims
    
    data = g.validated_data
    name = data.get("name", "").strip()
    rtype = data.get("type", "public").lower()
    description = (data.get("description") or "").strip() or None

    wrapped = None
    if rtype in ("private","secure"):
        import os
        raw = os.urandom(32)
        wrapped = wrap_room_key(raw)

    room = {
        "name": name,
        "type": rtype,
        "description": description,
        "archived": False,
        "ownerId": claims["sub"],
        "ownerName": claims["username"],
        "createdAt": datetime.utcnow(),
        "updatedAt": datetime.utcnow(),
        "wrappedKey": wrapped
    }
    rooms_coll.insert_one(room)
    
    shares_coll.update_one(
        {"roomId": str(room["_id"]), "userId": claims["sub"]},
        {"$set": {
            "roomId": str(room["_id"]), 
            "userId": claims["sub"], 
            "username": claims["username"], 
            "role":"owner"
        }},
        upsert=True
    )
    return jsonify({
        "status":"ok",
        "room":{
            "id":str(room["_id"]), 
            "name":name, 
            "type":rtype
        }
    }), 201


@rooms_bp.route("/rooms", methods=["GET"])
@require_auth
def list_rooms():
    """
    List rooms visible to the current user.
    Server-side enforcement of:
    - Authentication (must be logged in)
    - Room visibility rules (public + owned + member)
    
    Query param:
      - archived=1 to include archived rooms; default is to exclude archived rooms.
    """
    user = g.current_user
    claims = g.token_claims
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401

    include_archived = request.args.get("archived", "0") in ("1", "true", "True", "yes")

    sort_by = (request.args.get('sort_by') or 'updatedAt')
    order = (request.args.get('order') or 'desc').lower()
    rtype = (request.args.get('type') or '').lower()
    try:
        page = max(1, int(request.args.get('page') or 1))
    except Exception:
        page = 1
    try:
        per_page = min(500, max(1, int(request.args.get('per_page') or 200)))
    except Exception:
        per_page = 200

    try:
        shared_cursor = shares_coll.find({"$or": [{"userId": claims['sub']}, {"username": claims['sub']}]}, {"roomId": 1})
        shared_room_ids = [r["roomId"] for r in shared_cursor]
    except Exception:
        shared_room_ids = [r["roomId"] for r in shares_coll.find({"userId": claims['sub']})]
    try:
        logger.info("list_rooms: user=%s rtype=%s include_archived=%s sort_by=%s order=%s page=%s per_page=%s", claims.get('sub'), rtype, include_archived, sort_by, order, page, per_page)
        logger.debug("list_rooms: shared_room_ids (raw)=%s", shared_room_ids)
    except Exception:
        pass
    oids = []
    for rid in shared_room_ids:
        try:
            oids.append(ObjectId(rid))
        except Exception:
            pass

    base_clauses = [{"ownerId": claims['sub'] }]
    if oids:
        base_clauses.append({"_id": {"$in": oids}})
    base_match = {"$or": base_clauses} if len(base_clauses) > 1 else base_clauses[0]

    if rtype in ("public", "private", "secure"):
        if rtype == "public":
            match = {"$and": [ base_match, {"type": "public"} ]}
        else:
            match = {"$and": [ base_match, {"type": rtype} ]}
    else:
        match = base_match

    if not include_archived:
        match = {"$and": [match, {"archived": {"$ne": True}}]}

    hidden_room_ids = []

    try:
        logger.debug("list_rooms: mongo match=%s", match)
    except Exception:
        pass

    pipeline = []
    pipeline.append({"$match": match})
    pipeline.append({"$addFields": {"_id_str": {"$toString": "$_id"}}})
    pipeline.append({"$lookup": {"from": shares_coll.name, "localField": "_id_str", "foreignField": "roomId", "as": "members"}})
    pipeline.append({"$addFields": {"memberCount": {"$size": {"$ifNull": ["$members", []]}}}})

    sort_map = {
        'updatedAt': ('updatedAt', -1),
        'createdAt': ('createdAt', -1),
        'name': ('name', 1),
        'memberCount': ('memberCount', -1)
    }
    sort_field, default_dir = sort_map.get(sort_by, ('updatedAt', -1))
    dir_val = 1 if order == 'asc' else -1
    sort_spec = {sort_field: dir_val}

    skip = (page - 1) * per_page

    if include_archived:
        facet_results_pipeline = [ {"$match": {"archived": True}}, {"$sort": sort_spec}, {"$skip": skip}, {"$limit": per_page}, {"$project": {"id": {"$toString": "$_id"}, "name": 1, "type": 1, "ownerName": 1, "description": 1, "archived": 1, "createdAt": 1, "updatedAt": 1, "memberCount": 1, "ownerId": 1}} ]
        facet_total_pipeline = [{"$match": {"archived": True}}, {"$count": "count"}]
    else:
        facet_results_pipeline = [ {"$sort": sort_spec}, {"$skip": skip}, {"$limit": per_page}, {"$project": {"id": {"$toString": "$_id"}, "name": 1, "type": 1, "ownerName": 1, "description": 1, "archived": 1, "createdAt": 1, "updatedAt": 1, "memberCount": 1, "ownerId": 1}} ]
        facet_total_pipeline = [{"$count": "count"}]

    pipeline.append({"$facet": {
        "results": facet_results_pipeline,
        "total": facet_total_pipeline
    }})

    try:
        agg_res = list(rooms_coll.aggregate(pipeline))
        results = []
        total = 0
        if agg_res and isinstance(agg_res, list):
            res0 = agg_res[0]
            results = res0.get('results', [])
            total = (res0.get('total', []) and res0['total'][0].get('count', 0)) or 0
        out = []
        for r in results:
            my_role = None
            try:
                if str(r.get('ownerId')) == claims['sub']:
                    my_role = 'owner'
                else:
                    sh = shares_coll.find_one({'roomId': r.get('id'), '$or': [{'userId': claims['sub']}, {'username': claims['sub']}]})
                    if sh and sh.get('role'):
                        my_role = sh.get('role')
            except Exception:
                my_role = None
            out.append({
                'id': r.get('id'),
                'name': r.get('name'),
                'type': r.get('type'),
                'ownerName': r.get('ownerName'),
                'description': r.get('description'),
                'archived': bool(r.get('archived', False)),
                'myRole': my_role,
                'createdAt': r.get('createdAt'),
                'updatedAt': r.get('updatedAt'),
                'memberCount': r.get('memberCount', 0)
            })
        try:
            returned_ids = [x.get('id') for x in out]
            logger.info("list_rooms: returning %d rooms (page=%s per_page=%s) total=%s ids=%s", len(out), page, per_page, total, returned_ids)
        except Exception:
            pass
        return jsonify({'status': 'ok', 'rooms': out, 'total': total, 'page': page, 'per_page': per_page})
    except Exception as e:
        try:
            owned = list(rooms_coll.find({"ownerId": claims["sub"], "archived": {"$ne": True}}))
            shared_room_ids = [r["roomId"] for r in shares_coll.find({"userId": claims['sub']})]
            shared = []
            if shared_room_ids:
                oids = []
                for rid in shared_room_ids:
                    try:
                        oids.append(ObjectId(rid))
                    except Exception:
                        pass
                if oids:
                    shared = list(rooms_coll.find({"_id": {"$in": oids}, "archived": {"$ne": True}}))
            def _fmt_single(r):
                rid = str(r["_id"])
                member_count = shares_coll.count_documents({"roomId": rid})
                my_role = None
                try:
                    if str(r.get("ownerId")) == claims["sub"]:
                        my_role = "owner"
                    else:
                        share = shares_coll.find_one({"roomId": rid, "$or": [{"userId": claims["sub"]}, {"username": claims["sub"]}]})
                        if share and share.get("role"):
                            my_role = share.get("role")
                except Exception:
                    my_role = None
                return {
                    "id": rid,
                    "name": r.get("name"),
                    "type": r.get("type"),
                    "ownerName": r.get("ownerName"),
                    "description": r.get("description"),
                    "archived": bool(r.get("archived", False)),
                    "myRole": my_role,
                    "createdAt": r.get("createdAt"),
                    "updatedAt": r.get("updatedAt"),
                    "memberCount": member_count
                }
            ids = set()
            items = []
            for r in owned + shared:
                rid = str(r["_id"])
                if rid in ids:
                    continue
                ids.add(rid)
                items.append(_fmt_single(r))
            try:
                total_fallback = len(items)
                skip_fallback = (page - 1) * per_page
                paged = items[skip_fallback: skip_fallback + per_page]
                return jsonify({"status": "ok", "rooms": paged, "total": total_fallback, "page": page, "per_page": per_page})
            except Exception:
                return jsonify({"status":"ok","rooms": items})
        except Exception:
            return jsonify({"status":"error","message":"Failed to list rooms"}), 500

@rooms_bp.route("/users/suggest", methods=["GET"])
@require_auth
def suggest_users():
    """
    Suggest usernames matching the provided query parameter `q`.
    Returns up to 10 case-insensitive prefix matches. Requires authentication.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    """
    claims = g.token_claims
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"status":"ok","suggestions": []})
    try:
        cursor = users_coll.find({"username": {"$regex": f"^{re.escape(q)}", "$options": "i"}}, {"username": 1}).limit(10)
        suggestions = [u.get("username") for u in cursor]
    except Exception:
        suggestions = []
    return jsonify({"status":"ok","suggestions": suggestions})

@rooms_bp.route("/rooms/suggest", methods=["GET"])
@require_auth
def suggest_rooms():
    """
    Suggest public room names matching the provided query parameter `q`.
    Returns up to 10 case-insensitive prefix matches. Requires authentication.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    """
    claims = g.token_claims
    q = (request.args.get("q") or "").strip()
    if not q:
        return jsonify({"status":"ok","rooms": []})
    try:
        cursor = rooms_coll.find({"type": "public", "archived": {"$ne": True}, "name": {"$regex": f"^{re.escape(q)}", "$options": "i"}}, {"name": 1, "ownerName": 1}).limit(10)
        rooms = []
        for r in cursor:
            rid = str(r.get("_id"))
            try:
                member_count = shares_coll.count_documents({"roomId": rid})
            except Exception:
                member_count = 0
            rooms.append({
                "id": rid,
                "name": r.get("name"),
                "ownerName": r.get("ownerName"),
                "memberCount": member_count,
                "type": r.get("type")
            })
    except Exception:
        rooms = []
    return jsonify({"status": "ok", "rooms": rooms})

@rooms_bp.route("/rooms/<roomId>/share", methods=["POST"])
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
    user = g.current_user
    claims = g.token_claims
    room = g.current_room
    
    inviter_share = shares_coll.find_one({"roomId": str(room["_id"]), "userId": claims["sub"]})
    if not inviter_share or inviter_share.get("role") not in ("owner","admin","editor"):
        return jsonify({"status":"error","message":"Forbidden: Only room owner, admin, or editor can share"}), 403

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

    if role == "admin" and inviter_share.get("role") != "owner":
        return jsonify({"status":"error","message":"Forbidden: Only the room owner may invite admin users"}), 403

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
                if _notification_allowed_for(uid, 'invite'):
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
                if _notification_allowed_for(uid, 'share_added'):
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

@rooms_bp.route("/rooms/<roomId>/admin/fill_wrapped_key", methods=["POST"])
@validate_request_data({
    "adminSecret": {"validator": validate_optional_string(max_length=500), "required": True}
})
def admin_fill_wrapped_key(roomId):
    """
    Admin helper: generate a per-room key and wrap it with the master key for
    private/secure rooms that lack a wrappedKey. Protected by ADMIN_SECRET env var.
    Body: { "adminSecret": "..." }
    
    Server-side enforcement:
    - Admin secret validation
    - Room existence check
    - Input validation via @validate_request_data
    """
    import os as _os
    admin_secret = _os.getenv("ADMIN_SECRET")
    data = g.validated_data
    if not admin_secret or data.get("adminSecret") != admin_secret:
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room:
        return jsonify({"status":"error","message":"Room not found"}), 404
    if room.get("type") not in ("private","secure"):
        return jsonify({"status":"error","message":"Not a private/secure room"}), 400
    if room.get("wrappedKey"):
        return jsonify({"status":"ok","message":"wrappedKey already present"})
    raw = _os.urandom(32)
    wrapped = wrap_room_key(raw)
    rooms_coll.update_one({"_id": room["_id"]}, {"$set": {"wrappedKey": wrapped}})
    return jsonify({"status":"ok","message":"wrappedKey created"})

@rooms_bp.route("/rooms/<roomId>/strokes", methods=["POST"])
@require_auth
@require_room_access(room_id_param="roomId")
@limiter.limit(f"{RATE_LIMIT_STROKE_MINUTE}/minute")
@validate_request_data({
    "stroke": {"validator": lambda v: (isinstance(v, dict), "Stroke must be an object") if not isinstance(v, dict) else (True, None), "required": True},
    "signature": {"validator": validate_optional_string(max_length=1000), "required": False},
    "signerPubKey": {"validator": validate_optional_string(max_length=1000), "required": False}
})
def post_stroke(roomId):
    """
    Add a stroke to a room's canvas.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room access required via @require_room_access
    - Input validation via @validate_request_data
    - Viewer role cannot post strokes
    - Secure rooms require wallet signature
    - Private/secure rooms encrypt stroke data
    """
    user = g.current_user
    claims = g.token_claims
    room = g.current_room
    
    try:
        share = shares_coll.find_one({"roomId": str(room["_id"]), "$or": [{"userId": claims["sub"]}, {"username": claims["sub"]}]})
        if share and share.get("role") == "viewer":
            return jsonify({"status":"error","message":"Forbidden: viewers cannot modify the canvas"}), 403
    except Exception:
        pass

    payload = g.validated_data
    stroke = payload["stroke"]
    stroke["roomId"] = roomId
    stroke["user"]   = claims["username"]
    stroke["ts"]     = int(time.time() * 1000)
    
    if "drawingId" in stroke and "id" not in stroke:
        stroke["id"] = stroke["drawingId"]
    elif "id" not in stroke and "drawingId" not in stroke:
        stroke["id"] = f"stroke_{stroke['ts']}_{claims['username']}"

    if room["type"] == "secure":
        sig = payload.get("signature"); spk = payload.get("signerPubKey")
        if not (sig and spk):
            return jsonify({"status":"error","message":"Signature required for secure room"}), 400
        try:
            import nacl.signing, nacl.encoding
            vk = nacl.signing.VerifyKey(spk, encoder=nacl.encoding.HexEncoder)
            msg_data = {
                "roomId": roomId, "user": stroke["user"], "color": stroke["color"],
                "lineWidth": stroke["lineWidth"], "pathData": stroke["pathData"], "timestamp": stroke.get("timestamp", stroke["ts"])
            }
            msg = json.dumps(msg_data, separators=(',', ':'), sort_keys=True).encode()
            vk.verify(msg, bytes.fromhex(sig))
        except Exception as e:
            logger.error(f"Signature verification failed for room {roomId}: {str(e)}")
            return jsonify({"status":"error","message":"Bad signature"}), 400
        stroke["walletSignature"] = sig
        stroke["walletPubKey"]    = spk

    asset_data = {}
    if room["type"] in ("private","secure"):
        if not room.get("wrappedKey"):
            try:
                enc_count = strokes_coll.count_documents({"roomId": roomId, "$or": [{"blob": {"$exists": True}}, {"asset.data.encrypted": {"$exists": True}}]})
            except Exception:
                enc_count = 0

            if enc_count == 0:
                try:
                    raw = os.urandom(32)
                    wrapped_new = wrap_room_key(raw)
                    rooms_coll.update_one({"_id": room["_id"]}, {"$set": {"wrappedKey": wrapped_new}})
                    room["wrappedKey"] = wrapped_new
                    logger.info("post_stroke: auto-created wrappedKey for room %s", roomId)
                except Exception as e:
                    logger.exception("post_stroke: failed to auto-create wrappedKey for room %s: %s", roomId, e)
                    
                    return jsonify({"status": "error", "message": "Failed to create room encryption key; contact administrator"}), 500
            else:
                logger.error("post_stroke: room %s missing wrappedKey and has %d encrypted blobs; cannot auto-fill", roomId, enc_count)
                return jsonify({"status": "error", "message": "Room encryption key missing; contact administrator"}), 500
        try:
            rk = unwrap_room_key(room["wrappedKey"])
        except Exception as e:
            logger.exception("post_stroke: failed to unwrap room key for room %s: %s", roomId, e)
            return jsonify({"status": "error", "message": "Invalid room encryption key; contact administrator"}), 500
        enc = encrypt_for_room(rk, json.dumps(stroke).encode())
        asset_data = {"roomId": roomId, "type": room["type"], "encrypted": enc}
        strokes_coll.insert_one({"roomId": roomId, "ts": stroke["ts"], "blob": enc})

        rooms_coll.update_one({"_id": room["_id"]}, {"$set": {"updatedAt": datetime.utcnow()}})
    else:
        asset_data = {"roomId": roomId, "type": "public", "stroke": stroke}
        strokes_coll.insert_one({"roomId": roomId, "ts": stroke["ts"], "stroke": stroke})

        rooms_coll.update_one({"_id": room["_id"]}, {"$set": {"updatedAt": datetime.utcnow()}})

    try:
        path_data = stroke.get("pathData")
        if isinstance(path_data, dict) and path_data.get("tool") == "cut" and path_data.get("cut") == True:
            orig_stroke_ids = path_data.get("originalStrokeIds") or []
            if orig_stroke_ids:
                cut_set_key = f"cut-stroke-ids:{roomId}"
                redis_client.sadd(cut_set_key, *[str(sid) for sid in orig_stroke_ids])
                logger.info(f"Added {len(orig_stroke_ids)} stroke IDs to cut set for room {roomId}")
    except Exception as e:
        logger.warning(f"post_stroke: failed to process cut record: {e}")

    prep = {
        "operation": "CREATE",
        "amount": 1,
        "signerPublicKey": SIGNER_PUBLIC_KEY,
        "signerPrivateKey": SIGNER_PRIVATE_KEY,
        "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
        "asset": { "data": asset_data }
    }
    commit_transaction_via_graphql(prep)

    skip_undo_stack = payload.get("skipUndoStack", False) or stroke.get("skipUndoStack", False)
    if not skip_undo_stack:
        key_base = f"room:{roomId}:{claims['sub']}"
        redis_client.lpush(f"{key_base}:undo", json.dumps(stroke))
        redis_client.delete(f"{key_base}:redo")

    push_to_room(roomId, "new_stroke", {
        "roomId": roomId,
        "stroke": stroke,
        "user": claims["username"],
        "timestamp": stroke["ts"]
    })

    return jsonify({"status":"ok"})

@rooms_bp.route("/rooms/<roomId>/strokes", methods=["GET"])
@require_auth
@require_room_access(room_id_param="roomId")
def get_strokes(roomId):
    """
    Retrieve all strokes for a room with server-side filtering.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room access required via @require_room_access
    - Supports query params: start, end (timestamp range for history)
    - Filters undone strokes server-side
    - Filters cleared strokes server-side
    - Decrypts private/secure room strokes server-side
    
    Query parameters (all optional):
    - start: Start timestamp for history range
    - end: End timestamp for history range
    """
    user = g.current_user
    claims = g.token_claims
    room = g.current_room
    
    try:
        user_sub = claims.get("sub")
        room_type = room.get("type")
        owner = room.get("ownerId")
        logger.info(f"get_strokes: roomId={roomId} user={user_sub} owner={owner} room_type={room_type}")
    except Exception:
        logger.exception("get_strokes: failed to log diagnostic info")

    mongo_query = {
        "$or": [
            {"roomId": roomId},
            {"transactions.value.asset.data.roomId": roomId},
            {"transactions.value.asset.data.roomId": [roomId]},
            {"transactions.value.asset.data.roomId": {"$in": [roomId]}}
        ]
    }
    items = list(strokes_coll.find(mongo_query))
    
    user_id = claims['sub']
    undone_strokes = set()
    
    cut_set_key = f"cut-stroke-ids:{roomId}"
    try:
        raw_cut = redis_client.smembers(cut_set_key)
        cut_stroke_ids = set(x.decode() if isinstance(x, (bytes, bytearray)) else str(x) for x in (raw_cut or set()))
    except Exception as e:
        logger.warning(f"Failed to get cut stroke IDs: {e}")
        cut_stroke_ids = set()
    
    try:
        pattern = f"room:{roomId}:*:undone_strokes"
        for key in redis_client.scan_iter(match=pattern):
            undone_keys = redis_client.smembers(key)
            for stroke_key in undone_keys:
                undone_strokes.add(stroke_key.decode('utf-8') if isinstance(stroke_key, bytes) else str(stroke_key))
        logger.debug(f"Loaded {len(undone_strokes)} undone strokes from Redis for room {roomId}")
    except Exception as e:
        logger.warning(f"Redis lookup for undone strokes failed: {e}")

    try:
        pipeline = [
            {
                "$match": {
                    "asset.data.roomId": roomId,
                    "asset.data.type": {"$in": ["undo_marker", "redo_marker"]}
                }
            },
            {"$sort": {"asset.data.ts": -1}},
            {
                "$group": {
                    "_id": "$asset.data.strokeId",
                    "latest_op": {"$first": "$asset.data.type"}
                }
            }
        ]
        markers = strokes_coll.aggregate(pipeline)
        for marker in markers:
            if marker["latest_op"] == "undo_marker":
                undone_strokes.add(marker["_id"])
            elif marker["latest_op"] == "redo_marker" and marker["_id"] in undone_strokes:
                undone_strokes.remove(marker["_id"])
        logger.debug(f"Total {len(undone_strokes)} undone strokes after MongoDB recovery for room {roomId}")
    except Exception as e:
        logger.warning(f"MongoDB recovery of undo/redo state failed: {e}")

    try:
        clear_after = 0
        clear_key = f"last-clear-ts:{roomId}"
        raw = None
        try:
            raw = redis_client.get(clear_key)
        except Exception:
            raw = None
        if raw:
            try:
                if isinstance(raw, (bytes, bytearray)):
                    raw = raw.decode()
                clear_after = int(raw)
            except Exception:
                clear_after = 0
        else:
            try:
                blk = strokes_coll.find_one({"asset.data.type": "clear_marker", "asset.data.roomId": roomId}, sort=[("_id", -1)])
                if blk:
                    asset = (blk.get("asset") or {}).get("data", {})
                    cand = asset.get("ts") or asset.get("timestamp") or asset.get("value")
                    try:
                        clear_after = int(cand) if cand is not None else 0
                    except Exception:
                        clear_after = 0
            except Exception:
                clear_after = 0
    except Exception:
        clear_after = 0

    start_param = request.args.get('start')
    end_param = request.args.get('end')
    history_mode = bool(start_param or end_param)
    try:
        start_ts = int(start_param) if start_param is not None and start_param != '' else None
    except Exception:
        start_ts = None
    try:
        end_ts = int(end_param) if end_param is not None and end_param != '' else None
    except Exception:
        end_ts = None

    if room["type"] in ("private","secure"):
        rk = None
        try:
            if room.get("wrappedKey"):
                rk = unwrap_room_key(room["wrappedKey"])
        except Exception:
            logger.exception("get_strokes: failed to unwrap room key for room %s", roomId)
            rk = None

        out = []
        seen_stroke_ids = set()
        
        for it in items:
            try:
                stroke_data = None
                
                if 'transactions' in it and it['transactions']:
                    try:
                        asset_data = it['transactions'][0]['value']['asset']['data']
                        if 'stroke' in asset_data:
                            stroke_data = asset_data['stroke']
                            if stroke_data and 'timestamp' in stroke_data:
                                stroke_data['ts'] = stroke_data['timestamp']
                        elif 'encrypted' in asset_data:
                            if rk is None:
                                continue
                            blob = asset_data['encrypted']
                            raw = decrypt_for_room(rk, blob)
                            stroke_data = json.loads(raw.decode())
                            if stroke_data and 'timestamp' in stroke_data:
                                stroke_data['ts'] = stroke_data['timestamp']
                    except (KeyError, IndexError, TypeError):
                        pass
                
                if stroke_data is None:
                    if "blob" in it:
                        if rk is None:
                            continue
                        blob = it["blob"]
                        raw = decrypt_for_room(rk, blob)
                        stroke_data = json.loads(raw.decode())
                    elif 'asset' in it and 'data' in it['asset'] and 'encrypted' in it['asset']['data']:
                        if rk is None:
                            continue
                        blob = it['asset']['data']['encrypted']
                        raw = decrypt_for_room(rk, blob)
                        stroke_data = json.loads(raw.decode())
                    elif "stroke" in it:
                        stroke_data = it["stroke"]
                    elif 'asset' in it and 'data' in it['asset'] and 'stroke' in it['asset']['data']:
                        stroke_data = it['asset']['data']['stroke']
                    else:
                        continue

                stroke_id = stroke_data.get("id") or stroke_data.get("drawingId")
                
                if stroke_id and stroke_id in seen_stroke_ids:
                    continue
                
                parent_paste_id = None
                try:
                    parent_paste_id = None
                    try:
                        if isinstance(stroke_data, dict) and 'parentPasteId' in stroke_data:
                            parent_paste_id = stroke_data.get('parentPasteId')
                        else:
                            pd = stroke_data.get('pathData') if isinstance(stroke_data, dict) else None
                            if isinstance(pd, dict):
                                parent_paste_id = pd.get('parentPasteId')
                            else:
                                parent_paste_id = None
                    except Exception:
                        parent_paste_id = None
                except Exception:
                    parent_paste_id = None

                parent_undone = parent_paste_id in undone_strokes if parent_paste_id else False

                if stroke_id and not parent_undone and stroke_id not in undone_strokes and stroke_id not in cut_stroke_ids:
                    try:
                        st_ts = stroke_data.get('ts') or stroke_data.get('timestamp')
                        if isinstance(st_ts, dict) and '$numberLong' in st_ts:
                            st_ts = int(st_ts['$numberLong'])
                        elif isinstance(st_ts, (bytes, bytearray)):
                            st_ts = int(st_ts.decode())
                        else:
                            st_ts = int(st_ts) if st_ts is not None else None
                    except Exception:
                        st_ts = None

                    if not history_mode and (st_ts is None or st_ts <= clear_after):
                        continue
                    if st_ts is not None:
                        stroke_data['ts'] = st_ts
                        stroke_data['timestamp'] = st_ts

                    if history_mode:
                        if (start_ts is not None and (st_ts is None or st_ts < start_ts)) or (end_ts is not None and (st_ts is None or st_ts > end_ts)):
                            continue

                    out.append(stroke_data)
                    if stroke_id:
                        seen_stroke_ids.add(stroke_id)
            except Exception:
                continue
        
        out.sort(key=lambda s: s.get('ts') or s.get('timestamp') or 0)
        
        return jsonify({"status":"ok","strokes": out})
    else:
        filtered_strokes = []
        seen_stroke_ids = set()
        
        for it in items:
            try:
                stroke_data = None
                
                if 'transactions' in it and it['transactions']:
                    try:
                        asset_data = it['transactions'][0]['value']['asset']['data']
                        if 'stroke' in asset_data:
                            stroke_data = asset_data['stroke']
                            if stroke_data and 'timestamp' in stroke_data:
                                stroke_data['ts'] = stroke_data['timestamp']
                    except (KeyError, IndexError, TypeError):
                        pass
                
                if stroke_data is None:
                    if 'stroke' in it:
                        stroke_data = it["stroke"]
                    elif 'asset' in it and 'data' in it['asset']:
                        if 'stroke' in it['asset']['data']:
                            stroke_data = it['asset']['data']['stroke']
                        elif 'value' in it['asset']['data']:
                            stroke_data = json.loads(it['asset']['data'].get('value', '{}'))
                    else:
                        continue

                stroke_id = stroke_data.get("id") or stroke_data.get("drawingId")
                
                if stroke_id and stroke_id in seen_stroke_ids:
                    continue
                
                parent_paste_id = None
                try:
                    parent_paste_id = None
                    try:
                        if isinstance(stroke_data, dict) and 'parentPasteId' in stroke_data:
                            parent_paste_id = stroke_data.get('parentPasteId')
                        else:
                            pd = stroke_data.get('pathData') if isinstance(stroke_data, dict) else None
                            if isinstance(pd, dict):
                                parent_paste_id = pd.get('parentPasteId')
                            else:
                                parent_paste_id = None
                    except Exception:
                        parent_paste_id = None
                except Exception:
                    parent_paste_id = None
                parent_undone = parent_paste_id in undone_strokes if parent_paste_id else False

                if stroke_id and not parent_undone and stroke_id not in undone_strokes and stroke_id not in cut_stroke_ids:
                    try:
                        st_ts = stroke_data.get('ts') or stroke_data.get('timestamp')
                        if isinstance(st_ts, dict) and '$numberLong' in st_ts:
                            st_ts = int(st_ts['$numberLong'])
                        elif isinstance(st_ts, (bytes, bytearray)):
                            st_ts = int(st_ts.decode())
                        else:
                            st_ts = int(st_ts) if st_ts is not None else None
                    except Exception:
                        st_ts = None

                    if not history_mode and (st_ts is None or st_ts <= clear_after):
                        continue
                    if history_mode:
                        if (start_ts is not None and (st_ts is None or st_ts < start_ts)) or (end_ts is not None and (st_ts is None or st_ts > end_ts)):
                            continue

                    if st_ts is not None:
                        stroke_data['ts'] = st_ts
                        stroke_data['timestamp'] = st_ts

                    filtered_strokes.append(stroke_data)
                    if stroke_id:
                        seen_stroke_ids.add(stroke_id)
            except Exception:
                continue
        
        if history_mode and get_strokes_from_mongo is not None:
            try:
                mongo_items = get_strokes_from_mongo(start_ts, end_ts, roomId)
                existing_ids = set((s.get('id') or s.get('drawingId')) for s in filtered_strokes if s)
                for it in (mongo_items or []):
                    try:
                        payload = it.get('value')
                        parsed = None
                        if isinstance(payload, str):
                            try:
                                parsed = json.loads(payload)
                            except Exception:
                                parsed = None
                        elif isinstance(payload, dict):
                            parsed = payload
                        if not parsed:
                            continue
                        sid = parsed.get('id') or parsed.get('drawingId') or it.get('id')
                        if not sid or sid in existing_ids:
                            continue
                        try:
                            parsed_ts = int(it.get('ts') or parsed.get('ts') or parsed.get('timestamp') or 0)
                        except Exception:
                            parsed_ts = None
                        if parsed_ts is not None:
                            parsed['ts'] = parsed_ts
                        parsed['roomId'] = parsed.get('roomId') or roomId
                        filtered_strokes.append(parsed)
                        existing_ids.add(sid)
                    except Exception:
                        continue
            except Exception:
                logger.exception("rooms.get_strokes: Mongo history supplement failed for room %s", roomId)

        filtered_strokes.sort(key=lambda s: s.get('ts') or s.get('timestamp') or 0)
        return jsonify({"status":"ok","strokes": filtered_strokes})

@rooms_bp.route("/rooms/<roomId>/undo", methods=["POST"])
@require_auth
@require_room_access(room_id_param="roomId")
@limiter.limit(f"{RATE_LIMIT_UNDO_REDO_MINUTE}/minute")
def room_undo(roomId):
    """
    Undo the last action in a room.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room access required via @require_room_access
    - Viewer role cannot undo (read-only)
    """
    logger.info(f"Room undo request for room {roomId}")
    
    user = g.current_user
    claims = g.token_claims
    room = g.current_room
    
    user_id = claims['sub']
    
    try:
        share = shares_coll.find_one({"roomId": roomId, "$or": [{"userId": user_id}, {"username": user_id}]})
        if share and share.get('role') == 'viewer':
            return jsonify({"status":"error","message":"Forbidden: viewers cannot perform undo"}), 403
    except Exception:
        pass
    key_base = f"room:{roomId}:{user_id}"
    logger.info(f"Using key_base: {key_base} for user {user_id}")
    
    last_raw = redis_client.lpop(f"{key_base}:undo")
    if not last_raw:
        logger.info("Undo stack is empty, returning noop.")
        return jsonify({"status":"noop"})
    
    logger.info("Popped stroke from undo stack.")
    
    try:
        stroke = json.loads(last_raw)
        stroke_id = stroke.get("id") or stroke.get("drawingId")
        if not stroke_id:
            logger.error("Stroke ID missing in undo data.")
            raise ValueError("Stroke ID missing")

        logger.info(f"Processing undo for stroke_id: {stroke_id}")

        path_data = stroke.get("pathData")
        is_cut_record = (isinstance(path_data, dict) and 
                        path_data.get("tool") == "cut" and 
                        path_data.get("cut") == True)
        
        if is_cut_record:
            original_stroke_ids = path_data.get("originalStrokeIds") or []
            replacement_segment_ids = path_data.get("replacementSegmentIds") or []
            cut_set_key = f"cut-stroke-ids:{roomId}"
            
            if original_stroke_ids:
                for orig_id in original_stroke_ids:
                    redis_client.srem(cut_set_key, str(orig_id))
                logger.info(f"Removed {len(original_stroke_ids)} original stroke IDs from cut set during undo")
            
            if replacement_segment_ids:
                for rep_id in replacement_segment_ids:
                    redis_client.sadd(cut_set_key, str(rep_id))
                logger.info(f"Added {len(replacement_segment_ids)} replacement segment IDs to cut set during undo")

        redis_client.lpush(f"{key_base}:redo", last_raw)
        logger.info("Moved stroke to redo stack.")
        
        redis_client.sadd(f"{key_base}:undone_strokes", stroke_id)
        logger.info("Added stroke to undone_strokes set in Redis.")

        ts = int(time.time() * 1000)
        marker_rec = {
            "type": "undo_marker",
            "roomId": roomId,
            "user": user_id,
            "strokeId": stroke_id,
            "ts": ts
        }
        
        logger.info("Attempting to persist undo marker via GraphQL.")
        try:
            marker_asset = {"data": marker_rec}
            payload = {
                "operation": "CREATE", "amount": 1,
                "signerPublicKey": SIGNER_PUBLIC_KEY, "signerPrivateKey": SIGNER_PRIVATE_KEY,
                "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
                "asset": marker_asset
            }
            strokes_coll.insert_one({"asset": marker_asset})
            commit_transaction_via_graphql(payload)
            logger.info("Successfully persisted undo marker.")
        except Exception as e:
            logger.exception("GraphQL commit failed for room_undo marker")
            redis_client.lpush(f"{key_base}:undo", last_raw)
            redis_client.lrem(f"{key_base}:redo", 1, last_raw)
            redis_client.srem(f"{key_base}:undone_strokes", stroke_id)
            return jsonify({"status":"error", "message":"Failed to persist undo action"}), 500

        push_to_room(roomId, "stroke_undone", {
            "roomId": roomId,
            "strokeId": stroke_id,
            "user": claims.get("username", "unknown"),
            "timestamp": ts
        })
        logger.info("Broadcasted stroke_undone event.")
        return jsonify({"status":"ok", "undone_stroke_id": stroke_id})

    except Exception as e:
        logger.exception("An error occurred during room_undo")
        if last_raw:
            redis_client.lpush(f"{key_base}:undo", last_raw)
        return jsonify({"status":"error","message":f"Failed to undo: {str(e)}"}), 500

@rooms_bp.route("/rooms/<roomId>/undo_redo_status", methods=["GET"])
@require_auth
@require_room_access(room_id_param="roomId")
def get_undo_redo_status(roomId):
    """
    Get the current undo/redo stack sizes for the user in this room.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room access required via @require_room_access
    """
    user = g.current_user
    claims = g.token_claims
    room = g.current_room
    
    key_base = f"room:{roomId}:{claims['sub']}"
    undo_count = redis_client.llen(f"{key_base}:undo")
    redo_count = redis_client.llen(f"{key_base}:redo")
    
    return jsonify({
        "status": "ok",
        "undo_available": undo_count > 0,
        "redo_available": redo_count > 0,
        "undo_count": undo_count,
        "redo_count": redo_count
    })

@rooms_bp.route("/rooms/<roomId>/redo", methods=["POST"])
@require_auth
@require_room_access(room_id_param="roomId")
@limiter.limit(f"{RATE_LIMIT_UNDO_REDO_MINUTE}/minute")
def room_redo(roomId):
    """
    Redo the last undone action in a room.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room access required via @require_room_access
    - Viewer role cannot redo (read-only)
    """
    user = g.current_user
    claims = g.token_claims
    room = g.current_room
    
    user_id = claims['sub']
    
    try:
        share = shares_coll.find_one({"roomId": roomId, "$or": [{"userId": user_id}, {"username": user_id}]})
        if share and share.get('role') == 'viewer':
            return jsonify({"status":"error","message":"Forbidden: viewers cannot perform redo"}), 403
    except Exception:
        pass
    
    key_base = f"room:{roomId}:{user_id}"

    last_raw = redis_client.lpop(f"{key_base}:redo")
    if not last_raw: return jsonify({"status":"noop"})
    
    try:
        stroke = json.loads(last_raw)
        stroke_id = stroke.get("id") or stroke.get("drawingId")
        if not stroke_id:
            raise ValueError("Stroke ID missing")

        path_data = stroke.get("pathData")
        is_cut_record = (isinstance(path_data, dict) and 
                        path_data.get("tool") == "cut" and 
                        path_data.get("cut") == True)
        
        if is_cut_record:
            original_stroke_ids = path_data.get("originalStrokeIds") or []
            replacement_segment_ids = path_data.get("replacementSegmentIds") or []
            cut_set_key = f"cut-stroke-ids:{roomId}"
            
            if original_stroke_ids:
                redis_client.sadd(cut_set_key, *[str(orig_id) for orig_id in original_stroke_ids])
                logger.info(f"Added {len(original_stroke_ids)} stroke IDs back to cut set during redo")
            
            if replacement_segment_ids:
                for rep_id in replacement_segment_ids:
                    redis_client.srem(cut_set_key, str(rep_id))
                logger.info(f"Removed {len(replacement_segment_ids)} replacement segment IDs from cut set during redo")

        redis_client.lpush(f"{key_base}:undo", last_raw)
        
        redis_client.srem(f"{key_base}:undone_strokes", stroke_id)

        ts = int(time.time() * 1000)
        marker_rec = {
            "type": "redo_marker",
            "roomId": roomId,
            "user": user_id,
            "strokeId": stroke_id,
            "ts": ts
        }
        
        try:
            payload = {
                "operation": "CREATE", "amount": 1,
                "signerPublicKey": SIGNER_PUBLIC_KEY, "signerPrivateKey": SIGNER_PRIVATE_KEY,
                "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
                "asset": {"data": marker_rec}
            }
            strokes_coll.insert_one({"asset": {"data": marker_rec}})
            commit_transaction_via_graphql(payload)
            logger.info("Successfully persisted redo marker.")
        except Exception:
            logger.exception("GraphQL commit failed for room_redo marker")
            redis_client.lpop(f"{key_base}:undo")
            redis_client.rpush(f"{key_base}:redo", last_raw)
            redis_client.sadd(f"{key_base}:undone_strokes", stroke_id)
            return jsonify({"status":"error", "message":"Failed to persist redo action"}), 500

        push_to_room(roomId, "stroke_redone", {
            "roomId": roomId,
            "stroke": stroke,
            "user": claims.get("username", "unknown"),
            "timestamp": ts
        })
        
        return jsonify({"status":"ok", "redone_stroke": stroke})
        
    except Exception as e:
        if last_raw:
            redis_client.lpush(f"{key_base}:redo", last_raw)
        return jsonify({"status":"error","message":f"Failed to redo: {str(e)}"}), 500

@rooms_bp.route("/rooms/<roomId>/reset_my_stacks", methods=["POST"])
@require_auth
@require_room_access(room_id_param="roomId")
def reset_my_stacks(roomId):
    """
    Reset this authenticated user's undo/redo stacks for the given room.
    This endpoint is intended to be called by the client when the user refreshes
    the page so server-side undo/redo state does not leak across sessions.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room access required via @require_room_access
    - Viewer role cannot reset stacks (read-only)
    """
    user = g.current_user
    claims = g.token_claims
    room = g.current_room
    
    user_id = claims['sub']
    
    try:
        share = shares_coll.find_one({"roomId": roomId, "$or": [{"userId": user_id}, {"username": user_id}]})
        if share and share.get('role') == 'viewer':
            return jsonify({"status":"error","message":"Forbidden: viewers cannot reset stacks"}), 403
    except Exception:
        pass
    key_base = f"room:{roomId}:{user_id}"
    try:
        redis_client.delete(f"{key_base}:undo")
        redis_client.delete(f"{key_base}:redo")
        redis_client.delete(f"{key_base}:undone_strokes")
    except Exception:
        logger.exception("Failed to reset user stacks for room %s user %s", roomId, user_id)
        return jsonify({"status":"error","message":"Failed to reset stacks"}), 500
    return jsonify({"status":"ok"})

@rooms_bp.route("/rooms/<roomId>/clear", methods=["POST"])
@require_auth
@require_room_access(room_id_param="roomId")
def room_clear(roomId):
    """
    Clear all strokes from a room's canvas.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room access required via @require_room_access (only user access with edit permissions can clear entire canvas)
    - Viewer role cannot clear (read-only)
    - Stores clear timestamp server-side for filtering
    - Preserves strokes in MongoDB for history recall
    """
    user = g.current_user
    claims = g.token_claims
    room = g.current_room

    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room:
        return jsonify({"status":"error","message":"Room not found"}), 404
    if not _ensure_member(claims["sub"], room):
        return jsonify({"status":"error","message":"Forbidden"}), 403
    try:
        share = shares_coll.find_one({"roomId": str(room["_id"]), "$or": [{"userId": claims["sub"]}, {"username": claims["sub"]}]})
        if share and share.get('role') == 'viewer':
            return jsonify({"status":"error","message":"Forbidden: viewers cannot clear the canvas"}), 403
    except Exception:
        pass

    cleared_at = int(time.time() * 1000)

    try:
        clear_ts_key = f"last-clear-ts:{roomId}"
        redis_client.set(clear_ts_key, cleared_at)
        logger.info(f"Stored clear timestamp {cleared_at} for room {roomId}")
    except Exception:
        logger.exception("Failed to store clear timestamp in Redis")

    try:
        suffixes = [":undo", ":redo", ":undone_strokes"]
        for suf in suffixes:
            pattern = f"room:{roomId}:*{suf}"
            try:
                for key in redis_client.scan_iter(match=pattern):
                    try:
                        redis_client.delete(key)
                    except Exception:
                        try:
                            redis_client.delete(key.decode() if hasattr(key, 'decode') else str(key))
                        except Exception:
                            pass
            except Exception:
                try:
                    keys = redis_client.keys(pattern)
                    for k in keys:
                        try:
                            redis_client.delete(k)
                        except Exception:
                            pass
                except Exception:
                    pass

        cut_set_key = f"cut-stroke-ids:{roomId}"
        try:
            redis_client.delete(cut_set_key)
        except Exception:
            pass
    except Exception:
        logger.exception("Failed to reset redis undo/redo keys during clear")

    marker_rec = {
        "type": "clear_marker",
        "roomId": roomId,
        "user": claims.get("username", claims.get("sub")),
        "ts": cleared_at
    }
    try:
        strokes_coll.insert_one({"asset": {"data": marker_rec}})

        payload = {
            "operation": "CREATE",
            "amount": 1,
            "signerPublicKey": SIGNER_PUBLIC_KEY,
            "signerPrivateKey": SIGNER_PRIVATE_KEY,
            "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
            "asset": {"data": marker_rec}
        }
        try:
            commit_transaction_via_graphql(payload)
        except Exception:
            logger.exception("GraphQL commit failed for clear_marker, continuing with Mongo insert only")
    except Exception:
        logger.exception("Failed to persist clear marker")

    try:
        push_to_room(roomId, "canvas_cleared", {
            "roomId": roomId,
            "clearedAt": cleared_at,
            "user": claims.get("username", claims.get("sub"))
        })
    except Exception:
        logger.exception("Failed to push canvas_cleared to room")

    return jsonify({"status": "ok", "clearedAt": cleared_at})

@rooms_bp.route("/rooms/<roomId>", methods=["GET"])
@require_auth
@require_room_access(room_id_param="roomId")
def get_room_details(roomId):
    """
    Get detailed information about a specific room.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room access required via @require_room_access
    - Returns room metadata, member list, permissions
    - Auto-joins public rooms if not already a member
    """
    user = g.current_user
    claims = g.token_claims
    room = g.current_room
    
    try:
        user_sub = claims.get("sub")
        room_type = room.get("type")
        owner = room.get("ownerId")
        share_entry = None
        try:
            share_entry = shares_coll.find_one({"roomId": str(room["_id"]), "$or": [{"userId": user_sub}, {"username": user_sub}]})
        except Exception:
            share_entry = None
        logger.info(f"get_room_details: roomId={roomId} user={user_sub} owner={owner} room_type={room_type} share_entry={bool(share_entry)}")
    except Exception:
        logger.exception("get_room_details: diagnostic logging failed")

    if room.get("type") in ("private","secure"):
        if not _ensure_member(claims["sub"], room):
            return jsonify({"status":"error","message":"Forbidden"}), 403
    else:
        try:
            if not _ensure_member(claims["sub"], room):
                try:
                    shares_coll.update_one(
                        {"roomId": str(room["_id"]), "userId": claims["sub"]},
                        {"$set": {"roomId": str(room["_id"]), "userId": claims["sub"], "username": claims.get("username"), "role": "editor"}},
                        upsert=True
                    )
                except Exception:
                    logger.exception("auto-join failed for user %s room %s", claims.get("sub"), str(room.get("_id")))
        except Exception:
            pass
    return jsonify({"status":"ok","room":{
        "id": str(room["_id"]),
        "name": room.get("name"),
        "type": room.get("type"),
        "description": room.get("description"),
        "ownerId": room.get("ownerId"),
        "ownerName": room.get("ownerName"),
        "archived": bool(room.get("archived", False)),
        "myRole": (lambda: (
            "owner" if str(room.get("ownerId")) == claims["sub"] else (
                (shares_coll.find_one({"roomId": str(room["_id"]), "$or": [{"userId": claims["sub"]}, {"username": claims["sub"]}]}) or {}).get("role")
            )
        ))(),
        "createdAt": room.get("createdAt"),
        "updatedAt": room.get("updatedAt")
    }})

@rooms_bp.route("/rooms/<roomId>/members", methods=["GET"])
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

@rooms_bp.route("/rooms/<roomId>/permissions", methods=["PATCH"])
@require_auth
@require_room_access(room_id_param="roomId")
@validate_request_data({
    "userId": {"validator": validate_member_id, "required": True},
    "role": {"validator": validate_optional_string(), "required": False}
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
            if _notification_allowed_for(target_user_id, 'removed'):
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
        if _notification_allowed_for(target_user_id, 'role_changed'):
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
            if _notification_allowed_for(target_user_id, 'ownership_transfer'):
                push_to_user(target_user_id, 'notification', {
                    'type': 'ownership_transfer',
                    'message': f"You are now the owner of room '{room.get('name')}'",
                    'link': f"/rooms/{roomId}",
                    'createdAt': datetime.utcnow()
                })
        except Exception:
            pass
    return jsonify({"status":"ok","userId": target_user_id, "role": role})

@rooms_bp.route("/rooms/<roomId>", methods=["PATCH"])
@require_auth
@require_room_access(room_id_param="roomId")
@validate_request_data({
    "name": {"validator": validate_optional_string(max_length=256), "required": False},
    "description": {"validator": validate_optional_string(max_length=2000), "required": False},
    "type": {"validator": validate_room_type, "required": False},
    "archived": {"validator": lambda v: (isinstance(v, bool), "Archived must be a boolean") if not isinstance(v, bool) else (True, None), "required": False}
})
def update_room(roomId):
    """
    Update room metadata (name, description, type, archived status).
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room access required via @require_room_access
    - Input validation via @validate_request_data
    """
    user = g.current_user
    claims = g.token_claims
    room = g.current_room
    
    data = request.get_json() or {}
    is_owner = (str(room.get("ownerId")) == claims["sub"])
    caller_role = None
    if not is_owner:
        try:
            caller_role = (shares_coll.find_one({"roomId": str(room["_id"]), "$or": [{"userId": claims["sub"]}, {"username": claims["sub"]}]}) or {}).get("role")
        except Exception:
            caller_role = None
        if caller_role not in ("editor", "admin"):
            return jsonify({"status":"error","message":"Forbidden"}), 403
    
    updates = {}
    if "name" in data:
        updates["name"] = data.get("name").strip()
    
    if "description" in data:
        updates["description"] = (data.get("description") or "").strip() or None
    if "type" in data:
        t = (data.get("type") or "").lower()
        if not is_owner:
            return jsonify({"status":"error","message":"Only owner may change room type"}), 403
        if t not in ("public", "private", "secure"):
            return jsonify({"status":"error","message":"Invalid room type"}), 400
        updates["type"] = t
        if t == "public" and room.get("wrappedKey"):
            try:
                logger.info(f"Migrating encrypted strokes to plaintext for room {roomId} as it becomes public")
                rk = unwrap_room_key(room["wrappedKey"]) if room.get("wrappedKey") else None
                if rk is not None:
                    cursor = strokes_coll.find({"roomId": str(room["_id"])})
                    for it in cursor:
                        try:
                            stroke_data = None
                            if "blob" in it:
                                blob = it["blob"]
                                raw = decrypt_for_room(rk, blob)
                                stroke_data = json.loads(raw.decode())
                            elif 'asset' in it and isinstance(it['asset'], dict) and 'data' in it['asset'] and 'encrypted' in it['asset']['data']:
                                blob = it['asset']['data']['encrypted']
                                raw = decrypt_for_room(rk, blob)
                                stroke_data = json.loads(raw.decode())
                            if stroke_data:
                                try:
                                    strokes_coll.update_one({"_id": it["_id"]}, {"$set": {"stroke": stroke_data}, "$unset": {"blob": "", "asset": ""}})
                                except Exception:
                                    try:
                                        doc = it
                                        doc.pop('blob', None)
                                        doc.pop('asset', None)
                                        doc['stroke'] = stroke_data
                                        strokes_coll.replace_one({"_id": it["_id"]}, doc)
                                    except Exception:
                                        try:
                                            logger.exception(f"Failed to replace stroke doc {it.get('_id')} during migration")
                                        except Exception:
                                            logger.exception("Failed to replace stroke doc during migration")
                        except Exception:
                            continue
                else:
                    logger.warning(f"Room {roomId} had wrappedKey but failed to unwrap; skipping migration")
            except Exception:
                logging.getLogger(__name__).exception("Failed to migrate encrypted strokes for room %s", roomId)
            updates["wrappedKey"] = None
        if t in ("private", "secure") and not room.get("wrappedKey"):
            try:
                import os
                raw = os.urandom(32)
                updates["wrappedKey"] = wrap_room_key(raw)
            except Exception:
                logging.getLogger(__name__).exception("Failed to generate wrappedKey during room type change")
    if "archived" in data:
        if not is_owner:
            return jsonify({"status":"error","message":"Only owner may change archived state"}), 403
        updates["archived"] = bool(data.get("archived"))
    if not updates:
        return jsonify({"status":"error","message":"No valid fields to update"}), 400
    updates["updatedAt"] = datetime.utcnow()
    rooms_coll.update_one({"_id": ObjectId(roomId)}, {"$set": updates})
    try:
        if updates.get("type") in ("private", "secure"):
            shares_coll.update_one(
                {"roomId": str(room["_id"]), "userId": room["ownerId"]},
                {"$set": {"roomId": str(room["_id"]), "userId": room["ownerId"], "username": room.get("ownerName", updates.get("ownerName")), "role": "owner"}},
                upsert=True
            )
    except Exception:
        logger.exception("Failed to ensure owner membership after room type change")
    try:
        room_refreshed = rooms_coll.find_one({"_id": ObjectId(roomId)})
        resp_room = {
            "id": str(room_refreshed["_id"]),
            "name": room_refreshed.get("name"),
            "type": room_refreshed.get("type"),
            "description": room_refreshed.get("description"),
            "ownerId": room_refreshed.get("ownerId"),
            "ownerName": room_refreshed.get("ownerName"),
            "archived": bool(room_refreshed.get("archived", False)),
            "createdAt": room_refreshed.get("createdAt"),
            "updatedAt": room_refreshed.get("updatedAt")
        }
        return jsonify({"status": "ok", "room": resp_room})
    except Exception:
        return jsonify({"status":"ok","updated": updates})

@rooms_bp.route("/rooms/<roomId>/transfer", methods=["POST"])
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

@rooms_bp.route("/rooms/<roomId>/leave", methods=["POST"])
@require_auth
@require_room_access(room_id_param="roomId")
def leave_room(roomId):
    """
    Leave a room (remove membership).
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room access required via @require_room_access
    - Owner must transfer ownership before leaving
    """
    user = g.current_user
    claims = g.token_claims
    room = g.current_room
    user_id = claims["sub"]
    try:
        share = shares_coll.find_one({"roomId": str(room["_id"]), "$or": [{"userId": user_id}, {"username": user_id}]})
    except Exception:
        share = shares_coll.find_one({"roomId": str(room["_id"]), "userId": user_id})
    if not share:
        if room.get("type") == "public":
            logger.debug("leave_room: user %s not a member of public room %s; treating as no-op", user_id, str(room.get("_id")))
            return jsonify({"status":"ok","message":"Not a member (noop)", "removed": False}), 200
        return jsonify({"status":"error","message":"Not a member"}), 400
    if share.get("role") == "owner":
        return jsonify({"status":"error","message":"Owner must transfer ownership before leaving"}), 400
    try:
        del_q = {"roomId": str(room["_id"]), "$or": [{"userId": user_id}, {"username": user_id}]}
        shares_coll.delete_one(del_q)
    except Exception:
        shares_coll.delete_one({"roomId": str(room["_id"]), "userId": user_id})
    notifications_coll.insert_one({
        "userId": room.get("ownerId"),
        "type": "member_left",
        "message": f"{claims.get('username')} left room '{room.get('name')}'",
        "link": f"/rooms/{roomId}",
        "read": False,
        "createdAt": datetime.utcnow()
    })
    return jsonify({"status":"ok", "removed": True})

@rooms_bp.route("/rooms/<roomId>", methods=["DELETE"])
@require_auth
@require_room_owner(room_id_param="roomId")
def delete_room(roomId):
    """
    Permanently delete a room and all related data. Owner-only and irreversible.
    Best-effort cleanup: strokes, shares, invites, notifications, redis keys.
    Broadcasts a room_deleted event before removal so clients can refresh.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room ownership required via @require_room_owner
    """
    user = g.current_user
    claims = g.token_claims
    room = g.current_room

    rid = str(room.get("_id"))

    try:
        push_to_room(rid, "room_deleted", {"roomId": rid})
    except Exception:
        logger.exception("Failed to push room_deleted event for room %s", rid)

    try:
        strokes_coll.delete_many({"roomId": rid})
    except Exception:
        logger.exception("Failed to delete strokes for room %s", rid)

    try:
        shares_coll.delete_many({"roomId": rid})
    except Exception:
        logger.exception("Failed to delete shares for room %s", rid)

    try:
        invites_coll.delete_many({"roomId": rid})
    except Exception:
        logger.exception("Failed to delete invites for room %s", rid)

    try:
        notifications_coll.delete_many({"link": {"$regex": f"/rooms/{rid}"}})
    except Exception:
        logger.exception("Failed to delete notifications for room %s", rid)

    try:
        suffixes = [":undo", ":redo", ":undone_strokes"]
        for suf in suffixes:
            pattern = f"room:{rid}:*{suf}"
            try:
                for key in redis_client.scan_iter(match=pattern):
                    try:
                        redis_client.delete(key)
                    except Exception:
                        try:
                            redis_client.delete(key.decode() if hasattr(key, 'decode') else str(key))
                        except Exception:
                            pass
            except Exception:
                try:
                    keys = redis_client.keys(pattern)
                    for k in keys:
                        try:
                            redis_client.delete(k)
                        except Exception:
                            pass
                except Exception:
                    pass
        cut_set_key = f"cut-stroke-ids:{rid}"
        try:
            redis_client.delete(cut_set_key)
        except Exception:
            pass
    except Exception:
        logger.exception("Failed to cleanup redis keys for room %s", rid)

    try:
        rooms_coll.delete_one({"_id": ObjectId(roomId)})
    except Exception:
        logger.exception("Failed to delete room document %s", rid)

    try:
        marker_rec = {"type": "delete_marker", "roomId": rid, "user": claims.get("username"), "ts": int(time.time() * 1000)}
        strokes_coll.insert_one({"asset": {"data": marker_rec}})
    except Exception:
        pass

    return jsonify({"status": "ok", "deleted": rid})

@rooms_bp.route("/rooms/<roomId>/invite", methods=["POST"])
@require_auth
@require_room_owner(room_id_param="roomId")
@validate_request_data({
    "username": {"validator": validate_username, "required": True},
    "role": {"validator": validate_member_role, "required": False}
})
def invite_user(roomId):
    """
    Invite a user to a room.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room ownership required via @require_room_owner
    - Input validation via @validate_request_data
    """
    user = g.current_user
    claims = g.token_claims
    room = g.current_room
    
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room:
        return jsonify({"status":"error","message":"Room not found"}), 404
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
    query = {"status": "pending", "$or": [{"invitedUserId": claims["sub"]}]}
    if claims.get("username"):
        query["$or"].append({"invitedUsername": claims.get("username")})
    for inv in invites_coll.find(query).sort("createdAt", -1):
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
    if not (inv.get("invitedUserId") == claims["sub"] or inv.get("invitedUsername") == claims.get("username")):
        return jsonify({"status":"error","message":"Forbidden"}), 403
    if inv.get("status") != "pending":
        return jsonify({"status":"error","message":"Invite not pending"}), 400
    shares_coll.update_one(
        {"roomId": inv["roomId"], "userId": inv["invitedUserId"]},
        {"$set": {"roomId": inv["roomId"], "userId": inv["invitedUserId"], "username": inv["invitedUsername"], "role": inv["role"]}},
        upsert=True
    )
    invites_coll.update_one({"_id": ObjectId(inviteId)}, {"$set": {"status":"accepted", "respondedAt": datetime.utcnow()}})
    try:
        if _notification_allowed_for(inv["inviterId"], 'invite_response'):
            notifications_coll.insert_one({
                "userId": inv["inviterId"],
                "type": "invite_response",
                "message": f"{inv['invitedUsername']} accepted your invite to room '{inv.get('roomName')}'",
                "link": f"/rooms/{inv['roomId']}",
                "read": False,
                "createdAt": datetime.utcnow()
            })
            try:
                push_to_user(inv["inviterId"], 'notification', {'type': 'invite_response', 'message': f"{inv['invitedUsername']} accepted your invite to room '{inv.get('roomName')}'", 'link': f"/rooms/{inv['roomId']}", 'createdAt': datetime.utcnow()})
            except Exception:
                pass
    except Exception:
        try:
            notifications_coll.insert_one({
                "userId": inv["inviterId"],
                "type": "invite_response",
                "message": f"{inv['invitedUsername']} accepted your invite to room '{inv.get('roomName')}'",
                "link": f"/rooms/{inv['roomId']}",
                "read": False,
                "createdAt": datetime.utcnow()
            })
        except Exception:
            pass
    return jsonify({"status":"ok"})

@rooms_bp.route("/invites/<inviteId>/decline", methods=["POST"])
def decline_invite(inviteId):
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    inv = invites_coll.find_one({"_id": ObjectId(inviteId)})
    if not inv:
        return jsonify({"status":"error","message":"Invite not found"}), 404
    if not (inv.get("invitedUserId") == claims["sub"] or inv.get("invitedUsername") == claims.get("username")):
        return jsonify({"status":"error","message":"Forbidden"}), 403
    if inv.get("status") != "pending":
        return jsonify({"status":"error","message":"Invite not pending"}), 400
    invites_coll.update_one({"_id": ObjectId(inviteId)}, {"$set": {"status":"declined", "respondedAt": datetime.utcnow()}})
    try:
        if _notification_allowed_for(inv["inviterId"], 'invite_response'):
            notifications_coll.insert_one({
                "userId": inv["inviterId"],
                "type": "invite_response",
                "message": f"{inv['invitedUsername']} declined your invite to room '{inv.get('roomName')}'",
                "link": f"/rooms/{inv['roomId']}",
                "read": False,
                "createdAt": datetime.utcnow()
            })
            try:
                push_to_user(inv["inviterId"], 'notification', {'type': 'invite_response', 'message': f"{inv['invitedUsername']} declined your invite to room '{inv.get('roomName')}'", 'link': f"/rooms/{inv['roomId']}", 'createdAt': datetime.utcnow()})
            except Exception:
                pass
    except Exception:
        try:
            notifications_coll.insert_one({
                "userId": inv["inviterId"],
                "type": "invite_response",
                "message": f"{inv['invitedUsername']} declined your invite to room '{inv.get('roomName')}'",
                "link": f"/rooms/{inv['roomId']}",
                "read": False,
                "createdAt": datetime.utcnow()
            })
        except Exception:
            pass
    return jsonify({"status":"ok"})

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

@rooms_bp.route("/notifications/<nid>", methods=["DELETE"])
def delete_notification(nid):
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    try:
        notifications_coll.delete_one({"_id": ObjectId(nid), "userId": claims["sub"]})
    except Exception:
        return jsonify({"status":"error","message":"Failed to delete"}), 500
    return jsonify({"status":"ok"})

@rooms_bp.route("/notifications", methods=["DELETE"])
def clear_notifications():
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    try:
        notifications_coll.delete_many({"userId": claims["sub"]})
    except Exception:
        return jsonify({"status":"error","message":"Failed to clear notifications"}), 500
    return jsonify({"status":"ok"})

@rooms_bp.route("/users/me/notification_preferences", methods=["GET","PATCH"])
def notification_preferences():
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    try:
        if isinstance(claims.get("sub"), str) and len(claims.get("sub")) == 24:
            query = {"_id": ObjectId(claims.get("sub"))}
        else:
            query = {"username": claims.get("username") or claims.get("sub")}
    except Exception:
        query = {"username": claims.get("username") or claims.get("sub")}

    if request.method == "GET":
        u = users_coll.find_one(query, {"notificationPreferences": 1})
        prefs = (u or {}).get("notificationPreferences") or {}
        return jsonify({"status":"ok","preferences": prefs})

    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return jsonify({"status":"error","message":"Invalid body"}), 400
    clean = {}
    for k, v in body.items():
        if isinstance(k, str) and isinstance(v, bool):
            clean[k] = v
    try:
        users_coll.update_one(query, {"$set": {"notificationPreferences": clean}}, upsert=False)
    except Exception:
        return jsonify({"status":"error","message":"Failed to persist preferences"}), 500
    return jsonify({"status":"ok","preferences": clean})
