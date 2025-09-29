#!/usr/bin/env python3
"""
Simple test script to validate the undo marker logic fix
without needing the full server running
"""

import sys
import os
import json

# Add the backend directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from services.db import strokes_coll
from services.graphql_service import GraphQLService

def simulate_undo_redo_markers():
    """Create test data that simulates the undo/redo marker issue"""
    print("=== Simulating Undo/Redo Marker Issue ===")
    
    # Sample data structure that would be created by the system
    room_id = "test_room_123"
    stroke_id = "test_stroke_456"
    marker_id = f"undo-{stroke_id}"
    base_ts = 1700000000000
    
    # Clear any existing test data
    strokes_coll.delete_many({
        "transactions.value.asset.data.id": {"$regex": f"undo-{stroke_id}"}
    })
    
    # Create test document simulating undo operation
    undo_doc = {
        "roomId": room_id,
        "ts": base_ts,
        "transactions": [{
            "value": {
                "asset": {
                    "data": {
                        "id": marker_id,
                        "ts": base_ts + 100,
                        "undone": True,
                        "value": json.dumps({"strokeId": stroke_id, "roomId": room_id}),
                        "roomId": room_id
                    }
                }
            }
        }]
    }
    
    # Create test document simulating redo operation (newer timestamp)
    redo_doc = {
        "roomId": room_id,
        "ts": base_ts + 1000,
        "transactions": [{
            "value": {
                "asset": {
                    "data": {
                        "id": marker_id,  # Same marker ID
                        "ts": base_ts + 1100,  # Later timestamp
                        "undone": False,  # Redo sets undone=False
                        "value": json.dumps({"strokeId": stroke_id, "roomId": room_id}),
                        "roomId": room_id
                    }
                }
            }
        }]
    }
    
    # Insert test documents
    strokes_coll.insert_one(undo_doc)
    strokes_coll.insert_one(redo_doc)
    
    print(f"Created test data:")
    print(f"  - Undo marker: ts={base_ts + 100}, undone=True")
    print(f"  - Redo marker: ts={base_ts + 1100}, undone=False (newer)")
    
    return room_id, stroke_id

def test_old_vs_new_logic():
    """Test the difference between old and new undo marker logic"""
    
    room_id, stroke_id = simulate_undo_redo_markers()
    
    print(f"\n=== Testing GraphQL Service Logic ===")
    print(f"Room: {room_id}, Stroke: {stroke_id}")
    
    # Test the new logic
    graphql_service = GraphQLService()
    markers = graphql_service.get_undo_markers(room_id)
    
    print(f"\nNew logic results:")
    print(f"  Found {len(markers)} undo markers")
    
    undone_stroke_ids = set()
    for marker in markers:
        marker_id = marker['id']
        if marker_id.startswith("undo-"):
            test_stroke_id = marker_id[5:]  # Remove "undo-" prefix
            undone_stroke_ids.add(test_stroke_id)
            print(f"    Marker: {marker_id} -> stroke_id: {test_stroke_id}, undone: {marker['undone']}")
    
    print(f"  Strokes marked as undone: {undone_stroke_ids}")
    
    # Expected result: stroke should NOT be in undone set because redo was more recent
    if stroke_id in undone_stroke_ids:
        print(f"  ❌ FAILURE: Stroke {stroke_id} is marked as undone, but it was redone!")
        print(f"      The system is not properly handling redo operations.")
        return False
    else:
        print(f"  ✅ SUCCESS: Stroke {stroke_id} is correctly NOT marked as undone")
        print(f"      The system properly recognizes that redo overrides undo.")
        return True

def cleanup():
    """Clean up test data"""
    strokes_coll.delete_many({
        "transactions.value.asset.data.id": {"$regex": "undo-test_stroke_"}
    })
    print(f"\n✅ Cleaned up test data")

def main():
    print("=== Undo/Redo Marker Logic Test ===")
    print("This test validates that the GraphQL service correctly handles")
    print("redo operations by using the most recent marker timestamp.")
    
    try:
        success = test_old_vs_new_logic()
        cleanup()
        
        if success:
            print(f"\n🎉 TEST PASSED: The fix correctly handles redo operations!")
        else:
            print(f"\n❌ TEST FAILED: The fix needs more work.")
            
        return success
        
    except Exception as e:
        print(f"\n❌ TEST ERROR: {e}")
        import traceback
        traceback.print_exc()
        cleanup()
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)