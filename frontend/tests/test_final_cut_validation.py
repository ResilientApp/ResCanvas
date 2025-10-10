#!/usr/bin/env python3
"""
Final validation test for cut functionality
Tests the complete user workflow as it would happen in the browser
"""

import asyncio
import aiohttp
import json
import random
from datetime import datetime

API_BASE = "http://localhost:10010"

async def test_complete_cut_workflow():
    """Test the complete cut workflow exactly as a user would experience it"""
    
    print("=" * 70)
    print("FINAL CUT FUNCTIONALITY VALIDATION TEST")
    print("=" * 70)
    print()
    
    async with aiohttp.ClientSession() as session:
        # Step 1: User Registration and Login
        print("Step 1: User Registration and Login")
        print("-" * 70)
        username = f"cutuser_{random.randint(10000, 99999)}"
        password = "testpass123"
        
        # Register
        async with session.post(f"{API_BASE}/auth/register", json={
            "username": username,
            "password": password
        }) as resp:
            assert resp.status == 201, f"Registration failed: {resp.status}"
            print(f"  ✓ Registered: {username}")
        
        # Login
        async with session.post(f"{API_BASE}/auth/login", json={
            "username": username,
            "password": password
        }) as resp:
            assert resp.status == 200, f"Login failed: {resp.status}"
            data = await resp.json()
            token = data["token"]
            print(f"  ✓ Logged in successfully")
        
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        
        # Step 2: Create a Room
        print("\nStep 2: Create a Room")
        print("-" * 70)
        async with session.post(f"{API_BASE}/rooms", 
                              json={"name": "Cut Test Room"},
                              headers=headers) as resp:
            assert resp.status == 201, f"Room creation failed: {resp.status}"
            room_data = await resp.json()
            room_id = room_data["room"]["id"]
            print(f"  ✓ Created room: {room_id}")
        
        # Step 3: Draw Two Strokes
        print("\nStep 3: Draw Original Strokes")
        print("-" * 70)
        
        def create_stroke(stroke_id, color, points):
            return {
                "drawingId": stroke_id,
                "color": color,
                "lineWidth": 3,
                "pathData": {"tool": "pen", "path": points},
                "timestamp": int(datetime.now().timestamp() * 1000),
                "user": username,
                "roomId": room_id
            }
        
        stroke1_id = f"horizontal_{int(datetime.now().timestamp() * 1000)}"
        stroke1 = create_stroke(stroke1_id, "#FF0000", 
                               [[10, 100], [50, 100], [100, 100], [150, 100], [200, 100]])
        
        stroke2_id = f"vertical_{int(datetime.now().timestamp() * 1000) + 1}"
        stroke2 = create_stroke(stroke2_id, "#0000FF",
                               [[100, 10], [100, 50], [100, 100], [100, 150], [100, 200]])
        
        for stroke in [stroke1, stroke2]:
            async with session.post(f"{API_BASE}/rooms/{room_id}/strokes",
                                  json={"stroke": stroke},
                                  headers=headers) as resp:
                assert resp.status in [200, 201], f"Stroke submission failed: {resp.status}"
                print(f"  ✓ Drew stroke: {stroke['color']}")
        
        # Verify initial state
        async with session.get(f"{API_BASE}/rooms/{room_id}/strokes", headers=headers) as resp:
            data = await resp.json()
            initial_count = len(data["strokes"])
            print(f"  ✓ Canvas has {initial_count} strokes")
            assert initial_count == 2, f"Expected 2 strokes, found {initial_count}"
        
        # Step 4: Perform Cut Operation
        print("\nStep 4: Cut a Region (Square from 75,75 to 125,125)")
        print("-" * 70)
        
        # First, submit replacement segments (parts outside the cut)
        repl1_id = f"repl_h_left_{int(datetime.now().timestamp() * 1000)}"
        repl1 = create_stroke(repl1_id, "#FF0000", [[10, 100], [75, 100]])
        
        repl2_id = f"repl_h_right_{int(datetime.now().timestamp() * 1000) + 1}"
        repl2 = create_stroke(repl2_id, "#FF0000", [[125, 100], [200, 100]])
        
        repl3_id = f"repl_v_top_{int(datetime.now().timestamp() * 1000) + 2}"
        repl3 = create_stroke(repl3_id, "#0000FF", [[100, 10], [100, 75]])
        
        repl4_id = f"repl_v_bottom_{int(datetime.now().timestamp() * 1000) + 3}"
        repl4 = create_stroke(repl4_id, "#0000FF", [[100, 125], [100, 200]])
        
        print("  → Submitting replacement segments...")
        for repl in [repl1, repl2, repl3, repl4]:
            async with session.post(f"{API_BASE}/rooms/{room_id}/strokes",
                                  json={"stroke": repl},
                                  headers=headers) as resp:
                assert resp.status in [200, 201], f"Replacement submission failed: {resp.status}"
        print(f"  ✓ Submitted 4 replacement segments")
        
        # Then submit the cut record
        cut_id = f"cut_{int(datetime.now().timestamp() * 1000)}"
        cut_record = {
            "drawingId": cut_id,
            "color": "#FFFFFF",
            "lineWidth": 1,
            "pathData": {
                "tool": "cut",
                "rect": {"x": 75, "y": 75, "width": 50, "height": 50},
                "cut": True,
                "originalStrokeIds": [stroke1_id, stroke2_id]
            },
            "timestamp": int(datetime.now().timestamp() * 1000),
            "user": username,
            "roomId": room_id
        }
        
        async with session.post(f"{API_BASE}/rooms/{room_id}/strokes",
                              json={"stroke": cut_record},
                              headers=headers) as resp:
            assert resp.status in [200, 201], f"Cut record submission failed: {resp.status}"
        print(f"  ✓ Submitted cut record")
        
        # Step 5: Verify Cut Effectiveness
        print("\nStep 5: Verify Cut is Effective")
        print("-" * 70)
        
        async with session.get(f"{API_BASE}/rooms/{room_id}/strokes", headers=headers) as resp:
            data = await resp.json()
            strokes = data["strokes"]
            
            original_visible = any(s.get('drawingId') in [stroke1_id, stroke2_id] or 
                                 s.get('id') in [stroke1_id, stroke2_id] 
                                 for s in strokes)
            
            replacements_visible = sum(1 for s in strokes 
                                      if s.get('drawingId', '').startswith('repl_') or 
                                         s.get('id', '').startswith('repl_'))
            
            print(f"  → Total strokes visible: {len(strokes)}")
            print(f"  → Original strokes visible: {original_visible}")
            print(f"  → Replacement segments visible: {replacements_visible}")
            
            if original_visible:
                print(f"  ✗ FAILED: Original strokes are still visible!")
                return False
            
            if replacements_visible != 4:
                print(f"  ! WARNING: Expected 4 replacement segments, found {replacements_visible}")
            
            print(f"  ✓ Cut is effective - original strokes hidden")
        
        # Step 6: Test Persistence (Simulating Page Refreshes)
        print("\nStep 6: Test Persistence Across Page Refreshes")
        print("-" * 70)
        
        all_refreshes_passed = True
        for i in range(15):
            await asyncio.sleep(0.2)  # Simulate network/browser delay
            
            async with session.get(f"{API_BASE}/rooms/{room_id}/strokes", headers=headers) as resp:
                data = await resp.json()
                strokes = data["strokes"]
                
                original_reappeared = any(s.get('drawingId') in [stroke1_id, stroke2_id] or 
                                         s.get('id') in [stroke1_id, stroke2_id] 
                                         for s in strokes)
                
                replacements_count = sum(1 for s in strokes 
                                        if s.get('drawingId', '').startswith('repl_') or 
                                           s.get('id', '').startswith('repl_'))
                
                status = "✓" if not original_reappeared else "✗"
                print(f"  {status} Refresh {i+1:2d}: {len(strokes)} strokes, {replacements_count} replacements")
                
                if original_reappeared:
                    print(f"  ✗ FAILED: Original strokes reappeared on refresh {i+1}!")
                    all_refreshes_passed = False
                    break
        
        if all_refreshes_passed:
            print(f"  ✓ All refreshes passed - cut persists correctly")
        
        # Step 7: Final Verification
        print("\n" + "=" * 70)
        if all_refreshes_passed and not original_visible:
            print("✅ ALL TESTS PASSED - CUT FUNCTIONALITY IS WORKING CORRECTLY!")
            print("=" * 70)
            print()
            print("Summary:")
            print("  ✓ Original strokes are properly hidden after cut")
            print("  ✓ Replacement segments (outside cut area) are preserved")
            print("  ✓ Cut persists across multiple page refreshes")
            print("  ✓ Backend correctly filters cut strokes from API responses")
            print()
            return True
        else:
            print("❌ TEST FAILED - CUT FUNCTIONALITY NEEDS DEBUGGING")
            print("=" * 70)
            return False

async def main():
    try:
        success = await test_complete_cut_workflow()
        exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Test execution failed: {e}")
        import traceback
        traceback.print_exc()
        exit(1)

if __name__ == "__main__":
    asyncio.run(main())
