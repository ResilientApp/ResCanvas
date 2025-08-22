# routes/get_canvas_data.py

from flask import Blueprint, jsonify, request
import json
import traceback
import logging
from services.canvas_counter import get_canvas_draw_count
from services.db import redis_client, strokes_coll
from config import *
import os
from pymongo import MongoClient, errors as pymongo_errors
import math
import datetime

def _extract_number_long(v):
    """Normalize various Mongo exported numeric wrappers to int."""
    try:
        if v is None:
            return None
        # case: {"$numberLong": "1748763359966"}
        if isinstance(v, dict) and "$numberLong" in v:
            return int(v["$numberLong"])
        # plain dict numeric as string
        if isinstance(v, str) and v.isdigit():
            return int(v)
        if isinstance(v, (int, float)):
            return int(v)
    except Exception:
        pass
    return None

def _parse_inner_value_to_dict(maybe_str):
    """If value is a JSON-string, parse it; otherwise if it's dict, return it."""
    if maybe_str is None:
        return None
    if isinstance(maybe_str, dict):
        return maybe_str
    if isinstance(maybe_str, str):
        try:
            return json.loads(maybe_str)
        except Exception:
            # not JSON, return None
            return None
    return None

def _find_ts_in_doc(doc):
    """
    Attempt to locate a timestamp (epoch ms) inside a document with tolerant checks.
    Returns int timestamp or None.
    """
    # Common places:
    # doc['value']['ts'] or doc['value']['timestamp']
    # doc['transactions'][...]['value']['ts'] or ['value']['timestamp']
    # doc['value']['asset']['data']['ts'] or ['timestamp']
    # if doc['value']['value'] is a JSON string, it might include "timestamp":12345
    try:
        v = doc.get('value') if isinstance(doc, dict) else None
        if isinstance(v, dict):
            # direct ts / timestamp fields
            for key in ('ts', 'timestamp', 'order'):
                candidate = v.get(key)
                n = _extract_number_long(candidate)
                if n:
                    return n
            # nested asset.data
            asset = v.get('asset')
            if isinstance(asset, dict):
                ad = asset.get('data', {})
                for key in ('ts', 'timestamp', 'order'):
                    n = _extract_number_long(ad.get(key))
                    if n:
                        return n
            # sometimes the drawing JSON is stored as a string in v['value']
            inner = _parse_inner_value_to_dict(v.get('value'))
            if inner:
                for key in ('timestamp', 'ts', 'order'):
                    if key in inner:
                        n = _extract_number_long(inner.get(key))
                        if n:
                            return n
        # transactions array
        if 'transactions' in doc and isinstance(doc['transactions'], list):
            for txn in doc['transactions']:
                tv = txn.get('value')
                if isinstance(tv, dict):
                    for key in ('ts', 'timestamp', 'order'):
                        n = _extract_number_long(tv.get(key))
                        if n:
                            return n
                    # tv.value might be JSON string
                    inner = _parse_inner_value_to_dict(tv.get('value'))
                    if inner:
                        for key in ('timestamp', 'ts', 'order'):
                            n = _extract_number_long(inner.get(key))
                            if n:
                                return n
                    # asset nested
                    asset = tv.get('asset') or (tv.get('asset', {}) if isinstance(tv, dict) else None)
                    if isinstance(asset, dict):
                        ad = asset.get('data', {})
                        for key in ('ts', 'timestamp', 'order'):
                            n = _extract_number_long(ad.get(key))
                            if n:
                                return n
    except Exception:
        pass
    return None

