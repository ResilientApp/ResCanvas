import json
import time
import requests
from flask import Flask, jsonify, request
from flask_cors import CORS
import threading
import redis
from config import *
import asyncio
from resilient_python_cache import ResilientPythonCache, MongoConfig, ResilientDBConfig
import motor.motor_asyncio
from pymongo import MongoClient
from pymongo.server_api import ServerApi
import logging
from logging.handlers import RotatingFileHandler

logging.basicConfig(
    level=logging.DEBUG,  # adjust to DEBUG for development
    format="%(asctime)s [%(levelname)s] %(name)s:%(lineno)d – %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

handler = RotatingFileHandler(
    LOG_FILE, maxBytes=1*1024*1024, backupCount=1
)
handler.setLevel(logging.DEBUG)
handler.setFormatter(logging.Formatter(
    "%(asctime)s [%(levelname)s] %(name)s:%(lineno)d – %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
))
logging.getLogger().addHandler(handler)

logger = logging.getLogger(__name__)
mongo_client = MongoClient(MONGO_URI, server_api=ServerApi('1'))
strokes_coll = mongo_client[DB_NAME][COLLECTION_NAME]

def commit_transaction_via_graphql(payload: dict) -> str:
    import json
    mutation = """
    mutation PostTransaction($data: PrepareAsset!) {
      postTransaction(data: $data) { id }
    }
    """
    body = {
        "query": mutation,
        "variables": {"data": payload},
        "operationName": "PostTransaction"
    }

    resp = requests.post(
        GRAPHQL_URL,
        json=body,
        headers={**HEADERS, "Content-Type": "application/json"}
    )

    # Parse JSON (or raise if it isn't JSON)
    try:
        result = resp.json()
    except ValueError:
        logger.error("GraphQL did not return JSON:", resp.text)
        resp.raise_for_status()
    
    logger.error(f"[GraphQL {resp.status_code}] response:")
    logger.error(json.dumps(result, indent=2))

    if result.get("errors"):
        errs = result["errors"]
        raise RuntimeError(f"GraphQL errors: {errs}")

    if resp.status_code // 100 != 2:
        raise RuntimeError(f"HTTP {resp.status_code} from GraphQL")

    return result["data"]["postTransaction"]["id"]

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
        block = strokes_coll.find_one(
            {"transactions.value.asset.data.id": "res-canvas-draw-count"},
            sort=[("id", -1)]
        )
        if block:
            tx = next(
                (t for t in block["transactions"]
                if t.get("value", {}).get("asset", {}).get("data", {}).get("id") == "res-canvas-draw-count"),
                None
            )
            if tx:
                count = tx["value"]["asset"]["data"].get("value", 0)
                redis_client.set("res-canvas-draw-count", count)
            else:
                raise KeyError("Found block but no matching txn for res-canvas-draw-count")
        else:
            raise KeyError("No Mongo block found for res-canvas-draw-count")

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
        increment_count = {
            "operation": "CREATE",
            "amount": 1,
            "signerPublicKey": SIGNER_PUBLIC_KEY,
            "signerPrivateKey": SIGNER_PRIVATE_KEY,
            "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
            "asset": {
                "data": {
                    "id": "res-canvas-draw-count",
                    "value": count
                }
            }
        }
        commit_transaction_via_graphql(increment_count)

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
            return jsonify({"status": "error", "message": "Missing required field: ts"}), 400

        request_data['id'] = 'clear-canvas-timestamp'
        ts_value = request_data['ts']

        count_data = {
            "id": "draw_count_clear_canvas",
            "value": get_canvas_draw_count()
        }

        # Prepare both GraphQL transactions
        clear_payload = {
            "operation": "CREATE",
            "amount": 1,
            "signerPublicKey": SIGNER_PUBLIC_KEY,
            "signerPrivateKey": SIGNER_PRIVATE_KEY,
            "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
            "asset": {"data": request_data}
        }
        count_payload = {
            "operation": "CREATE",
            "amount": 1,
            "signerPublicKey": SIGNER_PUBLIC_KEY,
            "signerPrivateKey": SIGNER_PRIVATE_KEY,
            "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
            "asset": {"data": count_data}
        }

        # Commit both via GraphQL
        commit_transaction_via_graphql(clear_payload)
        commit_transaction_via_graphql(count_payload)

        # Cache in Redis
        redis_client.set(request_data['id'], ts_value)
        redis_client.set(count_data['id'], count_data['value'])

        # Clear all undo/redo stacks in Redis
        for key in redis_client.scan_iter("undo-*"):
            redis_client.delete(key)
        for key in redis_client.scan_iter("redo-*"):
            redis_client.delete(key)

        return jsonify({"status": "success", "message": "timestamp submitted successfully"}), 201
    except Exception as e:
        import traceback
        traceback.print_exc()
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
        request_data.pop('undone', None)

        logger.error("submit_new_line request_data:")
        logger.error(request_data)

        # Commit via GraphQL instead of raw REST
        full_data = {
            "id":    request_data["id"],
            "ts":    request_data["ts"],
            "user":  request_data["user"],
            **json.loads(request_data["value"])
        }
        prep = {
            "operation": "CREATE",
            "amount": 1,
            "signerPublicKey": SIGNER_PUBLIC_KEY,
            "signerPrivateKey": SIGNER_PRIVATE_KEY,
            "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
            "asset": {"data": full_data}
        }
        txn_id = commit_transaction_via_graphql(prep)
        request_data['txnId'] = txn_id

        # Cache the new drawing in Redis
        increment_canvas_draw_count()
        cache_entry = full_data.copy()
        cache_entry['txnId'] = txn_id
        redis_client.set(cache_entry['id'], json.dumps(cache_entry))

        # Update user's undo/redo stacks
        redis_client.lpush(f"{user_id}:undo", json.dumps(request_data))
        redis_client.delete(f"{user_id}:redo")  # Clear redo stack

        return jsonify({"status": "success", "message": "Line submitted successfully"}), 201
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            "status": "error",
            "message": "GraphQL commit failed",
            "details": str(e)
        }), 500

