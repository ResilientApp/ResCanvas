# routes/clear_canvas.py

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
        # Ensure the request has JSON data
        if not request.is_json:
            return jsonify({
                "status": "error",
                "message": "Request Content-Type must be 'application/json'."
            }), 400

        request_data = request.json
        if not request_data:
            return jsonify({"status": "error", "message": "Invalid input"}), 400

        # Validate required fields
        if 'ts' not in request_data:
            return jsonify({"status": "error", "message": "Missing required field: ts"}), 400

        request_data['id'] = 'clear-canvas-timestamp'
        ts_value = request_data['ts']
        room_id = request_data.get('roomId')
        marker_id = f"draw_count_clear_canvas:{room_id}" if room_id else "draw_count_clear_canvas"
        count_data = {
            "id": marker_id,
            "value": ts_value,
            **({"roomId": room_id} if room_id else {})
        }

        # Prepare both GraphQL transactions
        clear_payload = {
            "operation": "CREATE",
            "amount": 1,
            "signerPublicKey": SIGNER_PUBLIC_KEY,
            "signerPrivateKey": SIGNER_PRIVATE_KEY,
            "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
            "asset": {"data": request_data}
        }
        count_payload = {
            "operation": "CREATE",
            "amount": 1,
            "signerPublicKey": SIGNER_PUBLIC_KEY,
            "signerPrivateKey": SIGNER_PRIVATE_KEY,
            "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
            "asset": {"data": count_data}
        }

        # Commit both via GraphQL
        commit_transaction_via_graphql(clear_payload)
        commit_transaction_via_graphql(count_payload)

        # Cache in Redis
        redis_client.set(request_data['id'], ts_value)
        redis_client.set(count_data['id'], count_data['value'])

        # Clear all undo/redo stacks in Redis
        for key in redis_client.scan_iter("undo-*"):
            redis_client.delete(key)
        for key in redis_client.scan_iter("redo-*"):
            redis_client.delete(key)

        return jsonify({"status": "success", "message": "timestamp submitted successfully"}), 201
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500