def _extract_user_and_inner_value(doc):
    """
    Extract a user label and a JSON-string payload similar to what getCanvasData previously returned.
    Returns tuple (user, payload_string) or (None, None)
    """
    try:
        # try doc['value'] first
        v = doc.get('value') if isinstance(doc, dict) else None
        if isinstance(v, dict):
            # if 'value' is a JSON string containing drawing data, prefer that
            if 'value' in v and isinstance(v['value'], str):
                user = v.get('user') or (v.get('asset', {}).get('data', {}).get('user'))
                return user, v['value']
            # if asset.data exists, dump it as JSON string
            if 'asset' in v and isinstance(v['asset'], dict) and isinstance(v['asset'].get('data'), dict):
                user = v.get('user') or v['asset']['data'].get('user')
                return user, json.dumps(v['asset']['data'])
            # if value['value'] is a dict, dump it
            if 'value' in v and isinstance(v['value'], dict):
                user = v.get('user')
                return user, json.dumps(v['value']['value'])
            # else last resort, dump v itself
            user = v.get('user')
            return user, json.dumps(v)
        # transactions array
        if 'transactions' in doc and isinstance(doc['transactions'], list):
            for txn in doc['transactions']:
                tv = txn.get('value')
                if isinstance(tv, dict):
                    if 'value' in tv and isinstance(tv['value'], str):
                        user = tv.get('user') or (tv.get('asset', {}).get('data', {}).get('user'))
                        return user, tv['value']
                    if 'asset' in tv and isinstance(tv['asset'], dict) and isinstance(tv['asset'].get('data'), dict):
                        user = tv.get('user') or tv['asset']['data'].get('user')
                        return user, json.dumps(tv['asset']['data'])
                    if 'value' in tv and isinstance(tv['value'], dict):
                        return tv.get('user'), json.dumps(tv['value']['value'])
        # nothing matched
    except Exception:
        pass
    return None, None

def _normalize_numberlong_in_obj(o):
    """
    Recursively walk a dict/list and convert Mongo export numeric wrappers
    like {"$numberLong":"123"} or {"$numberInt":"123"} into ints.
    Leaves other keys alone.
    """
    if o is None:
        return o
    # dict
    if isinstance(o, dict):
        # case where this dict is a numeric wrapper
        if "$numberLong" in o and isinstance(o["$numberLong"], (str, int)):
            try:
                return int(o["$numberLong"])
            except Exception:
                return o["$numberLong"]
        if "$numberInt" in o and isinstance(o["$numberInt"], (str, int)):
            try:
                return int(o["$numberInt"])
            except Exception:
                return o["$numberInt"]
        # otherwise recursively normalize fields
        newd = {}
        for k, v in o.items():
            newd[k] = _normalize_numberlong_in_obj(v)
        return newd
    # list
    if isinstance(o, list):
        return [_normalize_numberlong_in_obj(x) for x in o]
    # primitive
    return o

