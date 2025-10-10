from flask import jsonify, g, request
from bson import ObjectId
from datetime import datetime
import json
import time
import logging
from services.db import rooms_coll, shares_coll, strokes_coll, redis_client
from services.socketio_service import push_to_room
from services.crypto_service import wrap_room_key, unwrap_room_key, encrypt_for_room, decrypt_for_room
from services.graphql_service import commit_transaction_via_graphql
import os
from config import SIGNER_PUBLIC_KEY, SIGNER_PRIVATE_KEY, RECIPIENT_PUBLIC_KEY
from middleware.auth import require_auth, require_room_access, require_room_owner, validate_request_data
from middleware.validators import validate_optional_string

logger = logging.getLogger(__name__)

try:
    from routes.get_canvas_data import get_strokes_from_mongo
except Exception:
    get_strokes_from_mongo = None

@require_auth
@require_room_access(room_id_param="roomId")
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
            msg = json.dumps({
                "roomId": roomId, "user": stroke["user"], "color": stroke["color"],
                "lineWidth": stroke["lineWidth"], "pathData": stroke["pathData"], "timestamp": stroke.get("timestamp", stroke["ts"])
            }, separators=(',', ':'), sort_keys=True).encode()
            vk.verify(msg, bytes.fromhex(sig))
        except Exception:
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

@require_auth
@require_room_owner(room_id_param="roomId")
def room_clear(roomId):
    """
    Clear all strokes from a room's canvas.
    
    Server-side enforcement:
    - Authentication required via @require_auth
    - Room ownership required via @require_room_owner (only owner can clear entire canvas)
    - Viewer role cannot clear (read-only)
    - Stores clear timestamp server-side for filtering
    - Preserves strokes in MongoDB for history recall
    """
    from .auth_helpers import ensure_member
    
    user = g.current_user
    claims = g.token_claims
    room = g.current_room

    room = rooms_coll.find_one({"_id": ObjectId(roomId)})
    if not room:
        return jsonify({"status":"error","message":"Room not found"}), 404
    if not ensure_member(claims["sub"], room):
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
