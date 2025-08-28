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

def _now_ms():
    return int(time.time() * 1000)

def _stack_candidates(user_id, room_id):
    """
    Return candidate stack base names in preferred order.
    Some codepaths historically used different ordering; be tolerant:
        - room:user
        - user:room
        - user (global)
    We will attempt to pop from these in order.
    """
    candidates = []
    if room_id:
        candidates.append(f"{room_id}:{user_id}")
        candidates.append(f"{user_id}:{room_id}")
    candidates.append(f"{user_id}")
    return candidates

def _persist_undo_state(stroke_obj: dict, undone: bool, ts: int):
    payload = {
        "operation": "CREATE",
        "amount": 1,
        "signerPublicKey": SIGNER_PUBLIC_KEY,
        "signerPrivateKey": SIGNER_PRIVATE_KEY,
        "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
        "asset": {
            "data": {
                "ts": ts,
                # Store the original stroke as string to match main branch format
                "value": json.dumps(stroke_obj, separators=(",", ":")),
                "undone": bool(undone)
            }
        }
    }
    commit_transaction_via_graphql(payload)

@undo_redo_bp.route('/undo', methods=['POST'])
def undo():
    try:
        data = request.get_json(silent=True) or {}
        user_id = data.get('userId') or data.get('user') or data.get('username')
        room_id = data.get('roomId') or data.get('room_id')
        if not user_id:
            return jsonify({"status": "error", "message": "userId is required"}), 400

        # try candidate bases until we find a non-empty undo stack
        item = None
        used_base = None
        for base in _stack_candidates(user_id, room_id):
            undo_key = f"{base}:undo"
            item = redis_client.lpop(undo_key)
            if item:
                used_base = base
                break
        if not item:
            return jsonify({"status": "empty"}), 200

        try:
            stroke_obj = json.loads(item)
        except Exception:
            # If something odd got stored, just wrap it
            stroke_obj = {"raw": item}

        ts = _now_ms()
        _persist_undo_state(stroke_obj, undone=True, ts=ts)

        # Make it available for redo on the same base we popped from
        if used_base:
            redis_client.lpush(f"{used_base}:redo", json.dumps(stroke_obj, separators=(",", ":")))
        else:
            # fallback to the straightforward base
            redis_client.lpush(f"{user_id}:redo", json.dumps(stroke_obj, separators=(",", ":")))


        return jsonify({"status": "success", "ts": ts}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

@undo_redo_bp.route('/redo', methods=['POST'])
def redo():
    try:
        data = request.get_json(silent=True) or {}
        user_id = data.get('userId') or data.get('user') or data.get('username')
        room_id = data.get('roomId') or data.get('room_id')
        if not user_id:
            return jsonify({"status":"error","message":"userId required"}), 400

        # try candidate bases until we find a non-empty redo stack
        item = None
        used_base = None
        for base in _stack_candidates(user_id, room_id):
            redo_key = f"{base}:redo"
            item = redis_client.lpop(redo_key)
            if item:
                used_base = base
                break
        if not item:
            return jsonify({"status": "empty"}), 200

        try:
            stroke_obj = json.loads(item)
        except Exception:
            stroke_obj = {"raw": item}

        ts = _now_ms()
        _persist_undo_state(stroke_obj, undone=False, ts=ts)

        # After redoing, place it back on the undo stack on the same base
        if used_base:
            redis_client.lpush(f"{used_base}:undo", json.dumps(stroke_obj, separators=(",", ":")))
        else:
            redis_client.lpush(f"{user_id}:undo", json.dumps(stroke_obj, separators=(",", ":")))

        return jsonify({"status": "success", "ts": ts}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500
