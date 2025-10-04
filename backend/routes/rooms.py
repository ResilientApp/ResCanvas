# routes/rooms.py
from flask import Blueprint, request, jsonify
from bson import ObjectId
from datetime import datetime
import json, time, traceback, logging
from services.db import rooms_coll, shares_coll, users_coll, strokes_coll, redis_client, invites_coll, notifications_coll
from services.socketio_service import push_to_user, push_to_room
from services.crypto_service import wrap_room_key, unwrap_room_key, encrypt_for_room, decrypt_for_room
from services.graphql_service import commit_transaction_via_graphql, GraphQLService
import os
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
    """Return True if the given authenticated identity corresponds to a member.

    Historically the app accepted a permissive fallback auth where `sub` was a
    username (e.g. "alice") while the modern JWT `sub` is the user's ObjectId
    string. Membership documents were created under both schemes, so check both
    forms (userId and username) to remain backward-compatible.
    """
    # Quick owner equality check - ownerId may be stored as username or as ObjectId string
    if room.get("ownerId") == user_id:
        return True
    # Also allow matching by username if claims provided a username-like value
    try:
        # If user_id looks like an ObjectId hex (24 chars) the username variant
        # may still be stored in the shares as the original username; check both.
        # Check the shares_coll for either userId == user_id OR username == user_id
        if shares_coll.find_one({"roomId": str(room["_id"]), "$or": [{"userId": user_id}, {"username": user_id}] } ):
            return True
    except Exception:
        # Fall back to a simple lookup by userId only if the composite query fails
        try:
            return shares_coll.find_one({"roomId": str(room["_id"]), "userId": user_id}) is not None
        except Exception:
            return False
    return False

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

    room = {
        "name": name,
        "type": rtype,
        "description": description,
        "archived": False,
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
        rid = str(r["_id"])
        # Calculate member count based on shares collection.
        # The shares_coll stores an explicit membership record for the owner (created at room creation),
        # so counting share documents for the room gives the true member count. Previously we added +1
        # which double-counted the owner.
        member_count = shares_coll.count_documents({"roomId": rid})
        # determine this caller's role in the room (owner/admin/editor/viewer)
        my_role = None
        try:
            # prefer direct owner match
            if str(r.get("ownerId")) == claims["sub"]:
                my_role = "owner"
            else:
                # check shares collection for either userId or username
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


@rooms_bp.route("/rooms/<roomId>/admin/fill_wrapped_key", methods=["POST"])
def admin_fill_wrapped_key(roomId):
    """
    Admin helper: generate a per-room key and wrap it with the master key for
    private/secure rooms that lack a wrappedKey. Protected by ADMIN_SECRET env var.
    Body: { "adminSecret": "..." }
    """
    import os as _os
    admin_secret = _os.getenv("ADMIN_SECRET")
    body = request.get_json(silent=True) or {}
    if not admin_secret or body.get("adminSecret") != admin_secret:
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
def post_stroke(roomId):
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room: return jsonify({"status":"error","message":"Room not found"}), 404
    # Only enforce membership for private/secure rooms; public rooms are open to any authenticated user
    if room.get("type") in ("private", "secure") and not _ensure_member(claims["sub"], room):
        return jsonify({"status":"error","message":"Forbidden"}), 403

    payload = request.get_json(force=True)  # {stroke:{...}, signature?, signerPubKey?}
    stroke = payload["stroke"]
    stroke["roomId"] = roomId
    stroke["user"]   = claims["username"]
    stroke["ts"]     = int(time.time() * 1000)
    
    # Normalize id field - support both 'id' and 'drawingId'
    if "drawingId" in stroke and "id" not in stroke:
        stroke["id"] = stroke["drawingId"]
    elif "id" not in stroke and "drawingId" not in stroke:
        stroke["id"] = f"stroke_{stroke['ts']}_{claims['username']}"

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
        # wrappedKey may be absent or invalid if the room was created before
        # per-room key wrapping was implemented or if the master key was rotated.
        # Fail gracefully with a helpful error rather than letting unwrap_room_key
        # raise and produce a 500 with an unclear traceback.
        if not room.get("wrappedKey"):
            # Attempt a safe automatic backfill: only create a new wrappedKey if
            # there are NO existing encrypted blobs for this room. This keeps the
            # UX seamless for users while avoiding accidental data-loss in rooms
            # that already contain encrypted data under a previous per-room key.
            try:
                enc_count = strokes_coll.count_documents({"roomId": roomId, "$or": [{"blob": {"$exists": True}}, {"asset.data.encrypted": {"$exists": True}}]})
            except Exception:
                enc_count = 0

            if enc_count == 0:
                # Safe to create a fresh per-room key and persist it
                try:
                    raw = os.urandom(32)
                    wrapped_new = wrap_room_key(raw)
                    rooms_coll.update_one({"_id": room["_id"]}, {"$set": {"wrappedKey": wrapped_new}})
                    # refresh local room variable so unwrap uses the new value
                    room["wrappedKey"] = wrapped_new
                    # use module-level logger (avoid rebinding logger inside function)
                    logger.info("post_stroke: auto-created wrappedKey for room %s", roomId)
                except Exception as e:
                    # use module-level logger (avoid rebinding logger inside function)
                    logger.exception("post_stroke: failed to auto-create wrappedKey for room %s: %s", roomId, e)
                    
                    return jsonify({"status": "error", "message": "Failed to create room encryption key; contact administrator"}), 500
            else:
                # use module-level logger (avoid rebinding logger inside function)
                logger.error("post_stroke: room %s missing wrappedKey and has %d encrypted blobs; cannot auto-fill", roomId, enc_count)
                return jsonify({"status": "error", "message": "Room encryption key missing; contact administrator"}), 500
        try:
            rk = unwrap_room_key(room["wrappedKey"])
        except Exception as e:
            # use module-level logger (avoid rebinding logger inside function)
            logger.exception("post_stroke: failed to unwrap room key for room %s: %s", roomId, e)
            return jsonify({"status": "error", "message": "Invalid room encryption key; contact administrator"}), 500
        enc = encrypt_for_room(rk, json.dumps(stroke).encode())
        asset_data = {"roomId": roomId, "type": room["type"], "encrypted": enc}
        # keep a small Mongo cache for quick reloads
        strokes_coll.insert_one({"roomId": roomId, "ts": stroke["ts"], "blob": enc})
    else:
        asset_data = {"roomId": roomId, "type": "public", "stroke": stroke}
        strokes_coll.insert_one({"roomId": roomId, "ts": stroke["ts"], "stroke": stroke})

    # Handle cut records - check if this stroke represents a cut operation
    try:
        # Check the pathData for cut record markers
        path_data = stroke.get("pathData")
        if isinstance(path_data, dict) and path_data.get("tool") == "cut" and path_data.get("cut") == True:
            # This is a cut record, extract original stroke IDs
            orig_stroke_ids = path_data.get("originalStrokeIds") or []
            if orig_stroke_ids:
                cut_set_key = f"cut-stroke-ids:{roomId}"
                redis_client.sadd(cut_set_key, *[str(sid) for sid in orig_stroke_ids])
                logger.info(f"Added {len(orig_stroke_ids)} stroke IDs to cut set for room {roomId}")
    except Exception as e:
        logger.warning(f"post_stroke: failed to process cut record: {e}")

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
    # Skip undo stack for replacement segments (they're part of the cut operation)
    # Accept skip flag either as a top-level payload field or embedded in the stroke object
    skip_undo_stack = payload.get("skipUndoStack", False) or stroke.get("skipUndoStack", False)
    if not skip_undo_stack:
        key_base = f"room:{roomId}:{claims['sub']}"
        redis_client.lpush(f"{key_base}:undo", json.dumps(stroke))
        redis_client.delete(f"{key_base}:redo")

    # Broadcast the new stroke to all users in the room via Socket.IO
    push_to_room(roomId, "new_stroke", {
        "roomId": roomId,
        "stroke": stroke,
        "user": claims["username"],
        "timestamp": stroke["ts"]
    })

    return jsonify({"status":"ok"})

@rooms_bp.route("/rooms/<roomId>/strokes", methods=["GET"])
def get_strokes(roomId):
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room: return jsonify({"status":"error","message":"Room not found"}), 404
    # Diagnostic logging to help debug membership/CORS issues seen by the client
    try:
        logger = logging.getLogger(__name__)
        user_sub = claims.get("sub")
        room_type = room.get("type")
        owner = room.get("ownerId")
        is_member = _ensure_member(user_sub, room)
        logger.info(f"get_strokes: roomId={roomId} user={user_sub} owner={owner} room_type={room_type} is_member={is_member}")
    except Exception:
        logger = logging.getLogger(__name__)
        logger.exception("get_strokes: failed to log diagnostic info")

    # Only enforce membership for private/secure rooms; public rooms are readable by any authenticated user
    if room.get("type") in ("private", "secure") and not _ensure_member(claims["sub"], room):
        return jsonify({"status":"error","message":"Forbidden"}), 403

    # This is a simplified version. A robust implementation would fetch from ResDB/GraphQL
    # and handle pagination, especially for large canvases.
    items = list(strokes_coll.find({"roomId": roomId}).sort("ts", 1))
    
    # Get undo/redo state for ALL USERS in the room (not just this user)
    # This is critical for multi-user sync - when User A undoes, User B must see it
    user_id = claims['sub']
    undone_strokes = set()
    
    # Get cut stroke IDs from Redis
    cut_set_key = f"cut-stroke-ids:{roomId}"
    try:
        raw_cut = redis_client.smembers(cut_set_key)
        cut_stroke_ids = set(x.decode() if isinstance(x, (bytes, bytearray)) else str(x) for x in (raw_cut or set()))
    except Exception as e:
        logger.warning(f"Failed to get cut stroke IDs: {e}")
        cut_stroke_ids = set()
    
    # CRITICAL FIX: Check Redis for undone strokes from ALL USERS in this room
    # Pattern: room:{roomId}:*:undone_strokes (wildcard to match all user IDs)
    try:
        # Get all keys matching the pattern for this room (all users)
        pattern = f"room:{roomId}:*:undone_strokes"
        for key in redis_client.scan_iter(match=pattern):
            undone_keys = redis_client.smembers(key)
            for stroke_key in undone_keys:
                undone_strokes.add(stroke_key.decode('utf-8') if isinstance(stroke_key, bytes) else str(stroke_key))
        logger.debug(f"Loaded {len(undone_strokes)} undone strokes from Redis for room {roomId}")
    except Exception as e:
        logger.warning(f"Redis lookup for undone strokes failed: {e}")

    # CRITICAL FIX: MongoDB aggregation for ALL USERS in the room (not just this user)
    # This ensures undo/redo markers from all users are considered
    try:
        # Find the latest undo/redo markers for each stroke from ANY user in this room
        pipeline = [
            {
                "$match": {
                    "asset.data.roomId": roomId,
                    "asset.data.type": {"$in": ["undo_marker", "redo_marker"]}
                    # NOTE: Removed user filter - we want markers from ALL users
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


    if room["type"] in ("private","secure"):
        # Try to unwrap the per-room key; if absent/invalid, continue gracefully
        rk = None
        try:
            if room.get("wrappedKey"):
                rk = unwrap_room_key(room["wrappedKey"])
        except Exception:
            logger = logging.getLogger(__name__)
            logger.exception("get_strokes: failed to unwrap room key for room %s", roomId)
            rk = None

        out = []
        for it in items:
            try:
                stroke_data = None
                # Encrypted blob (requires rk)
                if "blob" in it:
                    if rk is None:
                        # cannot decrypt without room key; skip
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
                # Plaintext stroke (public format cached in Mongo)
                elif "stroke" in it:
                    stroke_data = it["stroke"]
                elif 'asset' in it and 'data' in it['asset'] and 'stroke' in it['asset']['data']:
                    stroke_data = it['asset']['data']['stroke']
                else:
                    continue

                stroke_id = stroke_data.get("id") or stroke_data.get("drawingId")
                # Also support grouping: child strokes may have a parentPasteId which
                # should be considered undone if the parent paste-record was undone.
                parent_paste_id = None
                try:
                    # Robustly extract parentPasteId: it may be present at the top-level
                    # or embedded inside pathData when pathData is a dict. If pathData is
                    # an array (freehand strokes), avoid calling .get on a list and
                    # instead ignore it — the top-level parentPasteId is preferred.
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

                # If parent paste id is present and that id is in the undone set,
                # treat this stroke as undone/filtered.
                parent_undone = parent_paste_id in undone_strokes if parent_paste_id else False

                if stroke_id and not parent_undone and stroke_id not in undone_strokes and stroke_id not in cut_stroke_ids:
                    out.append(stroke_data)
            except Exception:
                # Skip strokes that fail to decrypt or parse
                continue
        return jsonify({"status":"ok","strokes": out})
    else:
        # Public rooms
        filtered_strokes = []
        for it in items:
            try:
                stroke_data = None
                if 'stroke' in it:
                    stroke_data = it["stroke"]
                elif 'asset' in it and 'data' in it['asset']:
                    if 'stroke' in it['asset']['data']:
                        stroke_data = it['asset']['data']['stroke']
                    elif 'value' in it['asset']['data']: # Legacy format
                        stroke_data = json.loads(it['asset']['data'].get('value', '{}'))
                else:
                    continue

                stroke_id = stroke_data.get("id") or stroke_data.get("drawingId")
                # Check for parentPasteId and treat child strokes as undone if their parent was undone
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
                    filtered_strokes.append(stroke_data)
            except Exception:
                continue # Skip malformed strokes
        
        return jsonify({"status":"ok","strokes": filtered_strokes})

@rooms_bp.route("/rooms/<roomId>/undo", methods=["POST"])
def room_undo(roomId):
    logger.info(f"Room undo request for room {roomId}")
    claims = _authed_user()
    if not claims:
        logger.warning("Unauthorized undo attempt.")
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    
    user_id = claims['sub']
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

        # Check if this is a cut record being undone
        path_data = stroke.get("pathData")
        is_cut_record = (isinstance(path_data, dict) and 
                        path_data.get("tool") == "cut" and 
                        path_data.get("cut") == True)
        
        if is_cut_record:
            # This is a cut record - remove the original stroke IDs from the cut set
            # AND add replacement segment IDs to the cut set (so they get filtered out too)
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

        # Move to redo stack
        redis_client.lpush(f"{key_base}:redo", last_raw)
        logger.info("Moved stroke to redo stack.")
        
        # Add to the set of undone strokes in Redis
        redis_client.sadd(f"{key_base}:undone_strokes", stroke_id)
        logger.info("Added stroke to undone_strokes set in Redis.")

        # Persist an undo marker to MongoDB via GraphQL
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
            # Also save marker to local mongo for faster queries
            strokes_coll.insert_one({"asset": marker_asset})
            commit_transaction_via_graphql(payload)
            logger.info("Successfully persisted undo marker.")
        except Exception as e:
            logger.exception("GraphQL commit failed for room_undo marker")
            # Optionally, revert the Redis operation if consistency is critical
            redis_client.lpush(f"{key_base}:undo", last_raw)
            redis_client.lrem(f"{key_base}:redo", 1, last_raw)
            redis_client.srem(f"{key_base}:undone_strokes", stroke_id)
            return jsonify({"status":"error", "message":"Failed to persist undo action"}), 500

        # Broadcast undo event
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
        # If any error occurs, revert the pop from the undo stack
        if last_raw:
            redis_client.lpush(f"{key_base}:undo", last_raw)
        return jsonify({"status":"error","message":f"Failed to undo: {str(e)}"}), 500

@rooms_bp.route("/rooms/<roomId>/undo_redo_status", methods=["GET"])
def get_undo_redo_status(roomId):
    """Get the current undo/redo stack sizes for the user in this room"""
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    
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
def room_redo(roomId):
    claims = _authed_user()
    if not claims: return jsonify({"status":"error","message":"Unauthorized"}), 401
    
    user_id = claims['sub']
    key_base = f"room:{roomId}:{user_id}"

    last_raw = redis_client.lpop(f"{key_base}:redo")
    if not last_raw: return jsonify({"status":"noop"})
    
    try:
        stroke = json.loads(last_raw)
        stroke_id = stroke.get("id") or stroke.get("drawingId")
        if not stroke_id:
            raise ValueError("Stroke ID missing")

        # Check if this is a cut record being redone
        path_data = stroke.get("pathData")
        is_cut_record = (isinstance(path_data, dict) and 
                        path_data.get("tool") == "cut" and 
                        path_data.get("cut") == True)
        
        if is_cut_record:
            # This is a cut record - add the original stroke IDs back to the cut set
            # AND remove replacement segment IDs from the cut set (so they become visible again)
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

        # Re-add to undo stack
        redis_client.lpush(f"{key_base}:undo", last_raw)
        
        # Remove from the set of undone strokes in Redis
        redis_client.srem(f"{key_base}:undone_strokes", stroke_id)

        # Persist a redo marker to MongoDB via GraphQL
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
            # Optionally, revert the Redis operation
            redis_client.lpop(f"{key_base}:undo")
            redis_client.rpush(f"{key_base}:redo", last_raw)
            redis_client.sadd(f"{key_base}:undone_strokes", stroke_id)
            return jsonify({"status":"error", "message":"Failed to persist redo action"}), 500

        # Broadcast redo event
        push_to_room(roomId, "stroke_redone", {
            "roomId": roomId,
            "stroke": stroke, # Send the full stroke data so the frontend can re-render it
            "user": claims.get("username", "unknown"),
            "timestamp": ts
        })
        
        return jsonify({"status":"ok", "redone_stroke": stroke})
        
    except Exception as e:
        # If any error occurs, revert the pop from the redo stack
        if last_raw:
            redis_client.lpush(f"{key_base}:redo", last_raw)
        return jsonify({"status":"error","message":f"Failed to redo: {str(e)}"}), 500


@rooms_bp.route("/rooms/<roomId>/reset_my_stacks", methods=["POST"])
def reset_my_stacks(roomId):
    """Reset this authenticated user's undo/redo stacks for the given room.
    This endpoint is intended to be called by the client when the user refreshes
    the page so server-side undo/redo state does not leak across sessions.
    """
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    user_id = claims['sub']
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
def room_clear(roomId):
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401

    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room:
        return jsonify({"status":"error","message":"Room not found"}), 404
    if not _ensure_member(claims["sub"], room):
        return jsonify({"status":"error","message":"Forbidden"}), 403

    # Authoritative clear timestamp (server-side) in epoch ms
    cleared_at = int(time.time() * 1000)

    # Delete strokes for the room from MongoDB
    try:
        strokes_coll.delete_many({"roomId": roomId})
    except Exception:
        logger.exception("Failed to delete strokes during clear")
        return jsonify({"status":"error","message":"Failed to clear strokes"}), 500

    # Reset per-user undo/redo lists stored in Redis for this room.
    # Pattern used for per-user keys elsewhere: f"room:{roomId}:{userId}:undo" / ":redo"
    try:
        # More robustly delete the per-user undo/redo and undone_strokes keys
        suffixes = [":undo", ":redo", ":undone_strokes"]
        for suf in suffixes:
            pattern = f"room:{roomId}:*{suf}"
            try:
                for key in redis_client.scan_iter(match=pattern):
                    try:
                        redis_client.delete(key)
                    except Exception:
                        try:
                            # fallback if key is bytes/str mismatch
                            redis_client.delete(key.decode() if hasattr(key, 'decode') else str(key))
                        except Exception:
                            pass
            except Exception:
                # Some redis clients may not support scan_iter as used; fallback to keys()
                try:
                    keys = redis_client.keys(pattern)
                    for k in keys:
                        try:
                            redis_client.delete(k)
                        except Exception:
                            pass
                except Exception:
                    pass

        # Also reset any cut-stroke set for the room
        cut_set_key = f"cut-stroke-ids:{roomId}"
        try:
            redis_client.delete(cut_set_key)
        except Exception:
            pass
    except Exception:
        logger.exception("Failed to reset redis undo/redo keys during clear")

    # Persist a clear marker to MongoDB so the chain contains an authoritative clear event
    marker_rec = {
        "type": "clear_marker",
        "roomId": roomId,
        "user": claims.get("username", claims.get("sub")),
        "ts": cleared_at
    }
    try:
        # Insert into the strokes collection so reads can see the clear event if desired
        strokes_coll.insert_one({"asset": {"data": marker_rec}})

        # Optionally commit via GraphQL if the project relies on committed transactions
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
            # Non-fatal: log but continue. The MongoDB insertion is the authoritative local store.
            logger.exception("GraphQL commit failed for clear_marker, continuing with Mongo insert only")
    except Exception:
        logger.exception("Failed to persist clear marker")

    # Broadcast a canvas_cleared event with authoritative clearedAt so clients can reconcile
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
def get_room_details(roomId):
    claims = _authed_user()
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room:
        return jsonify({"status":"error","message":"Room not found"}), 404
    # Diagnostic logging: help trace why clients may receive Forbidden for public rooms
    try:
        logger = logging.getLogger(__name__)
        user_sub = claims.get("sub")
        room_type = room.get("type")
        owner = room.get("ownerId")
        is_member = _ensure_member(user_sub, room)
        share_entry = None
        try:
            share_entry = shares_coll.find_one({"roomId": str(room["_id"]), "$or": [{"userId": user_sub}, {"username": user_sub}]})
        except Exception:
            share_entry = None
        logger.info(f"get_room_details: roomId={roomId} user={user_sub} owner={owner} room_type={room_type} is_member={is_member} share_entry={bool(share_entry)}")
    except Exception:
        logging.getLogger(__name__).exception("get_room_details: diagnostic logging failed")

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
        "myRole": (lambda: (
            "owner" if str(room.get("ownerId")) == claims["sub"] else (
                (shares_coll.find_one({"roomId": str(room["_id"]), "$or": [{"userId": claims["sub"]}, {"username": claims["sub"]}]}) or {}).get("role")
            )
        ))(),
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
    # retentionDays removed from schema
    # allow changing the room type (public/private/secure)
    if "type" in data:
        t = (data.get("type") or "").lower()
        if t not in ("public", "private", "secure"):
            return jsonify({"status":"error","message":"Invalid room type"}), 400
        updates["type"] = t
        # If switching to public and the room currently has a wrappedKey (i.e. was private/secure),
        # attempt to migrate any encrypted strokes in MongoDB into plaintext entries so public reads work.
        if t == "public" and room.get("wrappedKey"):
            try:
                logger = logging.getLogger(__name__)
                logger.info(f"Migrating encrypted strokes to plaintext for room {roomId} as it becomes public")
                rk = unwrap_room_key(room["wrappedKey"]) if room.get("wrappedKey") else None
                if rk is not None:
                    # Iterate over all stroke documents for the room and decrypt blobs
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
                                # Replace encrypted blob/asset with a plaintext 'stroke' field so public reads will find it
                                try:
                                    strokes_coll.update_one({"_id": it["_id"]}, {"$set": {"stroke": stroke_data}, "$unset": {"blob": "", "asset": ""}})
                                except Exception:
                                    # best-effort: try a conservative update if unset fails
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
                            # Skip malformed / undecryptable entries
                            continue
                else:
                    logger.warning(f"Room {roomId} had wrappedKey but failed to unwrap; skipping migration")
            except Exception:
                logging.getLogger(__name__).exception("Failed to migrate encrypted strokes for room %s", roomId)
            # Ensure wrappedKey is removed for the now-public room
            updates["wrappedKey"] = None
        # If switching to a restricted room type and there's no wrappedKey yet,
        # generate a per-room key and wrap it for storage so private/secure
        # operations (encrypt/decrypt) can function.
        if t in ("private", "secure") and not room.get("wrappedKey"):
            try:
                import os
                raw = os.urandom(32)
                updates["wrappedKey"] = wrap_room_key(raw)
            except Exception:
                # Non-fatal: log and continue. If wrapping fails, the subsequent
                # get_strokes path will surface an error which will be visible
                # to the client thanks to the global error handler.
                logging.getLogger(__name__).exception("Failed to generate wrappedKey during room type change")
    if "archived" in data:
        updates["archived"] = bool(data.get("archived"))
    if not updates:
        return jsonify({"status":"error","message":"No valid fields to update"}), 400
    updates["updatedAt"] = datetime.utcnow()
    rooms_coll.update_one({"_id": ObjectId(roomId)}, {"$set": updates})
    # If the room is being changed to a restricted type, ensure the owner
    # retains an explicit membership record so owner access is preserved.
    try:
        if updates.get("type") in ("private", "secure"):
            shares_coll.update_one(
                {"roomId": str(room["_id"]), "userId": room["ownerId"]},
                {"$set": {"roomId": str(room["_id"]), "userId": room["ownerId"], "username": room.get("ownerName", updates.get("ownerName")), "role": "owner"}},
                upsert=True
            )
    except Exception:
        # Non-fatal: log and continue. We don't want a membership upsert failure
        # to block the room update operation. The after_request CORS handler
        # will surface any errors in the HTTP response if needed.
        logger = logging.getLogger(__name__)
        logger.exception("Failed to ensure owner membership after room type change")
    # Return the refreshed room document in the same shape as get_room_details
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
        # Fallback: return the partial updates if fetching the refreshed room fails
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


@rooms_bp.route("/rooms/<roomId>", methods=["DELETE"])
def delete_room(roomId):
    """Permanently delete a room and all related data. Owner-only and irreversible.
    Best-effort cleanup: strokes, shares, invites, notifications, redis keys.
    Broadcasts a room_deleted event before removal so clients can refresh.
    """
    claims = _authed_user()
    if not claims:
        return jsonify({"status": "error", "message": "Unauthorized"}), 401
    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room:
        return jsonify({"status": "error", "message": "Room not found"}), 404
    # only owner may delete
    if str(room.get("ownerId")) != claims["sub"]:
        return jsonify({"status": "error", "message": "Forbidden"}), 403

    rid = str(room.get("_id"))

    # Notify connected clients in the room that it will be deleted
    try:
        push_to_room(rid, "room_deleted", {"roomId": rid})
    except Exception:
        logger.exception("Failed to push room_deleted event for room %s", rid)

    # Delete strokes
    try:
        strokes_coll.delete_many({"roomId": rid})
    except Exception:
        logger.exception("Failed to delete strokes for room %s", rid)

    # Delete shares (memberships)
    try:
        shares_coll.delete_many({"roomId": rid})
    except Exception:
        logger.exception("Failed to delete shares for room %s", rid)

    # Delete invites
    try:
        invites_coll.delete_many({"roomId": rid})
    except Exception:
        logger.exception("Failed to delete invites for room %s", rid)

    # Delete notifications referencing this room (best-effort by link)
    try:
        notifications_coll.delete_many({"link": {"$regex": f"/rooms/{rid}"}})
    except Exception:
        logger.exception("Failed to delete notifications for room %s", rid)

    # Remove Redis keys (undo/redo/undone and cut sets)
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

    # Finally delete the room document
    try:
        rooms_coll.delete_one({"_id": ObjectId(roomId)})
    except Exception:
        logger.exception("Failed to delete room document %s", rid)

    # Optionally: insert a tombstone marker in strokes_coll so reads are aware (best-effort)
    try:
        marker_rec = {"type": "delete_marker", "roomId": rid, "user": claims.get("username"), "ts": int(time.time() * 1000)}
        strokes_coll.insert_one({"asset": {"data": marker_rec}})
    except Exception:
        # non-fatal
        pass

    return jsonify({"status": "ok", "deleted": rid})
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
