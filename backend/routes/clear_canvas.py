# routes/clear_canvas.py
from flask import Blueprint, jsonify, request
import traceback, time, logging
from services.canvas_counter import get_canvas_draw_count
from services.graphql_service import commit_transaction_via_graphql
from services.db import redis_client
from config import SIGNER_PUBLIC_KEY, SIGNER_PRIVATE_KEY, RECIPIENT_PUBLIC_KEY

logger = logging.getLogger(__name__)
clear_canvas_bp = Blueprint('clear_canvas', __name__)

@clear_canvas_bp.route('/submitClearCanvasTimestamp', methods=['POST'])
def submit_clear_timestamp():
    """Record a 'clear canvas' marker.
    We persist TWO markers:
      1) clear-canvas-timestamp: epoch millis of when clear occurred (for TS-based filtering)
      2) draw_count_clear_canvas or draw_count_clear_canvas:{roomId}: the current draw-count (for Redis key range)
    We also reset all undo/redo stacks in Redis.
    Optional JSON body may include {"roomId": "..."} for room-scoped clear.
    """
    try:
        body = request.get_json(force=True, silent=True) or {}
        room_id = body.get('roomId') or request.args.get('roomId')

        # 1) Timestamp marker (ms since epoch)
        ts_ms = int(time.time() * 1000)
        ts_asset = {
            'amount': 1,
            'signerPublicKey': SIGNER_PUBLIC_KEY,
            'signerPrivateKey': SIGNER_PRIVATE_KEY,
            'recipientPublicKey': RECIPIENT_PUBLIC_KEY,
            'asset': {'data': {'id': 'clear-canvas-timestamp', 'ts': ts_ms}}
        }
        commit_transaction_via_graphql(ts_asset)
        redis_client.set('clear-canvas-timestamp', ts_ms)

        # 2) Draw-count marker (global or room-scoped)
        count = get_canvas_draw_count()
        marker_id = f"draw_count_clear_canvas:{room_id}" if room_id else "draw_count_clear_canvas"
        count_asset = {
            'amount': 1,
            'signerPublicKey': SIGNER_PUBLIC_KEY,
            'signerPrivateKey': SIGNER_PRIVATE_KEY,
            'recipientPublicKey': RECIPIENT_PUBLIC_KEY,
            'asset': {'data': {'id': marker_id, 'value': count}}
        }
        commit_transaction_via_graphql(count_asset)
        redis_client.set(marker_id, int(count))

        # Clear undo/redo stacks (global & per-room)
        for key in redis_client.scan_iter("undo-*"):
            redis_client.delete(key)
        for key in redis_client.scan_iter("redo-*"):
            redis_client.delete(key)
        for key in redis_client.scan_iter("*:*:undo"):
            redis_client.delete(key)
        for key in redis_client.scan_iter("*:*:redo"):
            redis_client.delete(key)

        return jsonify({'status':'success', 'timestamp': ts_ms, 'count': count}), 201
    except Exception as e:
        logger.exception("submitClearCanvasTimestamp failed")
        return jsonify({'status':'error','message': str(e)}), 500
