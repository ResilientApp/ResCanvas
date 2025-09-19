from flask import Blueprint, request, jsonify
import traceback
from services.canvas_counter import get_canvas_draw_count
from services.graphql_service import commit_transaction_via_graphql
from services.db import redis_client, strokes_coll
from config import *
import logging
import time
import json
from config import SIGNER_PUBLIC_KEY, SIGNER_PRIVATE_KEY, RECIPIENT_PUBLIC_KEY

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
def submit_clear_canvas_timestamp():
    try:
        if not request.is_json:
            return jsonify({"status": "error", "message": "JSON body required"}), 400

        body = request.get_json(silent=True) or {}
        # Accept body ts or timestamp; fallback to server time
        ts = _number(body.get('ts') or body.get('timestamp') or _now_ms())
        room_id = body.get('roomId') or body.get('room_id') or None

        # Determine current canvas draw-count (the exclusive upper bound used by keys res-canvas-draw-<i>)
        try:
            res_draw_count = int(get_canvas_draw_count())
        except Exception:
            # fallback: if we cannot read counter, set to 0 to avoid accidentally excluding everything
            logger.exception("Failed reading canvas draw count; defaulting to 0")
            res_draw_count = 0

        # --- keys / marker ids (canonical  legacy compatibility)
        if room_id:
            # Redis cache key used by readers
            redis_ts_cache_key = f"last-clear-ts:{room_id}"
            # compatibility key (older code might read this directly)
            redis_ts_legacy = f"clear-canvas-timestamp:{room_id}"
            # ResDB/Mongo persistent id (canonical)
            resdb_ts_id = f"clear-canvas-timestamp:{room_id}"
            # canonical draw count id / redis key
            redis_count_key = f"res-canvas-draw-count:{room_id}"
            # legacy draw count id (some readers still look for this name)
            redis_count_legacy = f"draw_count_clear_canvas:{room_id}"
            resdb_count_id = f"res-canvas-draw-count:{room_id}"
        else:
            redis_ts_cache_key = "last-clear-ts"
            redis_ts_legacy = "clear-canvas-timestamp"
            resdb_ts_id = "clear-canvas-timestamp"
            redis_count_key = "res-canvas-draw-count"
            redis_count_legacy = "draw_count_clear_canvas"
            resdb_count_id = "res-canvas-draw-count"

        # 1) Set Redis markers so subsequent reads are instantaneous (set both canonical and legacy names)
        try:
            redis_client.set(redis_ts_cache_key, ts)
            redis_client.set(redis_ts_legacy, ts)
            redis_client.set(redis_count_key, res_draw_count)
            redis_client.set(redis_count_legacy, res_draw_count)
        except Exception:
            logger.exception("Failed setting Redis keys for clear markers")

        # 2) Persist markers to ResDB (so Mongo mirror can be used for recovery) - persist canonical ids and a legacy id
        try:
            _persist_marker(resdb_count_id, "value", res_draw_count)
            _persist_marker(resdb_ts_id, "ts", ts)
            # persist legacy id for compatibility (safe duplicate)
            _persist_marker(redis_count_legacy, "value", res_draw_count)
        except Exception:
            logger.exception("Failed persisting clear markers to ResDB")

        # 3) Clear undo/redo stacks/markers:
        # For room-scoped clear: only remove per-user lists and per-stroke markers for that room.
        # For global clear: remove all stacks and markers.
        try:
            if room_id:
                # delete per-user stack lists for this room: keys like "<roomId>:<user>:undo"
                for pattern in (f"{room_id}:*:undo", f"{room_id}:*:redo"):
                    for key in redis_client.scan_iter(pattern):
                        try:
                            redis_client.delete(key)
                        except Exception:
                            pass
                # delete per-stroke undo/redo markers that belong to this room (legacy style keys might be used)
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
                # global clear: delete all per-user undo/redo lists and all per-stroke markers
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