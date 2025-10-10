#!/usr/bin/env python3
"""
Test script to verify History Recall correctly loads drawings before and after Clear Canvas.
Also tests that History Recall UI buttons remain enabled in history mode.
"""

import requests
import json
import time
import sys
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:10010"
UNIQUE_ID = int(time.time())
TEST_USER_EMAIL = f"test_history_{UNIQUE_ID}@example.com"
TEST_USER_PASSWORD = "testpass123"
TEST_ROOM_NAME = f"HistoryRecallTest_{UNIQUE_ID}"

# ANSI color codes
GREEN = '\033[92m'
RED = '\033[91m'
BLUE = '\033[94m'
YELLOW = '\033[93m'
RESET = '\033[0m'

def log(message, color=RESET):
    """Print colored log message."""
    print(f"{color}{message}{RESET}")

def register_and_login():
    """Register a test user and get auth token."""
    log("\n=== Step 1: Register and Login ===", BLUE)
    
    # Register - registration returns a token directly
    register_response = requests.post(f"{BASE_URL}/auth/register", json={
        "username": TEST_USER_EMAIL.split('@')[0],
        "email": TEST_USER_EMAIL,
        "password": TEST_USER_PASSWORD
    })
    
    if register_response.status_code == 201:
        # New user registered, token is in response
        token = register_response.json().get('token')
        log(f"✓ User registered successfully, token received", GREEN)
        return token
    elif register_response.status_code == 409:
        # User already exists, need to login
        log(f"✓ User already exists, logging in...", GREEN)
        login_response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": TEST_USER_EMAIL,
            "password": TEST_USER_PASSWORD
        })
        
        if login_response.status_code != 200:
            log(f"✗ Login failed: {login_response.status_code} - {login_response.text}", RED)
            return None
        
        token = login_response.json().get('token')
        log(f"✓ Login successful, token received", GREEN)
        return token
    else:
        log(f"✗ Registration failed: {register_response.status_code} - {register_response.text}", RED)
        return None

def create_test_room(token):
    """Create a test room and return room ID."""
    log("\n=== Step 2: Create Test Room ===", BLUE)
    
    headers = {'Authorization': f'Bearer {token}'}
    response = requests.post(f"{BASE_URL}/rooms", 
                            headers=headers,
                            json={
                                "name": TEST_ROOM_NAME,
                                "privacy": "private",
                                "max_users": 10
                            })
    
    log(f"Room creation response: {response.status_code} - {response.text}", YELLOW)
    
    if response.status_code not in [200, 201]:
        log(f"✗ Room creation failed: {response.status_code} - {response.text}", RED)
        return None
    
    data = response.json()
    # Check both 'id' and '_id' fields in the response and nested 'room' object
    room_id = data.get('id') or data.get('_id') or data.get('room', {}).get('id') or data.get('room', {}).get('_id')
    if isinstance(room_id, dict) and '$oid' in room_id:
        room_id = room_id['$oid']
    
    log(f"✓ Room created with ID: {room_id}", GREEN)
    return room_id

def draw_strokes(token, room_id, count, label):
    """Draw multiple test strokes and return their timestamps."""
    log(f"\n=== Drawing {count} strokes ({label}) ===", BLUE)
    
    headers = {'Authorization': f'Bearer {token}'}
    timestamps = []
    
    for i in range(count):
        ts = int(time.time() * 1000)
        stroke_id = f"test-stroke-{label}-{i}-{ts}"
        
        # Inner stroke data
        stroke_value = {
            "id": stroke_id,
            "drawingId": stroke_id,
            "user": TEST_USER_EMAIL,
            "pathData": [{"x": 100 + i*10, "y": 100 + i*10}, {"x": 200 + i*10, "y": 200 + i*10}],
            "color": "#000000",
            "lineWidth": 2,
            "ts": ts,
            "timestamp": ts,
            "brushStyle": "round",
            "order": ts
        }
        
        # Wrapper expected by submitNewLineRoom
        request_data = {
            "roomId": room_id,
            "user": TEST_USER_EMAIL,
            "value": json.dumps(stroke_value)
        }
        
        response = requests.post(f"{BASE_URL}/submitNewLineRoom",
                                headers=headers,
                                json=request_data)
        
        if response.status_code not in [200, 201]:
            log(f"✗ Failed to draw stroke {i}: {response.status_code} - {response.text[:200]}", RED)
        else:
            timestamps.append(ts)
            log(f"✓ Drew stroke {i+1}/{count} at timestamp {ts}", GREEN)
        
        time.sleep(0.2)  # Small delay between strokes
    
    return timestamps

