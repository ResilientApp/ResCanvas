# routes/get_canvas_data.py

from flask import Blueprint, jsonify, request
import json
import traceback
import logging
from services.canvas_counter import get_canvas_draw_count
from services.db import redis_client, strokes_coll
from config import *

logger = logging.getLogger(__name__)

get_canvas_data_bp = Blueprint('get_canvas_data', __name__)

@get_canvas_data_bp.route('/getCanvasData', methods=['GET'])
def get_canvas_data():
    try:
        res_canvas_draw_count = get_canvas_draw_count()

        # Ensure clear_timestamp and count_value_clear_canvas exists, defaulting to 0 if not found
        clear_timestamp = redis_client.get('clear-canvas-timestamp')
        count_value_clear_canvas = redis_client.get('draw_count_clear_canvas')
        
        if clear_timestamp is None:
            block = strokes_coll.find_one(
                {"transactions.value.asset.data.id": "clear-canvas-timestamp"},
                sort=[("id", -1)]
            )
            if block:
                tx = next(
                    (t for t in block["transactions"]
                    if t.get("value", {}).get("asset", {}).get("data", {}).get("id") == "clear-canvas-timestamp"),
                    None
                )
                if tx:
                    clear_timestamp = tx["value"]["asset"]["data"].get("ts", 0)
                    redis_client.set("clear-canvas-timestamp", clear_timestamp)
                else:
                    logger.error("Found block but no matching txn for clear-canvas-timestamp")
                    clear_timestamp = 0
            else:
                logger.error("No Mongo block for clear-canvas-timestamp")
                clear_timestamp = 0
        else:
            clear_timestamp = int(clear_timestamp.decode())

        if count_value_clear_canvas is None:
            block = strokes_coll.find_one(
                {"transactions.value.asset.data.id": "draw_count_clear_canvas"},
                sort=[("id", -1)]
            )
            if block:
                tx = next(
                    (t for t in block["transactions"]
                    if t.get("value", {}).get("asset", {}).get("data", {}).get("id") == "draw_count_clear_canvas"),
                    None
                )
                if tx:
                    count_value_clear_canvas = tx["value"]["asset"]["data"].get("value", 0)
                    redis_client.set("draw_count_clear_canvas", count_value_clear_canvas)
                else:
                    logger.error("Found block but no matching txn for draw_count_clear_canvas")
                    count_value_clear_canvas = 0
            else:
                logger.error("No Mongo block for draw_count_clear_canvas")
                count_value_clear_canvas = 0
        else:
            count_value_clear_canvas = int(count_value_clear_canvas.decode())

        all_missing_data = []
        missing_keys = []
        
        # Determine the current state for each stroke based on undo/redo records.
        stroke_states = {}
        # Process all undo records.
        for key in redis_client.keys("undo-*"):
            data = redis_client.get(key)
            if data:
                record = json.loads(data)
                stroke_id = record["id"].replace("undo-", "")
                stroke_states[stroke_id] = record  # State: undone (True)

        # Process all redo records and update state if they are more recent.
        for key in redis_client.keys("redo-*"):
            data = redis_client.get(key)
            if data:
                record = json.loads(data)
                stroke_id = record["id"].replace("redo-", "")
                if stroke_id in stroke_states:
                    if record["ts"] > stroke_states[stroke_id]["ts"]:
                        stroke_states[stroke_id] = record  # State: redone (undone==False)
                else:
                    stroke_states[stroke_id] = record

        # Build the set of strokes currently marked as undone.
        undone_strokes = set()
        for stroke_id, state in stroke_states.items():
            if state.get("undone"):
                undone_strokes.add(stroke_id)

        # Check Redis for existing data
        logger.error("count_value_clear_canvas")
        logger.error(count_value_clear_canvas)
        logger.error(res_canvas_draw_count)
        for i in range(count_value_clear_canvas, res_canvas_draw_count):
            key_id = "res-canvas-draw-" + str(i)
            data = redis_client.get(key_id)

            if data:
                logger.error(data)
                drawing = json.loads(data)
                # Exclude undone strokes
                if drawing["id"] not in undone_strokes and "ts" in drawing and isinstance(drawing["ts"], int) and drawing["ts"] > clear_timestamp:
                    wrapper = {
                        "id":                drawing["id"],
                        "user":              drawing["user"],
                        "ts":                drawing["ts"],
                        "deletion_date_flag":"",
                        "undone":            drawing.get("undone", False),
                        "value":             json.dumps(drawing)
                    }
                    all_missing_data.append(wrapper)
            else:
                missing_keys.append((key_id, i))
        for key_str, idx in missing_keys:
            block = strokes_coll.find_one(
                {"transactions.value.asset.data.id": key_str},
                sort=[("id", -1)]
            )

            logger.error("key_str")
            logger.error(key_str)
            if not block:
                logger.error(f"No Mongo block for {key_str}; total docs: {strokes_coll.count_documents({})}")
                continue

            matching_txs = [
                t for t in block["transactions"]
                if t.get("value", {}).get("asset", {}).get("data", {}).get("id") == key_str
            ]

            # Sort by timestamp and pick the latest one
            tx = max(matching_txs, key=lambda t: t["value"]["asset"]["data"].get("ts", 0), default=None)
            
            if not tx:
                logger.error(f"Found block {block['id']} but no matching txn inside for {key_str}")
                continue

            asset_data = tx["value"]["asset"]["data"]

            # If asset_data contains value as a stringified dict from redo/undo extract it out here
            if isinstance(asset_data.get("value"), str):
                try:
                    inner = json.loads(asset_data["value"])
                    asset_data.update(inner)
                    asset_data.pop("value", None)
                except Exception:
                    pass

            asset_data["undone"] = asset_data.get("undone", False)

            redis_client.set(key_str, json.dumps(asset_data))

            # Accept only strokes after last time we clear the canvas and of the correct prefix
            if (
                asset_data["id"].startswith("res-canvas-draw-") and
                isinstance(asset_data["ts"], int) and
                asset_data["ts"] > clear_timestamp
            ):
                wrapper = {
                    "id":                asset_data["id"],
                    "user":              asset_data["user"],
                    "ts":                asset_data["ts"],
                    "deletion_date_flag":"",
                    "undone":            asset_data["undone"],
                    "value":             json.dumps(asset_data)
                }
                all_missing_data.append(wrapper)

        # Now check for undone strokes stored in resdb but not in redis to prevent them from loading back
        stroke_entries = {}
        for entry in all_missing_data:
            stroke_id = entry.get('id')
            time_stamp = entry.get('ts')
            
            if stroke_id and time_stamp:
                existing_entry = stroke_entries.get(stroke_id)
                if not existing_entry or time_stamp > existing_entry['ts']:
                    stroke_entries[stroke_id] = entry
        
        # Filter out entries where 'undone' is True for the latest entry
        latest_entries = {}
        for entry in all_missing_data:
            stroke_id = entry["id"]
            ts = entry.get("ts", 0)
            if stroke_id not in latest_entries or ts > latest_entries[stroke_id]["ts"]:
                latest_entries[stroke_id] = entry

        logger.error(latest_entries)

        # Keep only the strokes whose latest version is not undone
        all_missing_data = [
            entry for entry in latest_entries.values()
            if not entry.get("undone", False)
        ]

        logger.error(all_missing_data)


        # Now fetch the set of cut stroke IDs from Redis
        cut_ids = redis_client.smembers("cut-stroke-ids")
        cut_ids = set(x.decode() for x in cut_ids) if cut_ids else set()

        # Remove any drawing whose drawingId (or id field) is in cut_ids.
        stroke_entries = {}
        for entry in all_missing_data:
            stroke_id = entry.get('drawingId') or entry.get('id')
            time_stamp = entry.get('ts')
            if stroke_id and time_stamp:
                existing_entry = stroke_entries.get(stroke_id)
                if not existing_entry or time_stamp > existing_entry['ts']:
                    stroke_entries[stroke_id] = entry
        
        # Filter out entries that have been cut.
        active_strokes = [entry for entry in stroke_entries.values() if entry.get('drawingId', entry.get('id')) not in cut_ids]
        start_param = request.args.get('start')
        end_param = request.args.get('end')
        if start_param or end_param:
            try:
                start_ts = int(start_param) if start_param is not None and start_param != '' else None
                end_ts = int(end_param) if end_param is not None and end_param != '' else None
                filtered = []
                for entry in active_strokes:
                    entry_ts = int(entry.get('ts', entry.get('timestamp', 0)))
                    if (start_ts is None or entry_ts >= start_ts) and (end_ts is None or entry_ts <= end_ts):
                        filtered.append(entry)
                all_missing_data = filtered
            except Exception as e:
                logger.error(f"Error parsing start/end params: {e}")
                all_missing_data = active_strokes
        else:
            all_missing_data = active_strokes
            logger.error(all_missing_data)

        all_missing_data.sort(key=lambda x: int(x["id"].split("-")[-1]))
        logger.error(all_missing_data)

        for entry in all_missing_data:
            logger.error(f"[FINAL RETURN] {json.dumps(entry, indent=2)}")
        return jsonify({"status": "success", "data": all_missing_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
