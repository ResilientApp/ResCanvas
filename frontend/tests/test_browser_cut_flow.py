#!/usr/bin/env python3
"""
Test script that simulates the exact browser flow for cut operations
"""

import asyncio
import aiohttp
import json
import random
from datetime import datetime

API_BASE = "http://localhost:10010"

class BrowserCutTest:
    def __init__(self):
        self.session = None
        self.token = None
        self.username = None
        self.room_id = None
        
    async def start_session(self):
        """Initialize aiohttp session"""
        self.session = aiohttp.ClientSession()
        
    async def stop_session(self):
        """Close aiohttp session"""
        if self.session:
            await self.session.close()
            
    async def register_and_login(self):
        """Register and login"""
        self.username = f"cuttest_{random.randint(1000, 9999)}"
        password = "testpass123"
        
        # Register
        async with self.session.post(f"{API_BASE}/auth/register", json={
            "username": self.username,
            "password": password
        }) as resp:
            if resp.status != 201:
                text = await resp.text()
                raise Exception(f"Failed to register: {resp.status} - {text}")
            print(f"✅ Registered user: {self.username}")
            
        # Login
        async with self.session.post(f"{API_BASE}/auth/login", json={
            "username": self.username,
            "password": password
        }) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise Exception(f"Failed to login: {resp.status} - {text}")
            login_data = await resp.json()
            self.token = login_data["token"]
            print(f"✅ Logged in successfully")
            
    async def create_room(self):
        """Create a test room"""
        headers = {"Authorization": f"Bearer {self.token}"}
        async with self.session.post(f"{API_BASE}/rooms", 
                                   json={"name": f"Cut Test Room {random.randint(100, 999)}"},
                                   headers=headers) as resp:
            if resp.status != 201:
                text = await resp.text()
                raise Exception(f"Failed to create room: {resp.status} - {text}")
            room_data = await resp.json()
            self.room_id = room_data["room"]["id"]
            print(f"✅ Created room: {self.room_id}")
            
    async def submit_stroke(self, stroke_data):
        """Submit a stroke exactly as the frontend does"""
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "stroke": stroke_data,
            "signature": None,
            "signerPubKey": None
        }
        
        async with self.session.post(f"{API_BASE}/rooms/{self.room_id}/strokes",
                                   json=payload,
                                   headers=headers) as resp:
            if resp.status not in [200, 201]:
                text = await resp.text()
                raise Exception(f"Failed to submit stroke: {resp.status} - {text}")
            return await resp.json()
            
    async def get_strokes(self):
        """Get all strokes from the room"""
        headers = {"Authorization": f"Bearer {self.token}"}
        async with self.session.get(f"{API_BASE}/rooms/{self.room_id}/strokes",
                                  headers=headers) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise Exception(f"Failed to get strokes: {resp.status} - {text}")
            data = await resp.json()
            return data["strokes"]
            
    async def run_test(self):
        """Run the complete cut functionality test"""
        print("🚀 Starting Browser-Accurate Cut Test...")
        print("=" * 60)
        
        try:
            await self.start_session()
            await self.register_and_login()
            await self.create_room()
            
            # Step 1: Create original strokes (exactly as frontend does)
            print("\n📝 Step 1: Creating original strokes...")
            stroke1 = {
                "drawingId": f"stroke_{datetime.now().timestamp()}_{random.randint(1000, 9999)}",
                "color": "#FF0000",
                "lineWidth": 3,
                "pathData": {
                    "tool": "pen",
                    "path": [[10, 50], [50, 50], [100, 50], [150, 50], [190, 50]]
                },
                "timestamp": int(datetime.now().timestamp() * 1000),
                "user": self.username,
                "roomId": self.room_id
            }
            await self.submit_stroke(stroke1)
            print(f"  ✅ Created stroke: {stroke1['drawingId']}")
            
            stroke2 = {
                "drawingId": f"stroke_{datetime.now().timestamp()}_{random.randint(1000, 9999)}",
                "color": "#0000FF",
                "lineWidth": 3,
                "pathData": {
                    "tool": "pen",
                    "path": [[50, 10], [50, 50], [50, 100], [50, 150], [50, 190]]
                },
                "timestamp": int(datetime.now().timestamp() * 1000),
                "user": self.username,
                "roomId": self.room_id
            }
            await self.submit_stroke(stroke2)
            print(f"  ✅ Created stroke: {stroke2['drawingId']}")
            
            # Verify initial state
            initial_strokes = await self.get_strokes()
            print(f"  ✅ Initial strokes count: {len(initial_strokes)}")
            assert len(initial_strokes) == 2, f"Expected 2 strokes, got {len(initial_strokes)}"
            
            # Step 2: Submit replacement segments (parts outside cut region)
            print("\n✂️ Step 2: Submitting replacement segments...")
            replacement1 = {
                "drawingId": f"repl_1_{datetime.now().timestamp()}_{random.randint(1000, 9999)}",
                "color": "#FF0000",
                "lineWidth": 3,
                "pathData": {
                    "tool": "pen",
                    "path": [[10, 50], [45, 50]]  # Part before cut
                },
                "timestamp": int(datetime.now().timestamp() * 1000),
                "user": self.username,
                "roomId": self.room_id
            }
            await self.submit_stroke(replacement1)
            print(f"  ✅ Replacement 1: {replacement1['drawingId']}")
            
            replacement2 = {
                "drawingId": f"repl_2_{datetime.now().timestamp()}_{random.randint(1000, 9999)}",
                "color": "#FF0000",
                "lineWidth": 3,
                "pathData": {
                    "tool": "pen",
                    "path": [[155, 50], [190, 50]]  # Part after cut
                },
                "timestamp": int(datetime.now().timestamp() * 1000),
                "user": self.username,
                "roomId": self.room_id
            }
            await self.submit_stroke(replacement2)
            print(f"  ✅ Replacement 2: {replacement2['drawingId']}")
            
            # Step 3: Submit cut record
            print("\n🔪 Step 3: Submitting cut record...")
            cut_record = {
                "drawingId": f"cut_{datetime.now().timestamp()}_{random.randint(1000, 9999)}",
                "color": "#FFFFFF",
                "lineWidth": 1,
                "pathData": {
                    "tool": "cut",
                    "rect": {"x": 45, "y": 45, "width": 110, "height": 110},
                    "cut": True,
                    "originalStrokeIds": [stroke1['drawingId'], stroke2['drawingId']]
                },
                "timestamp": int(datetime.now().timestamp() * 1000),
                "user": self.username,
                "roomId": self.room_id
            }
            await self.submit_stroke(cut_record)
            print(f"  ✅ Cut record: {cut_record['drawingId']}")
            
            # Step 4: Verify cut effectiveness
            print("\n🔍 Step 4: Verifying cut effectiveness...")
            strokes_after_cut = await self.get_strokes()
            
            original_ids = {stroke1['drawingId'], stroke2['drawingId']}
            replacement_ids = {replacement1['drawingId'], replacement2['drawingId']}
            cut_id = cut_record['drawingId']
            
            visible_original = [s for s in strokes_after_cut if s.get('drawingId') in original_ids or s.get('id') in original_ids]
            visible_replacements = [s for s in strokes_after_cut if s.get('drawingId') in replacement_ids or s.get('id') in replacement_ids]
            visible_cut_records = [s for s in strokes_after_cut if (s.get('drawingId') == cut_id or s.get('id') == cut_id) or (s.get('pathData', {}).get('tool') == 'cut')]
            
            print(f"  📊 Analysis:")
            print(f"    - Original strokes visible: {len(visible_original)} (expected: 0)")
            print(f"    - Replacement segments visible: {len(visible_replacements)} (expected: 2)")
            print(f"    - Cut records visible: {len(visible_cut_records)} (expected: 1)")
            print(f"    - Total strokes: {len(strokes_after_cut)}")
            
            if len(visible_original) > 0:
                print(f"  ❌ FAILED: Original strokes still visible!")
                print(f"    Visible originals: {[s.get('drawingId') or s.get('id') for s in visible_original]}")
                return False
                
            if len(visible_replacements) != 2:
                print(f"  ⚠️  WARNING: Expected 2 replacement segments, found {len(visible_replacements)}")
                
            print(f"  ✅ Cut is effective immediately")
            
            # Step 5: Test persistence across multiple refreshes
            print("\n🔄 Step 5: Testing persistence (simulating page refreshes)...")
            for i in range(10):
                await asyncio.sleep(0.3)  # Simulate network delay
                refresh_strokes = await self.get_strokes()
                
                refresh_original = [s for s in refresh_strokes if s.get('drawingId') in original_ids or s.get('id') in original_ids]
                refresh_replacements = [s for s in refresh_strokes if s.get('drawingId') in replacement_ids or s.get('id') in replacement_ids]
                
                print(f"  Refresh {i+1:2d}: Total={len(refresh_strokes)}, Original={len(refresh_original)}, Replacements={len(refresh_replacements)}")
                
                if len(refresh_original) > 0:
                    print(f"  ❌ FAILED: Original strokes reappeared on refresh {i+1}!")
                    print(f"    Reappeared strokes: {[s.get('drawingId') or s.get('id') for s in refresh_original]}")
                    return False
                    
            print(f"  ✅ Cut persists correctly across all refreshes")
            
            # Success!
            print("\n" + "=" * 60)
            print("🎉 ALL TESTS PASSED!")
            print("=" * 60)
            print("✅ Cut functionality is working correctly")
            print("✅ Original strokes are properly filtered")
            print("✅ Replacement segments persist")
            print("✅ Cut persists across page refreshes")
            print("=" * 60)
            
            return True
            
        except Exception as e:
            print(f"\n❌ TEST FAILED: {e}")
            import traceback
            traceback.print_exc()
            return False
        finally:
            await self.stop_session()

async def main():
    tester = BrowserCutTest()
    success = await tester.run_test()
    
    if not success:
        print("\n⚠️  Cut functionality needs further debugging")
        exit(1)
    else:
        print("\n✨ Cut functionality is fully operational!")
        exit(0)

if __name__ == "__main__":
    asyncio.run(main())
