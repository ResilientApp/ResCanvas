#!/usr/bin/env python3
"""
Debug MongoDB storage to understand why recovery returns 0 strokes
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from services.db import strokes_coll
import json

ROOM_ID = "test-room-123" 

def check_mongodb_room_data():
    print(f"=== MONGODB DATA FOR ROOM {ROOM_ID} ===")
    
    # Check all strokes in MongoDB for this room
    room_strokes = list(strokes_coll.find({
        '$or': [
            {'roomId': ROOM_ID},
            {'value.roomId': ROOM_ID}, 
            {'value.asset.data.roomId': ROOM_ID},
            {'transactions.value.asset.data.roomId': ROOM_ID}
        ]
    }).sort('timestamp', -1).limit(10))
    
    print(f"Found {len(room_strokes)} strokes for room {ROOM_ID}")
    
    for stroke in room_strokes:
        print(f"\nStroke:")
        print(f"  _id: {stroke.get('_id')}")
        print(f"  id: {stroke.get('id')}")
        print(f"  roomId: {stroke.get('roomId')}")
        print(f"  user: {stroke.get('user')}")
        print(f"  timestamp: {stroke.get('timestamp')}")
        
        # Check if it has value field with nested data
        if 'value' in stroke:
            try:
                value_data = json.loads(stroke['value']) if isinstance(stroke['value'], str) else stroke['value']
                print(f"  value.id: {value_data.get('id')}")
                print(f"  value.roomId: {value_data.get('roomId')}")
                print(f"  value.user: {value_data.get('user')}")
            except:
                print(f"  value: {str(stroke['value'])[:100]}...")
    
    # Also check for any strokes added recently (last 5 minutes)
    import time
    recent_ts = (time.time() - 300) * 1000  # 5 minutes ago in ms
    
    recent_strokes = list(strokes_coll.find({
        'timestamp': {'$gt': recent_ts}
    }).sort('timestamp', -1))
    
    print(f"\n=== RECENT STROKES (last 5 min) ===")
    print(f"Found {len(recent_strokes)} recent strokes")
    
    for stroke in recent_strokes:
        print(f"  ID: {stroke.get('id')}, Room: {stroke.get('roomId')}, User: {stroke.get('user')}")

if __name__ == "__main__":
    check_mongodb_room_data()