# GET endpoint: getCanvasData
@app.route('/getCanvasData', methods=['GET'])
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
        all_missing_data = active_strokes
        logger.error(all_missing_data)

        all_missing_data.sort(key=lambda x: int(x["id"].split("-")[-1]))
        logger.error(all_missing_data)

        for entry in all_missing_data:
            logger.error(f"[FINAL RETURN] {json.dumps(entry, indent=2)}")
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

        raw = redis_client.lpop(f"{user_id}:undo")
        stroke_object = json.loads(raw)
        
        stroke_object["undone"] = True
        stroke_object["ts"]     = int(time.time() * 1000)
        logger.error("Re-undo stroke object")
        logger.error(stroke_object)

        undo_wrapper = {
            "id":                f"undo-{stroke_object['id']}",
            "user":              user_id,
            "ts":                stroke_object["ts"],
            "deletion_date_flag":"",
            "undone":            True,
            "value":             json.dumps(stroke_object)
        }

        redis_client.lpush(f"{user_id}:redo", json.dumps(stroke_object))
        redis_client.set(undo_wrapper["id"], json.dumps(undo_wrapper))

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
        import traceback
        traceback.print_exc()
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

        raw = redis_client.lpop(f"{user_id}:redo")
        stroke_object = json.loads(raw)
        
        stroke_object.pop("undone", None)
        stroke_object["ts"]     = int(time.time() * 1000)
        logger.error("Re-redo stroke object:", stroke_object)

        redo_wrapper = {
            "id":                f"redo-{stroke_object['id']}",
            "user":              user_id,
            "ts":                stroke_object["ts"],
            "deletion_date_flag":"",
            "undone":            False,
            "value":             json.dumps(stroke_object)
        }

        redis_client.lpush(f"{user_id}:undo", json.dumps(stroke_object))
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
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == '__main__':
    # Initialize res-canvas-draw-count if not present in Redis
    if not redis_client.exists('res-canvas-draw-count'):
        init_count = {"id": "res-canvas-draw-count", "value": 0}
        logger.error("Initialize res-canvas-draw-count if not present in Redis: ", init_count)
        init_payload = {
            "operation": "CREATE",
            "amount": 1,
            "signerPublicKey": SIGNER_PUBLIC_KEY,
            "signerPrivateKey": SIGNER_PRIVATE_KEY,
            "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
            "asset": {
                "data": {
                    "id": "res-canvas-draw-count",
                    "value": 0
                }
            }
        }

        commit_transaction_via_graphql(init_payload)
        redis_client.set('res-canvas-draw-count', 0)

        app.run(debug=True, host="0.0.0.0", port=10010)
    else:
        app.run(debug=True, host="0.0.0.0", port=10010)