def get_strokes_from_mongo(start_ts=None, end_ts=None):
    """
    Robust retrieval of strokes from MongoDB. Returns a list of items like:
      { 'value': <json-string>, 'user': <string>, 'ts': <int>, 'id': <string>, 'undone': bool }
    On any error this function returns an empty list (and logs the error).
    """
    mongo_uri = os.environ.get('MONGO_ATLAS_URI') or os.environ.get('MONGO_URL')
    db_name = os.environ.get('MONGO_DB', 'canvasCache')
    coll_name = os.environ.get('MONGO_COLLECTION', 'strokes')
    if not mongo_uri:
        logging.getLogger(__name__).error("MONGO_ATLAS_URI / MONGO_URL not set in environment")
        return []

    client = None
    cursor = None
    results = []
    try:
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')

        db = client[db_name]
        coll = db[coll_name]

        query = {
            '$or': [
                { 'value.ts': { '$exists': True } },
                { 'value.timestamp': { '$exists': True } },
                { 'value.asset.data.ts': { '$exists': True } },
                { 'transactions': { '$exists': True } }
            ]
        }

        # Create a simple cursor; some Atlas tiers disallow advanced cursor flags.
        try:
            cursor = coll.find(query).batch_size(200)
        except Exception as e:
            logging.getLogger(__name__).warning(f"Mongo find with batch_size failed; falling back to default find: {e}")
            cursor = coll.find(query)

        for doc in cursor:
            try:
                ts = _find_ts_in_doc(doc)
                if ts is None:
                    continue
                if (start_ts is not None and ts < start_ts) or (end_ts is not None and ts > end_ts):
                    continue

                user, payload = _extract_user_and_inner_value(doc)
                if not payload:
                    continue

                # Parse payload into dict (or wrap as raw)
                parsed_payload = None
                if isinstance(payload, str):
                    try:
                        parsed_payload = json.loads(payload)
                    except Exception:
                        parsed_payload = {"raw": payload}
                elif isinstance(payload, dict):
                    parsed_payload = payload
                else:
                    parsed_payload = {"raw": str(payload)}

                parsed_payload = _normalize_numberlong_in_obj(parsed_payload)

                # Determine id
                doc_id = ""
                try:
                    v = doc.get('value') if isinstance(doc, dict) else {}
                    if isinstance(v, dict):
                        aid = v.get('asset', {}).get('data', {}).get('id')
                        if aid:
                            doc_id = aid
                    if not doc_id and 'transactions' in doc and isinstance(doc['transactions'], list):
                        for txn in doc['transactions']:
                            av = txn.get('value', {}).get('asset', {}).get('data', {})
                            if av and av.get('id'):
                                doc_id = av.get('id')
                                break
                except Exception:
                    doc_id = doc_id or ""

                if isinstance(parsed_payload, dict):
                    parsed_payload.setdefault("undone", False)

                results.append({
                    'value': json.dumps(parsed_payload),
                    'user': user or parsed_payload.get("user", "") or "",
                    'ts': int(ts),
                    'id': doc_id or parsed_payload.get("id") or parsed_payload.get("drawingId") or "",
                    'undone': bool(parsed_payload.get("undone", False))
                })
            except Exception as inner_exc:
                # Log the problematic document and continue (don't abort entire query)
                logging.getLogger(__name__).exception(f"Failed to process Mongo doc id={doc.get('_id') if isinstance(doc, dict) else 'unknown'}: {inner_exc}")
                continue

        # sort by timestamp ascending
        results.sort(key=lambda x: x.get('ts', 0))
        logging.getLogger(__name__).info(f"Mongo history query returned {len(results)} items for range {start_ts}..{end_ts}")
        return results

    except pymongo_errors.PyMongoError as pm_err:
        logging.getLogger(__name__).exception(f"MongoDB error while fetching strokes: {pm_err}")
        return []
    except Exception as e:
        logging.getLogger(__name__).exception(f"Unexpected error in get_strokes_from_mongo: {e}")
        return []
    finally:
        # Close cursor/client if they exist
        try:
            if cursor is not None:
                try:
                    cursor.close()
                except Exception:
                    pass
        finally:
            try:
                if client is not None:
                    client.close()
            except Exception:
                pass

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

        # --- History mode detection: read query params early so loops can use history_mode
        start_param = request.args.get('start')
        end_param = request.args.get('end')
        history_mode = bool(start_param or end_param)
        if history_mode:
            logging.getLogger(__name__).info(f"History recall mode requested: start={start_param} end={end_param}")


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
                should_include = drawing.get("id") not in undone_strokes and "ts" in drawing and isinstance(drawing["ts"], int)
                if should_include and (history_mode or drawing["ts"] > clear_timestamp):
                    wrapper = {
                        "id":                 drawing.get("id", ""),
                        "user":               drawing.get("user", ""),
                        "ts":                 drawing.get("ts"),
                        "deletion_date_flag": "",
                        "undone":             drawing.get("undone", False),
                        # keep the inner stroke JSON as a string (consistent with other codepaths)
                        "value":              json.dumps(drawing),
                        # important: top-level roomId so room filtering can shortcut
                        "roomId":             drawing.get("roomId", None)
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
                asset_data.get("id","").startswith("res-canvas-draw-") and
                isinstance(asset_data.get("ts"), int) and
                (history_mode or asset_data.get("ts") > clear_timestamp)
            ):
                wrapper = {
                    "id":                 asset_data.get("id", ""),
                    "user":               asset_data.get("user", ""),
                    "ts":                 asset_data.get("ts"),
                    "deletion_date_flag": "",
                    "undone":             asset_data.get("undone", False),
                    "value":              json.dumps(asset_data),
                    "roomId":             asset_data.get("roomId", None)
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
        history_mode = bool(start_param or end_param)

        if history_mode:
            try:
                start_ts = int(start_param) if start_param is not None and start_param != '' else None
                end_ts = int(end_param) if end_param is not None and end_param != '' else None

                # Try to fetch directly from MongoDB; fall back to in-memory filtering if anything goes wrong.
                try:
                    mongo_items = get_strokes_from_mongo(start_ts, end_ts)
                    # mongo_items should already be in the same structure as other stroke entries:
                    # each item is a dict that contains at least 'value' (string or JSON) and 'user' fields.
                    all_missing_data = mongo_items
                except Exception as me:
                    logger.warning(f"Mongo history query failed; falling back to in-memory filter: {me}")
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

        # safe sort: prefer numeric tail in id (res-canvas-draw-N), else fall back to ts
        def _id_sort_key(x):
            try:
                idv = x.get('id') or ""
                parts = idv.split("-")
                tail = parts[-1] if parts else ""
                if tail.isdigit():
                    return int(tail)
                # not numeric tail -> use timestamp
                return int(x.get('ts', 0) or 0)
            except Exception:
                return int(x.get('ts', 0) or 0)

        all_missing_data.sort(key=_id_sort_key)
        logger.error(f"[PRE-FILTER COUNT] all_missing_data length before final room filter: {len(all_missing_data)}")
        # Support roomId query param: if present, only return strokes for that room.
        room_id = request.args.get("roomId")
        if room_id:
            def _deep_json_loads(value, max_depth=4):
                """
                Attempts to parse 'value' (bytes/str/dict) into a dict by peeling nested JSON layers,
                following common shapes we see in the store:
                - bytes -> utf-8 str
                - str -> json.loads -> dict
                - dict with 'value' that is itself str/bytes/dict -> keep descending
                Stops at max_depth or on first non-decodable layer.
                Returns the deepest dict it could parse, else {}.
                """
                cur = value
                depth = 0
                while depth < max_depth:
                    # bytes → str
                    if isinstance(cur, (bytes, bytearray)):
                        try:
                            cur = cur.decode("utf-8")
                        except Exception:
                            break

                    # str → dict (if JSON)
                    if isinstance(cur, str):
                        try:
                            cur = json.loads(cur)
                        except Exception:
                            # not JSON; stop
                            break

                    # dict → descend into .value when present
                    if isinstance(cur, dict):
                        # we've got a dict; see if the useful payload is at this level
                        # or if it's wrapped one level deeper inside "value"
                        if "value" in cur and isinstance(cur["value"], (dict, str, bytes)):
                            cur = cur["value"]
                            depth += 1
                            continue
                        # nothing else to descend into
                        return cur

                    # anything else → stop
                    break

                return cur if isinstance(cur, dict) else {}


            def _extract_room_id_from_any(entry):
                """
                Extracts roomId from:
                - top-level (entry.get("roomId"))
                - entry["value"] (including nested value->"value" JSON string)
                Returns string roomId or None.
                """
                # 1) top-level
                rid = entry.get("roomId")
                if isinstance(rid, str) and rid.strip():
                    return rid

                # 2) value (possibly nested)
                v = entry.get("value")
                parsed = _deep_json_loads(v)
                rid = parsed.get("roomId")
                if isinstance(rid, str) and rid.strip():
                    return rid

                # No roomId found anywhere
                return None


            def _entry_has_room(entry, room_id):
                """
                True if entry belongs to 'room_id' after checking top-level and nested value payloads.
                """
                rid = _extract_room_id_from_any(entry)
                return (rid == room_id)

            # Apply filter while preserving original ordering
            all_missing_data = [e for e in all_missing_data if _entry_has_room(e, room_id)]
        logger.error(all_missing_data)

        for entry in all_missing_data:
            logger.error(f"[FINAL RETURN] {json.dumps(entry, indent=2)}")
        return jsonify({"status": "success", "data": all_missing_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
