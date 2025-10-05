# routes/get_canvas_data.py

from flask import Blueprint, jsonify, request
import json
import traceback
import logging
from services.canvas_counter import get_canvas_draw_count
from services.db import redis_client, strokes_coll, rooms_coll
from services.crypto_service import unwrap_room_key, decrypt_for_room
from bson import ObjectId
from config import *
import os
from pymongo import MongoClient, errors as pymongo_errors
import math
import datetime
from cryptography.exceptions import InvalidTag

def _try_int(v, default=None):
    """Safe int conversion supporting bytes and Mongo numeric wrappers."""
    try:
        if v is None:
            return default
        if isinstance(v, (bytes, bytearray)):
            v = v.decode()
        if isinstance(v, dict) and "$numberLong" in v:
            return int(v["$numberLong"])
        if isinstance(v, str) and v.isdigit():
            return int(v)
        if isinstance(v, (int, float)):
            return int(v)
    except Exception:
        return default
    return default


def _id_repr(doc):
    """Safe representation of a document _id for logging."""
    try:
        if not doc:
            return '<no-doc>'
        _id = doc.get('_id') if isinstance(doc, dict) else None
        return str(_id) if _id is not None else '<no-id>'
    except Exception:
        return '<invalid-id>'

def _find_marker_value_from_mongo(marker_id: str):
    """
    Look up a small persisted marker (draw_count_clear_canvas or similar) in Mongo.
    Returns an int value if found, else None.
    """
    try:
        block = strokes_coll.find_one(
            {"transactions.value.asset.data.id": marker_id},
            sort=[("_id", -1)]
        )
    except Exception:
        block = None
    if not block:
        return None
    # find the most relevant transaction inside the block
    txs = block.get("transactions", []) or []
    best_val = None
    for tx in reversed(txs):
        if not isinstance(tx, dict):
            continue
        v = tx.get("value") or {}
        asset = (v.get("asset") or {}).get("data", {}) if isinstance(v.get("asset"), dict) else {}
        if not isinstance(asset, dict):
            continue
        if asset.get("id") != marker_id:
            continue
        # marker value commonly stored in asset.data.value or asset.data.ts
        cand = asset.get("value", asset.get("ts", asset.get("timestamp", asset.get("order"))))
        ival = _try_int(cand, None)
        if ival is not None:
            best_val = ival
            break
    return best_val

def _extract_number(v, default=0):
    try:
        if v is None:
            return default
        if isinstance(v, dict) and '$numberLong' in v:
            return int(v['$numberLong'])
        if isinstance(v, (int, float)):
            return int(v)
        if isinstance(v, str) and v.isdigit():
            return int(v)
    except Exception:
        pass
    return default

def _find_marker_ts_from_mongo(marker_id: str):
    """
    Find the most recent transaction in Mongo that contains an asset.data.id == marker_id
    and return the best timestamp found inside that small asset object.
    """
    try:
        block = strokes_coll.find_one(
            {"transactions.value.asset.data.id": marker_id},
            sort=[('_id', -1)]
        )
        if not block:
            return 0
        txs = block.get('transactions') or []
        # walk reversed so we get latest relevant embedded entry
        for tx in reversed(txs):
            val = tx.get('value', {}) or {}
            asset = (val.get('asset') or {}).get('data', {}) if isinstance(val.get('asset'), dict) else {}
            if isinstance(asset, dict) and asset.get('id') == marker_id:
                for key in ('ts', 'timestamp', 'order', 'value'):
                    if key in asset:
                        return _extract_number(asset.get(key), 0)
            # sometimes the marker is placed directly inside tx.value
            if isinstance(val, dict):
                dat = val.get('asset', {}).get('data') if val.get('asset') else None
                if isinstance(dat, dict) and dat.get('id') == marker_id:
                    for key in ('ts', 'timestamp', 'order', 'value'):
                        if key in dat:
                            return _extract_number(dat.get(key), 0)
        return 0
    except Exception:
        logger.exception("Failed reading marker %s from Mongo", marker_id)
        return 0

