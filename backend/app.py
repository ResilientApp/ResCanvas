import json
import time
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
import threading
import redis
from config import RESDB_API_COMMIT, RESDB_API_QUERY, HEADERS
import logging
from logging.handlers import RotatingFileHandler

logging.basicConfig(
    level=logging.DEBUG,  # adjust to DEBUG for development
    format="%(asctime)s [%(levelname)s] %(name)s:%(lineno)d – %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

handler = RotatingFileHandler(
    "backend.log", maxBytes=10*1024*1024, backupCount=5
)
handler.setLevel(logging.DEBUG)
handler.setFormatter(logging.Formatter(
    "%(asctime)s [%(levelname)s] %(name)s:%(lineno)d – %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
))
logging.getLogger().addHandler(handler)

logger = logging.getLogger(__name__)

lock = threading.Lock()

app = Flask(__name__)
CORS(app)  # Enable global CORS

# Initialize Redis client
redis_client = redis.Redis(host='localhost', port=6379, db=0)

# Function to get the canvas drawing count
def get_canvas_draw_count():
    count = redis_client.get('res-canvas-draw-count')

    if count is None:
        # If not in Redis, get from external API
        response = requests.get(
            RESDB_API_QUERY + "res-canvas-draw-count", headers=HEADERS)
        if response.status_code // 100 == 2:
            count = int(response.json()['value'])
            redis_client.set('res-canvas-draw-count', count)
        else:
            raise KeyError("Failed to get canvas draw count.")
    else:
        count = int(count)
    return count

# Function to increment the canvas drawing count
def increment_canvas_draw_count():
    with lock:
        count = get_canvas_draw_count() + 1
        # Update in Redis
        redis_client.set('res-canvas-draw-count', count)
        # Update in external API
        increment_count = {"id": "res-canvas-draw-count", "value": count}
        response = requests.post(
            RESDB_API_COMMIT, json=increment_count, headers=HEADERS)
        if response.status_code // 100 != 2:
            raise KeyError("Failed to increment canvas draw count.")
    return count

# POST endpoint: AddClearTimestamp
@app.route('/submitClearCanvasTimestamp', methods=['POST'])
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
            return jsonify({"status": "error", "message": "Missing required fields: ts"}), 400

        request_data['id'] = 'clear-canvas-timestamp'

        count_data = {}
        count_data['id'] = 'draw_count_clear_canvas'
        count_data['value'] = get_canvas_draw_count()

        response = requests.post(RESDB_API_COMMIT, json=request_data, headers=HEADERS)
        response_count_data = requests.post(RESDB_API_COMMIT, json=count_data, headers=HEADERS)

        if response.status_code // 100 == 2:
            # Cache the new timestamp in Redis
            redis_client.set(request_data['id'], request_data['ts'])
        if response_count_data.status_code // 100 == 2:
            # Cache the new draw count at clear canvas event in Redis
            redis_client.set(count_data['id'], count_data['value'])

            # Clear all undo/redo stacks in Redis
            for key in redis_client.scan_iter("undo-*"):
                redis_client.delete(key)
            for key in redis_client.scan_iter("redo-*"):
                redis_client.delete(key)

            return jsonify({"status": "success", "message": "timestamp submitted successfully"}), 201
        else:
            raise KeyError("Failed to submit data to external API.")
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# POST endpoint: submitNewLine
@app.route('/submitNewLine', methods=['POST'])
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
        request_data['undone'] = False

        logger.debug("submit_new_line request_data: %r", request_data)
        # {'ts': 1738654033439, 'value': '{"drawingId":"drawing_1738654033439","color":"#000000","lineWidth":5,"pathData":[{"x":176.75675675675677,"y":912.9319872905817},{"x":176.75675675675677,"y":908.0723758993252},{"x":178.3783783783784,"y":890.2538007980511},{"x":183.24324324324326,"y":870.8153552330249},{"x":196.21621621621622,"y":831.9384641029725},{"x":204.32432432432432,"y":802.7807957554331},{"x":212.43243243243245,"y":772.0032569441416},{"x":222.16216216216216,"y":736.3661067415935},{"x":231.8918918918919,"y":694.2494746840367},{"x":236.75675675675677,"y":668.3315472640018},{"x":244.86486486486487,"y":632.6943970614537},{"x":254.5945945945946,"y":608.3963401051709},{"x":259.4594594594595,"y":593.8175059314012},{"x":262.7027027027027,"y":579.2386717576316},{"x":264.3243243243243,"y":575.9989308301272},{"x":264.3243243243243,"y":574.379060366375},{"x":264.3243243243243,"y":572.7591899026229}],"timestamp":1738654033439,"user":"wasd|1738654019882"}', 'user': 'wasd|1738654019882', 'deletion_date_flag': '', 'id': 'res-canvas-draw-338', 'undone': False}

        # Forward the data to the external API
        response = requests.post(
            RESDB_API_COMMIT, json=request_data, headers=HEADERS)

        # Check response status
        if response.status_code // 100 == 2:
            # Cache the new drawing in Redis
            increment_canvas_draw_count()
            redis_client.set(request_data['id'], json.dumps(request_data))

            # Update user's undo/redo stacks
            redis_client.lpush(f"{user_id}:undo", json.dumps(request_data))
            redis_client.delete(f"{user_id}:redo")  # Clear redo stack

            return jsonify({"status": "success", "message": "Line submitted successfully"}), 201
        else:
            raise KeyError("Failed to submit data to external API.")
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# GET endpoint: getCanvasData
@app.route('/getCanvasData', methods=['GET'])
def get_canvas_data():
    try:
        res_canvas_draw_count = get_canvas_draw_count()
        logger.debug("res_canvas_draw_count: ")
        logger.debug(res_canvas_draw_count)
        # Ensure clear_timestamp and count_value_clear_canvas exists, defaulting to 0 if not found
        clear_timestamp = redis_client.get('clear-canvas-timestamp')
        count_value_clear_canvas = redis_client.get('draw_count_clear_canvas')
        
        if clear_timestamp is None:
            response = requests.get(RESDB_API_QUERY + "clear-canvas-timestamp")
            if response.status_code == 200 and response.text:
                clear_timestamp = int(response.json().get('ts', 0))
                redis_client.set("clear-canvas-timestamp", clear_timestamp)
            else:
                clear_timestamp = 0
        else:
            clear_timestamp = int(clear_timestamp.decode())

        if count_value_clear_canvas is None:
            response = requests.get(RESDB_API_QUERY + "draw_count_clear_canvas")
            if response.status_code == 200 and response.text:
                count_value_clear_canvas = int(response.json().get('value', 0))
                redis_client.set("draw_count_clear_canvas", count_value_clear_canvas)
            else:
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
        logger.debug("undone_strokes", undone_strokes)

        # Check Redis for existing data
        for i in range(count_value_clear_canvas, res_canvas_draw_count):
            key_id = "res-canvas-draw-" + str(i)
            data = redis_client.get(key_id)
            logger.debug("redis_client:")
            logger.debug(key_id)
            logger.debug(data)
            if data:
                drawing = json.loads(data)
                # Exclude undone strokes
                if drawing["id"] not in undone_strokes and "ts" in drawing and isinstance(drawing["ts"], int) and drawing["ts"] > clear_timestamp:
                    all_missing_data.append(drawing)
            else:
                missing_keys.append((key_id, i))

        # Fetch missing data from ResDB
        for key_id, index in missing_keys:
            response = requests.get(RESDB_API_QUERY + key_id)
            if response.status_code == 200 and response.text:
                if response.headers.get("Content-Type") == "application/json":
                    data = response.json()
                    logger.debug("redis_client:")
                    logger.debug(key_id)
                    logger.debug(data)
                    redis_client.set(key_id, json.dumps(data))

                    # Exclude undone strokes
                    if data["id"] not in undone_strokes and "ts" in data and isinstance(data["ts"], int) and data["ts"] > clear_timestamp:
                        all_missing_data.append(data)


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
        active_strokes = [entry for entry in stroke_entries.values() if not entry.get('undone', False)]
        all_missing_data = active_strokes

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
        all_missing_data = active_strokes
        
        all_missing_data.sort(key=lambda x: int(x["id"].split("-")[-1]))
        return jsonify({"status": "success", "data": all_missing_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/checkUndoRedo', methods=['GET'])
def check_undo_redo():
    user_id = request.args.get("userId")
    if not user_id:
        return jsonify({"status": "error", "message": "User ID required"}), 400

    # Fetch undo/redo stacks from Redis
    undo_available = redis_client.llen(f"{user_id}:undo") > 0
    redo_available = redis_client.llen(f"{user_id}:redo") > 0

    return jsonify({"undoAvailable": undo_available, "redoAvailable": redo_available}), 200

# POST endpoint: Undo operation
@app.route('/undo', methods=['POST'])
def undo_action():
    try:
        data = request.json
        user_id = data.get("userId")
        if not user_id:
            return jsonify({"status": "error", "message": "User ID required"}), 400

        undo_stack = redis_client.lrange(f"{user_id}:undo", 0, -1)
        if not undo_stack:
            return jsonify({"status": "error", "message": "Nothing to undo"}), 400

        last_action = redis_client.lpop(f"{user_id}:undo")
        redis_client.lpush(f"{user_id}:redo", last_action)

        last_action_data = json.loads(last_action)
        undo_record = {
            "id": f"undo-{last_action_data['id']}",
            "ts": int(time.time() * 1000),
            "user": user_id,
            "undone": True,
            "value": json.dumps(last_action_data)
        }
        redis_client.set(undo_record["id"], json.dumps(undo_record))

        last_action_data['undone'] = True
        last_action_data['ts'] = int(time.time() * 1000)
        logger.debug("last_action_data_UNDO:", last_action_data)
        response = requests.post(
            RESDB_API_COMMIT, json=last_action_data, headers=HEADERS)
        if response.status_code // 100 != 2:
            raise KeyError("Failed to append undo action in ResDB.")

        return jsonify({"status": "success", "message": "Undo successful"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# POST endpoint: Redo operation
@app.route('/redo', methods=['POST'])
def redo_action():
    try:
        data = request.json
        user_id = data.get("userId")
        if not user_id:
            return jsonify({"status": "error", "message": "User ID required"}), 400

        redo_stack = redis_client.lrange(f"{user_id}:redo", 0, -1)
        if not redo_stack:
            return jsonify({"status": "error", "message": "Nothing to redo"}), 400

        last_action = redis_client.lpop(f"{user_id}:redo")
        redis_client.lpush(f"{user_id}:undo", last_action)

        last_action_data = json.loads(last_action)
        redo_record = {
            "id": f"redo-{last_action_data['id']}",
            "ts": int(time.time() * 1000),
            "user": user_id,
            "undone": False,
            "value": json.dumps(last_action_data)
        }

        redis_client.set(redo_record["id"], json.dumps(redo_record))

        last_action_data['undone'] = False
        last_action_data['ts'] = int(time.time() * 1000)
        logger.debug("last_action_data_REDO", last_action_data)
        response = requests.post(
            RESDB_API_COMMIT, json=last_action_data, headers=HEADERS)
        if response.status_code // 100 != 2:
            raise KeyError("Failed to append redo action in ResDB.")

        return jsonify({"status": "success", "message": "Redo successful"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == '__main__':
    # Initialize res-canvas-draw-count if not present in Redis
    if not redis_client.exists('res-canvas-draw-count'):
        init_count = {"id": "res-canvas-draw-count", "value": 0}
        logger.debug("Initialize res-canvas-draw-count if not present in Redis: ", init_count)
        response = requests.post(
            RESDB_API_COMMIT, json=init_count, headers=HEADERS)
        if response.status_code // 100 == 2:
            redis_client.set('res-canvas-draw-count', 0)
            logger.debug('Set res-canvas-draw-count response:', response)
            app.run(debug=True, host="0.0.0.0", port=10010)
        else:
            logger.debug('Set res-canvas-draw-count response:', response)
    else:
        app.run(debug=True, host="0.0.0.0", port=10010)
