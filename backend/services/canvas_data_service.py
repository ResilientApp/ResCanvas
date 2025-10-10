"""Canvas data service for fetching and processing stroke data from MongoDB."""

import os
import json
import logging
from pymongo import MongoClient, errors as pymongo_errors
from services.db import rooms_coll, strokes_coll, redis_client
from services.crypto_service import unwrap_room_key, decrypt_for_room
from services.mongo_parsers import (
    find_ts_in_doc,
    extract_user_and_inner_value,
    normalize_numberlong_in_obj,
    id_repr,
    try_int
)
from bson import ObjectId
from cryptography.exceptions import InvalidTag

logger = logging.getLogger(__name__)

def find_marker_value_from_mongo(marker_id: str):
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
        cand = asset.get("value", asset.get("ts", asset.get("timestamp", asset.get("order"))))
        ival = try_int(cand, None)
        if ival is not None:
            best_val = ival
            break
    return best_val

def find_marker_ts_from_mongo(marker_id: str):
    """
    Find the most recent transaction in Mongo that contains an asset.data.id == marker_id
    and return the best timestamp found inside that small asset object.
    """
    try:
        block = strokes_coll.find_one(
            {"transactions.value.asset.data.id": marker_id},
            sort=[("_id", -1)]
        )
    except Exception:
        return None
    
    if not block:
        return None
    
    txs = block.get("transactions", []) or []
    best_ts = None
    for tx in reversed(txs):
        if not isinstance(tx, dict):
            continue
        v = tx.get("value") or {}
        asset = (v.get("asset") or {}).get("data", {}) if isinstance(v.get("asset"), dict) else {}
        if not isinstance(asset, dict):
            continue
        if asset.get("id") != marker_id:
            continue
        for key in ("ts", "timestamp", "order"):
            cand = asset.get(key)
            ival = try_int(cand, None)
            if ival is not None:
                best_ts = ival
                break
        if best_ts:
            break
    return best_ts

def get_effective_clear_ts(room_id: str):
    """
    Get the effective clear timestamp for a room.
    Checks Redis first, then falls back to MongoDB marker.
    """
    if not room_id:
        return None
    
    clear_ts_key = f"room:{room_id}:cleared_at"
    try:
        val = redis_client.get(clear_ts_key)
        if val:
            try:
                return int(val)
            except Exception:
                try:
                    return int(val.decode('utf-8'))
                except Exception:
                    pass
    except Exception:
        pass
    
    marker_id = f"draw_count_clear_canvas_{room_id}"
    try:
        ts = find_marker_ts_from_mongo(marker_id)
        if ts:
            return ts
    except Exception:
        pass
    
    return None