def _get_effective_clear_ts(room_id: str):
    """
    Return the effective clear timestamp (ms) for a given room:
    max(room-specific last-clear-ts, global last-clear-ts).
    Prefer Redis canonical cache keys, fall back to legacy redis keys,
    then fall back to reading the persisted ResDB/Mongo markers.
    """
    room_cache = f"last-clear-ts:{room_id}" if room_id else None
    room_legacy = f"clear-canvas-timestamp:{room_id}" if room_id else None
    global_cache = "last-clear-ts"
    global_legacy = "clear-canvas-timestamp"

    def _try_int(v):
        try:
            if v is None:
                return None
            if isinstance(v, (bytes, bytearray)):
                v = v.decode()
            return int(v)
        except Exception:
            return None

    room_ts = None
    if room_cache:
        try:
            room_ts = _try_int(redis_client.get(room_cache))
        except Exception:
            room_ts = None
        if room_ts is None:
            try:
                room_ts = _try_int(redis_client.get(room_legacy))
            except Exception:
                room_ts = None
    try:
        global_ts = _try_int(redis_client.get(global_cache))
    except Exception:
        global_ts = None
    if global_ts is None:
        try:
            global_ts = _try_int(redis_client.get(global_legacy))
        except Exception:
            global_ts = None

    if room_ts is None and room_cache:
        room_ts = _find_marker_ts_from_mongo(room_legacy or f"clear-canvas-timestamp:{room_id}")
    if global_ts is None:
        global_ts = _find_marker_ts_from_mongo("clear-canvas-timestamp")

    return max(room_ts or 0, global_ts or 0)

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

