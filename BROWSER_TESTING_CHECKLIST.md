# Browser Testing Checklist

## Pre-Testing Setup

### 1. Ensure Services Are Running
```bash
# Check screen sessions
screen -ls

# Should see:
# - rescanvas_backend (python app.py on port 10010)
# - rescanvas_frontend (npm start on port 3000)
# - rescanvas_python_cache (example.py sync service)
```

### 2. Clear Browser Cache (Optional)
- Press Ctrl+Shift+Delete
- Clear cache and cookies
- Reload page

---

## Test Checklist

### ✅ Issue #1: Cut Outlines
**Test Steps:**
1. Login to ResCanvas → Create/Join a room
2. Draw a circle or rectangle (use Shape tool)
3. Select "Select" mode from toolbar
4. Draw selection box around the shape
5. Click "Cut" button
6. Click "Undo" button
7. **Expected:** No blue outline should remain on canvas
8. Refresh page
9. **Expected:** Canvas should be clean, no artifacts

**Status:** [ ] Pass [ ] Fail
**Notes:**

---

### ✅ Issue #2: Undo/Redo During Operations  
**Test Steps:**
1. Open ResCanvas in two browser windows (or different browsers)
2. Window 1: Login as User A → Create a room
3. Window 2: Login as User B → Join same room (via Share)
4. Window 1: Draw 3 strokes
5. Window 2: Should see all 3 strokes appear in real-time
6. Window 1: Click "Undo" button once
7. Window 2: **Wait 2-3 seconds** (Socket.IO event + auto-refresh)
8. **Expected:** Window 2 should show only 2 strokes WITHOUT clicking Refresh
9. Window 1: Click "Redo" button
10. **Expected:** Window 2 should show 3 strokes again automatically

**Status:** [ ] Pass [ ] Fail
**Notes:**

---

### ✅ Issue #3: Single Refresh
**Test Steps:**
1. Login → Join a room
2. Draw 5 strokes
3. Click "Undo" button 2 times
4. Click "Refresh" button ONCE
5. **Expected:** Should see 3 strokes (not 5, not needing second refresh)
6. Check browser console
7. **Expected:** No error messages

**Status:** [ ] Pass [ ] Fail
**Notes:**

---

### ✅ Issue #7: Toolbar setState Warning
**Test Steps:**
1. Login → Join a room
2. Open Browser DevTools (F12)
3. Go to Console tab
4. Draw a stroke and click "Cut"
5. Click "Paste" button
6. **Expected:** No warning messages about "Cannot update during render"
7. Check console for any React warnings
8. **Expected:** Console should be clean

**Status:** [ ] Pass [ ] Fail
**Notes:**

---

### ✅ Issue #8: Socket.IO Connection
**Test Steps:**
1. Login → Join a room
2. Open Browser DevTools (F12) → Console tab
3. Look for Socket.IO connection messages
4. **Expected:** Should see "WS connected" or similar
5. Open Network tab → Filter by "WS" or "WebSocket"
6. **Expected:** Should see active WebSocket connection to localhost:10010
7. Draw a stroke
8. **Expected:** Socket should send "stroke" event
9. Check for any Socket.IO error messages
10. **Expected:** No "401 Unauthorized" or connection errors

**Status:** [ ] Pass [ ] Fail
**Notes:**

---

### ✅ Issue #4a: Member Count
**Test Steps:**
1. Login → Go to Dashboard
2. Create a new room
3. Click "Share" button
4. Add 2 usernames (comma-separated)
5. Click "Share"
6. Refresh page
7. **Expected:** Room should show "3 members" (owner + 2 shared)
8. **NOT:** Should NOT show "? members"

**Status:** [ ] Pass [ ] Fail
**Notes:**

---

### ✅ Issue #4b: Invitation Notifications
**Test Steps:**
1. User A: Login → Create a room → Share with User B
2. User B: Login → Go to Dashboard
3. **Expected:** Should see invitation notification with full text
4. **Expected:** "Accept" and "Decline" buttons should be fully visible
5. Try with very long room name (50+ characters)
6. **Expected:** Text should wrap properly, not be cut off
7. Create 10+ invitations
8. **Expected:** Notification section should scroll

**Status:** [ ] Pass [ ] Fail
**Notes:**

---

### ✅ Issue #4c: Dashboard Scrolling
**Test Steps:**
1. Login → Go to Dashboard
2. Create 20 rooms (or use existing test data)
3. **Expected:** Dashboard should scroll vertically
4. **Expected:** Each room section should scroll if needed
5. Resize browser window to small size
6. **Expected:** Room cards should wrap and remain readable
7. Check on mobile viewport (DevTools → Toggle Device Toolbar)
8. **Expected:** Should work on small screens

**Status:** [ ] Pass [ ] Fail
**Notes:**

---

### ✅ Issue #5: Canvas UI Theme
**Test Steps:**
1. Open legacy canvas: `http://localhost:3000/legacy`
2. Note the header background, logo position, avatar style
3. Open JWT canvas: Login → Join a room
4. **Expected:** Header should look identical to legacy
5. Compare: Background image, logo size, avatar, button style
6. **Expected:** All styling should match

**Reference Images:**
- Legacy: Header with toolbar-bg.jpeg background
- JWT: Should have same background and layout

**Status:** [ ] Pass [ ] Fail
**Notes:**

---

### ✅ Issue #6: /rooms Route
**Test Steps:**
1. Login successfully
2. Navigate to: `http://localhost:3000/rooms`
3. **Expected:** Should see Dashboard with room list (NOT blank page)
4. Should be identical to `http://localhost:3000/dashboard`
5. Check breadcrumb navigation
6. **Expected:** Should show "Home > Rooms"