def get_strokes_from_mongo(start_ts=None, end_ts=None, room_id=None):
    """
    Robust retrieval of strokes from MongoDB, optionally scoped to a room.
    Returns a list of items like:
      { 'value': <json-string>, 'user': <string>, 'ts': <int>, 'id': <string>, 'undone': bool, 'roomId': <string> }

    If room_id is provided, the Mongo query will try to restrict results to that room
    and will attempt to decrypt per-room 'encrypted' bundles using the room's wrappedKey.
    """
    mongo_uri = os.environ.get('MONGO_ATLAS_URI') or os.environ.get('MONGO_URL')
    db_name = os.environ.get('MONGO_DB', 'canvasCache')
    coll_name = os.environ.get('MONGO_COLLECTION', 'strokes')
    
    if not mongo_uri:
        logger.error("MONGO_ATLAS_URI / MONGO_URL not set in environment")
        return []

    client = None
    cursor = None
    results = []
    
    try:
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        client.admin.command('ping')

        db = client[db_name]
        coll = db[coll_name]

        base_or = [
            {'value.ts': {'$exists': True}},
            {'value.timestamp': {'$exists': True}},
            {'value.asset.data.ts': {'$exists': True}},
            {'transactions': {'$exists': True}}
        ]
        query = {'$or': base_or}

        if room_id:
            room_clauses = [
                {'roomId': room_id},
                {'value.roomId': room_id},
                {'value.asset.data.roomId': room_id},
                {'transactions.value.asset.data.roomId': room_id},
            ]
            query = {
                '$and': [
                    query,
                    {'$or': room_clauses}
                ]
            }

        try:
            cursor = coll.find(query).batch_size(200)
        except Exception as e:
            logger.warning(f"Mongo find with batch_size failed; falling back to default find: {e}")
            cursor = coll.find(query)

        room_doc = None
        if room_id:
            try:
                try:
                    room_doc = rooms_coll.find_one({"_id": ObjectId(room_id)})
                except Exception:
                    room_doc = rooms_coll.find_one({"_id": room_id}) or rooms_coll.find_one({"roomId": room_id})
            except Exception:
                room_doc = None

        for doc in cursor:
            try:
                ts = find_ts_in_doc(doc)
                if ts is None:
                    continue
                if (start_ts is not None and ts < start_ts) or (end_ts is not None and ts > end_ts):
                    continue

                user, payload = extract_user_and_inner_value(doc)
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

                parsed_payload = normalize_numberlong_in_obj(parsed_payload)

                try:
                    if isinstance(parsed_payload, dict) and isinstance(parsed_payload.get('stroke'), dict):
                        inner = parsed_payload.pop('stroke')
                        merged = {}
                        merged.update(parsed_payload)
                        merged.update(inner)
                        parsed_payload = merged
                except Exception:
                    pass

                parsed_payload = _try_decrypt_payload_for_room(parsed_payload, room_doc)

                doc_id = _extract_doc_id(doc, parsed_payload)
                room_candidate = _extract_room_id(doc, parsed_payload)

                if isinstance(parsed_payload, dict):
                    parsed_payload.setdefault("undone", False)

                results.append({
                    'value': json.dumps(parsed_payload),
                    'user': user or parsed_payload.get("user", "") or "",
                    'ts': int(ts),
                    'id': doc_id or parsed_payload.get("id") or parsed_payload.get("drawingId") or "",
                    'undone': bool(parsed_payload.get("undone", False)),
                    'roomId': room_candidate
                })
            except Exception as inner_exc:
                logger.exception(f"Failed to process Mongo doc {id_repr(doc)}: {inner_exc}")
                continue

        results.sort(key=lambda x: x.get('ts', 0))
        logger.info(f"Mongo history query returned {len(results)} items for range {start_ts}..{end_ts} room={room_id}")
        return results

    except pymongo_errors.PyMongoError as pm_err:
        logger.exception(f"MongoDB error while fetching strokes: {pm_err}")
        return []
    except Exception as e:
        logger.exception(f"Unexpected error in get_strokes_from_mongo: {e}")
        return []
    finally:
        try:
            if cursor is not None:
                cursor.close()
        except Exception:
            pass
        try:
            if client is not None:
                client.close()
        except Exception:
            pass

def _try_decrypt_payload_for_room(parsed, room_doc_local):
    """Attempt to decrypt encrypted payloads using room key."""
    if isinstance(parsed, dict) and isinstance(parsed.get("encrypted"), dict):
        if room_doc_local and room_doc_local.get("wrappedKey"):
            try:
                rk = unwrap_room_key(room_doc_local["wrappedKey"])
                decrypted = decrypt_for_room(rk, parsed["encrypted"])
                inner = json.loads(decrypted.decode('utf-8')) if isinstance(decrypted, (bytes, bytearray)) else json.loads(decrypted)
                for kk, vv in inner.items():
                    if kk not in parsed:
                        parsed[kk] = vv
                parsed.pop("encrypted", None)
            except Exception:
                pass
    
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

def _extract_doc_id(doc, parsed_payload):
    """Extract document ID from document or payload."""
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
    return doc_id

def _extract_room_id(doc, parsed_payload):
    """Extract room ID from document or payload."""
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
    
    return room_candidate

def process_mongo_docs(doc_list, start_ts=None, end_ts=None, room_id=None):
    """
    Process an iterable/list of Mongo-like documents into normalized stroke result dicts.
    """
    results = []
    for doc in (doc_list or []):
        try:
            ts = find_ts_in_doc(doc)
            if ts is None:
                continue
            if (start_ts is not None and ts < start_ts) or (end_ts is not None and ts > end_ts):
                continue

            user, payload = extract_user_and_inner_value(doc)
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

            parsed_payload = normalize_numberlong_in_obj(parsed_payload)

            try:
                if isinstance(parsed_payload, dict) and isinstance(parsed_payload.get('stroke'), dict):
                    inner = parsed_payload.pop('stroke')
                    merged = {}
                    merged.update(parsed_payload)
                    merged.update(inner)
                    parsed_payload = merged
            except Exception:
                pass

            doc_id = _extract_doc_id(doc, parsed_payload)
            room_candidate = _extract_room_id(doc, parsed_payload)

            results.append({
                'value': json.dumps(parsed_payload),
                'user': user or parsed_payload.get("user", "") or "",
                'ts': int(ts),
                'id': doc_id or parsed_payload.get("id") or parsed_payload.get("drawingId") or "",
                'undone': bool(parsed_payload.get("undone", False)),
                'roomId': room_candidate
            })
        except Exception:
            continue

    results.sort(key=lambda x: x.get('ts', 0))
    return results
