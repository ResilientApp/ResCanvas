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

# External API endpoints
RESDB_API_COMMIT = RESDB_API_COMMIT
RESDB_API_QUERY = RESDB_API_QUERY


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
        if not request_data:
            return jsonify({"status": "error", "message": "Invalid input"}), 400

        # Validate required fields
        if 'ts' not in request_data or 'value' not in request_data:
            return jsonify({"status": "error", "message": "Missing required fields: ts and value"}), 400

        # Get the canvas drawing count and increment it
        res_canvas_draw_count = get_canvas_draw_count()
        print('res_canvas_draw_count:', res_canvas_draw_count)

        request_data['id'] = "res-canvas-draw-" + str(res_canvas_draw_count)  # Adjust index

        # print('request.json:', request.json)
        # Forward the data to the external API
        response = requests.post(RESDB_API_COMMIT, json=request_data, headers=HEADERS)

        # Check response status
        if response.status_code // 100 == 2:
            # Cache the new drawing in Redis
            increment_canvas_draw_count()
            redis_client.set(request_data['id'], json.dumps(request_data))
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
        print('from_:', from_)

        # Get the canvas drawing count
        res_canvas_draw_count = get_canvas_draw_count()
        print('res_canvas_draw_count:', res_canvas_draw_count)

        all_missing_data = []
        missing_keys = []
        BATCH_SIZE = 100

        # Check Redis for existing data
        for i in range(from_, res_canvas_draw_count):
            key_id = "res-canvas-draw-" + str(i)
            data = redis_client.get(key_id)
            if data:
                # Data found in Redis
                all_missing_data.append(json.loads(data))
            else:
                # Data not in Redis, add to missing_keys
                missing_keys.append(key_id)

        # Fetch missing data from external API in batches
        for batch_start in range(0, len(missing_keys), BATCH_SIZE):
            batch_keys = missing_keys[batch_start:batch_start + BATCH_SIZE]
            print(f"Fetching batch: {batch_keys}")

            for key_id in batch_keys:
                response = requests.get(RESDB_API_QUERY + key_id)
                if response.status_code == 200:
                    if response.text and response.headers.get('Content-Type') == 'application/json':
                        data = response.json()
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

            time.sleep(0.001)  # Optional: Add a short delay to avoid overloading the external API

        # Sort the data based on index to maintain order
        all_missing_data.sort(key=lambda x: int(x['id'].split('-')[-1]))
        print(f"Get missing data success from {from_} to {res_canvas_draw_count}")
        return jsonify({"status": "success", "data": all_missing_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    # Initialize res-canvas-draw-count if not present in Redis
    if not redis_client.exists('res-canvas-draw-count'):
        init_count = {"id": "res-canvas-draw-count", "value": 0}
        response = requests.post(RESDB_API_COMMIT, json=init_count, headers=HEADERS)
        if response.status_code // 100 == 2:
            redis_client.set('res-canvas-draw-count', 0)
            print('Set res-canvas-draw-count response:', response)
            app.run(debug=True, host="0.0.0.0", port=10010)  # Start the Flask app
        else:
            print('Set res-canvas-draw-count response:', response)
    else:
        app.run(debug=True, host="0.0.0.0", port=10010)  # Start the Flask app
