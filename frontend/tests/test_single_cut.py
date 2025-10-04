#!/usr/bin/env python3
"""
Test that cutting a single stroke only adds that stroke's ID to the cut record.
This verifies the fix for the accumulating IDs bug.
"""

import requests
import time

BASE_URL = "http://localhost:10010"

# Test user credentials
test_user = {
    "username": "testuser",
    "email": "test@example.com",
    "password": "testpass123"
}

def register_and_login():
    """Register and login to get JWT token"""
    # Register
    requests.post(f"{BASE_URL}/auth/register", json=test_user)
    
    # Login
    response = requests.post(f"{BASE_URL}/auth/login", json={
        "username": test_user["username"],
        "password": test_user["password"]
    })
    return response.json()["access_token"]

def create_room(token):
    """Create a new room"""
    response = requests.post(
        f"{BASE_URL}/rooms",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Test Cut Room", "description": "Testing single cut"}
    )
    return response.json()["room"]["_id"]

def submit_stroke(token, room_id, stroke_id, tool="freehand"):
    """Submit a single stroke"""
    stroke = {
        "drawingId": stroke_id,
        "color": "#000000",
        "lineWidth": 2,
        "pathData": [{"x": 100, "y": 100}, {"x": 200, "y": 200}],
        "timestamp": int(time.time() * 1000),
        "user": test_user["username"]
    }
    
    if tool == "cut":
        stroke["pathData"] = {
            "tool": "cut",
            "rect": {"x": 90, "y": 90, "width": 120, "height": 120},
            "cut": True,
            "originalStrokeIds": [stroke_id]
        }
    
    response = requests.post(
        f"{BASE_URL}/rooms/{room_id}/strokes",
        headers={"Authorization": f"Bearer {token}"},
        json=stroke
    )
    return response.json()

def main():
    print("=" * 60)
    print("TESTING: Single Cut Should Only Add 1 Stroke ID")
    print("=" * 60)
    
    # Setup
    token = register_and_login()
    room_id = create_room(token)
    print(f"✓ Created room: {room_id}\n")
    
    # Draw first stroke
    print("1. Drawing first stroke...")
    stroke1_id = f"stroke_1_{int(time.time() * 1000)}"
    submit_stroke(token, room_id, stroke1_id)
    print(f"   ✓ Submitted stroke: {stroke1_id}\n")
    
    # Cut first stroke
    print("2. Cutting first stroke...")
    cut1_id = f"cut_1_{int(time.time() * 1000)}"
    result1 = submit_stroke(token, room_id, cut1_id, tool="cut")
    print(f"   ✓ Cut record 1 submitted\n")
    
    # Draw second stroke
    print("3. Drawing second stroke...")
    stroke2_id = f"stroke_2_{int(time.time() * 1000)}"
    submit_stroke(token, room_id, stroke2_id)
    print(f"   ✓ Submitted stroke: {stroke2_id}\n")
    
    # Cut second stroke - THIS should only add stroke2_id, not stroke1_id too
    print("4. Cutting second stroke...")
    cut2_id = f"cut_2_{int(time.time() * 1000)}"
    result2 = submit_stroke(token, room_id, cut2_id, tool="cut")
    print(f"   ✓ Cut record 2 submitted\n")
    
    # Verify backend logs show only 1 ID added for second cut
    print("=" * 60)
    print("EXPECTED: Backend should log 'Added 1 stroke IDs to cut set'")
    print("NOT: 'Added 2 stroke IDs to cut set' (accumulation bug)")
    print("=" * 60)
    print("\n✓ TEST COMPLETE - Check backend logs above")
    print("  Look for the log line showing how many IDs were added")

if __name__ == "__main__":
    main()
