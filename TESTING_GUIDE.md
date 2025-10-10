# Refactoring Testing Guide

## Overview
This guide provides step-by-step instructions to test the refactored codebase.

## Pre-Testing Checklist

### 1. Activate Refactored Frontend (Optional - for full test)
```bash
cd /home/ubuntu/resilient-apps/ResCanvas/frontend/src/components
cp Canvas.js Canvas.backup.js  # Backup original
cp Canvas.refactored.js Canvas.js  # Activate refactored version
```

### 2. Verify Backend Services
All new service files should be in place:
- `backend/services/room_auth_service.py`
- `backend/services/notification_service.py`
- `backend/services/room_service.py`
- `backend/services/mongo_parsers.py`
- `backend/services/canvas_data_service.py`
- `backend/routes/canvas_data.py`

### 3. Check Server Status
The backend should already be running in the `rescanvas_backend` screen session.
```bash
screen -r rescanvas_backend  # Should show python app.py running
# Press Ctrl+A then D to detach
```

## Test Cases

### Test 1: Authentication & Room Creation
**Objective:** Verify room_auth_service and room_service work correctly

1. **Login**
   - Navigate to login page
   - Enter valid credentials
   - Verify JWT token is stored
   - **Expected:** Successful login, redirected to dashboard

2. **Create Room**
   - Click "Create Room"
   - Enter room name, type (public/private/secure)
   - Submit
   - **Expected:** Room created, uses `create_room_record()` service
   - **Verify:** Check backend logs for service call

3. **List Rooms**
   - View dashboard room list
   - **Expected:** Rooms load using `get_user_rooms()` service
   - **Verify:** Pagination and sorting work

### Test 2: Canvas Data Fetching
**Objective:** Verify canvas_data_service and mongo_parsers work correctly

1. **Open Canvas**
   - Click on a room to open canvas
   - **Expected:** Canvas loads strokes from MongoDB
   - **Verify:** `/getCanvasData` endpoint uses new service layer

2. **Draw Strokes**
   - Draw freehand lines
   - Draw shapes (circle, rectangle, hexagon)
   - **Expected:** Strokes persist and render correctly

3. **History Recall**
   - Click history icon in toolbar
   - Select date/time range
   - Apply filter
   - **Expected:** Only strokes in range are shown
   - **Verify:** `get_strokes_from_mongo()` with time filters works

### Test 3: Frontend Hooks & Components
**Objective:** Verify refactored Canvas.js with hooks/components

1. **Canvas State Management**
   - Change colors, line width, draw modes
   - Switch between rooms
   - **Expected:** State persists per room (localStorage)
   - **Verify:** `useCanvasState` hook manages state correctly

2. **Pan & Zoom**
   - Middle-mouse-click and drag
   - **Expected:** Canvas pans smoothly
   - **Verify:** `useCanvasPan` hook throttles refreshes

3. **Dialogs**
   - Click "Clear Canvas" → confirm dialog appears
   - Click "History Recall" → date picker dialog appears
   - **Expected:** All dialogs render from CanvasDialogs.js

4. **Overlays**
   - View room header with name
   - Enter history mode → see "Editing Disabled" banner
   - Archive room → see "View Only" banner
   - **Expected:** All overlays render from CanvasOverlays.js

### Test 4: Undo/Redo System
**Objective:** Verify undo/redo with new services

1. **Draw and Undo**
   - Draw several strokes
   - Click undo multiple times
   - **Expected:** Strokes removed in reverse order

2. **Redo**
   - Click redo multiple times
   - **Expected:** Strokes restored

3. **Clear Canvas**
   - Click clear canvas
   - Verify undo/redo stacks cleared
   - **Expected:** Clean slate, undo/redo disabled

### Test 5: Real-Time Collaboration
**Objective:** Verify socket.io events work with refactored code

1. **Multi-User Test** (requires 2 browsers)
   - User A draws a stroke
   - **Expected:** User B sees stroke appear in real-time
   - **Verify:** `handleNewStroke` in Canvas.js processes events

2. **User Notifications**
   - User joins room
   - **Expected:** Snackbar shows "User X joined"
   - **Verify:** `showLocalSnack` from state hook works

### Test 6: Backwards Compatibility
**Objective:** Verify compatibility wrappers work

1. **Old get_canvas_data.py Endpoint**
   - Call `/getCanvasData` directly
   - **Expected:** Returns data (uses service layer internally)

2. **Old Helper Functions in rooms.py**
   - `_authed_user()` should call `authenticate_user()`
   - `_ensure_member()` should call `is_room_member()`
   - **Verify:** Check backend logs for compatibility wrapper usage

## Automated Testing

### Backend Unit Tests
```bash
cd /home/ubuntu/resilient-apps/ResCanvas/backend
python3 -m pytest tests/ -v
```

### Check for Import Errors
```bash
cd /home/ubuntu/resilient-apps/ResCanvas/backend
python3 -c "from services.room_service import *; from services.canvas_data_service import *; print('OK')"
```

### Frontend Build Test
```bash
cd /home/ubuntu/resilient-apps/ResCanvas/frontend
npm run build
# Should complete without errors
```

## Rollback Instructions

If tests fail, rollback to original files:

### Backend Rollback
```bash
cd /home/ubuntu/resilient-apps/ResCanvas/backend
git checkout routes/rooms.py routes/get_canvas_data.py app.py
```

### Frontend Rollback
```bash
cd /home/ubuntu/resilient-apps/ResCanvas/frontend/src/components
mv Canvas.js Canvas.refactored.js
mv Canvas.backup.js Canvas.js
```

## Success Criteria

✅ All authentication flows work
✅ Room CRUD operations work
✅ Canvas drawing and rendering work
✅ Undo/redo system works
✅ History recall works
✅ Real-time collaboration works
✅ Pan/zoom works
✅ No console errors
✅ Backend logs show service layer usage
✅ Backwards compatibility maintained

## Performance Metrics

Monitor these metrics before/after refactoring:

1. **Time to load canvas** (should be similar or faster)
2. **Time to fetch rooms list** (should use pagination efficiently)
3. **Memory usage** (should be similar or lower due to better modularity)
4. **Bundle size** (frontend build size)

## Troubleshooting

### Issue: Import errors in backend
**Solution:** Check Python path and ensure all service files are in `backend/services/`

### Issue: Frontend hooks not working
**Solution:** Verify all hook files are in `frontend/src/hooks/`

### Issue: Canvas doesn't render
**Solution:** Check browser console, verify `Canvas.refactored.js` syntax

### Issue: Socket.io events not firing
**Solution:** Verify socket connection, check backend logs

## Next Steps After Testing

1. If all tests pass, commit changes:
   ```bash
   git add .
   git commit -m "Refactor: Modularize Canvas.js, rooms.py, and get_canvas_data.py"
   ```

2. Add unit tests for new services
3. Update API documentation
4. Continue refactoring remaining large functions in rooms.py
