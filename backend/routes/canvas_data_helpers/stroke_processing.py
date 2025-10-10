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
    _extract_number_long,
    _find_ts_in_doc,
    _normalize_numberlong_in_obj,
    _parse_inner_value_to_dict,
    _extract_user_and_inner_value
)
from .mongo_helpers import _get_effective_clear_ts

def process_mongo_docs(doc_list, start_ts=None, end_ts=None, room_id=None):
    """
    Process an iterable/list of Mongo-like documents into normalized stroke result dicts.
    This extracts timestamps, user, payload, id, undone, and roomId similar to get_strokes_from_mongo.
    """
    results = []
    for doc in (doc_list or []):
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

            try:
                if isinstance(parsed_payload, dict) and isinstance(parsed_payload.get('stroke'), dict):
                    inner = parsed_payload.pop('stroke')
                    merged = {}
                    merged.update(parsed_payload)
                    merged.update(inner)
                    parsed_payload = merged
            except Exception:
                pass

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
        except Exception:
            continue

    results.sort(key=lambda x: x.get('ts', 0))
    return results


