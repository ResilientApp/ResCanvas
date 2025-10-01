# Comprehensive Fix Plan for Remaining Issues

## Date: October 1, 2025

## Issues to Fix

### 1. Cut Outlines Appearing After Undo ✓ (Previously Fixed)
- **Status**: Should be fixed by replacement segment tracking
- **Verification Needed**: Test cut → undo → check for outlines

### 2. Undo/Redo Not Working During Drawing/Panning
- **Problem**: Undo/redo works on refresh but not during active drawing/panning
- **Root Cause**: Drawing operations may be clearing or interfering with undo stack
- **Fix**: Ensure undo/redo state is preserved during draw/pan operations

### 3. Need to Press Refresh Twice
- **Problem**: First refresh doesn't show undo/redo changes
- **Root Cause**: Likely a race condition or state not being cleared properly
- **Fix**: Ensure refreshCanvas clears old state before fetching new data

### 4. Dashboard UI/UX Issues
#### 4a. "members: ?" showing instead of actual count
- **Fix**: Calculate and display actual member count for each room
#### 4b. Invitation notification should show accept/decline dialog
- **Fix**: Create modal dialog for invitation handling
#### 4c. Notification messages cut off
- **Fix**: Add proper scrolling and text wrapping
#### 4d. Page not scrollable, rooms cut off
- **Fix**: Add scrollable container for room list

### 5. Canvas UI Integration Issues
#### 5a. New top bar not integrated with legacy UI
- **Fix**: Merge JWT auth UI into legacy toolbar style
#### 5b. Bottom bar missing
- **Fix**: Restore bottom status bar from legacy UI
- **Reference**: Study ResCanvas-main UI carefully

### 6. Routes Issue - /rooms Returns Blank Page
- **Problem**: "No routes matched location /rooms"
- **Fix**: Add proper route configuration for /rooms path

### 7. Toolbar setState Warning
- **Problem**: "Cannot update a component (Canvas) while rendering a different component (Toolbar)"
- **Root Cause**: Toolbar calling setState directly during render
- **Fix**: Use useEffect or callback pattern to defer state updates

### 8. Socket.IO Connection Issues
- **Problem**: "can't establish a connection to the server at ws://localhost:10010/socket.io/"
- **Fix**: Verify Socket.IO server configuration and CORS settings

### 9. Drawing History Compatibility
- **Problem**: History recall not working with new login-based canvas
- **Fix**: Integrate history functionality with JWT room-based architecture

## Implementation Order (Priority)

1. **Critical Functionality Fixes** (Blocks usage)
   - Fix undo/redo during drawing/panning (#2)
   - Fix double refresh issue (#3)
   - Fix Socket.IO connection (#8)

2. **UI Integration** (User experience)
   - Integrate toolbar setState properly (#7)
   - Merge UI with legacy style (#5)
   - Fix routes (#6)

3. **Dashboard Improvements** (Polish)
   - Fix member count display (#4a)
   - Add invitation dialog (#4b)
   - Fix scrolling and layout (#4c, #4d)

4. **Feature Integration** (Extended functionality)
   - Drawing history compatibility (#9)
   - Verify cut outlines fix (#1)

## Testing Strategy

### Test Cases for Each Fix

#### Undo/Redo During Drawing
- [ ] Draw 3 strokes
- [ ] Undo 1 stroke (should work without refresh)
- [ ] Draw another stroke
- [ ] Undo (should undo the new stroke)
- [ ] Pan the canvas
- [ ] Undo (should still work)

#### Double Refresh Issue
- [ ] User A draws and undoes
- [ ] User B presses refresh once
- [ ] Verify User B sees correct state immediately

#### Cut Outlines
- [ ] Draw a rectangle
- [ ] Cut it in the middle
- [ ] Undo the cut
- [ ] Verify no white outlines appear
- [ ] Refresh page
- [ ] Verify still no outlines

#### Socket.IO
- [ ] Open two browser windows
- [ ] User A draws
- [ ] Verify User B sees it in real-time (no refresh needed)

#### Dashboard
- [ ] Create room with 2 members
- [ ] Verify "members: 2" shows
- [ ] Send invitation
- [ ] Verify notification shows accept/decline dialog
- [ ] Create 20 rooms
- [ ] Verify page scrolls

#### UI Integration
- [ ] Compare toolbar with ResCanvas-main
- [ ] Verify similar styling and layout
- [ ] Verify bottom status bar present

#### History Recall
- [ ] Draw strokes with timestamps
- [ ] Use history slider/controls
- [ ] Verify correct strokes show for time range
- [ ] Verify works across page refresh

## Files to Modify

### Priority 1 - Critical Fixes
1. `frontend/src/canvasBackendJWT.js` - Fix refresh logic
2. `frontend/src/Canvas.js` - Fix undo/redo during operations
3. `backend/app.py` - Fix Socket.IO configuration

### Priority 2 - UI Integration
4. `frontend/src/pages/Room.jsx` - Integrate toolbar properly
5. `frontend/src/components/Toolbar.jsx` - Fix setState warning
6. `frontend/src/App.js` - Fix routes configuration

### Priority 3 - Dashboard
7. `frontend/src/pages/Dashboard.jsx` - Fix all dashboard issues
8. `frontend/src/components/RoomCard.jsx` - Show member count
9. `frontend/src/components/InvitationDialog.jsx` - Create new component

### Priority 4 - Features
10. `frontend/src/Canvas.js` - Integrate history functionality
11. `frontend/src/canvasBackendJWT.js` - Add history API calls

## Expected Outcomes

After all fixes:
- ✅ Undo/redo works seamlessly during all operations
- ✅ Single refresh always shows correct state
- ✅ No cut outlines appear after undo
- ✅ Socket.IO provides real-time updates
- ✅ Dashboard shows accurate information
- ✅ UI matches legacy styling and polish
- ✅ History recall works with JWT rooms
- ✅ No console warnings or errors
- ✅ Multi-user collaboration is smooth and reliable