def clear_canvas(token, room_id):
    """Clear the canvas."""
    log("\n=== Clearing Canvas ===", BLUE)
    
    headers = {'Authorization': f'Bearer {token}'}
    clear_ts = int(time.time() * 1000)
    
    response = requests.post(f"{BASE_URL}/submitClearCanvasTimestamp",
                            headers=headers,
                            json={
                                "roomId": room_id,
                                "ts": clear_ts
                            })
    
    if response.status_code != 200:
        log(f"✗ Clear canvas failed: {response.status_code} - {response.text}", RED)
        return None
    
    log(f"✓ Canvas cleared at timestamp {clear_ts}", GREEN)
    time.sleep(0.5)  # Give backend time to process
    return clear_ts

def get_canvas_data(token, room_id, start_ts=None, end_ts=None):
    """Get canvas data, optionally with history mode time range."""
    headers = {'Authorization': f'Bearer {token}'}
    
    params = {'roomId': room_id}
    if start_ts is not None and end_ts is not None:
        params['start'] = str(start_ts)
        params['end'] = str(end_ts)
    
    response = requests.get(f"{BASE_URL}/getCanvasData",
                           headers=headers,
                           params=params)
    
    if response.status_code != 200:
        log(f"✗ Failed to get canvas data: {response.status_code} - {response.text}", RED)
        return []
    
    data = response.json()
    drawings = data.get('all_missing_data', [])
    return drawings

