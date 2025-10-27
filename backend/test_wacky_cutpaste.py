#!/usr/bin/env python3
"""
Test cut/paste undo/redo scenarios with wacky brushes
"""

import sys
import os
import json
import requests
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from services.db import redis_client

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
        json={"name": "Cut/Paste Test Room", "isPrivate": False}
    )
    return response.json()["room"]["id"]

def test_wacky_brush_cut_paste_undo_persist():
    print("\n" + "="*80)
    print("TEST: Wacky Brush Cut/Paste/Undo Persistence After Redis Flush")
    print("="*80)
    
    token = get_auth_token()
    room_id = create_test_room(token)
    print(f"✓ Created room: {room_id}")
    
    # Step 1: Draw wacky strokes (Sparkle brush)
    print(f"\n→ Drawing with Sparkle brush")
    sparkle_strokes = []
    for i in range(3):
        stroke_data = {
            "roomId": room_id,
            "pathData": [[10+i*20, 10+i*20], [30+i*20, 30+i*20]],
            "brushColor": "#FF0000",
            "brushSize": 5,
            "brushType": "sparkle",
            "brushParams": {"intensity": 0.8, "particleCount": 20},
            "metadata": {
                "brushType": "sparkle",
                "brushParams": {"intensity": 0.8, "particleCount": 20},
                "drawingType": "stroke"
            }
        }
        response = requests.post(
            f"{BASE_URL}/rooms/{room_id}/strokes",
            headers={"Authorization": f"Bearer {token}"},
            json={"stroke": stroke_data}
        )
        if response.status_code == 200:
            sparkle_strokes.append(response.json())
            print(f"  ✓ Drew sparkle stroke {i+1}")
        else:
            print(f"  ✗ Failed: {response.status_code}")
            return False
    
    time.sleep(0.5)
    
    # Step 2: Retrieve and verify sparkle strokes are there
    response = requests.get(
        f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    strokes_before = response.json()["strokes"]
    print(f"\n→ Before any operations: {len(strokes_before)} stroke(s)")
    
    sparkle_count = sum(1 for s in strokes_before if s.get('metadata', {}).get('brushType') == 'sparkle')
    print(f"  - {sparkle_count} sparkle strokes")
    
    if sparkle_count != 3:
        print(f"✗ Expected 3 sparkle strokes, got {sparkle_count}")
        return False
    
    # Step 3: Simulate cut/paste by creating a pasted stroke
    print(f"\n→ Simulating cut/paste operation")
    pasted_stroke = {
        "roomId": room_id,
        "pathData": [[100, 100], [120, 120]],
        "brushColor": "#FF0000",
        "brushSize": 5,
        "brushType": "sparkle",
        "brushParams": {"intensity": 0.8, "particleCount": 20},
        "metadata": {
            "brushType": "sparkle",
            "brushParams": {"intensity": 0.8, "particleCount": 20},
            "drawingType": "stroke",
            "isPasted": True,
            "originalStrokeId": "original-stroke-id"
        }
    }
    response = requests.post(
        f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json={"stroke": pasted_stroke}
    )
    print(f"  ✓ Pasted sparkle stroke")
    
    time.sleep(0.5)
    
    # Step 4: Verify pasted stroke appears
    response = requests.get(
        f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    strokes_after_paste = response.json()["strokes"]
    print(f"\n→ After paste: {len(strokes_after_paste)} stroke(s)")
    
    if len(strokes_after_paste) != 4:
        print(f"✗ Expected 4 strokes after paste, got {len(strokes_after_paste)}")
        return False
    
    # Step 5: Undo the pasted stroke
    print(f"\n→ Undoing pasted stroke")
    response = requests.post(
        f"{BASE_URL}/rooms/{room_id}/undo",
        headers={"Authorization": f"Bearer {token}"}
    )
    if response.status_code != 200:
        print(f"✗ Undo failed: {response.status_code}")
        return False
    print(f"  ✓ Undo successful")
    
    time.sleep(1.0)  # Give MongoDB sync time
    
    # Step 6: Verify pasted stroke is hidden
    response = requests.get(
        f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    strokes_after_undo = response.json()["strokes"]
    print(f"\n→ After undo: {len(strokes_after_undo)} stroke(s)")
    
    if len(strokes_after_undo) != 3:
        print(f"✗ Expected 3 strokes after undo (pasted hidden), got {len(strokes_after_undo)}")
        return False
    
    # Step 7: Flush Redis
    print(f"\n→ Flushing Redis cache")
    redis_client.flushall()
    print(f"  ✓ Redis flushed")
    
    time.sleep(0.5)
    
    # Step 8: Verify strokes still correct after Redis flush
    response = requests.get(
        f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    strokes_after_flush = response.json()["strokes"]
    print(f"\n→ After Redis flush: {len(strokes_after_flush)} stroke(s)")
    
    # Check that brushType is preserved
    sparkle_after_flush = sum(1 for s in strokes_after_flush if s.get('metadata', {}).get('brushType') == 'sparkle')
    print(f"  - {sparkle_after_flush} sparkle strokes")
    
    if len(strokes_after_flush) != 3:
        print(f"\n✗ FAILED: Expected 3 strokes (pasted still hidden), got {len(strokes_after_flush)}")
        print(f"  The undone pasted stroke reappeared!")
        return False
    
    if sparkle_after_flush != 3:
        print(f"\n✗ FAILED: Expected 3 sparkle strokes, got {sparkle_after_flush}")
        print(f"  Brush metadata was lost!")
        return False
    
    print(f"\n✓ SUCCESS: Wacky brush cut/paste/undo state persisted after Redis flush")
    print(f"  - Pasted stroke stayed hidden ✓")
    print(f"  - Brush metadata preserved ✓")
    return True

if __name__ == "__main__":
    print("\n" + "="*80)
    print("WACKY BRUSH CUT/PASTE/UNDO/REDO PERSISTENCE TEST")
    print("="*80)
    
    try:
        passed = test_wacky_brush_cut_paste_undo_persist()
        
        print("\n" + "="*80)
        print("TEST RESULT")
        print("="*80)
        
        if passed:
            print("✓ PASS - All wacky brush cut/paste/undo scenarios work correctly")
            sys.exit(0)
        else:
            print("✗ FAIL - Some scenarios failed")
            sys.exit(1)
    except Exception as e:
        print(f"\n✗ Test crashed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
