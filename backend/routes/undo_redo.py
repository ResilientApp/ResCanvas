from flask import Blueprint, jsonify, request
import json
import time
import traceback
import logging
import uuid
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

def _persist_undo_state(stroke_obj: dict, undone: bool, ts: int, marker_id: str = None):
    """
    Persist an undo/redo marker to ResDB (so Mongo mirror can be used for recovery).
    We include the marker id (e.g., 'undo-<strokeId>' or 'redo-<strokeId>') so reads can locate it.
    """
    try:
        stroke_id = None
        if marker_id:
            if marker_id.startswith("undo-"):
                stroke_id = marker_id[5:]
            elif marker_id.startswith("redo-"):
                stroke_id = marker_id[5:]
        
        marker_type = "undo_marker" if undone else "redo_marker"
        
        asset_data = {
            "ts": ts,
            "type": marker_type,
            "roomId": stroke_obj.get("roomId"),
            "strokeId": stroke_id or _safe_get_stroke_id(stroke_obj),
            "value": json.dumps(stroke_obj, separators=(",", ":")),
            "undone": bool(undone)
        }
        if marker_id:
            asset_data["id"] = marker_id
        payload = {
            "operation": "CREATE",
            "amount": 1,
            "signerPublicKey": SIGNER_PUBLIC_KEY,
            "signerPrivateKey": SIGNER_PRIVATE_KEY,
            "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
            "asset": {"data": asset_data}
        }
        commit_transaction_via_graphql(payload)
    except Exception:
        logger.exception("GraphQL commit failed for undo/redo persist")

def _safe_get_stroke_id(stroke_obj):
    """Return a deterministic stroke id where possible, else None."""
    try:
        if isinstance(stroke_obj, dict):
            for key in ("id", "drawingId", "strokeId", "drawing_id"):
                if key in stroke_obj and stroke_obj[key]:
                    return str(stroke_obj[key])
        return None
    except Exception:
        return None

@undo_redo_bp.route('/undo', methods=['POST'])
def undo():
    try:
        data = request.get_json(silent=True) or {}
        user_id = data.get('userId') or data.get('user') or data.get('username')
        room_id = data.get('roomId') or data.get('room_id')
        if not user_id:
            return jsonify({"status": "error", "message": "userId is required"}), 400

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
            stroke_obj = {"raw": item}

        ts = _now_ms()

        stroke_id = _safe_get_stroke_id(stroke_obj) or f"unknown-{ts}-{uuid.uuid4().hex[:8]}"
        undo_marker_key = f"undo-{stroke_id}"
        redo_marker_key = f"redo-{stroke_id}"

        try:
            marker_rec = {"id": undo_marker_key, "user": user_id, "ts": ts, "undone": True, "value": stroke_obj}
            redis_client.set(undo_marker_key, json.dumps(marker_rec))
            try:
                redis_client.delete(redo_marker_key)
            except Exception:
                pass
        except Exception:
            logger.exception("Failed to set undo marker for %s", stroke_id)

        _persist_undo_state(stroke_obj, undone=True, ts=ts, marker_id=undo_marker_key)

        if used_base:
            redis_client.lpush(f"{used_base}:redo", json.dumps(stroke_obj, separators=(",", ":")))
        else:
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

        stroke_id = _safe_get_stroke_id(stroke_obj) or f"unknown-{ts}-{uuid.uuid4().hex[:8]}"
        undo_marker_key = f"undo-{stroke_id}"
        redo_marker_key = f"redo-{stroke_id}"

        try:
            marker_rec = {"id": redo_marker_key, "user": user_id, "ts": ts, "undone": False, "value": stroke_obj}
            redis_client.set(redo_marker_key, json.dumps(marker_rec))
            try:
                redis_client.delete(undo_marker_key)
            except Exception:
                pass
        except Exception:
            logger.exception("Failed to set redo marker for %s", stroke_id)

        _persist_undo_state(stroke_obj, undone=False, ts=ts, marker_id=redo_marker_key)

        if used_base:
            redis_client.lpush(f"{used_base}:undo", json.dumps(stroke_obj, separators=(",", ":")))
        else:
            redis_client.lpush(f"{user_id}:undo", json.dumps(stroke_obj, separators=(",", ":")))

        return jsonify({"status": "success", "ts": ts}), 200
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500
    