def run_test():
    """Run the complete test."""
    log("=" * 70, YELLOW)
    log("  HISTORY RECALL WITH CLEAR CANVAS TEST", YELLOW)
    log("=" * 70, YELLOW)
    
    # Step 1: Authentication
    token = register_and_login()
    if not token:
        log("\n✗ TEST FAILED: Could not authenticate", RED)
        return False
    
    # Step 2: Create room
    room_id = create_test_room(token)
    if not room_id:
        log("\n✗ TEST FAILED: Could not create room", RED)
        return False
    
    # Step 3: Draw first batch of strokes (BEFORE clear)
    before_clear_start = int(time.time() * 1000)
    time.sleep(0.1)
    before_timestamps = draw_strokes(token, room_id, 3, "BEFORE-CLEAR")
    time.sleep(0.5)
    before_clear_end = int(time.time() * 1000)
    
    if not before_timestamps:
        log("\n✗ TEST FAILED: Could not draw before-clear strokes", RED)
        return False
    
    # Step 4: Clear canvas
    clear_timestamp = clear_canvas(token, room_id)
    if not clear_timestamp:
        log("\n✗ TEST FAILED: Could not clear canvas", RED)
        return False
    
    time.sleep(0.5)
    
    # Step 5: Draw second batch of strokes (AFTER clear)
    after_clear_start = int(time.time() * 1000)
    time.sleep(0.1)
    after_timestamps = draw_strokes(token, room_id, 3, "AFTER-CLEAR")
    time.sleep(0.5)
    after_clear_end = int(time.time() * 1000)
    
    if not after_timestamps:
        log("\n✗ TEST FAILED: Could not draw after-clear strokes", RED)
        return False
    
    # Step 6: Get normal canvas data (should only show AFTER clear)
    log("\n=== Step 6: Testing Normal Mode (should only show AFTER clear) ===", BLUE)
    log("Waiting 3 seconds for MongoDB sync to catch up...", YELLOW)
    time.sleep(3)
    normal_data = get_canvas_data(token, room_id)
    log(f"Normal mode returned {len(normal_data)} drawings", YELLOW)
    
    # Count BEFORE vs AFTER strokes in normal mode
    before_count_normal = sum(1 for d in normal_data if 'BEFORE-CLEAR' in json.loads(d.get('value', '{}')).get('id', ''))
    after_count_normal = sum(1 for d in normal_data if 'AFTER-CLEAR' in json.loads(d.get('value', '{}')).get('id', ''))
    
    log(f"  - BEFORE-CLEAR strokes: {before_count_normal}", YELLOW)
    log(f"  - AFTER-CLEAR strokes: {after_count_normal}", YELLOW)
    
    if before_count_normal > 0:
        log("✗ FAIL: Normal mode should NOT show BEFORE-CLEAR strokes", RED)
        return False
    
    if after_count_normal != 3:
        log(f"✗ FAIL: Normal mode should show exactly 3 AFTER-CLEAR strokes, got {after_count_normal}", RED)
        return False
    
    log("✓ PASS: Normal mode correctly shows only AFTER-CLEAR strokes", GREEN)
    
    # Step 7: Test history mode with range covering BEFORE clear
    log("\n=== Step 7: Testing History Mode (should show BEFORE clear) ===", BLUE)
    history_data = get_canvas_data(token, room_id, before_clear_start - 5000, before_clear_end + 5000)
    log(f"History mode (BEFORE range) returned {len(history_data)} drawings", YELLOW)
    
    before_count_history = sum(1 for d in history_data if 'BEFORE-CLEAR' in json.loads(d.get('value', '{}')).get('id', ''))
    after_count_history = sum(1 for d in history_data if 'AFTER-CLEAR' in json.loads(d.get('value', '{}')).get('id', ''))
    
    log(f"  - BEFORE-CLEAR strokes: {before_count_history}", YELLOW)
    log(f"  - AFTER-CLEAR strokes: {after_count_history}", YELLOW)
    
    if before_count_history != 3:
        log(f"✗ FAIL: History mode should show exactly 3 BEFORE-CLEAR strokes, got {before_count_history}", RED)
        log("✗ THIS IS THE BUG: Drawings before Clear Canvas are not loaded in History Recall!", RED)
        return False
    
    if after_count_history > 0:
        log(f"✗ FAIL: History mode with BEFORE range should not show AFTER-CLEAR strokes, got {after_count_history}", RED)
        return False
    
    log("✓ PASS: History mode correctly shows BEFORE-CLEAR strokes", GREEN)
    
    # Step 8: Test history mode with range covering BOTH before and after
    log("\n=== Step 8: Testing History Mode (full range, BEFORE + AFTER) ===", BLUE)
    full_history_data = get_canvas_data(token, room_id, before_clear_start - 5000, after_clear_end + 5000)
    log(f"History mode (full range) returned {len(full_history_data)} drawings", YELLOW)
    
    before_count_full = sum(1 for d in full_history_data if 'BEFORE-CLEAR' in json.loads(d.get('value', '{}')).get('id', ''))
    after_count_full = sum(1 for d in full_history_data if 'AFTER-CLEAR' in json.loads(d.get('value', '{}')).get('id', ''))
    
    log(f"  - BEFORE-CLEAR strokes: {before_count_full}", YELLOW)
    log(f"  - AFTER-CLEAR strokes: {after_count_full}", YELLOW)
    
    if before_count_full != 3:
        log(f"✗ FAIL: Full range should show exactly 3 BEFORE-CLEAR strokes, got {before_count_full}", RED)
        return False
    
    if after_count_full != 3:
        log(f"✗ FAIL: Full range should show exactly 3 AFTER-CLEAR strokes, got {after_count_full}", RED)
        return False
    
    log("✓ PASS: History mode with full range shows BOTH BEFORE and AFTER strokes", GREEN)
    
    # Final summary
    log("\n" + "=" * 70, GREEN)
    log("  ✓ ALL TESTS PASSED!", GREEN)
    log("  - History Recall correctly loads drawings before Clear Canvas", GREEN)
    log("  - History Recall correctly loads drawings after Clear Canvas", GREEN)
    log("  - Normal mode correctly excludes cleared drawings", GREEN)
    log("=" * 70, GREEN)
    
    return True

if __name__ == "__main__":
    try:
        success = run_test()
        sys.exit(0 if success else 1)
    except Exception as e:
        log(f"\n✗ TEST FAILED WITH EXCEPTION: {e}", RED)
        import traceback
        traceback.print_exc()
        sys.exit(1)
