# routes/get_canvas_data_room.py
from flask import Blueprint, jsonify, request
from services.db import redis_client, strokes_coll
from services.graphql_service import GraphQLService
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
    
    # Build set of undone strokes from persistent markers
    # This is crucial for proper redo functionality after Redis flush
    undone_strokes = set()
    
    try:
        # Check GraphQL persistent storage for undo markers (recovery after Redis flush)
        graphql_service = GraphQLService()
        persistent_markers = graphql_service.get_undo_markers(room_id)
        for marker in persistent_markers:
            if marker.get('undone') and marker.get('id'):
                marker_id = marker['id']
                if marker_id.startswith("undo-"):
                    stroke_id = marker_id[5:]  # Remove "undo-" prefix
                    undone_strokes.add(stroke_id)
                    logger.debug(f"Added stroke {stroke_id} to undone set from persistent marker")
    except Exception as e:
        logger.exception(f"Error loading persistent undo markers: {e}")

    # Only return strokes after the effective clear timestamp, and scoped to this room
    # Room stroke docs are shaped like: { roomId: <str>, ts: <int>, stroke: {...}, ... }
    cursor = strokes_coll.find(
        {"roomId": room_id, "ts": {"$gt": clear_after}},
        sort=[('ts', ASCENDING), ('_id', ASCENDING)]
    )

    items = []
    filtered_count = 0
    total_count = 0
    
    for doc in cursor:
        total_count += 1
        
        # Filter out undone strokes 
        stroke_data = doc.get("stroke", {})
        stroke_id = stroke_data.get("id") or stroke_data.get("drawingId")
        
        if stroke_id and stroke_id in undone_strokes:
            filtered_count += 1
            logger.debug(f"Filtering out undone stroke: {stroke_id}")
            continue
            
        # convert ObjectId for client safety
        if isinstance(doc.get('_id'), ObjectId):
            doc['_id'] = str(doc['_id'])
        items.append(doc)
    
    logger.info(f"Room {room_id}: Returning {len(items)} strokes (filtered out {filtered_count} undone strokes from {total_count} total)")
    return jsonify({"status": "success", "clearAfter": clear_after, "items": items}), 200
