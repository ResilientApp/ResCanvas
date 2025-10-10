from flask import jsonify, g, request
from bson import ObjectId
import json
import time
import logging
from services.db import shares_coll, strokes_coll, redis_client
from services.socketio_service import push_to_room
from services.graphql_service import commit_transaction_via_graphql
from config import SIGNER_PUBLIC_KEY, SIGNER_PRIVATE_KEY, RECIPIENT_PUBLIC_KEY
from middleware.auth import require_auth, require_room_access

logger = logging.getLogger(__name__)

@require_auth
@require_room_access(room_id_param="roomId")
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

@require_auth
@require_room_access(room_id_param="roomId")
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
