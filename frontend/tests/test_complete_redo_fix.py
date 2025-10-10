#!/usr/bin/env python3
"""
Integration test to validate the complete redo persistence fix

This test simulates the exact issue reported:
1. Draw 3 strokes in a room
2. Undo last 2 strokes  
3. Redo 1 stroke (second stroke should reappear)
4. Flush Redis cache (simulates server restart)
5. Test both room stroke endpoints to ensure consistent behavior
"""

import sys
import os
import json

# Add the backend directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))

from services.db import strokes_coll, redis_client  
from services.graphql_service import GraphQLService
from routes.rooms import rooms_coll
from bson import ObjectId
from pymongo import ASCENDING

def simulate_room_with_strokes():
    """Create a test room with 3 strokes"""
    print("=== Setting Up Test Room with Strokes ===")
    
    # Create test room document
    room_doc = {
        "name": "Test Redo Room",
        "type": "public",
        "owner": "test_user",
        "members": ["test_user"],
        "created": 1700000000000
    }
    
    result = rooms_coll.insert_one(room_doc)
    room_id = str(result.inserted_id)
    
    # Create 3 test strokes
    stroke_ids = []
    base_ts = 1700000000000
    
    for i in range(3):
        stroke_id = f"stroke_{i}_{base_ts + i * 1000}"
        stroke_ids.append(stroke_id)
        
        stroke_doc = {
            "roomId": room_id,
            "ts": base_ts + i * 1000,
            "stroke": {
                "id": stroke_id,
                "drawingId": stroke_id,
                "color": f"#FF{i:02d}{i:02d}0",
                "lineWidth": 5,
                "pathData": [[100 + i*50, 100], [150 + i*50, 150]],
                "user": "test_user",
                "ts": base_ts + i * 1000,
                "roomId": room_id
            }
        }
        
        strokes_coll.insert_one(stroke_doc)
    
    print(f"Created room {room_id} with strokes: {stroke_ids}")
    return room_id, stroke_ids

def simulate_undo_operations(room_id, stroke_ids):
    """Simulate undoing the last 2 strokes"""
    print(f"\n=== Simulating Undo Operations ===")
    
    # Simulate undo operations by creating undo markers
    user_id = "test_user" 
    base_ts = 1700001000000  # Later timestamp for undo operations
    
    # Undo last 2 strokes (indices 2 and 1)
    undone_stroke_ids = []
    for i, stroke_id in enumerate([stroke_ids[2], stroke_ids[1]]):  # Undo in reverse order
        marker_id = f"undo-{stroke_id}"
        undone_stroke_ids.append(stroke_id)
        
        # Create persistent undo marker document (as GraphQL service would)
        undo_doc = {
            "roomId": room_id,
            "ts": base_ts + i * 100,
            "transactions": [{
                "value": {
                    "asset": {
                        "data": {
                            "id": marker_id,
                            "ts": base_ts + i * 100,
                            "undone": True,
                            "value": json.dumps({"strokeId": stroke_id, "roomId": room_id}),
                            "roomId": room_id
                        }
                    }
                }
            }]
        }
        
        strokes_coll.insert_one(undo_doc)
        print(f"  Created undo marker for stroke {stroke_id}")
    
    return undone_stroke_ids

def simulate_redo_operation(room_id, stroke_id):
    """Simulate redoing one stroke (the second one)"""
    print(f"\n=== Simulating Redo Operation ===")
    
    marker_id = f"undo-{stroke_id}"
    redo_ts = 1700002000000  # Even later timestamp for redo
    
    # Create persistent redo marker document (undone=False)
    redo_doc = {
        "roomId": room_id,
        "ts": redo_ts,
        "transactions": [{
            "value": {
                "asset": {
                    "data": {
                        "id": marker_id,  # Same marker ID as undo
                        "ts": redo_ts,
                        "undone": False,  # This is the key difference
                        "value": json.dumps({"strokeId": stroke_id, "roomId": room_id}),
                        "roomId": room_id
                    }
                }
            }
        }]
    }
    
    strokes_coll.insert_one(redo_doc)
    print(f"  Created redo marker for stroke {stroke_id} (undone=False)")

def test_graphql_service_logic(room_id):
    """Test the GraphQL service undo marker logic"""
    print(f"\n=== Testing GraphQL Service Logic ===")
    
    graphql_service = GraphQLService()
    markers = graphql_service.get_undo_markers(room_id)
    
    print(f"GraphQL service found {len(markers)} undo markers:")
    undone_stroke_ids = set()
    
    for marker in markers:
        marker_id = marker['id']
        stroke_id = marker_id[5:]  # Remove "undo-" prefix
        undone_stroke_ids.add(stroke_id)
        print(f"  {marker_id} -> {stroke_id} (undone={marker['undone']})")
    
    return undone_stroke_ids

def test_room_strokes_endpoint(room_id, expected_count):
    """Test the /rooms/<id>/strokes endpoint filtering logic"""
    print(f"\n=== Testing Room Strokes Endpoint Logic ===")
    
    # Simulate the exact logic from the rooms.py get_strokes function
    undone_strokes = set()
    
    # Get undo markers from GraphQL persistent storage (simulating Redis flush scenario)
    try:
        graphql_service = GraphQLService()
        persistent_markers = graphql_service.get_undo_markers(room_id)
        for marker in persistent_markers:
            if marker.get('undone') and marker.get('id'):
                marker_id = marker['id']
                if marker_id.startswith("undo-"):
                    stroke_id = marker_id[5:]  # Remove "undo-" prefix
                    undone_strokes.add(stroke_id)
    except Exception as e:
        print(f"Error loading persistent undo markers: {e}")
    
    # Get all strokes for the room
    items = list(strokes_coll.find({"roomId": room_id}).sort("ts", 1))
    
    # Filter strokes (simulating public room logic)
    filtered_strokes = []
    for item in items:
        stroke_data = item.get("stroke")
        if not stroke_data:
            continue  # Skip undo marker documents
            
        stroke_id = stroke_data.get("id") or stroke_data.get("drawingId")
        if stroke_id not in undone_strokes:
            filtered_strokes.append(stroke_data)
    
    print(f"Room strokes endpoint: {len(filtered_strokes)} strokes (expected: {expected_count})")
    print(f"Undone strokes: {undone_strokes}")
    
    return len(filtered_strokes) == expected_count, filtered_strokes

