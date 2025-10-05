# routes/new_line.py

from flask import Blueprint, jsonify, request
import json
import traceback
import logging
from services.canvas_counter import get_canvas_draw_count, increment_canvas_draw_count
from services.graphql_service import commit_transaction_via_graphql
from services.db import redis_client
from services.socketio_service import push_to_room, push_to_user
from config import *

logger = logging.getLogger(__name__)

new_line_bp = Blueprint('new_line', __name__)

@new_line_bp.route('/submitNewLine', methods=['POST'])
def submit_new_line():
    try:
        # Ensure the request has JSON data
        if not request.is_json:
            return jsonify({
                "status": "error",
                "message": "Request Content-Type must be 'application/json'."
            }), 400

        request_data = request.json
        user_id = request_data.get("user")
        if not request_data:
            return jsonify({"status": "error", "message": "Invalid input"}), 400

        # Validate required fields
        if 'ts' not in request_data or 'value' not in request_data or 'user' not in request_data:
            return jsonify({"status": "error", "message": "Missing required fields: ts, value or user"}), 400

        # Check if this is a cut record
        # The client should set "cut": true and include an array "originalStrokeIds"
        parsed_value = json.loads(request_data["value"])
        if parsed_value.get("cut", False) and "originalStrokeIds" in parsed_value:
            original_ids = parsed_value["originalStrokeIds"]
            # Update Redis: add these IDs to a dedicated set so that they are filtered out later.
            if original_ids:
                # Note: redis_client.sadd expects all members as separate arguments.
                redis_client.sadd("cut-stroke-ids", *original_ids)

        # Get the canvas drawing count and increment it
        res_canvas_draw_count = get_canvas_draw_count()
        request_data['id'] = "res-canvas-draw-" + str(res_canvas_draw_count)  # Adjust index
        request_data.pop('undone', None)

        logger.error("submit_new_line request_data:")
        logger.error(request_data)

        # Commit via GraphQL instead of raw REST
        # Parse the inner value first
        inner_value = json.loads(request_data["value"])
        
        full_data = {
            "id":    request_data["id"],  # Keep the res-canvas-draw-X id
            "ts":    request_data["ts"],
            "user":  request_data["user"],
            # Add all fields from the inner value EXCEPT id (to avoid overwriting)
            **{k: v for k, v in inner_value.items() if k != 'id'},
            # Preserve the original stroke id in a separate field
            "originalId": inner_value.get("id")
        }
        prep = {
            "operation": "CREATE",
            "amount": 1,
            "signerPublicKey": SIGNER_PUBLIC_KEY,
            "signerPrivateKey": SIGNER_PRIVATE_KEY,
            "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
            "asset": {"data": full_data}
        }
        txn_id = commit_transaction_via_graphql(prep)
        request_data['txnId'] = txn_id

        # Cache the new drawing in Redis
        increment_canvas_draw_count()
        cache_entry = full_data.copy()
        cache_entry['txnId'] = txn_id
        redis_client.set(cache_entry['id'], json.dumps(cache_entry))

        # ALSO save to MongoDB for Redis flush recovery
        # This ensures stroke data persists even after Redis flushes
        # Use the same nested structure that recovery expects: asset.data
        from services.db import strokes_coll
        mongo_entry = {
            'asset': {
                'data': {
                    'id': full_data['id'],  # Server-assigned res-canvas-draw-X ID
                    'roomId': request_data.get('roomId'),  # Room context
                    'ts': full_data['ts'], 
                    'timestamp': full_data.get('timestamp'),
                    'user': full_data['user'],
                    'type': 'public',
                    'value': json.dumps(full_data)  # Store the complete stroke data as JSON string
                }
            },
            'txnId': txn_id
        }
        strokes_coll.insert_one(mongo_entry)

        # Update user's undo/redo stacks
        # Store the corrected data with server-assigned ID for proper undo/redo
        undo_stack_entry = {
            "id": full_data["id"],  # Use the server-assigned res-canvas-draw-X ID
            "ts": full_data["ts"],
            "user": full_data["user"],
            "value": json.dumps(full_data),  # Store the full corrected data
            "txnId": txn_id
        }
        redis_client.lpush(f"{user_id}:undo", json.dumps(undo_stack_entry))
        redis_client.delete(f"{user_id}:redo")  # Clear redo stack

        return jsonify({"status": "success", "message": "Line submitted successfully"}), 201
    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": "GraphQL commit failed",
            "details": str(e)
        }), 500
