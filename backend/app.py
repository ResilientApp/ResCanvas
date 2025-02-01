import json
import time
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
import threading
import redis
from config import RESDB_API_COMMIT, RESDB_API_QUERY, HEADERS

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
        # print("request_data:")
        # print(request_data)
        response = requests.post(
            RESDB_API_COMMIT, json=request_data, headers=HEADERS)

        if response.status_code // 100 == 2:
            # Cache the new timestamp in Redis
            redis_client.set(request_data['id'], request_data["ts"])
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

        # Get the canvas drawing count and increment it
        res_canvas_draw_count = get_canvas_draw_count()

        request_data['id'] = "res-canvas-draw-" + \
            str(res_canvas_draw_count)  # Adjust index
        # Ensure new strokes are marked as not undone
        request_data['undone'] = False
        print("TEST:")
        print(request_data)

        # Forward the data to the external API
        response = requests.post(
            RESDB_API_COMMIT, json=request_data, headers=HEADERS)

        # Check response status
        if response.status_code // 100 == 2:
            # Cache the new drawing in Redis
            increment_canvas_draw_count()
            redis_client.set(request_data['id'], json.dumps(request_data))
            #redis_client.rpush("global:drawings", json.dumps(request_data))

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
        # TODO: check why 'from' value is increasing from 0 during submit stroke
        from_ = request.args.get('from')
        print("from_")
        print(from_)
        if from_ is None:
            return jsonify({"status": "error", "message": "Missing required fields: from"}), 400
        from_ = int(from_)

        res_canvas_draw_count = get_canvas_draw_count()
        print(res_canvas_draw_count)
        # Ensure clear_timestamp exists, defaulting to 0 if not found
        # TODO: move to get_clear_timestamp(), check if need to setting to zero
        clear_timestamp = redis_client.get('clear-canvas-timestamp')
        if clear_timestamp is None:
            response = requests.get(RESDB_API_QUERY + "clear-canvas-timestamp")
            if response.status_code == 200 and response.text:
                clear_timestamp = int(response.json().get("value", 0))
                redis_client.set("clear-canvas-timestamp", clear_timestamp)
            else:
                clear_timestamp = 0
        else:
            clear_timestamp = int(clear_timestamp.decode())
        print(clear_timestamp)
        all_missing_data = []
        missing_keys = []
        undone_strokes = set()

        # Fetch undone strokes from Redis
        for key in redis_client.keys("undo-*"):
            undone_data = redis_client.get(key)
            
            if undone_data:
                undone_strokes.add(json.loads(undone_data)[
                                   "id"].replace("undo-", ""))
        print("undone_strokes")
        print(undone_strokes)

        # Check Redis for existing data
        for i in range(from_, res_canvas_draw_count):
            key_id = "res-canvas-draw-" + str(i)
            data = redis_client.get(key_id)
            if data:
                drawing = json.loads(data)
                #print(key_id)
                # Exclude undone strokes
                if drawing["id"] not in undone_strokes and "ts" in drawing and isinstance(drawing["ts"], int) and drawing["ts"] > clear_timestamp:
                    all_missing_data.append(drawing)
                    #print(drawing['id'])
            else:
                missing_keys.append((key_id, i))

        # Fetch missing data from ResDB
        for key_id, index in missing_keys:
            response = requests.get(RESDB_API_QUERY + key_id)
            if response.status_code == 200 and response.text:
                if response.headers.get("Content-Type") == "application/json":
                    data = response.json()

                    # Exclude undone strokes
                    if data["id"] not in undone_strokes and "ts" in data and isinstance(data["ts"], int) and data["ts"] > clear_timestamp:
                        all_missing_data.append(data)

                        # Cache in Redis
                        redis_client.set(key_id, json.dumps(data))
            #time.sleep(0.001)

        all_missing_data.sort(key=lambda x: int(x["id"].split("-")[-1]))
        #print(all_missing_data)
        return jsonify({"status": "success", "data": all_missing_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# TODO: check if working later
@app.route('/checkUndoRedo', methods=['GET'])
def check_undo_redo():
    user_id = request.args.get("userId")
    if not user_id:
        return jsonify({"status": "error", "message": "User ID required"}), 400

    # Fetch undo/redo stacks from Redis
    undo_available = redis_client.llen(f"{user_id}:undo") > 0
    redo_available = redis_client.llen(f"{user_id}:redo") > 0

    if not undo_available:
        response = requests.get(RESDB_API_QUERY + f"undo-{user_id}")
        if response.status_code == 200 and response.text:
            undo_available = True  # Found an undo record in ResDB

    if not redo_available:
        response = requests.get(RESDB_API_QUERY + f"redo-{user_id}")
        if response.status_code == 200 and response.text:
            redo_available = True  # Found a redo record in ResDB

    return jsonify({"undoAvailable": undo_available, "redoAvailable": redo_available}), 200

# POST endpoint: Undo operation
# TODO: need to check for last_action_data['undone'] flag to avoid grabbing undone strokes
# example, in resilientdb, after undoing the simple stroke once:
# [id: drawing1, stroke_data: (1,1), undone: false, id: drawing2, stroke_data: (1,1), undone: true]
# now redo resets the stroke's undo flag in a new append entry to resilientdb:
# [id: drawing1, stroke_data: (1,1), undone: false, id: drawing2, stroke_data: (1,1), undone: true,
# id: drawing3, stroke_data: (1,1), undone: false]
# if # of false > # of true for undone flag then drawing should load on canvas
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
        #redis_client.lrem("global:drawings", 1, last_action)

        response = requests.post(
            RESDB_API_COMMIT, json=undo_record, headers=HEADERS)
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
        #redis_client.rpush("global:drawings", last_action)

        response = requests.post(
            RESDB_API_COMMIT, json=redo_record, headers=HEADERS)
        if response.status_code // 100 != 2:
            raise KeyError("Failed to append redo action in ResDB.")

        return jsonify({"status": "success", "message": "Redo successful"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == '__main__':
    # TODO: merge to get_canvas_draw_count(), check if need to setting to zero 
    # since need to fetch from ResDB instead

    # Initialize res-canvas-draw-count if not present in Redis
    if not redis_client.exists('res-canvas-draw-count'):
        init_count = {"id": "res-canvas-draw-count", "value": 0}
        response = requests.post(
            RESDB_API_COMMIT, json=init_count, headers=HEADERS)
        if response.status_code // 100 == 2:
            redis_client.set('res-canvas-draw-count', 0)
            print('Set res-canvas-draw-count response:', response)
            app.run(debug=True, host="0.0.0.0", port=10010)
        else:
            print('Set res-canvas-draw-count response:', response)
    else:
        app.run(debug=True, host="0.0.0.0", port=10010)
