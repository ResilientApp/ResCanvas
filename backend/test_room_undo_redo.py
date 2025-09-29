#!/usr/bin/env python3
"""
Test script to verify room-based undo/redo works exactly like legacy system.
This tests the exact scenario from user: draw 3, undo 2, redo 2, multiple refreshes.
"""

import requests
import json
import time

BASE_URL = "http://localhost:5000"
ROOM = "test_undo_redo_room"

# Test JWT token (replace with valid token)
TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjoidGVzdF91c2VyIiwidGltZXN0YW1wIjoxNzM0ODIxMzA0LjYzNjcxNTl9.YYL1K4ZfSJHQ-sEqpQhBqEwCYCtlwP1FgN6t7W2Umqg"

headers = {'Authorization': f'Bearer {TOKEN}'}

def clear_room():
    """Clear the test room"""
    response = requests.post(f"{BASE_URL}/clear_canvas/{ROOM}", headers=headers)
    print(f"Clear room: {response.status_code}")

def add_stroke(stroke_id, points):
    """Add a stroke to the room"""
    stroke_data = {
        'id': stroke_id,
        'points': points,
        'color': '#000000',
        'width': 2,
        'timestamp': int(time.time() * 1000)
    }
    response = requests.post(f"{BASE_URL}/rooms/{ROOM}/strokes", 
                           headers=headers, 
                           json=stroke_data)
    print(f"Add stroke {stroke_id}: {response.status_code}")
    return response.status_code == 200

def get_strokes():
    """Get all strokes from the room"""
    response = requests.get(f"{BASE_URL}/rooms/{ROOM}/strokes", headers=headers)
    if response.status_code == 200:
        strokes = response.json()
        stroke_ids = [s['id'] for s in strokes]
        print(f"Get strokes: {len(strokes)} strokes - {stroke_ids}")
        return strokes
    else:
        print(f"Get strokes failed: {response.status_code}")
        return []

def undo_stroke(stroke_id):
    """Undo a specific stroke"""
    response = requests.post(f"{BASE_URL}/rooms/{ROOM}/undo/{stroke_id}", headers=headers)
    print(f"Undo stroke {stroke_id}: {response.status_code}")
    return response.status_code == 200

def redo_stroke(stroke_id):
    """Redo a specific stroke"""  
    response = requests.post(f"{BASE_URL}/rooms/{ROOM}/redo/{stroke_id}", headers=headers)
    print(f"Redo stroke {stroke_id}: {response.status_code}")
    return response.status_code == 200

def test_room_undo_redo():
    """Test the complete room undo/redo scenario"""
    print("=== Testing Room-Based Undo/Redo ===\n")
    
    # Step 1: Clear room and verify empty
    print("1. Clear room and verify empty")
    clear_room()
    strokes = get_strokes()
    assert len(strokes) == 0, f"Expected 0 strokes after clear, got {len(strokes)}"
    print("✅ Room cleared successfully\n")
    
    # Step 2: Add 3 strokes
    print("2. Add 3 strokes")
    add_stroke("stroke1", [[10, 10], [20, 20]])
    add_stroke("stroke2", [[30, 30], [40, 40]])
    add_stroke("stroke3", [[50, 50], [60, 60]])
    
    strokes = get_strokes()
    assert len(strokes) == 3, f"Expected 3 strokes after adding, got {len(strokes)}"
    print("✅ All 3 strokes added successfully\n")
    
    # Step 3: Undo 2 strokes (stroke2 and stroke3)
    print("3. Undo 2 strokes (stroke2 and stroke3)")
    undo_stroke("stroke2")
    undo_stroke("stroke3")
    
    strokes = get_strokes()
    assert len(strokes) == 1, f"Expected 1 stroke after undo, got {len(strokes)}"
    assert strokes[0]['id'] == 'stroke1', f"Expected stroke1 to remain, got {strokes[0]['id']}"
    print("✅ Undo working - only stroke1 visible\n")
    
    # Step 4: Redo 2 strokes (stroke2 and stroke3)
    print("4. Redo 2 strokes (stroke2 and stroke3)")
    redo_stroke("stroke2")
    redo_stroke("stroke3")
    
    strokes = get_strokes()
    assert len(strokes) == 3, f"Expected 3 strokes after redo, got {len(strokes)}"
    stroke_ids = {s['id'] for s in strokes}
    expected_ids = {'stroke1', 'stroke2', 'stroke3'}
    assert stroke_ids == expected_ids, f"Expected {expected_ids}, got {stroke_ids}"
    print("✅ Redo working - all 3 strokes visible again\n")
    
    # Step 5: Multiple refresh calls to test persistence
    print("5. Test multiple refresh calls (most critical test)")
    for i in range(5):
        print(f"   Refresh #{i+1}")
        strokes = get_strokes()
        assert len(strokes) == 3, f"Refresh {i+1}: Expected 3 strokes, got {len(strokes)}"
        stroke_ids = {s['id'] for s in strokes}
        assert stroke_ids == expected_ids, f"Refresh {i+1}: Expected {expected_ids}, got {stroke_ids}"
        
    print("✅ Persistence test passed - redone strokes stay visible across refreshes\n")
    
    # Step 6: Test undo after redo (mixed operations)
    print("6. Test undo after redo (stroke3)")
    undo_stroke("stroke3")
    
    strokes = get_strokes()
    assert len(strokes) == 2, f"Expected 2 strokes after mixed undo, got {len(strokes)}"
    stroke_ids = {s['id'] for s in strokes}
    expected_ids = {'stroke1', 'stroke2'}
    assert stroke_ids == expected_ids, f"Expected {expected_ids}, got {stroke_ids}"
    print("✅ Mixed undo/redo operations work correctly\n")
    
    # Step 7: Final persistence test
    print("7. Final persistence test after mixed operations")
    for i in range(3):
        print(f"   Final refresh #{i+1}")
        strokes = get_strokes()
        assert len(strokes) == 2, f"Final refresh {i+1}: Expected 2 strokes, got {len(strokes)}"
        stroke_ids = {s['id'] for s in strokes}
        assert stroke_ids == expected_ids, f"Final refresh {i+1}: Expected {expected_ids}, got {stroke_ids}"
        
    print("✅ Final persistence test passed\n")
    
    print("🎉 ALL TESTS PASSED! Room undo/redo works exactly like legacy system!")

if __name__ == "__main__":
    try:
        test_room_undo_redo()
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()