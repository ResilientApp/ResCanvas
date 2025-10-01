# Comprehensive Fixes for Cut/Paste and Multi-User Sync Issues

## Date: October 1, 2025

## Issues Addressed

### Issue 1: Shape Outlines Reappearing After Undo
**Problem**: When undoing cut operations on shapes, the outlines of shapes would reappear along the cut boundary. Additionally, cutting from previously undone areas would cause parts to reappear.

**Root Cause**: Replacement segments were being submitted to the database, but when the cut was undone:
1. They were removed from local state
2. But remained in the database
3. When canvas refreshed (to sync with other users), they came back from the database
4. This caused the "ghost outlines" issue

**Solution**:
1. Track replacement segment IDs in the cut record (`replacementSegmentIds` field)
2. When a cut is undone on the backend:
   - Remove original stroke IDs from the cut set (makes originals visible again)
   - Add replacement segment IDs to the cut set (hides replacement segments)
3. When a cut is redone:
   - Add original stroke IDs back to the cut set (hides originals)
   - Remove replacement segment IDs from the cut set (makes replacements visible again)

**Files Changed**:
- `frontend/src/useCanvasSelection.js`: Added `replacementSegmentIds` to cut record
- `backend/routes/rooms.py`: Updated `room_undo` and `room_redo` to handle replacement segments

### Issue 2: 500 Errors and CORS Issues
**Problem**: Backend was crashing with Socket.IO errors, showing:
```
RuntimeError: The Werkzeug web server is not designed to run in production. 
Pass allow_unsafe_werkzeug=True to the run() method to disable this error.
```

**Solution**: Added `allow_unsafe_werkzeug=True` to the `socketio.run()` call in development mode.

**Files Changed**:
- `backend/app.py`: Added `allow_unsafe_werkzeug=True` parameter

### Issue 3: Undo/Redo Not Syncing Across Users
**Problem**: When User A undoes a stroke, User B's canvas doesn't reflect the change. The canvases become out of sync.

**Root Cause**: The JWT version was NOT refreshing the canvas from the backend after undo/redo operations. The legacy system calls `refreshCanvasButtonHandler()` in the `finally` block of every undo/redo, which fetches the latest state from the backend including ALL users' undo/redo markers.

**Solution**: 
1. Always call `refreshCanvasButtonHandler()` after undo/redo (in the `finally` block)
2. Also call `checkUndoRedoAvailability()` to update button states
3. This ensures the canvas loads the latest state from the backend, which includes:
   - Strokes undone by other users
   - Strokes redone by other users  
   - Cut/paste operations by other users
   - All undo/redo markers persisted to MongoDB

**Files Changed**:
- `frontend/src/canvasBackendJWT.js`: 
  - Removed conditional `if (shouldRefreshFromBackend)` check
  - Always call `refreshCanvasButtonHandler()` in finally blocks for both undo and redo
  - Added `checkUndoRedoAvailability()` calls

## Architecture Summary

### Cut Operation Flow (Complete)

**Frontend (When Cutting)**:
1. User selects region and cuts
2. Calculate replacement segments (parts outside cut region)
3. Submit replacement segments with `skipUndoStack: true` (persists but doesn't add to undo)
4. Create cut record with:
   - `originalStrokeIds`: IDs of strokes being cut
   - `replacementSegmentIds`: IDs of replacement segments
5. Submit cut record (this DOES add to undo stack)
6. Backend adds `originalStrokeIds` to Redis `cut-stroke-ids:{roomId}` set

**Backend (When Loading Strokes)**:
- Filter out any stroke whose ID is in the `cut-stroke-ids:{roomId}` set
- This hides both original strokes and (when undone) replacement segments

**Frontend (When Undoing Cut)**:
1. Remove cut record and replacement segments from local state
2. Re-add original strokes to local state
3. Call backend undo ONCE (only for the cut record)
4. Refresh canvas from backend (picks up changes from all users)

**Backend (When Undoing Cut)**:
1. Detect it's a cut record being undone
2. Remove `originalStrokeIds` from cut set → originals become visible
3. Add `replacementSegmentIds` to cut set → replacements become hidden
4. Persist undo marker to MongoDB/GraphQL
5. Broadcast `stroke_undone` event via Socket.IO

**Frontend (When Redoing Cut)**:
1. Remove originals from local state
2. Re-add cut record and replacement segments to local state
3. Call backend redo ONCE
4. Refresh canvas from backend

**Backend (When Redoing Cut)**:
1. Detect it's a cut record being redone
2. Add `originalStrokeIds` back to cut set → originals hidden again
3. Remove `replacementSegmentIds` from cut set → replacements visible again
4. Persist redo marker
5. Broadcast `stroke_redone` event

### Multi-User Sync Architecture

**Key Insight from Legacy System**: The undo/redo system works across users because:

1. **Undo/redo markers are persisted to the blockchain** (MongoDB mirror)
2. **Every undo/redo triggers a canvas refresh** from the backend
3. The backend GET endpoint returns strokes filtered by:
   - User-specific undo/redo markers (from MongoDB aggregation)
   - Global cut set (from Redis)
4. When User A undoes, User B's next refresh picks up User A's undo marker
5. This keeps all canvases perfectly in sync

**Critical Pattern**:
```javascript
try {
  // Perform undo/redo logic
} finally {
  // ALWAYS refresh from backend - don't skip this!
  refreshCanvasButtonHandler();
  checkUndoRedoAvailability();
}
```

## Testing Recommendations

### Test 1: Shape Cut Outlines
1. Draw a rectangle/circle
2. Cut it in the middle
3. Undo the cut
4. Verify: No ghost outlines appear
5. Refresh page
6. Verify: Original shape is back, no outlines

### Test 2: Multi-User Undo Sync
1. User A draws 3 strokes
2. User B sees all 3 strokes
3. User A undoes 1 stroke
4. User B's canvas should immediately (on next refresh) show only 2 strokes
5. User A redoes
6. User B's canvas should show 3 strokes again

### Test 3: Multi-User Cut Sync
1. User A draws a stroke and cuts it
2. User B sees the cut result (replacement segments only)
3. User A undoes the cut
4. User B should see the original stroke restored
5. User A redoes the cut
6. User B should see the cut result again

### Test 4: Backend Stability
1. Draw 10+ strokes rapidly
2. Verify no 500 errors or CORS issues
3. Verify all strokes are saved successfully
4. Check backend logs for no crashes

## Performance Considerations

- Replacement segments use `skipUndoStack: true` → no undo stack bloat
- Each cut operation adds exactly +1 to undo count (only the cut record)
- Canvas refresh after undo/redo is necessary for sync but adds network latency
- Consider debouncing rapid undo/redo to reduce refresh frequency

## Known Limitations

1. **Refresh frequency**: Every undo/redo triggers a full canvas refresh. For very large canvases, this may be slow.
2. **Cut complexity**: Complex shapes with many segments may have performance issues.
3. **Concurrent cuts**: If two users cut the same stroke simultaneously, last-write-wins.

## Migration Notes

If migrating from legacy to JWT system:
- Undo/redo stacks are NOT compatible (different key patterns in Redis)
- Cut sets ARE compatible (same Redis key format)
- Consider flushing Redis or migrating stacks on deployment
