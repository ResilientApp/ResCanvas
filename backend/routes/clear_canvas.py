
# routes/clear_canvas.py - patched to use per-room draw-count only (no timestamp)
from flask import Blueprint, jsonify, request
import traceback
from services.canvas_counter import get_canvas_draw_count
from services.graphql_service import commit_transaction_via_graphql
from services.db import redis_client
from config import *
import logging

logger = logging.getLogger(__name__)

clear_canvas_bp = Blueprint('clear_canvas', __name__)

@clear_canvas_bp.route('/submitClearCanvasTimestamp', methods=['POST'])
def submit_clear_timestamp():
    try:
        payload = request.get_json(force=True) or {}
        roomId = payload.get('roomId')

        # Use current draw count (global sequence) as the marker for clearing this room.
        draw_count = get_canvas_draw_count()

        marker_id = f"draw_count_clear_canvas:{roomId}" if roomId else "draw_count_clear_canvas"

        # Atomically set draw-count and clear undo/redo stacks for the room
        # Note: use pipeline transaction for atomicity
        pipe = redis_client.pipeline(transaction=True)
        pipe.set(marker_id, draw_count)
        # Clear only the undo/redo stacks for this room (namespaced by roomId) if provided
        if roomId:
            # keys for per-room undo/redo use pattern "{roomId}:user:undo" etc., so remove any keys that start with "{roomId}:"
            for k in redis_client.scan_iter(f"{roomId}:*"):
                if ':undo' in k.decode() or ':redo' in k.decode():
                    redis_client.delete(k)
        else:
            # global clear: clear all undo/redo stacks
            for key in redis_client.scan_iter("undo-*"):
                redis_client.delete(key)
            for key in redis_client.scan_iter("redo-*"):
                redis_client.delete(key)

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
                    **({"roomId": roomId} if roomId else {})
                }}
            }
            commit_transaction_via_graphql(count_payload)
        except Exception as e:
            logger.exception("commit_transaction_via_graphql for clear failed (continuing): %s", e)

        return ('', 201)
    except Exception as e:
        traceback.print_exc()
        return jsonify({'status': 'error', 'message': str(e)}), 500
