# routes/get_canvas_data_room.py
from flask import Blueprint, jsonify, request
from services.db import redis_client, strokes_coll
import logging
import traceback
from bson import ObjectId
from config import *
from pymongo import ASCENDING, DESCENDING

logger = logging.getLogger(__name__)
get_canvas_data_room_bp = Blueprint('get_canvas_data_room', __name__)

def _extract_number(v, default=0):
    try:
        if isinstance(v, dict) and '$numberLong' in v:
            return int(v['$numberLong'])
        return int(v)
    except Exception:
        return default

def _find_marker_ts_from_mongo(marker_id: str):
    try:
        doc = strokes_coll.find_one(
            {"transactions.value.asset.data.id": marker_id},
            sort=[('_id', DESCENDING)]
        )
        if not doc:
            return 0
        # Walk down to asset.data
        txs = doc.get('transactions') or []
        for tx in reversed(txs):
            val = tx.get('value', {})
            dat = (val.get('asset') or {}).get('data', {})
            if isinstance(dat, dict) and dat.get('id') == marker_id:
                # Try common fields
                for key in ('ts', 'timestamp', 'order', 'value'):
                    if key in dat:
                        return _extract_number(dat.get(key), 0)
        return 0
    except Exception:
        logger.exception("Failed reading marker %s from Mongo", marker_id)
        return 0

def _get_effective_clear_ts(room_id: str):
    # Prefer Redis, fall back to Mongo/ResDB mirror
    room_key = f"last-clear-ts:{room_id}"
    room_legacy = f"clear-canvas-timestamp:{room_id}"
    global_key = "last-clear-ts"
    global_legacy = "clear-canvas-timestamp"

    def _try_int(val):
        try:
            return int(val) if val is not None else None
        except Exception:
            return None

    # try canonical cache key first, then the legacy redis key, then fall back to mongo/ResDB
    try:
        room_ts = _try_int(redis_client.get(room_key))
    except Exception:
        room_ts = None
    if room_ts is None:
        try:
            room_ts = _try_int(redis_client.get(room_legacy))
        except Exception:
            room_ts = None

    try:
        global_ts = _try_int(redis_client.get(global_key))
    except Exception:
        global_ts = None
    if global_ts is None:
        try:
            global_ts = _try_int(redis_client.get(global_legacy))
        except Exception:
            global_ts = None

    if room_ts is None:
        room_ts = _find_marker_ts_from_mongo(f"clear-canvas-timestamp:{room_id}")
    if global_ts is None:
        global_ts = _find_marker_ts_from_mongo("clear-canvas-timestamp")
    return max(room_ts or 0, global_ts or 0)

@get_canvas_data_room_bp.route('/getCanvasDataRoom', methods=['GET'])
def get_canvas_data_room():
    room_id = request.args.get('roomId') or request.args.get('room_id')
    if not room_id:
        return jsonify({"status": "error", "message": "roomId is required"}), 400

    clear_after = _get_effective_clear_ts(room_id)

    # Only return strokes after the effective clear timestamp, and scoped to this room
    # Room stroke docs are shaped like: { roomId: <str>, ts: <int>, stroke: {...}, ... }
    cursor = strokes_coll.find(
        {"roomId": room_id, "ts": {"$gt": clear_after}},
        sort=[('ts', ASCENDING), ('_id', ASCENDING)]
    )

    items = []
    for doc in cursor:
        # convert ObjectId for client safety
        if isinstance(doc.get('_id'), ObjectId):
            doc['_id'] = str(doc['_id'])
        items.append(doc)

    return jsonify({"status": "success", "clearAfter": clear_after, "items": items}), 200
