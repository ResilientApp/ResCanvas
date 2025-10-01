# Remaining Issues - Systematic Fix Implementation

## Backend Test Results ✅
All backend functionality tests pass:
- ✅ Undo/redo persistence (single refresh works)
- ✅ Socket.IO server responding
- ✅ Routes configuration working
- ✅ Room API endpoints functional

## Frontend Issues to Address

### PRIORITY 1: Critical Functionality Issues

#### Issue #1: Cut Outlines Appearing on Shapes After Undo
**Current Behavior:** Cut outlines still visible after undo
**Root Cause:** Canvas not fully clearing cut artifacts
**Fix Location:** `frontend/src/useCanvasSelection.js` and `frontend/src/Canvas.js`
**Implementation:**
1. Add explicit canvas clear before redraw after undo/redo
2. Ensure cut overlay is properly reset
3. Test with shapes and strokes

#### Issue #2: Undo/Redo During Drawing/Panning
**Current Behavior:** Undo/redo only works after explicit refresh button press
**Root Cause:** Socket.IO event handlers call `mergedRefreshCanvas()` which doesn't re-fetch from backend
**Fix Location:** `frontend/src/Canvas.js` lines 158-210
**Current Code Analysis:**
```javascript
// Lines 191-197: Current event handler
const handleStrokeUndone = (data) => {
  console.log('Stroke undone event received:', data);
  // Force a full refresh from backend to ensure consistency
  mergedRefreshCanvas();  // ← This may not be fetching from backend

  // Update undo/redo status
  if (currentRoomId) {
    checkUndoRedoAvailability(auth, setUndoAvailable, setRedoAvailable, currentRoomId);
  }
};
```

**Issue:** The `mergedRefreshCanvas()` function may just redraw local cache without fetching from backend

**Implementation Plan:**
1. Find and examine `mergedRefreshCanvas` implementation
2. Ensure it calls `refreshCanvas` from `canvasBackendJWT.js` which actually fetches from API
3. Or replace with direct call to `refreshCanvasButtonHandler()` which is known to work
4. Test that undo/redo by User A immediately appears on User B's canvas without manual refresh

#### Issue #3: Need to Press Refresh Twice
**Current Behavior:** Must press refresh button twice to see undo/redo changes
**Root Cause:** Race condition or cache not being invalidated properly
**Fix Location:** `frontend/src/canvasBackendJWT.js` `refreshCanvas` function
**Implementation:**
1. Check if userData.drawings cache is being cleared before fetch
2. Ensure strokes are completely replaced, not merged
3. Add cache invalidation before backend fetch

#### Issue #7: Toolbar setState Warning During Render
**Current Behavior:** Console warning about setState during render
**Fix Location:** Toolbar component (need to find file)
**Implementation:**
1. Find toolbar component with grep_search
2. Move setState calls to useEffect or callback
3. Wrap in useCallback if needed

#### Issue #8: Socket.IO Connection Errors
**Current Behavior:** Socket.IO errors in console (possibly)
**Status:** Backend Socket.IO is responding (test passed)
**Root Cause:** Frontend may be using wrong token format
**Fix Location:** `frontend/src/Canvas.js` lines 159-169
**Current Code Analysis:**
```javascript
useEffect(() => {
  if (!auth?.tokens?.access_token || !currentRoomId) return;
  
  const socket = getSocket(auth.tokens.access_token);  // ← Token format issue?
```

**Issue:** Code checks `auth?.tokens?.access_token` but other parts use `auth?.token`

**Implementation:**
1. Standardize auth token access across all files
2. Check if `auth.token` or `auth.tokens.access_token` is correct
3. Update Socket.IO connection to use correct format
4. Verify with browser console

### PRIORITY 2: UI/UX Integration

#### Issue #4a: Dashboard Member Count Showing "?"
**Current Behavior:** Member count displays "?" instead of actual number
**Root Cause:** Backend `/rooms/{id}` doesn't return member list, only owner
**Fix Location:** `frontend/src/pages/Dashboard.jsx`
**Implementation:**
1. Add new backend endpoint `/rooms/{id}/members` to get member list
2. Or include members in `/rooms/{id}` response
3. Calculate count on frontend
4. Display as "X members"

#### Issue #4b: Invitation Notification Cut Off
**Current Behavior:** Long notification text gets truncated
**Fix Location:** Dashboard notification component
**Implementation:**
1. Add modal dialog for invitation accept/decline
2. Show full invitation details in modal
3. Add accept/decline buttons
4. Update notification to show truncated preview + "View" button

