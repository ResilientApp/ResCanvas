from flask import Blueprint, request, jsonify
import traceback
from services.canvas_counter import get_canvas_draw_count
from services.graphql_service import commit_transaction_via_graphql
from services.db import redis_client, strokes_coll
from config import *
from middleware.rate_limit import limiter
import logging
import time
import json
from config import SIGNER_PUBLIC_KEY, SIGNER_PRIVATE_KEY, RECIPIENT_PUBLIC_KEY, RATE_LIMIT_ROOM_CLEAR_MINUTE

logger = logging.getLogger(__name__)

clear_canvas_bp = Blueprint('clear_canvas', __name__)

def _now_ms():
    return int(time.time() * 1000)

def _number(v, default=0):
    try:
        if isinstance(v, dict) and '$numberLong' in v:
            return int(v['$numberLong'])
        return int(v)
    except Exception:
        return default

def _persist_marker(id_value: str, value_field: str, value):
    """Persist a small marker object (id  value) into ResDB so it survives Redis flush."""
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

@clear_canvas_bp.route('/submitClearCanvasTimestamp', methods=['POST'])
@limiter.limit(f"{RATE_LIMIT_ROOM_CLEAR_MINUTE}/minute", key_func=lambda: request.get_json(silent=True).get('roomId', 'unknown') if request.is_json else 'unknown')
def submit_clear_canvas_timestamp():
    try:
        if not request.is_json:
            return jsonify({"status": "error", "message": "JSON body required"}), 400

        body = request.get_json(silent=True) or {}
        ts = _number(body.get('ts') or body.get('timestamp') or _now_ms())
        room_id = body.get('roomId') or body.get('room_id') or None

        try:
            res_draw_count = int(get_canvas_draw_count())
        except Exception:
            logger.exception("Failed reading canvas draw count; defaulting to 0")
            res_draw_count = 0

        if room_id:
            redis_ts_cache_key = f"last-clear-ts:{room_id}"
            redis_ts_legacy = f"clear-canvas-timestamp:{room_id}"
            resdb_ts_id = f"clear-canvas-timestamp:{room_id}"
            redis_count_key = f"res-canvas-draw-count:{room_id}"
            redis_count_legacy = f"draw_count_clear_canvas:{room_id}"
            resdb_count_id = f"res-canvas-draw-count:{room_id}"
        else:
            redis_ts_cache_key = "last-clear-ts"
            redis_ts_legacy = "clear-canvas-timestamp"
            resdb_ts_id = "clear-canvas-timestamp"
            redis_count_key = "res-canvas-draw-count"
            redis_count_legacy = "draw_count_clear_canvas"
            resdb_count_id = "res-canvas-draw-count"

        try:
            redis_client.set(redis_ts_cache_key, ts)
            redis_client.set(redis_ts_legacy, ts)
            redis_client.set(redis_count_key, res_draw_count)
            redis_client.set(redis_count_legacy, res_draw_count)
        except Exception:
            logger.exception("Failed setting Redis keys for clear markers")

        try:
            _persist_marker(resdb_count_id, "value", res_draw_count)
            _persist_marker(resdb_ts_id, "ts", ts)
            _persist_marker(redis_count_legacy, "value", res_draw_count)
        except Exception:
            logger.exception("Failed persisting clear markers to ResDB")

        try:
            if room_id:
                for pattern in (f"{room_id}:*:undo", f"{room_id}:*:redo"):
                    for key in redis_client.scan_iter(pattern):
                        try:
                            redis_client.delete(key)
                        except Exception:
                            pass
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
            else:
                for pattern in ("*:undo", "*:redo", "undo-*", "redo-*"):
                    for key in redis_client.scan_iter(pattern):
                        try:
                            redis_client.delete(key)
                        except Exception:
                            pass
        except Exception:
            logger.exception("Failed clearing undo/redo stacks for clear request (continuing)")

        return jsonify({"status": "success", "room": room_id, "resDrawCount": res_draw_count, "ts": ts}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500