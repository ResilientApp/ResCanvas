"""
Canvas service functions for ResCanvas.
"""

import logging
from .db import strokes_coll, redis_client
from .canvas_counter import get_canvas_draw_count
from .graphql_service import commit_transaction_via_graphql
from config import SIGNER_PUBLIC_KEY, SIGNER_PRIVATE_KEY, RECIPIENT_PUBLIC_KEY
import time
import json

logger = logging.getLogger(__name__)


def _now_ms():
    """Get current timestamp in milliseconds."""
    return int(time.time() * 1000)


def _persist_marker(id_value: str, value_field: str, value):
    """Persist a small marker object (id + value) into ResDB so it survives Redis flush."""
    payload = {
        "operation": "CREATE",
        "amount": 1,
        "signerPublicKey": SIGNER_PUBLIC_KEY,
        "signerPrivateKey": SIGNER_PRIVATE_KEY,
        "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
        "asset": {
            "data": {
                "id": id_value,
                value_field: value
            }
        }
    }
    try:
        commit_transaction_via_graphql(payload)
    except Exception:
        logger.exception("Failed to persist marker %s", id_value)


def clear_canvas(room_id: str) -> dict:
    """
    Clear all strokes from a canvas/room.
    
    This function:
    1. Deletes all strokes from MongoDB for the room
    2. Sets a clear timestamp marker in Redis and ResDB
    3. Clears undo/redo stacks for the room
    
    Args:
        room_id: The room ID to clear
        
    Returns:
        dict: Status dictionary with success flag and metadata
    """
    try:
        # Get current timestamp and draw count
        ts = _now_ms()
        try:
            res_draw_count = int(get_canvas_draw_count())
        except Exception:
            logger.exception("Failed reading canvas draw count; defaulting to 0")
            res_draw_count = 0
        
        # Delete all strokes from MongoDB for this room
        delete_result = strokes_coll.delete_many({"roomId": room_id})
        deleted_count = delete_result.deleted_count
        logger.info(f"Deleted {deleted_count} strokes from room {room_id}")
        
        # Set clear timestamp markers in Redis
        redis_ts_cache_key = f"last-clear-ts:{room_id}"
        redis_ts_legacy = f"clear-canvas-timestamp:{room_id}"
        resdb_ts_id = f"clear-canvas-timestamp:{room_id}"
        redis_count_key = f"res-canvas-draw-count:{room_id}"
        redis_count_legacy = f"draw_count_clear_canvas:{room_id}"
        resdb_count_id = f"res-canvas-draw-count:{room_id}"
        
        try:
            redis_client.set(redis_ts_cache_key, ts)
            redis_client.set(redis_ts_legacy, ts)
            redis_client.set(redis_count_key, res_draw_count)
            redis_client.set(redis_count_legacy, res_draw_count)
        except Exception:
            logger.exception("Failed setting Redis keys for clear markers")
        
        # Persist markers to ResDB
        try:
            _persist_marker(resdb_count_id, "value", res_draw_count)
            _persist_marker(resdb_ts_id, "ts", ts)
            _persist_marker(redis_count_legacy, "value", res_draw_count)
        except Exception:
            logger.exception("Failed persisting clear markers to ResDB")
        
        # Clear undo/redo stacks for this room
        try:
            # Clear room-specific undo/redo keys
            for pattern in (f"{room_id}:*:undo", f"{room_id}:*:redo"):
                for key in redis_client.scan_iter(pattern):
                    try:
                        redis_client.delete(key)
                    except Exception:
                        pass
            
            # Clear generic undo/redo keys for this room
            for key in redis_client.scan_iter("undo-*"):
                try:
                    data = redis_client.get(key)
                    if not data:
                        continue
                    rec = json.loads(data)
                    if rec.get("roomId") == room_id:
                        redis_client.delete(key)
                except Exception:
                    pass
            
            for key in redis_client.scan_iter("redo-*"):
                try:
                    data = redis_client.get(key)
                    if not data:
                        continue
                    rec = json.loads(data)
                    if rec.get("roomId") == room_id:
                        redis_client.delete(key)
                except Exception:
                    pass
        except Exception:
            logger.exception("Failed clearing undo/redo stacks for room %s", room_id)
        
        return {
            "success": True,
            "room_id": room_id,
            "deleted_count": deleted_count,
            "timestamp": ts,
            "draw_count": res_draw_count
        }
    
    except Exception as e:
        logger.exception("Failed to clear canvas for room %s", room_id)
        return {
            "success": False,
            "error": str(e),
            "room_id": room_id
        }
