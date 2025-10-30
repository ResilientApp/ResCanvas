#!/usr/bin/env python3
"""
Test GET /rooms/{roomId}/strokes endpoint directly
"""
import requests
import json
from services.db import rooms_coll, strokes_coll
from bson import ObjectId

# Find a room with brush strokes
brush_stroke = strokes_coll.find_one({'stroke.brushType': {'$exists': True, '$ne': 'normal'}})
if not brush_stroke:
    print("❌ No brush strokes found in database")
    exit(1)

room_id = brush_stroke.get('roomId')
print(f"Testing room: {room_id}")

# Get room details
room = rooms_coll.find_one({'_id': ObjectId(room_id)})
if room:
    print(f"Room name: {room.get('name', 'Unknown')}")
    print(f"Room type: {room.get('type', 'Unknown')}")

# Count strokes in this room
total = strokes_coll.count_documents({'roomId': room_id, 'stroke': {'$exists': True}})
brush_count = strokes_coll.count_documents({
    'roomId': room_id,
    'stroke.brushType': {'$exists': True, '$ne': 'normal'}
})

print(f"\nMongoDB state:")
print(f"  Total strokes: {total}")
print(f"  Brush strokes: {brush_count}")

# Make actual HTTP GET request
print(f"\n{'='*80}")
print(f"Making HTTP GET request to /rooms/{room_id}/strokes")
print(f"{'='*80}")

url = f"http://localhost:10010/rooms/{room_id}/strokes"

# We need a valid token - let's try to create one or use existing
# For testing, let's just check the backend logs instead
print(f"\n⚠️  Cannot make HTTP request without valid JWT token")
print(f"   Instead, checking what's in MongoDB and what the endpoint SHOULD return...")

# Simulate what the GET endpoint should return
strokes_to_return = list(strokes_coll.find({
    'roomId': room_id,
    'stroke': {'$exists': True}
}).sort('ts', 1))

print(f"\nStrokes that SHOULD be returned by GET endpoint: {len(strokes_to_return)}")

for i, doc in enumerate(strokes_to_return[:3]):
    stroke = doc.get('stroke', {})
    print(f"\nStroke {i}:")
    print(f"  ID: {stroke.get('id', 'N/A')}")
    print(f"  User: {stroke.get('user', 'N/A')}")
    print(f"  brushType: {stroke.get('brushType', 'NOT FOUND')}")
    print(f"  brushParams: {stroke.get('brushParams', 'NOT FOUND')}")
    print(f"  metadata: {stroke.get('metadata', 'NOT FOUND')}")
    
    # Check if brush metadata is present
    has_brush = stroke.get('brushType') and stroke.get('brushType') != 'normal'
    if has_brush:
        print(f"  ✅ HAS BRUSH METADATA")
    else:
        print(f"  ℹ️  Normal stroke (no brush)")

print(f"\n{'='*80}")
print("CONCLUSION:")
print(f"{'='*80}")
print(f"MongoDB contains {brush_count} strokes with brush metadata")
print(f"GET endpoint SHOULD return these strokes with brush metadata intact")
print(f"If frontend receives strokes WITHOUT brush metadata, the issue is in:")
print(f"  1. GET endpoint extracting stroke_data from MongoDB docs, OR")
print(f"  2. JSON serialization removing fields, OR")
print(f"  3. Frontend not preserving fields when creating Drawing objects")