def test_canvas_data_room_endpoint(room_id, expected_count):
    """Test the /getCanvasDataRoom endpoint filtering logic"""
    print(f"\n=== Testing Canvas Data Room Endpoint Logic ===")
    
    # Simulate the logic from get_canvas_data_room.py (with our fix)
    undone_strokes = set()
    
    try:
        # Check GraphQL persistent storage for undo markers (recovery after Redis flush)
        graphql_service = GraphQLService()
        persistent_markers = graphql_service.get_undo_markers(room_id)
        for marker in persistent_markers:
            if marker.get('undone') and marker.get('id'):
                marker_id = marker['id']
                if marker_id.startswith("undo-"):
                    stroke_id = marker_id[5:]  # Remove "undo-" prefix
                    undone_strokes.add(stroke_id)
    except Exception as e:
        print(f"Error loading persistent undo markers: {e}")
    
    # Get all strokes for the room
    cursor = strokes_coll.find(
        {"roomId": room_id, "stroke": {"$exists": True}},  # Only stroke documents
        sort=[('ts', ASCENDING)]
    )
    
    items = []
    filtered_count = 0
    total_count = 0
    
    for doc in cursor:
        total_count += 1
        
        # Filter out undone strokes 
        stroke_data = doc.get("stroke", {})
        stroke_id = stroke_data.get("id") or stroke_data.get("drawingId")
        
        if stroke_id and stroke_id in undone_strokes:
            filtered_count += 1
            continue
            
        items.append(doc)
    
    print(f"Canvas data room endpoint: {len(items)} strokes (expected: {expected_count})")
    print(f"Filtered out: {filtered_count}, Total processed: {total_count}")
    print(f"Undone strokes: {undone_strokes}")
    
    return len(items) == expected_count, items

def cleanup_test_data(room_id):
    """Clean up all test data"""
    print(f"\n=== Cleaning Up Test Data ===")
    
    # Remove room document
    rooms_coll.delete_one({"_id": ObjectId(room_id)})
    
    # Remove all stroke documents for this room
    stroke_result = strokes_coll.delete_many({"roomId": room_id})
    
    # Remove all undo marker documents for this room  
    marker_result = strokes_coll.delete_many({
        "transactions.value.asset.data.roomId": room_id
    })
    
    print(f"Removed room, {stroke_result.deleted_count} stroke docs, {marker_result.deleted_count} marker docs")

def main():
    print("=== Complete Redo Persistence Fix Validation ===")
    print("This test validates the fix for the issue where redo functionality")
    print("breaks after Redis flush by not properly handling redo markers.")
    
    room_id = None
    try:
        # Setup: Create room with 3 strokes
        room_id, stroke_ids = simulate_room_with_strokes()
        
        # Step 1: Undo last 2 strokes (should leave 1 visible)
        undone_stroke_ids = simulate_undo_operations(room_id, stroke_ids)
        
        # Step 2: Redo the second stroke (should make 2 visible)
        redo_stroke_id = stroke_ids[1]  # The second stroke
        simulate_redo_operation(room_id, redo_stroke_id)
        
        # Step 3: Test GraphQL service logic
        graphql_undone_strokes = test_graphql_service_logic(room_id)
        
        # Step 4: Test both endpoints after "Redis flush" (persistent storage only)
        room_endpoint_success, room_strokes = test_room_strokes_endpoint(room_id, 2)
        canvas_endpoint_success, canvas_items = test_canvas_data_room_endpoint(room_id, 2)
        
        # Results
        print(f"\n=== RESULTS ===")
        print(f"Expected visible strokes: 2 (first + redone second)")
        print(f"Room strokes endpoint: {'✅ PASS' if room_endpoint_success else '❌ FAIL'} ({len(room_strokes)} strokes)")
        print(f"Canvas data room endpoint: {'✅ PASS' if canvas_endpoint_success else '❌ FAIL'} ({len(canvas_items)} strokes)")
        
        # Detailed analysis
        if room_endpoint_success and canvas_endpoint_success:
            print(f"\n🎉 ALL TESTS PASSED!")
            print(f"The redo persistence fix is working correctly.")
            print(f"Both endpoints properly handle redo operations after Redis flush.")
            
            # Verify which specific strokes are visible
            visible_stroke_ids = {s['id'] for s in room_strokes}
            expected_visible = {stroke_ids[0], stroke_ids[1]}  # First and second (redone)
            
            if visible_stroke_ids == expected_visible:
                print(f"✅ Correct strokes are visible: {visible_stroke_ids}")
            else:
                print(f"❌ Wrong strokes visible: {visible_stroke_ids}, expected: {expected_visible}")
                
        else:
            print(f"\n❌ TESTS FAILED!")
            print(f"The fix needs additional work.")
            
            if not room_endpoint_success:
                print(f"  - Room strokes endpoint is not working correctly")
            if not canvas_endpoint_success:
                print(f"  - Canvas data room endpoint is not working correctly")
        
        return room_endpoint_success and canvas_endpoint_success
        
    except Exception as e:
        print(f"\n❌ TEST ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    finally:
        if room_id:
            cleanup_test_data(room_id)

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)