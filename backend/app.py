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
        response = requests.get(RESDB_API_QUERY + "res-canvas-draw-count", headers=HEADERS)
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
        response = requests.post(RESDB_API_COMMIT, json=increment_count, headers=HEADERS)
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
        if 'ts' not in request_data :
            return jsonify({"status": "error", "message": "Missing required fields: ts"}), 400

        request_data['id'] = 'clear-canvas-timestamp'

        response = requests.post(RESDB_API_COMMIT, json=request_data, headers=HEADERS)

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

        request_data['id'] = "res-canvas-draw-" + str(res_canvas_draw_count)  # Adjust index
        request_data['undone'] = False  # Ensure new strokes are marked as not undone

        # Forward the data to the external API
        response = requests.post(RESDB_API_COMMIT, json=request_data, headers=HEADERS)

        # Check response status
        if response.status_code // 100 == 2:
            # Cache the new drawing in Redis
            increment_canvas_draw_count()
            redis_client.set(request_data['id'], json.dumps(request_data))
            redis_client.rpush("global:drawings", json.dumps(request_data))

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
        # Use query parameters to retrieve 'from'
        from_ = request.args.get('from')
        if from_ is None:
            return jsonify({"status": "error", "message": "Missing required fields: from"}), 400
        from_ = int(from_)

        # Get the canvas drawing count
        res_canvas_draw_count = get_canvas_draw_count()

        clear_timestamp = redis_client.get('clear-canvas-timestamp')

        all_missing_data = []
        missing_keys = []

        # Check Redis for existing data
        for i in range(from_, res_canvas_draw_count):
            key_id = "res-canvas-draw-" + str(i)
            data = redis_client.get(key_id)
            if data:
                drawing = json.loads(data)
                #print(drawing)
                if not drawing.get('undone', False) and isinstance(drawing["ts"], int) and (drawing["ts"] > int(clear_timestamp.decode())):
                    all_missing_data.append(drawing)
            else:
                # Data not in Redis, add to missing_keys
                missing_keys.append((key_id, i))

        # Fetch missing data from external API and cache it
        for key_id, index in missing_keys:
            response = requests.get(RESDB_API_QUERY + key_id)
            if response.status_code == 200:
                if response.text and response.headers.get('Content-Type') == 'application/json':
                    data = response.json()
                    if not data.get('undone', False) and isinstance(data["ts"], int) and (data["ts"] > int(clear_timestamp.decode())):
                        all_missing_data.append(data)

                        # Cache in Redis
                        redis_client.set(key_id, json.dumps(data))
                else:
                    data = {"id": key_id, "value": ""}
                    all_missing_data.append(data)
                    # Cache in Redis
                    redis_client.set(key_id, json.dumps(data))
            else:
                raise KeyError(f"Failed to get data for {key_id}")
            time.sleep(0.001)

        # Sort the data based on index to maintain order
        all_missing_data.sort(key=lambda x: int(x['id'].split('-')[-1]))

        return jsonify({"status": "success", "data": all_missing_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# POST endpoint: Undo operation
@app.route('/undo', methods=['POST'])
def undo_action():
    try:
        data = request.json
        user_id = data.get("userId")
        if not user_id:
            return jsonify({"status": "error", "message": "User ID required"}), 400

        # Check user's undo stack
        undo_stack = redis_client.lrange(f"{user_id}:undo", 0, -1)
        if not undo_stack:
            return jsonify({"status": "error", "message": "Nothing to undo"}), 400

        # Pop the last action and add to the redo stack
        last_action = redis_client.lpop(f"{user_id}:undo")
        redis_client.lpush(f"{user_id}:redo", last_action)

        # Mark the action as undone in Redis and ResDB
        last_action_data = json.loads(last_action)
        last_action_data['undone'] = True
        redis_client.set(last_action_data['id'], json.dumps(last_action_data))

        # Forward the update to ResDB
        response = requests.post(RESDB_API_COMMIT, json=last_action_data, headers=HEADERS)
        if response.status_code // 100 != 2:
            raise KeyError("Failed to update undo action in ResDB.")

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

        # Check user's redo stack
        redo_stack = redis_client.lrange(f"{user_id}:redo", 0, -1)
        if not redo_stack:
            return jsonify({"status": "error", "message": "Nothing to redo"}), 400

        # Pop the last redo action and add to the undo stack
        last_action = redis_client.lpop(f"{user_id}:redo")
        redis_client.lpush(f"{user_id}:undo", last_action)

        # Mark the action as redone in Redis and ResDB
        last_action_data = json.loads(last_action)
        last_action_data['undone'] = False
        redis_client.set(last_action_data['id'], json.dumps(last_action_data))

        # Forward the update to ResDB
        response = requests.post(RESDB_API_COMMIT, json=last_action_data, headers=HEADERS)
        if response.status_code // 100 != 2:
            raise KeyError("Failed to update redo action in ResDB.")

        return jsonify({"status": "success", "message": "Redo successful"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    # Initialize res-canvas-draw-count if not present in Redis
    if not redis_client.exists('res-canvas-draw-count'):
        init_count = {"id": "res-canvas-draw-count", "value": 0}
        response = requests.post(RESDB_API_COMMIT, json=init_count, headers=HEADERS)
        if response.status_code // 100 == 2:
            redis_client.set('res-canvas-draw-count', 0)
            #print('Set res-canvas-draw-count response:', response)
            app.run(debug=True, host="0.0.0.0", port=10010)
        else:
            print('Set res-canvas-draw-count response:', response)
    else:
        app.run(debug=True, host="0.0.0.0", port=10010)