**Status:** [ ] Pass [ ] Fail
**Notes:**

---

### ✅ Issue #9: Drawing History
**Test Steps:**
1. Login as User A → Create a room
2. Draw 5 strokes
3. Login as User B in another window → Join same room
4. Draw 5 more strokes
5. Look for "Drawing History" sidebar on the right
6. **Expected:** Sidebar should be visible (or show on hover)
7. Click to expand time periods
8. **Expected:** Should see User A and User B listed
9. Click on User A's name
10. **Expected:** User A's strokes should be highlighted, User B's dimmed
11. Click again to deselect
12. **Expected:** All strokes visible normally

**Status:** [ ] Pass [ ] Fail
**Notes:**

---

## Multi-User Collaboration Test

### Complete Workflow Test
**Test Steps:**
1. **Setup:** Open 3 browser windows (Chrome, Firefox, Edge)
   - Window 1: User A (owner)
   - Window 2: User B (editor)
   - Window 3: User C (editor)

2. **User A:** Create room → Share with B and C
3. **User B & C:** Accept invitation → Join room

4. **Drawing Phase:**
   - User A: Draw a red circle
   - User B: Should see red circle appear immediately
   - User C: Should see red circle appear immediately
   - User B: Draw a blue line
   - User A & C: Should see blue line immediately
   - User C: Draw a green rectangle
   - User A & B: Should see green rectangle immediately

5. **Undo Phase:**
   - User A: Click Undo (removes User A's red circle)
   - User B & C: Should see red circle disappear automatically (wait 2-3 sec)
   - All windows: Should now show only blue line + green rectangle

6. **Redo Phase:**
   - User A: Click Redo
   - User B & C: Should see red circle reappear automatically

7. **Cut/Paste Phase:**
   - User B: Select mode → Select green rectangle → Cut
   - User A & C: Should see green rectangle disappear
   - User B: Click Paste → Place rectangle in new location
   - User A & C: Should see rectangle in new location

8. **Refresh Phase:**
   - All users: Click Refresh button
   - **Expected:** All users see identical canvas state
   - No strokes missing, no duplicates, perfect sync

**Status:** [ ] Pass [ ] Fail
**Notes:**

---

## Performance Test

### Test Steps:
1. Draw 100+ strokes rapidly
2. Click Undo 50 times rapidly
3. Click Redo 50 times rapidly
4. **Expected:** No lag, no race conditions
5. Click Refresh
6. **Expected:** Single refresh shows correct state
7. Check browser memory usage
8. **Expected:** No memory leaks

**Status:** [ ] Pass [ ] Fail
**Notes:**

---

## Browser Compatibility Test

### Test in Multiple Browsers:
- [ ] Chrome/Chromium
- [ ] Firefox
- [ ] Safari (if available)
- [ ] Edge

### For Each Browser:
1. Run all tests above
2. Check for browser-specific issues
3. Verify Canvas rendering works correctly
4. Verify Socket.IO connection works
5. Check for console errors

**Notes:**

---

## Mobile Responsiveness Test

### Test Steps:
1. Open DevTools → Toggle Device Toolbar (Ctrl+Shift+M)
2. Test on: iPhone SE, iPad, Galaxy S20
3. **Expected:** Dashboard should be scrollable and readable
4. **Expected:** Canvas should work (with touch)
5. **Expected:** Buttons should be clickable
6. **Expected:** No horizontal scrolling needed

**Status:** [ ] Pass [ ] Fail
**Notes:**

---

## Final Verification

### All Tests Passing?
- [ ] Issue #1: Cut outlines ✅
- [ ] Issue #2: Undo/redo during operations ✅
- [ ] Issue #3: Single refresh ✅
- [ ] Issue #7: Toolbar setState warning ✅
- [ ] Issue #8: Socket.IO connection ✅
- [ ] Issue #4a: Member count ✅
- [ ] Issue #4b: Invitation notifications ✅
- [ ] Issue #4c: Dashboard scrolling ✅
- [ ] Issue #5: Canvas UI theme ✅
- [ ] Issue #6: /rooms route ✅
- [ ] Issue #9: Drawing history ✅
- [ ] Multi-user collaboration ✅
- [ ] Performance ✅
- [ ] Browser compatibility ✅
- [ ] Mobile responsiveness ✅

### Overall Status: [ ] READY FOR PRODUCTION

---

## Troubleshooting

### If Socket.IO Not Connecting:
```bash
# Check backend is running
curl http://localhost:10010/health

# Check Socket.IO endpoint
curl http://localhost:10010/socket.io/

# Restart backend if needed
screen -r rescanvas_backend
# Press Ctrl+C, then: python3 app.py
```

### If Frontend Not Loading:
```bash
# Check frontend is running
curl http://localhost:3000

# Restart frontend if needed
screen -r rescanvas_frontend
# Press Ctrl+C, then: npm start
```

### If Multi-User Sync Not Working:
1. Check backend logs for errors
2. Verify both users in same room (check room ID)
3. Check browser console for Socket.IO errors
4. Verify auth tokens are valid

---

## Success Criteria

✅ **All tests pass**
✅ **No console errors or warnings**
✅ **Multi-user sync works perfectly**
✅ **UI is responsive and polished**
✅ **Performance is smooth (100+ strokes)**
✅ **Works in all major browsers**

**Final Status:** Ready for Production! 🎉
