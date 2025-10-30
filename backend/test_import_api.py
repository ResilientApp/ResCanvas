#!/usr/bin/env python3
"""
Test import functionality by:
1. Logging in to get JWT token
2. Reading the export file
3. POSTing import to target room
4. Verifying response
5. Checking if strokes appear in GET /api/rooms/{id}/strokes
"""

import sys
import json
import requests

API_BASE = "http://127.0.0.1:10010"

def main():
    # Register first
    print("[0/5] Registering test user...")
    register_resp = requests.post(f"{API_BASE}/auth/register", json={
        "username": "test_import_user",
        "password": "test123456",
        "email": "test_import@example.com"
    })
    if register_resp.status_code not in [200, 201]:
        # User might already exist, try login
        print(f"Register returned {register_resp.status_code}, will try login...")
    
    # Login to get token
    print("[1/5] Logging in...")
    login_resp = requests.post(f"{API_BASE}/auth/login", json={
        "username": "test_import_user", 
        "password": "test123456"
    })
    if login_resp.status_code != 200:
        print(f"Login failed: {login_resp.status_code} {login_resp.text}")
        return 1
    
    login_data = login_resp.json()
    print(f"Login response: {json.dumps(login_data, indent=2)}")
    token = login_data.get("access_token") or login_data.get("token")
    if not token:
        print(f"No token in response!")
        return 1
    
    headers = {"Authorization": f"Bearer {token}"}
    print(f"✓ Logged in successfully, token length: {len(token)}")
    
    # Read export file
    print("\n[2/5] Reading export file...")
    export_file_path = "/home/ubuntu/resilient-apps/ResCanvas/public 3232_export_1761789425591.json"
    try:
        with open(export_file_path, 'r') as f:
            export_data = json.load(f)
        print(f"✓ Export file loaded: {export_data.get('strokeCount')} strokes")
        print(f"  - Room ID: {export_data.get('roomId')}")
        print(f"  - Room Name: {export_data.get('roomName')}")
        print(f"  - Strokes count: {len(export_data.get('strokes', []))}")
    except Exception as e:
        print(f"Error reading export file: {e}")
        return 1
    
    # Target room for import
    target_room_id = "68d646de87f8dce24f47b70a"
    
    # Test 1: Import with clearExisting=False (merge)
    print(f"\n[3/5] Testing import (merge) into room {target_room_id}...")
    import_payload = {
        "strokes": export_data["strokes"],
        "clearExisting": False
    }
    
    import_resp = requests.post(
        f"{API_BASE}/api/rooms/{target_room_id}/import",
        headers=headers,
        json=import_payload
    )
    
    print(f"Response status: {import_resp.status_code}")
    print(f"Response body: {import_resp.text[:500]}")
    
    if import_resp.status_code == 200:
        result = import_resp.json()
        print(f"✓ Import successful!")
        print(f"  - Imported: {result.get('imported')}")
        print(f"  - Failed: {result.get('failed')}")
        print(f"  - Total: {result.get('total')}")
    else:
        print(f"✗ Import failed: {import_resp.status_code}")
        print(f"  Error: {import_resp.text}")
        return 1
    
    # Get strokes to verify they were imported
    print(f"\n[4/5] Fetching strokes from room {target_room_id}...")
    strokes_resp = requests.get(
        f"{API_BASE}/rooms/{target_room_id}/strokes",
        headers=headers
    )
    
    if strokes_resp.status_code == 200:
        strokes_data = strokes_resp.json()
        strokes = strokes_data.get("strokes", [])
        print(f"✓ Got {len(strokes)} strokes from room")
        
        # Check if imported strokes are present
        imported_ids = {s.get('id') or s.get('drawingId') for s in export_data['strokes']}
        fetched_ids = {s.get('id') or s.get('drawingId') for s in strokes}
        
        matching = imported_ids & fetched_ids
        print(f"  - Imported stroke IDs in export: {len(imported_ids)}")
        print(f"  - Total stroke IDs in room: {len(fetched_ids)}")
        print(f"  - Matching IDs: {len(matching)}")
        
        if matching:
            print(f"✓ Found {len(matching)} imported strokes in room!")
            print(f"  Sample IDs: {list(matching)[:3]}")
        else:
            print("✗ WARNING: No matching stroke IDs found!")
            print(f"  First imported ID: {list(imported_ids)[:3]}")
            print(f"  First fetched ID: {list(fetched_ids)[:3]}")
    else:
        print(f"✗ Failed to fetch strokes: {strokes_resp.status_code}")
        print(f"  Error: {strokes_resp.text}")
    
    # Test 2: Import with clearExisting=True (replace)
    print(f"\n[5/5] Testing import (replace) into room {target_room_id}...")
    import_payload_clear = {
        "strokes": export_data["strokes"],
        "clearExisting": True
    }
    
    import_resp_clear = requests.post(
        f"{API_BASE}/api/rooms/{target_room_id}/import",
        headers=headers,
        json=import_payload_clear
    )
    
    print(f"Response status: {import_resp_clear.status_code}")
    if import_resp_clear.status_code == 200:
        result = import_resp_clear.json()
        print(f"✓ Import with clear successful!")
        print(f"  - Imported: {result.get('imported')}")
        print(f"  - Failed: {result.get('failed')}")
    else:
        print(f"✗ Import with clear failed: {import_resp_clear.status_code}")
    
    # Final verification
    print("\n[VERIFICATION] Fetching strokes after replace...")
    strokes_resp_final = requests.get(
        f"{API_BASE}/rooms/{target_room_id}/strokes",
        headers=headers
    )
    
    if strokes_resp_final.status_code == 200:
        final_strokes = strokes_resp_final.json().get("strokes", [])
        print(f"✓ Final stroke count: {len(final_strokes)}")
        print(f"  Expected: {export_data['strokeCount']}")
        
        if len(final_strokes) == export_data['strokeCount']:
            print("✓ Stroke count matches export!")
        else:
            print(f"⚠ Stroke count mismatch: got {len(final_strokes)}, expected {export_data['strokeCount']}")
    
    print("\n✓ Import test complete!")
    return 0

if __name__ == "__main__":
    sys.exit(main())
