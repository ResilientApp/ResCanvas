
# routes/clear_canvas.py - patched to use per-room draw-count only (no timestamp)
from flask import Blueprint, jsonify, request
import traceback
from services.canvas_counter import get_canvas_draw_count
from services.graphql_service import commit_transaction_via_graphql
from services.db import redis_client
from config import *
import logging
import json

logger = logging.getLogger(__name__)

clear_canvas_bp = Blueprint('clear_canvas', __name__)

@clear_canvas_bp.route('/submitClearCanvasTimestamp', methods=['POST'])
def submit_clear_timestamp():
    try:
        payload = request.get_json(force=True) or {}
        roomId = payload.get('roomId')
        # Require roomId to avoid accidental global clears
        if not roomId:
            return jsonify({'status':'error','message':'roomId required for room-scoped clear'}), 400

        # Use current global draw count as the marker for clearing this room.
        draw_count = get_canvas_draw_count()

        marker_id = f"draw_count_clear_canvas:{roomId}"

        # Atomically set draw-count and delete per-room undo/redo lists and wrapper keys for this room
        pipe = redis_client.pipeline(transaction=True)
        pipe.set(marker_id, draw_count)

        # Delete per-room stack keys (format: "{roomId}:{user}:undo" and "{roomId}:{user}:redo")
        for k in redis_client.scan_iter(f"{roomId}:*"):
            try:
                ks = k.decode() if isinstance(k, (bytes, bytearray)) else str(k)
                if ks.endswith(":undo") or ks.endswith(":redo"):
                    pipe.delete(ks)
            except Exception:
                # skip keys we cannot decode
                continue

        # 
        # Remove any global wrapper keys (undo-*, redo-*) that belong to this room.
        # Wrapper keys are named "undo-<stroke_id>" or "redo-<stroke_id>" and their value is JSON.
        for wk in redis_client.scan_iter("undo-*"):
            try:
                raw = redis_client.get(wk)
                if not raw:
                    continue
                rec = json.loads(raw)
                # wrapper may embed the stroke in "value" as a JSON-encoded string, or in "value" field
                inner = None
                if isinstance(rec.get("value"), str):
                    try:
                        inner = json.loads(rec.get("value"))
                    except Exception:
                        inner = None
                # sometimes the wrapper directly stores fields including 'roomId'
                if inner is None:
                    inner = rec.get("roomId") and rec or None
                room_in_wrapper = None
                if inner and isinstance(inner, dict):
                    room_in_wrapper = inner.get("roomId")
                if room_in_wrapper == roomId:
                    # delete via pipeline
                    pipe.delete(wk)
            except Exception:
                continue
        for wk in redis_client.scan_iter("redo-*"):
            try:
                raw = redis_client.get(wk)
                if not raw:
                    continue
                rec = json.loads(raw)
                inner = None
                if isinstance(rec.get("value"), str):
                    try:
                        inner = json.loads(rec.get("value"))
                    except Exception:
                        inner = None
                if inner is None:
                    inner = rec.get("roomId") and rec or None
                room_in_wrapper = None
                if inner and isinstance(inner, dict):
                    room_in_wrapper = inner.get("roomId")
                if room_in_wrapper == roomId:
                    pipe.delete(wk)
            except Exception:
                continue
pipe.execute()

        # Attempt to commit an audit record via GraphQL for the clear operation.
        # This is best-effort: if GraphQL fails we still succeed locally in Redis.
        try:
            count_payload = {
                "operation": "CREATE",
                "amount": 1,
                "signerPublicKey": SIGNER_PUBLIC_KEY,
                "signerPrivateKey": SIGNER_PRIVATE_KEY,
                "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
                "asset": {"data": {
                    "id": marker_id,
                    "value": draw_count,
                    "roomId": roomId
                }}
            }
            commit_transaction_via_graphql(count_payload)
        except Exception as e:
            logger.exception("commit_transaction_via_graphql for clear failed (continuing): %s", e)

        return jsonify({'status': 'success', 'roomId': roomId, 'marker': marker_id, 'drawCount': draw_count}), 201
    except Exception as e:
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500
