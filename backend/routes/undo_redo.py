# routes/undo_redo.py

from flask import Blueprint, jsonify, request
import json
import time
import traceback
import logging
from services.db import redis_client
from services.graphql_service import commit_transaction_via_graphql
from config import *

logger = logging.getLogger(__name__)

undo_redo_bp = Blueprint('undo_redo', __name__)

@undo_redo_bp.route('/checkUndoRedo', methods=['GET'])
def check_undo_redo():
    user_id = request.args.get("userId")
    if not user_id:
        return jsonify({"status": "error", "message": "User ID required"}), 400

    # Fetch undo/redo stacks from Redis
    undo_available = redis_client.llen(f"{user_id}:undo") > 0
    redo_available = redis_client.llen(f"{user_id}:redo") > 0

    return jsonify({"undoAvailable": undo_available, "redoAvailable": redo_available}), 200

# POST endpoint: Undo operation
@undo_redo_bp.route('/undo', methods=['POST'])
def undo_action():
    try:
        data = request.json
        user_id = data.get("userId")
        if not user_id:
            return jsonify({"status": "error", "message": "User ID required"}), 400

        undo_stack = redis_client.lrange(f"{user_id}:undo", 0, -1)
        if not undo_stack:
            return jsonify({"status": "error", "message": "Nothing to undo"}), 400

        raw = redis_client.lpop(f"{user_id}:undo")
        stroke_object = json.loads(raw)
        
        stroke_object["undone"] = True
        stroke_object["ts"]     = int(time.time() * 1000)
        logger.error("Re-undo stroke object")
        logger.error(stroke_object)

        undo_wrapper = {
            "id":                f"undo-{stroke_object['id']}",
            "user":              user_id,
            "ts":                stroke_object["ts"],
            "deletion_date_flag":"",
            "undone":            True,
            "value":             json.dumps(stroke_object)
        }

        redis_client.lpush(f"{user_id}:redo", json.dumps(stroke_object))
        redis_client.set(undo_wrapper["id"], json.dumps(undo_wrapper))

        prep = {
            "operation": "CREATE",
            "amount": 1,
            "signerPublicKey": SIGNER_PUBLIC_KEY,
            "signerPrivateKey": SIGNER_PRIVATE_KEY,
            "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
            "asset": { "data": stroke_object }
        }
        commit_transaction_via_graphql(prep)

        return jsonify({"status": "success", "message": "Undo successful"}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

# POST endpoint: Redo operation
@undo_redo_bp.route('/redo', methods=['POST'])
def redo_action():
    try:
        data = request.json
        user_id = data.get("userId")
        if not user_id:
            return jsonify({"status": "error", "message": "User ID required"}), 400

        redo_stack = redis_client.lrange(f"{user_id}:redo", 0, -1)
        if not redo_stack:
            return jsonify({"status": "error", "message": "Nothing to redo"}), 400

        raw = redis_client.lpop(f"{user_id}:redo")
        stroke_object = json.loads(raw)
        
        stroke_object.pop("undone", None)
        stroke_object["ts"]     = int(time.time() * 1000)
        logger.error("Re-redo stroke object:", stroke_object)

        redo_wrapper = {
            "id":                f"redo-{stroke_object['id']}",
            "user":              user_id,
            "ts":                stroke_object["ts"],
            "deletion_date_flag":"",
            "undone":            False,
            "value":             json.dumps(stroke_object)
        }

        redis_client.lpush(f"{user_id}:undo", json.dumps(stroke_object))
        redis_client.set(redo_wrapper["id"], json.dumps(redo_wrapper))

        prep = {
            "operation": "CREATE",
            "amount": 1,
            "signerPublicKey": SIGNER_PUBLIC_KEY,
            "signerPrivateKey": SIGNER_PRIVATE_KEY,
            "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
            "asset": { "data": stroke_object }
        }
        commit_transaction_via_graphql(prep)

        return jsonify({"status": "success", "message": "Redo successful"}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500
