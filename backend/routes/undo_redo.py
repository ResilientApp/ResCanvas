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

def _stack_base(user_id, room_id):
    # room-aware stacks when room_id is present
    return f"{room_id}:{user_id}" if room_id else f"{user_id}"

@undo_redo_bp.route('/undo', methods=['POST'])
def undo():
    try:
        data = request.get_json(force=True) or {}
        user_id = data.get("userId")
        room_id = data.get("roomId")
        if not user_id:
            return jsonify({"status":"error","message":"userId required"}), 400

        base = _stack_base(user_id, room_id)
        stack_key = f"{base}:undo"
        redo_key  = f"{base}:redo"

        raw = redis_client.lpop(stack_key)
        if not raw:
            return jsonify({"status":"success","message":"Nothing to undo"}), 200

        stroke_object = json.loads(raw)
        # canonical id must exist (submit handlers now guarantee it)
        stroke_id = stroke_object.get("id")
        if not stroke_id:
            return jsonify({"status":"error","message":"stroke has no id"}), 500

        # mark undone, bump ts
        stroke_object["undone"] = True
        stroke_object["ts"] = int(time.time() * 1000)

        # publish state marker for get_canvas_data
        undo_wrapper = {
            "id": f"undo-{stroke_id}",
            "user": user_id,
            "ts": stroke_object["ts"],
            "deletion_date_flag": "",
            "undone": True,
            "roomId": room_id,
            "value": json.dumps(stroke_object)
        }
        # remove any existing redo marker for this stroke in the same room (keep only latest state)
        try:
            existing = redis_client.get(f"redo-{stroke_id}")
            if existing:
                try:
                    rec = json.loads(existing)
                    if rec.get("roomId") == room_id:
                        redis_client.delete(f"redo-{stroke_id}")
                except Exception:
                    pass
        except Exception:
            pass
        redis_client.set(undo_wrapper["id"], json.dumps(undo_wrapper))

        # push into room/user redo
        redis_client.lpush(redo_key, json.dumps(stroke_object))

        # also persist a transaction (optional, preserves your current semantics)
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
        return jsonify({"status":"error","message": str(e)}), 500

@undo_redo_bp.route('/redo', methods=['POST'])
def redo():
    try:
        data = request.get_json(force=True) or {}
        user_id = data.get("userId")
        room_id = data.get("roomId")  # NEW
        if not user_id:
            return jsonify({"status":"error","message":"userId required"}), 400

        base = _stack_base(user_id, room_id)
        redo_key  = f"{base}:redo"

        raw = redis_client.lpop(redo_key)
        if not raw:
            return jsonify({"status":"success","message":"Nothing to redo"}), 200

        stroke_object = json.loads(raw)
        stroke_id = stroke_object.get("id")
        if not stroke_id:
            return jsonify({"status":"error","message":"stroke has no id"}), 500

        stroke_object["undone"] = False
        stroke_object["ts"] = int(time.time() * 1000)

        redo_wrapper = {
            "id": f"redo-{stroke_id}",
            "user": user_id,
            "ts": stroke_object["ts"],
            "deletion_date_flag": "",
            "undone": False,
            "roomId": room_id,
            "value": json.dumps(stroke_object)
        }
        # remove any existing undo marker for this stroke in the same room (keep only latest state)
        try:
            existing = redis_client.get(f"undo-{stroke_id}")
            if existing:
                try:
                    rec = json.loads(existing)
                    if rec.get("roomId") == room_id:
                        redis_client.delete(f"undo-{stroke_id}")
                except Exception:
                    pass
        except Exception:
            pass
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
        return jsonify({"status":"error","message": str(e)}), 500
