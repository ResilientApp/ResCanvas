#!/usr/bin/env python3
"""
Test multi-user undo/redo sync by simulating two users
"""
import requests
import time
import json

BASE_URL = "http://localhost:10010"

# Register and login two users
def setup_users():
    users = []
    for i in [1, 2]:
        username = f"testuser{i}"
        user_data = {
            "username": username,
            "email": f"test{i}@example.com",
            "password": "testpass123"
        }
        
        # Register (may fail if already exists, that's OK)
        requests.post(f"{BASE_URL}/auth/register", json=user_data)
        
        # Login
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "username": username,
            "password": user_data["password"]
        })
        result = response.json()
        # Handle both "token" and "access_token" field names
        token = result.get("token") or result.get("access_token")
        if not token:
            print(f"Login failed for {username}: {result}")
            continue
        users.append({"username": username, "token": token})
        print(f"✓ User {i} logged in: {username}")
    
    return users

def create_room(token):
    """Create a new test room"""
    response = requests.post(
        f"{BASE_URL}/rooms",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Undo Test Room", "description": "Testing undo sync", "type": "public"}
    )
    result = response.json()
    room_id = result.get("room", {}).get("_id") or result.get("room", {}).get("id")
    if not room_id:
        print(f"Failed to create room: {result}")
        exit(1)
    print(f"✓ Created room: {room_id}\n")
    return room_id

def join_room(token, room_id, username):
    """Join a room by adding user to shares"""
    # For public rooms, we need to explicitly share with the user
    response = requests.post(
        f"{BASE_URL}/rooms/{room_id}/share",
        headers={"Authorization": f"Bearer {token}"},
        json={"usernames": [username], "role": "editor"}
    )
    return response.json()

def submit_stroke(token, room_id, stroke_id, username):
    """Submit a stroke"""
    stroke = {
        "drawingId": stroke_id,
        "color": "#000000",
        "lineWidth": 2,
        "pathData": [{"x": 100, "y": 100}, {"x": 200, "y": 200}],
        "timestamp": int(time.time() * 1000),
        "user": username
    }
    
    # Backend expects payload wrapped in {"stroke": ...}
    payload = {"stroke": stroke}
    
    response = requests.post(
        f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json=payload
    )
    
    if response.status_code != 200:
        print(f"  ERROR submitting stroke: {response.status_code} - {response.text[:200]}")
        return {"status": "error"}
    
    try:
        return response.json()
    except:
        return {"status": "ok"}

def get_strokes(token, room_id):
    """Get all strokes in the room"""
    response = requests.get(
        f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"}
    )
    result = response.json()
    if result["status"] == "ok":
        return result["strokes"]
    return []

def undo_stroke(token, room_id):
    """Undo last stroke"""
    response = requests.post(
        f"{BASE_URL}/rooms/{room_id}/undo",
        headers={"Authorization": f"Bearer {token}"},
        json={}
    )
    return response.json()

def get_undo_status(token, room_id):
    """Get undo/redo status"""
    response = requests.get(
        f"{BASE_URL}/rooms/{room_id}/undo_redo_status",
        headers={"Authorization": f"Bearer {token}"}
    )
    return response.json()

def main():
    print("="*70)
    print("MULTI-USER UNDO/REDO SYNC TEST")
    print("="*70 + "\n")
    
    # Setup
    users = setup_users()
    user1, user2 = users[0], users[1]
    room_id = create_room(user1["token"])
    
    # Add User 2 to the room
    print("Adding User 2 to room...")
    join_result = join_room(user1["token"], room_id, user2["username"])
    print(f"  Join result: {join_result.get('status', 'unknown')}\n")
    
    # User 1 draws 3 strokes
    print("Step 1: User 1 draws 3 strokes")
    stroke_ids = []
    for i in range(3):
        stroke_id = f"stroke_{i}_{int(time.time() * 1000)}"
        stroke_ids.append(stroke_id)
        submit_stroke(user1["token"], room_id, stroke_id, user1["username"])
        print(f"  - Submitted stroke {i+1}: {stroke_id}")
    
    time.sleep(1)
    
    # User 2 fetches strokes
    print("\nStep 2: User 2 fetches strokes")
    strokes = get_strokes(user2["token"], room_id)
    print(f"  User 2 sees {len(strokes)} strokes")
    for s in strokes:
        print(f"    - {s.get('drawingId', s.get('id', 'unknown'))}")
    
    # User 1 undoes one stroke
    print("\nStep 3: User 1 undoes one stroke")
    undo_result = undo_stroke(user1["token"], room_id)
    print(f"  Undo result: {undo_result}")
    
    # Check User 1's undo status
    status1 = get_undo_status(user1["token"], room_id)
    print(f"  User 1 undo status: undo_count={status1.get('undo_count')}, redo_count={status1.get('redo_count')}")
    
    # User 1 fetches strokes after undo
    print("\nStep 4: User 1 fetches strokes after undo")
    strokes1 = get_strokes(user1["token"], room_id)
    print(f"  User 1 sees {len(strokes1)} strokes")
    for s in strokes1:
        print(f"    - {s.get('drawingId', s.get('id', 'unknown'))}")
    
    time.sleep(1)
    
    # User 2 fetches strokes again
    print("\nStep 5: User 2 fetches strokes (should see the undo)")
    strokes2 = get_strokes(user2["token"], room_id)
    print(f"  User 2 sees {len(strokes2)} strokes")
    for s in strokes2:
        print(f"    - {s.get('drawingId', s.get('id', 'unknown'))}")
    
    # Check User 2's undo status
    status2 = get_undo_status(user2["token"], room_id)
    print(f"  User 2 undo status: undo_count={status2.get('undo_count')}, redo_count={status2.get('redo_count')}")
    
    print("\n" + "="*70)
    print("RESULTS:")
    print("="*70)
    print(f"Initial strokes: 3")
    print(f"User 1 after undo: {len(strokes1)} strokes")
    print(f"User 2 after User 1's undo: {len(strokes2)} strokes")
    
    if len(strokes1) == 2 and len(strokes2) == 2:
        print("\n✅ SUCCESS: Both users see 2 strokes (undo synced correctly)")
    elif len(strokes1) == 2 and len(strokes2) == 3:
        print("\n❌ FAILURE: User 2 still sees 3 strokes (undo NOT synced)")
        print("   This is the bug we need to fix!")
    else:
        print(f"\n⚠️  UNEXPECTED: User 1 sees {len(strokes1)}, User 2 sees {len(strokes2)}")

if __name__ == "__main__":
    main()
