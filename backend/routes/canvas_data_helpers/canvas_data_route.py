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

logger = logging.getLogger(__name__)

from .data_utils import _try_int, _extract_number, _normalize_numberlong_in_obj
from .mongo_helpers import get_strokes_from_mongo, _get_effective_clear_ts, _find_marker_ts_from_mongo
from .stroke_processing import process_mongo_docs

get_canvas_data_bp = Blueprint("get_canvas_data", __name__)

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
        logger = logging.getLogger(__name__)
        logger.info(f"getCanvasData: room_id={room_id} clear_after={clear_after} history_mode={history_mode} start={start_param} end={end_param} res_canvas_draw_count={res_canvas_draw_count} count_value_clear_canvas={count_value_clear_canvas}")
        if history_mode:
            logger.info(f"History recall mode requested: start={start_param} end={end_param}")


        all_missing_data = []
        missing_keys = []
        
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
                        stroke_states[stroke_id] = record
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

        undone_strokes = set()
        for stroke_id, state in stroke_states.items():
            if state.get("undone"):
                undone_strokes.add(stroke_id)

        logger.error("count_value_clear_canvas")
        logger.error(count_value_clear_canvas)
        logger.error(res_canvas_draw_count)
        
        try:
            try:
                start_idx = 0 if history_mode else int(count_value_clear_canvas or 0)
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

                            try:
                                asset_data = _normalize_numberlong_in_obj(asset_data)
                            except Exception:
                                pass

                            # Attempt to extract roomId from common nested locations so room filtering works
                            try:
                                room_candidate = asset_data.get('roomId') or asset_data.get('room')
                                if not room_candidate and isinstance(asset_data.get('stroke'), dict):
                                    room_candidate = asset_data.get('stroke', {}).get('roomId')

                                if isinstance(room_candidate, dict):
                                    room_candidate = room_candidate.get('$oid') or room_candidate.get('oid') or None
                                if isinstance(room_candidate, (bytes, bytearray)):
                                    try:
                                        room_candidate = room_candidate.decode('utf-8')
                                    except Exception:
                                        room_candidate = None
                                if isinstance(room_candidate, (int, float)):
                                    room_candidate = str(room_candidate)
                                if room_candidate:
                                    asset_data['roomId'] = room_candidate
                            except Exception:
                                pass

                            asset_data["undone"] = bool(asset_data.get("undone", False))
                            asset_data["id"] = asset_data.get("id") or key_id
                            try:
                                redis_client.set(key_id, json.dumps(asset_data))
                            except Exception:
                                pass
                            drawing = asset_data

                if drawing:
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
            logger.exception("Recovery loop failed; falling back to counter-range. Error: %s", e)
            # In history mode, start from 0 to include all drawings
            fallback_start = 0 if history_mode else int(count_value_clear_canvas or 0)
            for i in range(fallback_start, int(res_canvas_draw_count or 0)):
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
                # Use the robust helper to fetch strokes. In history mode, query the requested range.
                # Otherwise, query strokes after clear_after (normal mode behavior).
                if history_mode:
                    try:
                        s_ts = int(start_param) if start_param is not None and start_param != '' else None
                    except Exception:
                        s_ts = None
                    try:
                        e_ts = int(end_param) if end_param is not None and end_param != '' else None
                    except Exception:
                        e_ts = None
                    mongo_items = get_strokes_from_mongo(s_ts, e_ts, room_id)
                else:
                    mongo_items = get_strokes_from_mongo(clear_after, None, room_id)

                for it in mongo_items:
                    iid = it.get("id")
                    if iid:
                        mongo_map[str(iid)] = it
            except Exception:
                mongo_map = {}

        for key_str, idx in missing_keys:
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
                    asset_data["ts"] = int(found.get("ts") or asset_data.get("ts") or 0)
                    asset_data["user"] = found.get("user") or asset_data.get("user")
                else:
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
                asset_data.get("id") not in undone_strokes and
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

        # Keep only the strokes whose latest version is not undone
        all_missing_data = [
            entry for entry in latest_entries.values()
            if not entry.get("undone", False)
        ]

        cut_set_key = f"cut-stroke-ids:{room_id}" if room_id else "cut-stroke-ids"
        try:
            raw_cut = redis_client.smembers(cut_set_key)
            cut_ids = set(x.decode() if isinstance(x, (bytes, bytearray)) else str(x) for x in (raw_cut or set()))
        except Exception:
            cut_ids = set()

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

                filtered = []
                for entry in active_strokes:
                    entry_ts = int(entry.get('ts', entry.get('timestamp', 0)))
                    if (start_ts is None or entry_ts >= start_ts) and (end_ts is None or entry_ts <= end_ts):
                        filtered.append(entry)
                all_missing_data = filtered
                
                logger.info(f"History mode: filtered {len(all_missing_data)} strokes from Redis/in-memory data for range {start_ts}..{end_ts}")
                
                if len(all_missing_data) == 0:
                    try:
                        logger.warning(f"No strokes found in Redis for history range; trying MongoDB as fallback")
                        mongo_items = get_strokes_from_mongo(start_ts, end_ts, room_id)
                        if mongo_items:
                            all_missing_data = mongo_items
                            logger.info(f"MongoDB fallback returned {len(mongo_items)} strokes for history range {start_ts}..{end_ts}")
                        else:
                            logger.info("MongoDB fallback returned 0 items for history range")
                    except Exception as me:
                        logger.warning(f"Mongo history fallback also failed: {me}")
            except Exception as e:
                logger.error(f"Error in history mode processing: {e}")
                all_missing_data = active_strokes
        else:
            all_missing_data = active_strokes

        # safe sort: prefer numeric tail in id (res-canvas-draw-N), else fall back to ts
        def _id_sort_key(x):
            try:
                idv = x.get('id') or ""
                parts = idv.split("-")
                tail = parts[-1] if parts else ""
                if tail.isdigit():
                    return int(tail)
                return int(x.get('ts', 0) or 0)
            except Exception:
                return int(x.get('ts', 0) or 0)

        all_missing_data.sort(key=_id_sort_key)
        logger.error(f"[PRE-FILTER COUNT] all_missing_data length before final room filter: {len(all_missing_data)}")
        try:
            sample_debug = []
            for e in all_missing_data[:5]:
                v = e.get('value')
                try:
                    sval = v if isinstance(v, str) else json.dumps(v)
                except Exception:
                    sval = str(v)
                sample_debug.append({
                    'id': e.get('id'),
                    'roomId': e.get('roomId'),
                    'value_type': type(v).__name__,
                    'value_sample': sval[:200]
                })
            logger.debug("getCanvasData: sample entries before room filter: %s", sample_debug)
        except Exception:
            logger.exception("Failed to log sample entries for debugging room filter")
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
                    if isinstance(cur, (bytes, bytearray)):
                        try:
                            cur = cur.decode("utf-8")
                        except Exception:
                            break

                    if isinstance(cur, str):
                        try:
                            cur = json.loads(cur)
                        except Exception:
                            break

                    if isinstance(cur, dict):
                        # we've got a dict; see if the useful payload is at this level
                        # or if it's wrapped one level deeper inside "value"
                        if "value" in cur and isinstance(cur["value"], (dict, str, bytes)):
                            cur = cur["value"]
                            depth += 1
                            continue
                        return cur
                    break

                return cur if isinstance(cur, dict) else {}


            def _extract_room_id_from_any(entry):
                """
                Extracts roomId from:
                - top-level (entry.get("roomId"))
                - entry["value"] (including nested value->"value" JSON string)
                Returns string roomId or None.
                """
                # 1) top-level handles common forms like ObjectId, dict with $oid, bytes, numeric, or plain string
                rid = entry.get("roomId")
                try:
                    if rid is not None:
                        if isinstance(rid, ObjectId):
                            return str(rid)
                        
                        if isinstance(rid, dict) and ("$oid" in rid or "oid" in rid):
                            return rid.get("$oid") or rid.get("oid")
                        
                        if isinstance(rid, (bytes, bytearray)):
                            try:
                                dec = rid.decode("utf-8")
                                if dec.strip():
                                    return dec
                            except Exception:
                                pass

                        if isinstance(rid, (int, float)):
                            return str(rid)

                        if isinstance(rid, str) and rid.strip():
                            return rid
                except Exception:
                    pass

                # 2) value (possibly nested)
                v = entry.get("value")
                parsed = _deep_json_loads(v)
                rid = parsed.get("roomId")
                try:
                    if rid is not None:
                        if isinstance(rid, ObjectId):
                            return str(rid)
                        if isinstance(rid, dict) and ("$oid" in rid or "oid" in rid):
                            return rid.get("$oid") or rid.get("oid")
                        if isinstance(rid, (bytes, bytearray)):
                            try:
                                dec = rid.decode("utf-8")
                                if dec.strip():
                                    return dec
                            except Exception:
                                pass
                        if isinstance(rid, (int, float)):
                            return str(rid)
                        if isinstance(rid, str) and rid.strip():
                            return rid
                except Exception:
                    pass

                return None


            def _entry_has_room(entry, room_id):
                """
                True if entry belongs to 'room_id' after checking top-level and nested value payloads.
                """
                rid = _extract_room_id_from_any(entry)
                return (rid == room_id)

            all_missing_data = [e for e in all_missing_data if _entry_has_room(e, room_id)]

        # If a room filter was requested but no entries survived the filter,
        # attempt a targeted MongoDB query for strokes that were stored under
        if room_id and len(all_missing_data) == 0:
            try:
                logger.info(f"getCanvasData: room filter yielded 0 entries; trying direct Mongo lookup for room {room_id}")
                try:
                    start_ts = int(start_param) if start_param is not None and start_param != '' else None
                except Exception:
                    start_ts = None
                try:
                    end_ts = int(end_param) if end_param is not None and end_param != '' else None
                except Exception:
                    end_ts = None

                mongo_items = get_strokes_from_mongo(start_ts, end_ts, room_id)
                if mongo_items:
                    logger.info(f"getCanvasData: Mongo room lookup returned {len(mongo_items)} items for room {room_id}")
                    all_missing_data = mongo_items
            except Exception:
                logger.exception("getCanvasData: direct Mongo room lookup failed")

        logger.info(f"[POST-FILTER] all_missing_data length before final room filter: {len(all_missing_data)} sample_ids: {[e.get('id') for e in all_missing_data[:5]]}")
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
        logger.error(f"[POST-FILTER COUNT] all_missing_data length after final room filter: {len(all_missing_data)}")

        return jsonify({"status": "success", "data": all_missing_data}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@get_canvas_data_bp.route("/getCanvasData", methods=["GET"])
def get_canvas_data_route():
    return get_canvas_data()