def get_strokes_from_mongo(start_ts=None, end_ts=None, room_id=None):
    """
    Robust retrieval of strokes from MongoDB, optionally scoped to a room.
    Returns a list of items like:
      { 'value': <json-string>, 'user': <string>, 'ts': <int>, 'id': <string>, 'undone': bool }

    If room_id is provided, the Mongo query will try to restrict results to that room
    (matching several common storage shapes), and when possible we will attempt to
    decrypt per-room 'encrypted' bundles using the room's wrappedKey.

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

        # Base time-presence query (keep shapes that include timestamps in common places)
        base_or = [
            { 'value.ts': { '$exists': True } },
            { 'value.timestamp': { '$exists': True } },
            { 'value.asset.data.ts': { '$exists': True } },
            { 'transactions': { '$exists': True } }
        ]
        query = { '$or': base_or }

        # If a specific room_id is requested, include room-scoped filters to allow Mongo to narrow results.
        if room_id:
            room_clauses = [
                {'roomId': room_id},
                {'value.roomId': room_id},
                {'value.asset.data.roomId': room_id},
                {'transactions.value.asset.data.roomId': room_id},
            ]
            # Combine: require the base time-presence OR (but also require at least one of the room clauses)
            query = {
                '$and': [
                    query,
                    { '$or': room_clauses }
                ]
            }

        # Create a cursor; some Atlas tiers disallow advanced cursor flags.
        try:
            cursor = coll.find(query).batch_size(200)
        except Exception as e:
            logging.getLogger(__name__).warning(f"Mongo find with batch_size failed; falling back to default find: {e}")
            cursor = coll.find(query)

        # Pre-fetch the room_doc if we have a room_id (to allow decrypt)
        room_doc = None
        if room_id:
            try:
                # Try ObjectId then string _id, then roomId field
                try:
                    room_doc = rooms_coll.find_one({"_id": ObjectId(room_id)})
                except Exception:
                    room_doc = rooms_coll.find_one({"_id": room_id}) or rooms_coll.find_one({"roomId": room_id})
            except Exception:
                room_doc = None

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

                # Normalize the payload into a dict or fallback wrapper
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

                # Attempt decryption for private rooms if parsed_payload contains an 'encrypted' bundle
                # or nested 'value' that itself contains an 'encrypted' bundle. This helps history mode return
                # plaintext strokes right away when room_id is known.
                try:
                    def _try_decrypt_payload_for_room(parsed, room_doc_local):
                        # top-level
                        if isinstance(parsed, dict) and isinstance(parsed.get("encrypted"), dict):
                            if room_doc_local and room_doc_local.get("wrappedKey"):
                                try:
                                    rk = unwrap_room_key(room_doc_local["wrappedKey"])
                                    decrypted = decrypt_for_room(rk, parsed["encrypted"])
                                    inner = json.loads(decrypted.decode('utf-8')) if isinstance(decrypted, (bytes, bytearray)) else json.loads(decrypted)
                                    # merge decrypted inner (without overwriting)
                                    for kk,vv in inner.items():
                                        if kk not in parsed:
                                            parsed[kk] = vv
                                    parsed.pop("encrypted", None)
                                except Exception:
                                    # leave as-is; higher-level fallback can still attempt decryption
                                    pass
                        # nested inside 'value'
                        inner = parsed.get("value")
                        if isinstance(inner, str):
                            try:
                                ip = json.loads(inner)
                                if isinstance(ip, dict) and isinstance(ip.get("encrypted"), dict):
                                    if room_doc_local and room_doc_local.get("wrappedKey"):
                                        try:
                                            rk = unwrap_room_key(room_doc_local["wrappedKey"])
                                            decrypted = decrypt_for_room(rk, ip["encrypted"])
                                            inner_dec = json.loads(decrypted.decode('utf-8')) if isinstance(decrypted, (bytes, bytearray)) else json.loads(decrypted)
                                            parsed["value"] = inner_dec
                                            return parsed
                                        except Exception:
                                            pass
                            except Exception:
                                pass
                        elif isinstance(inner, dict) and isinstance(inner.get("encrypted"), dict):
                            if room_doc_local and room_doc_local.get("wrappedKey"):
                                try:
                                    rk = unwrap_room_key(room_doc_local["wrappedKey"])
                                    decrypted = decrypt_for_room(rk, inner["encrypted"])
                                    inner_dec = json.loads(decrypted.decode('utf-8')) if isinstance(decrypted, (bytes, bytearray)) else json.loads(decrypted)
                                    parsed["value"] = inner_dec
                                except Exception:
                                    pass
                        return parsed

                    parsed_payload = _try_decrypt_payload_for_room(parsed_payload, room_doc)
                except Exception:
                    # don't fail whole loop on decrypt errors
                    pass

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
                logging.getLogger(__name__).exception(f"Failed to process Mongo doc {_id_repr(doc)}: {inner_exc}")
                continue

        # sort by timestamp ascending
        results.sort(key=lambda x: x.get('ts', 0))
        logging.getLogger(__name__).info(f"Mongo history query returned {len(results)} items for range {start_ts}..{end_ts} room={room_id}")
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

        room_id = request.args.get("roomId") or request.args.get("room_id")
        clear_after = _get_effective_clear_ts(room_id)

        clear_key_room = f"draw_count_clear_canvas:{room_id}" if room_id else None
        room_count = None
        global_count = None
        
        try:
            if clear_key_room:
                rv = redis_client.get(clear_key_room)
                if rv is not None:
                    room_count = int(rv.decode()) if isinstance(rv, bytes) else int(rv)
            gv = redis_client.get("draw_count_clear_canvas")
            if gv is not None:
                global_count = int(gv.decode()) if isinstance(gv, bytes) else int(gv)
        except Exception:
            room_count = room_count if isinstance(room_count, int) else None
            global_count = global_count if isinstance(global_count, int) else None
        
        # Mongo fallback where Redis didn't have the value
        if room_count is None and clear_key_room:
            try:
                room_count = _find_marker_ts_from_mongo(clear_key_room) or _find_marker_ts_from_mongo(f"res-canvas-draw-count:{room_id}")
            except Exception:
                room_count = room_count if isinstance(room_count, int) else None
            if isinstance(room_count, int):
                try:
                    redis_client.set(clear_key_room, int(room_count))
                except Exception:
                    pass
        
        if global_count is None:
            try:
                global_count = _find_marker_ts_from_mongo("draw_count_clear_canvas") or _find_marker_ts_from_mongo("res-canvas-draw-count")
            except Exception:
                global_count = global_count if isinstance(global_count, int) else None
            if isinstance(global_count, int):
                try:
                    redis_client.set("draw_count_clear_canvas", int(global_count))
                except Exception:
                    pass
        
        count_value_clear_canvas = max(room_count or 0, global_count or 0)

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

        try:
            # We'll scan for both undo- and redo- prefix markers.
            # Query uses a simple regex on the stored asset.data.id field inside
            # transactions. This may be somewhat heavy but is necessary for recovery.
            for prefix in ("undo-", "redo-"):
                # Find any transaction blocks that contain an asset.data.id starting with the prefix.
                # We sort latest-first by _id so we see the most recent writes earliest.
                try:
                    cursor = strokes_coll.find(
                        {"transactions.value.asset.data.id": {"$regex": f"^{prefix}"}},
                        sort=[("_id", -1)]
                    )
                except Exception:
                    cursor = strokes_coll.find({"transactions.value.asset.data.id": {"$regex": f"^{prefix}"}})

                for doc in cursor:
                    try:
                        txs = doc.get("transactions") or []
                        for tx in txs:
                            if not isinstance(tx, dict):
                                continue
                            v = tx.get("value") or {}
                            asset = (v.get("asset") or {}).get("data") if isinstance(v.get("asset"), dict) else {}
                            if not isinstance(asset, dict):
                                continue
                            aid = asset.get("id")
                            if not aid or not aid.startswith(prefix):
                                continue
                            # extract ts (handle $numberLong wrappers)
                            cand_ts = asset.get("ts") or asset.get("timestamp") or asset.get("order") or 0
                            try:
                                if isinstance(cand_ts, dict) and "$numberLong" in cand_ts:
                                    ts_val = int(cand_ts["$numberLong"])
                                else:
                                    ts_val = int(cand_ts)
                            except Exception:
                                ts_val = 0
                            undone_flag = bool(asset.get("undone", True if prefix == "undo-" else False))
                            user_val = asset.get("user")
                            # canonical stroke id without prefix
                            sid = aid.replace(prefix, "")
                            rec = {"id": aid, "user": user_val, "ts": ts_val, "undone": undone_flag}
                            existing = stroke_states.get(sid)
                            if not existing or ts_val > (existing.get("ts", 0) or 0):
                                # store keyed by the non-prefixed stroke-id like Redis code expects
                                stroke_states[sid] = rec
                    except Exception:
                        # continue processing other txs/docs even if one fails
                        continue
        except Exception:
            logger.exception("Failed scanning Mongo for undo/redo markers")

        # Build the set of strokes currently marked as undone.
        undone_strokes = set()
        for stroke_id, state in stroke_states.items():
            if state.get("undone"):
                undone_strokes.add(stroke_id)

        # Check Redis for existing data
        logger.error("count_value_clear_canvas")
        logger.error(count_value_clear_canvas)
        logger.error(res_canvas_draw_count)
        
        try:
            # Ensure integer bounds
            try:
                start_idx = int(count_value_clear_canvas or 0)
            except Exception:
                start_idx = 0
            try:
                end_idx = int(res_canvas_draw_count or 0)
            except Exception:
                end_idx = 0

            for i in range(start_idx, end_idx):
                key_id = f"res-canvas-draw-{i}"
                drawing = None

                # 1) Try Redis cached entry first
                try:
                    raw = redis_client.get(key_id)
                    if raw:
                        try:
                            drawing = json.loads(raw)
                        except Exception:
                            # raw could be bytes that needs decoding
                            try:
                                drawing = json.loads(raw.decode()) if isinstance(raw, (bytes, bytearray)) else None
                            except Exception:
                                drawing = None
                except Exception:
                    drawing = None

                # 2) If not in Redis, try Mongo fallback for this specific key
                if not drawing:
                    try:
                        block = strokes_coll.find_one(
                            {"transactions.value.asset.data.id": key_id},
                            sort=[("_id", -1)]
                        )
                    except Exception:
                        block = None

                    if block:
                        # find transactions inside the block that reference this key_id
                        txs = []
                        for t in block.get("transactions", []):
                            if not isinstance(t, dict):
                                continue
                            val = t.get("value")
                            if isinstance(val, dict):
                                asset = (val.get("asset") or {}).get("data", {})
                                if isinstance(asset, dict) and asset.get("id") == key_id:
                                    txs.append(t)
                        # pick the latest tx for this key (by ts / timestamp / order)
                        if txs:
                            def _tx_ts(tt):
                                v = tt.get("value") or {}
                                asset = (v.get("asset") or {}).get("data", {}) if isinstance(v.get("asset"), dict) else {}
                                candidate = asset.get("ts") or asset.get("timestamp") or asset.get("order") or 0
                                # unwrap mongodb numeric wrappers
                                if isinstance(candidate, dict) and "$numberLong" in candidate:
                                    try:
                                        return int(candidate["$numberLong"])
                                    except Exception:
                                        return 0
                                try:
                                    return int(candidate)
                                except Exception:
                                    return 0
                            tx = max(txs, key=_tx_ts)
                            asset_data = (tx.get("value") or {}).get("asset", {}).get("data", {}) or {}

                            # if a JSON-string 'value' is embedded, merge it
                            if isinstance(asset_data.get("value"), str):
                                try:
                                    inner = json.loads(asset_data["value"])
                                    if isinstance(inner, dict):
                                        asset_data.update(inner)
                                        asset_data.pop("value", None)
                                except Exception:
                                    pass

                            # Normalize any Mongo numeric wrappers and booleans
                            try:
                                asset_data = _normalize_numberlong_in_obj(asset_data)
                            except Exception:
                                pass

                            asset_data["undone"] = bool(asset_data.get("undone", False))
                            # ensure id present
                            asset_data["id"] = asset_data.get("id") or key_id
                            # cache into Redis for next time
                            try:
                                redis_client.set(key_id, json.dumps(asset_data))
                            except Exception:
                                pass
                            drawing = asset_data

                # 3) If we have a drawing (from Redis or Mongo), normalize ts and decide inclusion
                if drawing:
                    # normalize ts into an int if possible
                    dts = drawing.get("ts") or drawing.get("timestamp")
                    if isinstance(dts, dict) and "$numberLong" in dts:
                        try:
                            dts = int(dts["$numberLong"])
                        except Exception:
                            dts = None
                    elif isinstance(dts, (str, bytes, bytearray)) and str(dts).isdigit():
                        try:
                            dts = int(dts)
                        except Exception:
                            dts = None
                    elif isinstance(dts, (int, float)):
                        dts = int(dts)
                    else:
                        dts = None
                    drawing["ts"] = dts

                    if (drawing.get("id") not in undone_strokes) and isinstance(drawing.get("ts"), int) and (history_mode or drawing["ts"] > clear_after):
                        wrapper = {
                            "id":                 drawing.get("id", ""),
                            "user":               drawing.get("user", "") or drawing.get("user", ""),
                            "ts":                 drawing.get("ts"),
                            "deletion_date_flag": "",
                            "undone":             bool(drawing.get("undone", False)),
                            "value":              json.dumps(drawing),
                            "roomId":             drawing.get("roomId", None)
                        }
                        all_missing_data.append(wrapper)
        except Exception as e:
            # In case of unexpected failure in the recovery loop, fall back to the older counter-based scan
            logger.exception("Recovery loop failed; falling back to counter-range. Error: %s", e)
            for i in range(int(count_value_clear_canvas or 0), int(res_canvas_draw_count or 0)):
                key_id = "res-canvas-draw-" + str(i)
                try:
                    data = redis_client.get(key_id)
                    if not data:
                        continue
                    drawing = json.loads(data) if not isinstance(data, (bytes, bytearray)) else json.loads(data.decode())
                except Exception:
                    continue
                dts = drawing.get("ts")
                try:
                    dts = int(dts) if dts is not None else None
                except Exception:
                    dts = None
                drawing["ts"] = dts
                should_include = drawing.get("id") not in undone_strokes and isinstance(drawing.get("ts"), int)
                if should_include and (history_mode or drawing["ts"] > clear_after):
                    wrapper = {
                        "id":                 drawing.get("id", ""),
                        "user":               drawing.get("user", ""),
                        "ts":                 drawing.get("ts"),
                        "deletion_date_flag": "",
                        "undone":             drawing.get("undone", False),
                        "value":              json.dumps(drawing),
                        "roomId":             drawing.get("roomId", None)
                    }
                    all_missing_data.append(wrapper)
                    
        # If we had missing cached res-canvas keys, attempt to recover them from Mongo in bulk.
        mongo_map = {}
        if missing_keys:
            try:
                # Use the robust helper to fetch strokes persisted after clear_after.
                # This is a single bulk query and is used only as a fallback when many cache keys are missing.
                mongo_items = get_strokes_from_mongo(clear_after, None, room_id)
                # Build a quick id -> item map for lookup
                for it in mongo_items:
                    iid = it.get("id")
                    if iid:
                        mongo_map[str(iid)] = it
            except Exception:
                mongo_map = {}

        for key_str, idx in missing_keys:
            # First try to find a direct transaction block (fast path)
            block = strokes_coll.find_one(
                {"transactions.value.asset.data.id": key_str},
                sort=[("_id", -1)]
            )

            logger.debug("attempting recovery for %s", key_str)

            # 1) If block exists, use the latest matching tx (existing logic)
            if block:
                matching_txs = [
                    t for t in block.get("transactions", [])
                    if t.get("value", {}).get("asset", {}).get("data", {}).get("id") == key_str
                ]
                tx = max(matching_txs, key=lambda t: _extract_number(t.get("value", {}).get("asset", {}).get("data", {}).get("ts", 0)), default=None)
                if not tx:
                    logger.debug("Found block %s but no matching txn inside for %s", block.get('_id'), key_str)
                    continue
                asset_data = tx["value"]["asset"]["data"]
            else:
                # 2) Fast bulk fallback: check the mongo_map we populated via get_strokes_from_mongo()
                found = mongo_map.get(key_str)
                if found:
                    # 'found' items are from get_strokes_from_mongo and have at least 'value','ts','user','id'
                    try:
                        payload = found.get("value")
                        parsed = json.loads(payload) if isinstance(payload, str) else payload
                    except Exception:
                        parsed = {"raw": payload}
                    asset_data = parsed if isinstance(parsed, dict) else {"raw": parsed}
                    asset_data["id"] = key_str
                    # ensure ts and user populated
                    asset_data["ts"] = int(found.get("ts") or asset_data.get("ts") or 0)
                    asset_data["user"] = found.get("user") or asset_data.get("user")
                else:
                    # 3) last-resort: try room-specific plaintext/decrypt scan as before (kept for completeness)
                    logger.debug("no direct block found for %s; attempting room-specific scan", key_str)
                    rid = request.args.get("roomId") or request.args.get("room_id")
                    doc = None
                    inner = None
                    room_doc = None

                    if rid:
                        try:
                            room_doc = rooms_coll.find_one({"_id": ObjectId(rid)})
                        except Exception:
                            room_doc = None
                        try:
                            doc = strokes_coll.find_one({"roomId": rid, "stroke.id": key_str})
                        except Exception:
                            doc = None
                        if not doc and room_doc and room_doc.get("type") in ("private", "secure"):
                            try:
                                rk = unwrap_room_key(room_doc["wrappedKey"])
                                for _doc in strokes_coll.find({"roomId": rid, "blob": {"$exists": True}}):
                                    try:
                                        candidate = decrypt_for_room(rk, _doc["blob"])
                                        candidate = json.loads(candidate.decode()) if isinstance(candidate, (bytes, bytearray)) else json.loads(candidate)
                                        if candidate.get("id") == key_str:
                                            inner = candidate
                                            break
                                    except Exception:
                                        continue
                            except Exception as _e:
                                logger.warning(f"get_canvas_data: decrypt scan failed for room {rid}: {_e}")

                    if doc or inner:
                        if inner is None:
                            inner = doc.get("stroke") if doc else inner
                        asset_data = {
                            "id": key_str,
                            "roomId": rid,
                            "ts": inner.get("timestamp") or inner.get("ts"),
                            "user": inner.get("user"),
                            "undone": bool(inner.get("undone", False)),
                        }
                        asset_data.update(inner)
                    else:
                        logger.debug(f"No Mongo block or fallback found for {key_str}")
                        continue

            if isinstance(asset_data.get("value"), str):
                try:
                    inner = json.loads(asset_data["value"])
                    asset_data.update(inner)
                    asset_data.pop("value", None)
                except Exception:
                    pass

            asset_data["undone"] = asset_data.get("undone", False)

            # Cache recovered stroke in Redis for next calls
            try:
                redis_client.set(key_str, json.dumps(asset_data))
            except Exception:
                logger.exception("Failed to cache recovered %s into Redis", key_str)

            # Only accept strokes after clear_after and correct prefix
            try:
                ast_ts = int(asset_data.get("ts")) if asset_data.get("ts") is not None else 0
            except Exception:
                ast_ts = 0

            if (
                asset_data.get("id","").startswith("res-canvas-draw-") and
                asset_data.get("id") not in undone_strokes and  # CRITICAL: Add undo filtering!
                (history_mode or ast_ts > clear_after)
            ):
                wrapper = {
                    "id":                 asset_data.get("id", ""),
                    "user":               asset_data.get("user", ""),
                    "ts":                 ast_ts,
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

        # logger.error(latest_entries)

        # Keep only the strokes whose latest version is not undone
        all_missing_data = [
            entry for entry in latest_entries.values()
            if not entry.get("undone", False)
        ]

        # logger.error(all_missing_data)


        # Now fetch the set of cut stroke IDs from Redis
        cut_set_key = f"cut-stroke-ids:{room_id}" if room_id else "cut-stroke-ids"
        try:
            raw_cut = redis_client.smembers(cut_set_key)
            cut_ids = set(x.decode() if isinstance(x, (bytes, bytearray)) else str(x) for x in (raw_cut or set()))
        except Exception:
            cut_ids = set()

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
                    mongo_items = get_strokes_from_mongo(start_ts, end_ts, room_id)
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
            #logger.error(all_missing_data)

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
        #logger.error(all_missing_data)

        # Decrypt pass to ensure that encrypted bundles inside returned entries get decrypted
        for entry in all_missing_data:
            try:
                raw_val = entry.get("value")
                parsed = None
                if isinstance(raw_val, str):
                    try:
                        parsed = json.loads(raw_val)
                    except Exception:
                        parsed = None
                elif isinstance(raw_val, dict):
                    parsed = raw_val

                if isinstance(parsed, dict) and isinstance(parsed.get("encrypted"), dict):
                    enc = parsed.get("encrypted")
                    rid = entry.get("roomId") or parsed.get("roomId")
                    room_doc = None
                    if rid:
                        try:
                            room_doc = rooms_coll.find_one({"_id": ObjectId(rid)})
                        except Exception:
                            room_doc = rooms_coll.find_one({"_id": rid})
                    if room_doc and room_doc.get("wrappedKey"):
                        try:
                            rk = unwrap_room_key(room_doc["wrappedKey"])
                            dec = decrypt_for_room(rk, enc)
                            dec_text = dec.decode("utf-8") if isinstance(dec, (bytes, bytearray)) else str(dec)
                            entry["value"] = dec_text
                        except InvalidTag:
                            logger.warning("get_canvas_data: InvalidTag decrypt final entry %s", entry.get("id"))
                        except Exception:
                            logger.exception("get_canvas_data: failed final decrypt for entry %s", entry.get("id"))
            except Exception:
                logger.exception("get_canvas_data: unexpected error while final decrypting entry")
            # logger.error(f"[FINAL RETURN] {json.dumps(entry, indent=2)}")
        logger.error(f"[POST-FILTER COUNT] all_missing_data length after final room filter: {len(all_missing_data)}")

        return jsonify({"status": "success", "data": all_missing_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
