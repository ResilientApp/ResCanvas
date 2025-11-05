#!/usr/bin/env python3
"""
Cleanup script to remove owner share records that were incorrectly created before the bug fixes.
Owners should only be identified by room.ownerId, not by share records in shares_coll.

This script:
1. Finds all rooms
2. For each room, checks if the owner has a share record
3. Deletes any owner share records found
4. Reports statistics
"""

import sys
from services.db import rooms_coll, shares_coll
from bson import ObjectId

def cleanup_owner_shares():
    """Remove any share records where userId matches the room's ownerId."""
    
    print("=" * 60)
    print("Cleanup Owner Share Records")
    print("=" * 60)
    print()
    
    # Get all rooms
    rooms = list(rooms_coll.find({}))
    print(f"Found {len(rooms)} total rooms")
    print()
    
    total_deleted = 0
    rooms_affected = []
    
    for room in rooms:
        room_id = str(room['_id'])
        owner_id = room.get('ownerId')
        room_name = room.get('name', 'Unnamed')
        
        if not owner_id:
            print(f"⚠️  Room '{room_name}' ({room_id}) has no ownerId, skipping")
            continue
        
        # Check if owner has a share record
        owner_shares = list(shares_coll.find({
            'roomId': room_id,
            'userId': owner_id
        }))
        
        if owner_shares:
            print(f"🔍 Room '{room_name}' ({room_id})")
            print(f"   Owner: {owner_id}")
            print(f"   Found {len(owner_shares)} owner share record(s) to delete")
            
            # Delete the owner share records
            result = shares_coll.delete_many({
                'roomId': room_id,
                'userId': owner_id
            })
            
            deleted_count = result.deleted_count
            total_deleted += deleted_count
            rooms_affected.append(room_name)
            
            print(f"   ✅ Deleted {deleted_count} owner share record(s)")
            print()
    
    print()
    print("=" * 60)
    print("Cleanup Summary")
    print("=" * 60)
    print(f"Total rooms checked: {len(rooms)}")
    print(f"Rooms with owner shares: {len(rooms_affected)}")
    print(f"Total owner shares deleted: {total_deleted}")
    
    if rooms_affected:
        print()
        print("Affected rooms:")
        for room_name in rooms_affected:
            print(f"  - {room_name}")
    
    print()
    print("✅ Cleanup complete!")
    print()
    
    return total_deleted

if __name__ == '__main__':
    try:
        deleted = cleanup_owner_shares()
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Error during cleanup: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
