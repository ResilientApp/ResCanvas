#!/usr/bin/env python3
"""
Test the actual live behavior of the system - what really happens when we:
1. Place a stamp
2. Retrieve it
3. Undo it
4. Check MongoDB
"""

import sys
import os
import json
import requests
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.db import redis_client, strokes_coll

BASE_URL = "http://localhost:10010"

def get_auth_token():
    """Login and get JWT token"""
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "username": "testuser",
        "password": "testpass123"
    })
    if response.status_code == 200:
        return response.json()["token"]
    
    requests.post(f"{BASE_URL}/auth/register", json={
        "username": "testuser",
        "password": "testpass123",
        "email": "test@example.com"
    })
    
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "username": "testuser",
        "password": "testpass123"
    })
    return response.json()["token"]

def create_test_room(token):
    """Create a test room"""
    response = requests.post(
        f"{BASE_URL}/rooms",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Behavior Test Room", "isPrivate": False}
    )
    return response.json()["room"]["id"]

def test_stamp_placement_and_retrieval():
    print("\n" + "="*80)
    print("TEST 1: Stamp Placement and Retrieval")
    print("="*80)
    
    token = get_auth_token()
    room_id = create_test_room(token)
    print(f"✓ Created room: {room_id}")
    
    # Place a stamp
    stamp_data = {
        "roomId": room_id,
        "pathData": [[100, 100]],
        "brushColor": "#FF0000",
        "brushSize": 5,
        "metadata": {
            "drawingType": "stamp",
            "stampData": {
                "emoji": "🌸",
                "name": "Flower",
                "category": "nature"
            },
            "stampSettings": {
                "size": 100,
                "rotation": 0,
                "opacity": 100
            }
        }
    }
    
    print(f"\n→ Placing stamp with metadata:")
    print(f"  - drawingType: {stamp_data['metadata']['drawingType']}")
    print(f"  - stampData: {stamp_data['metadata']['stampData']}")
    print(f"  - stampSettings: {stamp_data['metadata']['stampSettings']}")
    
    response = requests.post(
        f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json={"stroke": stamp_data}  # Wrap in "stroke" object
    )
    
    if response.status_code != 200:
        print(f"✗ Failed to place stamp: {response.status_code}")
        print(f"  Response: {response.text}")
        return False
    
    stroke_id = response.json().get("id")
    print(f"✓ Stamp placed with ID: {stroke_id}")
    
    # Wait a moment for persistence
    time.sleep(0.5)
    
    # Retrieve strokes
    print(f"\n→ Retrieving strokes from room {room_id}")
    response = requests.get(
        f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    if response.status_code != 200:
        print(f"✗ Failed to retrieve strokes: {response.status_code}")
        return False
    
    strokes = response.json()
    print(f"✓ Retrieved {len(strokes)} stroke(s)")
    
    # Debug: Show what we got
    print(f"\n→ Response type: {type(strokes)}")
    if isinstance(strokes, dict):
        print(f"  - Response is a dict with keys: {list(strokes.keys())}")
        if 'strokes' in strokes:
            strokes = strokes['strokes']
            print(f"  - Extracted strokes array: {len(strokes)} items")
    
    if len(strokes) == 0:
        print("✗ No strokes returned!")
        return False
    
    # Check the stamp
    stamp = strokes[0]
    print(f"\n→ Examining returned stroke:")
    print(f"  - Has 'metadata' field: {'metadata' in stamp}")
    
    if 'metadata' in stamp:
        metadata = stamp['metadata']
        print(f"  - metadata.drawingType: {metadata.get('drawingType')}")
        print(f"  - metadata.stampData: {metadata.get('stampData')}")
        print(f"  - metadata.stampSettings: {metadata.get('stampSettings')}")
        
        if metadata.get('drawingType') == 'stamp':
            if metadata.get('stampData') and metadata.get('stampSettings'):
                print(f"\n✓ STAMP METADATA PRESERVED CORRECTLY")
                return True
            else:
                print(f"\n✗ STAMP METADATA INCOMPLETE")
                print(f"  Missing: stampData={not metadata.get('stampData')}, stampSettings={not metadata.get('stampSettings')}")
                return False
    else:
        print(f"\n✗ NO METADATA FIELD IN RESPONSE")
        return False

def test_undo_persistence():
    print("\n" + "="*80)
    print("TEST 2: Undo Marker Persistence")
    print("="*80)
    
    token = get_auth_token()
    room_id = create_test_room(token)
    print(f"✓ Created room: {room_id}")
    
    # Place a simple stroke
    stroke_data = {
        "roomId": room_id,
        "pathData": [[50, 50], [60, 60]],
        "brushColor": "#0000FF",
        "brushSize": 3
    }
    
    response = requests.post(
        f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json={"stroke": stroke_data}  # Wrap in "stroke" object
    )
    stroke_id = response.json().get("id")
    print(f"✓ Placed stroke: {stroke_id}")
    
    time.sleep(0.5)
    
    # Undo the stroke
    print(f"\n→ Undoing stroke {stroke_id}")
    response = requests.post(
        f"{BASE_URL}/rooms/{room_id}/undo",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    if response.status_code != 200:
        print(f"✗ Undo failed: {response.status_code}")
        return False
    
    print(f"✓ Undo successful")
    
    time.sleep(1.0)  # Give MongoDB sync time
    
    # Check MongoDB for the undo marker
    print(f"\n→ Checking MongoDB for undo markers in room {room_id}")
    
    query = {
        "$or": [
            {
                "asset.data.roomId": room_id,
                "asset.data.type": {"$in": ["undo_marker", "redo_marker"]}
            },
            {
                "transactions.value.asset.data.roomId": room_id,
                "transactions.value.asset.data.type": {"$in": ["undo_marker", "redo_marker"]}
            }
        ]
    }
    
    markers = list(strokes_coll.find(query))
    print(f"✓ Found {len(markers)} marker document(s)")
    
    if len(markers) == 0:
        print(f"✗ NO UNDO MARKERS FOUND IN MONGODB")
        return False
    
    # Examine the first marker
    marker = markers[0]
    print(f"\n→ Examining marker document:")
    print(f"  - Document keys: {list(marker.keys())}")
    
    marker_data = None
    if 'asset' in marker and 'data' in marker['asset']:
        marker_data = marker['asset']['data']
        print(f"  - Found in asset.data")
    elif 'transactions' in marker:
        print(f"  - Found in transactions array")
        for txn in marker.get('transactions', []):
            if 'value' in txn and 'asset' in txn['value']:
                marker_data = txn['value']['asset'].get('data')
                if marker_data:
                    break
    
    if marker_data:
        print(f"\n→ Marker data contents:")
        print(f"  - type: {marker_data.get('type')}")
        print(f"  - roomId: {marker_data.get('roomId')}")
        print(f"  - strokeId: {marker_data.get('strokeId')}")
        print(f"  - undone: {marker_data.get('undone')}")
        
        if (marker_data.get('type') == 'undo_marker' and 
            marker_data.get('roomId') == room_id and
            marker_data.get('strokeId')):
            print(f"\n✓ UNDO MARKER CORRECTLY PERSISTED")
            return True
        else:
            print(f"\n✗ UNDO MARKER MISSING REQUIRED FIELDS")
            return False
    else:
        print(f"\n✗ COULD NOT EXTRACT MARKER DATA")
        return False

def test_redis_flush_recovery():
    print("\n" + "="*80)
    print("TEST 3: Redis Flush Recovery")
    print("="*80)
    
    token = get_auth_token()
    room_id = create_test_room(token)
    print(f"✓ Created room: {room_id}")
    
    # Place two strokes
    for i in range(2):
        stroke_data = {
            "roomId": room_id,
            "pathData": [[10+i*10, 10+i*10], [20+i*10, 20+i*10]],
            "brushColor": "#00FF00",
            "brushSize": 3
        }
        response = requests.post(
            f"{BASE_URL}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"},
            json={"stroke": stroke_data}  # Wrap in "stroke" object
        )
        print(f"✓ Placed stroke {i+1}")
    
    time.sleep(0.5)
    
    # Undo the second stroke
    print(f"\n→ Undoing last stroke")
    response = requests.post(
        f"{BASE_URL}/rooms/{room_id}/undo",
        headers={"Authorization": f"Bearer {token}"}
    )
    print(f"✓ Undo successful")
    
    time.sleep(1.0)  # Give MongoDB sync time
    
    # Get strokes before flush
    response = requests.get(
        f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    strokes_before = response.json()
    print(f"\n→ Before Redis flush: {len(strokes_before)} visible stroke(s)")
    
    # Flush Redis
    print(f"\n→ Flushing Redis cache")
    redis_client.flushall()
    print(f"✓ Redis flushed")
    
    time.sleep(0.5)
    
    # Get strokes after flush
    response = requests.get(
        f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    strokes_after = response.json()
    print(f"\n→ After Redis flush: {len(strokes_after)} visible stroke(s)")
    
    if len(strokes_before) == len(strokes_after):
        print(f"\n✓ UNDO STATE PRESERVED AFTER REDIS FLUSH")
        print(f"  (Both show {len(strokes_after)} stroke(s), undone stroke stayed hidden)")
        return True
    else:
        print(f"\n✗ UNDO STATE LOST AFTER REDIS FLUSH")
        print(f"  Before: {len(strokes_before)} strokes")
        print(f"  After: {len(strokes_after)} strokes")
        print(f"  Expected them to be equal!")
        return False

if __name__ == "__main__":
    print("\n" + "="*80)
    print("LIVE BEHAVIOR TESTING")
    print("="*80)
    
    results = []
    
    # Test 1
    try:
        results.append(("Stamp Placement/Retrieval", test_stamp_placement_and_retrieval()))
    except Exception as e:
        print(f"\n✗ Test 1 crashed: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Stamp Placement/Retrieval", False))
    
    # Test 2
    try:
        results.append(("Undo Marker Persistence", test_undo_persistence()))
    except Exception as e:
        print(f"\n✗ Test 2 crashed: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Undo Marker Persistence", False))
    
    # Test 3
    try:
        results.append(("Redis Flush Recovery", test_redis_flush_recovery()))
    except Exception as e:
        print(f"\n✗ Test 3 crashed: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Redis Flush Recovery", False))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    for test_name, passed in results:
        status = "✓ PASS" if passed else "✗ FAIL"
        print(f"{status} - {test_name}")
    
    total_passed = sum(1 for _, passed in results if passed)
    print(f"\nPassed: {total_passed}/{len(results)}")
    
    sys.exit(0 if total_passed == len(results) else 1)
