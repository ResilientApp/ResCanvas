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

from .data_utils import (
    _try_int,
    _extract_number,
    _extract_number_long,
    _find_ts_in_doc,
    _extract_user_and_inner_value,
    _id_repr,
    _normalize_numberlong_in_obj
)

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

                # If the payload wraps an inner 'stroke' object (common when room POST wrote stroke docs),
                # prefer the inner stroke dict so we expose id/drawingId/ts directly.
                try:
                    if isinstance(parsed_payload, dict) and isinstance(parsed_payload.get('stroke'), dict):
                        inner = parsed_payload.pop('stroke')
                        # merge without overwriting inner fields
                        merged = {}
                        merged.update(parsed_payload)
                        merged.update(inner)
                        parsed_payload = merged
                except Exception:
                    pass

                try:
                    def _try_decrypt_payload_for_room(parsed, room_doc_local):
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
                                    pass
                        inner = parsed.get("value")
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

                # Try to determine a roomId for this parsed payload so callers can filter by room
                room_candidate = None
                try:

                    rc = parsed_payload.get('roomId') if isinstance(parsed_payload, dict) else None
                    if rc:
                        room_candidate = rc

                    if not room_candidate and isinstance(doc, dict):
                        rc = doc.get('roomId')
                        if rc:
                            room_candidate = rc

                    if not room_candidate and isinstance(doc, dict) and 'transactions' in doc:
                        for txn in (doc.get('transactions') or []):
                            try:
                                tv = txn.get('value') or {}
                                asset = (tv.get('asset') or {}).get('data') if isinstance(tv.get('asset'), dict) else {}
                                if isinstance(asset, dict) and asset.get('roomId'):
                                    room_candidate = asset.get('roomId')
                                    break
                            except Exception:
                                continue
                    if isinstance(room_candidate, dict):
                        room_candidate = room_candidate.get('$oid') or room_candidate.get('oid') or None
                    if isinstance(room_candidate, (bytes, bytearray)):
                        try:
                            room_candidate = room_candidate.decode('utf-8')
                        except Exception:
                            room_candidate = None
                    if isinstance(room_candidate, (int, float)):
                        room_candidate = str(room_candidate)
                except Exception:
                    room_candidate = None

                results.append({
                    'value': json.dumps(parsed_payload),
                    'user': user or parsed_payload.get("user", "") or "",
                    'ts': int(ts),
                    'id': doc_id or parsed_payload.get("id") or parsed_payload.get("drawingId") or "",
                    'undone': bool(parsed_payload.get("undone", False)),
                    'roomId': room_candidate
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



