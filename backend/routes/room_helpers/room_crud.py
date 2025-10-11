# Certain fields (type, archived) remain owner-only. Non-owners with
# role 'editor' or 'admin' are permitted to update description and name where allowed.
from flask import jsonify, g, request
from bson import ObjectId
from datetime import datetime
import logging
import re
from services.db import rooms_coll, shares_coll, users_coll
from services.crypto_service import wrap_room_key
from middleware.auth import require_auth, require_room_access, require_room_owner, validate_request_data
from middleware.validators import (
    validate_room_name, 
    validate_room_type, 
    validate_optional_string
)

logger = logging.getLogger(__name__)

@require_auth
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
    from .auth_helpers import ensure_member
    
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
        if not ensure_member(claims["sub"], room):
            return jsonify({"status":"error","message":"Forbidden"}), 403
    else:
        try:
            if not ensure_member(claims["sub"], room):
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
        # canClear is true only for the room owner (frontend should use this to
        # disable the Clear button for non-owners). Keep server-side ownership
        # enforcement unchanged.
        "canClear": (str(room.get("ownerId")) == claims["sub"]),
        "createdAt": room.get("createdAt"),
        "updatedAt": room.get("updatedAt")
    }})

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
    from services.crypto_service import unwrap_room_key, decrypt_for_room
    
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
                from services.db import strokes_coll
                import json
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
    from services.db import notifications_coll
    notifications_coll.insert_one({
        "userId": room.get("ownerId"),
        "type": "member_left",
        "message": f"{claims.get('username')} left room '{room.get('name')}'",
        "link": f"/rooms/{roomId}",
        "read": False,
        "createdAt": datetime.utcnow()
    })
    return jsonify({"status":"ok", "removed": True})

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
    from services.db import strokes_coll, invites_coll, notifications_coll, redis_client
    from services.socketio_service import push_to_room
    import time
    
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

@require_auth
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
