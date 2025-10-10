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
            return None
    return None


def _find_ts_in_doc(doc):
    """
    Attempt to locate a timestamp (epoch ms) inside a document with tolerant checks.
    Returns int timestamp or None.
    """
    try:
        v = doc.get('value') if isinstance(doc, dict) else None
        if isinstance(v, dict):
            for key in ('ts', 'timestamp', 'order'):
                candidate = v.get(key)
                n = _extract_number_long(candidate)
                if n:
                    return n
            asset = v.get('asset')
            if isinstance(asset, dict):
                ad = asset.get('data', {})
                for key in ('ts', 'timestamp', 'order'):
                    n = _extract_number_long(ad.get(key))
                    if n:
                        return n
                # if the actual stroke payload is nested under asset.data.stroke, inspect it
                stroke_blob = ad.get('stroke') if isinstance(ad, dict) else None
                if isinstance(stroke_blob, dict):
                    for key in ('ts', 'timestamp', 'order'):
                        n = _extract_number_long(stroke_blob.get(key))
                        if n:
                            return n
            inner = _parse_inner_value_to_dict(v.get('value'))
            if inner:
                for key in ('timestamp', 'ts', 'order'):
                    if key in inner:
                        n = _extract_number_long(inner.get(key))
                        if n:
                            return n
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
                    asset = tv.get('asset') or (tv.get('asset', {}) if isinstance(tv, dict) else None)
                    if isinstance(asset, dict):
                        ad = asset.get('data', {})
                        for key in ('ts', 'timestamp', 'order'):
                            n = _extract_number_long(ad.get(key))
                            if n:
                                return n
                        stroke_blob = ad.get('stroke') if isinstance(ad, dict) else None
                        if isinstance(stroke_blob, dict):
                            for key in ('ts', 'timestamp', 'order'):
                                n = _extract_number_long(stroke_blob.get(key))
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
        v = doc.get('value') if isinstance(doc, dict) else None
        if isinstance(v, dict):
            if 'value' in v and isinstance(v['value'], str):
                user = v.get('user') or (v.get('asset', {}).get('data', {}).get('user'))
                return user, v['value']
            if 'asset' in v and isinstance(v['asset'], dict) and isinstance(v['asset'].get('data'), dict):
                user = v.get('user') or v['asset']['data'].get('user')
                return user, json.dumps(v['asset']['data'])
            if 'value' in v and isinstance(v['value'], dict):
                user = v.get('user')
                return user, json.dumps(v['value']['value'])
            user = v.get('user')
            return user, json.dumps(v)
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

        newd = {}
        for k, v in o.items():
            newd[k] = _normalize_numberlong_in_obj(v)
        return newd

    if isinstance(o, list):
        return [_normalize_numberlong_in_obj(x) for x in o]

    return o


