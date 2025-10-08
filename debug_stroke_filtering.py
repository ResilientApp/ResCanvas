#!/usr/bin/env python3
"""
Debug script to trace exactly why strokes are being filtered in get_strokes endpoint
"""
import os
import sys
import json
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

sys.path.insert(0, '/home/ubuntu/resilient-apps/ResCanvas/backend')
from services.crypto_service import unwrap_room_key, decrypt_for_room

load_dotenv()
mongo_uri = os.getenv("MONGO_ATLAS_URI")
client = MongoClient(mongo_uri)

rooms_coll = client["canvasCache"]["rooms"]
strokes_coll = client["canvasCache"]["strokes"]

room_id = "68d38894e33681b0c8e26b10"
room = rooms_coll.find_one({"_id": ObjectId(room_id)})

# Unwrap room key
rk = unwrap_room_key(room['wrappedKey'])

# Get all strokes (same query as API)
mongo_query = {
    "$or": [
        {"roomId": room_id},
        {"transactions.value.asset.data.roomId": room_id},
        {"transactions.value.asset.data.roomId": [room_id]},
        {"transactions.value.asset.data.roomId": {"$in": [room_id]}}
    ]
}
items = list(strokes_coll.find(mongo_query))

print(f"Total MongoDB records matched: {len(items)}")
print()

# Simulate the API logic
clear_after = 0
undone_strokes = set()
cut_stroke_ids = set()
seen_stroke_ids = set()
history_mode = False

filtered_reasons = {
    "no_stroke_data": 0,
    "no_stroke_id": 0,
    "seen_before": 0,
    "undone": 0,
    "cut": 0,
    "no_timestamp": 0,
    "before_clear": 0,
    "decrypt_failed": 0,
    "success": 0
}

for it in items:
    try:
        stroke_data = None
        
        # Handle ResilientDB transaction format
        if 'transactions' in it and it['transactions']:
            try:
                asset_data = it['transactions'][0]['value']['asset']['data']
                if 'stroke' in asset_data:
                    stroke_data = asset_data['stroke']
                    if stroke_data and 'timestamp' in stroke_data:
                        stroke_data['ts'] = stroke_data['timestamp']
                elif 'encrypted' in asset_data:
                    if rk is None:
                        filtered_reasons["decrypt_failed"] += 1
                        continue
                    blob = asset_data['encrypted']
                    raw = decrypt_for_room(rk, blob)
                    stroke_data = json.loads(raw.decode())
                    if stroke_data and 'timestamp' in stroke_data:
                        stroke_data['ts'] = stroke_data['timestamp']
            except (KeyError, IndexError, TypeError) as e:
                filtered_reasons["decrypt_failed"] += 1
                continue
        
        # Handle legacy formats
        if stroke_data is None:
            if "blob" in it:
                if rk is None:
                    filtered_reasons["decrypt_failed"] += 1
                    continue
                blob = it["blob"]
                raw = decrypt_for_room(rk, blob)
                stroke_data = json.loads(raw.decode())
            elif 'asset' in it and 'data' in it['asset'] and 'encrypted' in it['asset']['data']:
                if rk is None:
                    filtered_reasons["decrypt_failed"] += 1
                    continue
                blob = it['asset']['data']['encrypted']
                raw = decrypt_for_room(rk, blob)
                stroke_data = json.loads(raw.decode())
            elif "stroke" in it:
                stroke_data = it["stroke"]
            elif 'asset' in it and 'data' in it['asset'] and 'stroke' in it['asset']['data']:
                stroke_data = it['asset']['data']['stroke']
            else:
                filtered_reasons["no_stroke_data"] += 1
                continue

        stroke_id = stroke_data.get("id") or stroke_data.get("drawingId")
        
        if not stroke_id:
            filtered_reasons["no_stroke_id"] += 1
            continue
        
        # Deduplication
        if stroke_id and stroke_id in seen_stroke_ids:
            filtered_reasons["seen_before"] += 1
            continue
        
        # Check undone/cut
        if stroke_id in undone_strokes:
            filtered_reasons["undone"] += 1
            continue
        
        if stroke_id in cut_stroke_ids:
            filtered_reasons["cut"] += 1
            continue
        
        # Check timestamp
        try:
            st_ts = stroke_data.get('ts') or stroke_data.get('timestamp')
            if isinstance(st_ts, dict) and '$numberLong' in st_ts:
                st_ts = int(st_ts['$numberLong'])
            elif isinstance(st_ts, (bytes, bytearray)):
                st_ts = int(st_ts.decode())
            else:
                st_ts = int(st_ts) if st_ts is not None else None
        except Exception:
            st_ts = None

        if not history_mode and st_ts is None:
            filtered_reasons["no_timestamp"] += 1
            continue
        
        if not history_mode and st_ts <= clear_after:
            filtered_reasons["before_clear"] += 1
            continue
        
        # SUCCESS - stroke would be returned
        filtered_reasons["success"] += 1
        seen_stroke_ids.add(stroke_id)
        
    except Exception as e:
        filtered_reasons["decrypt_failed"] += 1
        continue

print("Filtering Results:")
print("=" * 50)
for reason, count in filtered_reasons.items():
    print(f"{reason:20s}: {count:4d}")
print("=" * 50)
print(f"Total:                  {len(items)}")
print()
print(f"Expected API return: {filtered_reasons['success']} strokes")
print(f"Actual API return: 25 strokes")