#### Issue #4c: Dashboard Page Not Scrollable
**Current Behavior:** Content overflow hidden
**Fix Location:** `frontend/src/pages/Dashboard.jsx` CSS
**Implementation:**
1. Add `overflow-y: auto` to main container
2. Set max-height or use vh units
3. Ensure room list is scrollable
4. Test with many rooms

#### Issue #5: Canvas UI Not Integrated with Legacy Theme
**Current Behavior:** New JWT canvas has different styling than legacy
**Reference Files:** 
- Legacy: `ResCanvas-main/frontend/src/Canvas.js`
- Current: `frontend/src/Canvas.js`
**Fix Location:** `frontend/src/Canvas.js` styling
**Implementation:**
1. Copy toolbar styling from legacy
2. Match color scheme and layout
3. Ensure consistent button styles
4. Preserve all functionality while updating appearance

#### Issue #6: /rooms Route Returning Blank Page
**Current Behavior:** Navigating to /rooms shows blank page
**Root Cause:** May be routing issue or missing component
**Fix Location:** `frontend/src/App.js` or routing configuration
**Implementation:**
1. Check if /rooms route is defined
2. Verify component is imported correctly
3. Add error boundary to catch render errors
4. Test navigation from dashboard

### PRIORITY 3: Feature Compatibility

#### Issue #9: Drawing History Not Compatible with JWT Rooms
**Current Behavior:** Drawing history feature doesn't work with JWT authentication
**Root Cause:** Legacy code uses different authentication mechanism
**Fix Location:** Drawing history component
**Implementation:**
1. Find drawing history implementation
2. Update to use JWT auth from context
3. Update API calls to use room-based endpoints
4. Test time-range filtering with JWT rooms

## Implementation Order

1. **First Wave - Critical Fixes (Day 1)**
   - Fix #8: Socket.IO connection (auth token standardization)
   - Fix #2: Undo/redo during operations (event handler fix)
   - Fix #3: Double refresh requirement (cache invalidation)
   - Test multi-user collaboration thoroughly

2. **Second Wave - UI Polish (Day 2)**
   - Fix #1: Cut outline artifacts
   - Fix #7: Toolbar setState warning
   - Fix #5: Canvas UI theme integration
   - Fix #6: /rooms route blank page

3. **Third Wave - Dashboard UX (Day 3)**
   - Fix #4a: Member count calculation
   - Fix #4b: Invitation modal dialog
   - Fix #4c: Dashboard scrolling

4. **Fourth Wave - Features (Day 4)**
   - Fix #9: Drawing history compatibility

## Testing Strategy

### For Each Fix:
1. **Unit Test:** Test the specific component/function
2. **Integration Test:** Test interaction with other components
3. **Multi-User Test:** Test with 2+ users in same room
4. **Browser Test:** Test in Chrome, Firefox, Safari

### Key Test Cases:
- User A draws → User B sees immediately (Socket.IO)
- User A undos → User B sees undo immediately (without refresh)
- User A cuts → User B sees cut immediately
- User A undos cut → User B sees original strokes restored
- Rapid undo/redo by User A → User B stays in sync
- Page refresh → All changes persist correctly

## Success Criteria

✅ **Issue #1:** Cut then undo → No outlines remain
✅ **Issue #2:** User A undos → User B sees change instantly
✅ **Issue #3:** Single refresh button press shows all changes
✅ **Issue #4:** Dashboard shows "5 members", full invitation text, scrollable list
✅ **Issue #5:** Canvas looks identical to legacy UI
✅ **Issue #6:** /rooms route displays room list properly
✅ **Issue #7:** No console warnings
✅ **Issue #8:** Socket.IO connects without errors
✅ **Issue #9:** Drawing history works with JWT rooms

## Files to Modify

### Critical Path:
1. `frontend/src/Canvas.js` - Socket.IO event handlers, auth token format
2. `frontend/src/canvasBackendJWT.js` - Cache invalidation in refreshCanvas
3. `frontend/src/socket.js` - Token passing to Socket.IO
4. `frontend/src/useCanvasSelection.js` - Cut outline cleanup

### UI/UX Path:
5. `frontend/src/pages/Dashboard.jsx` - Member count, notifications, scrolling
6. `frontend/src/App.js` - Routing configuration
7. Toolbar component (TBD) - setState warning fix

### Feature Path:
8. Drawing history component (TBD) - JWT compatibility

## Next Steps

1. Start with auth token standardization (Issue #8)
2. Fix Socket.IO event handlers (Issue #2)
3. Test multi-user undo/redo without manual refresh
4. Proceed to remaining issues in priority order
