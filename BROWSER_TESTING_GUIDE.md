# Browser Testing Guide for Cut Functionality

## Prerequisites
- Backend running: `http://localhost:10010`
- Frontend running: `http://localhost:10008`

## Test Steps

### 1. Open Browser and Login
1. Navigate to `http://localhost:10008`
2. You should see the login page
3. Create a new account or login with existing credentials

### 2. Create or Join a Room
1. After login, you'll see the Dashboard
2. Click "Create New Room" or join an existing room
3. Enter the canvas

### 3. Draw Test Strokes
1. Select the **Pen tool** (should be default)
2. Draw a **horizontal line** from left to right across the canvas
3. Change color (click the color circle)
4. Draw a **vertical line** from top to bottom, crossing the horizontal line
5. You should now have two lines that form a cross/plus shape

### 4. Perform Cut Operation
1. Click the **Cut tool** (scissors icon) in the toolbar
2. Draw a **rectangle selection** around the intersection of the two lines
   - Click and drag to create the selection rectangle
   - The selected area will be highlighted
3. Release the mouse button to complete the cut
4. **Expected Result**: The portions of the lines within the rectangle should disappear immediately

### 5. Verify Immediate Effect
**✓ PASS**: The cut area is blank  
**✗ FAIL**: The cut area still shows the original strokes

### 6. Test Persistence - Refresh Page
1. Press `F5` or click the browser refresh button
2. Wait for the canvas to reload
3. **Expected Result**: The cut area should STILL be blank after refresh

### 7. Verify Persistence
**✓ PASS**: The cut area remains blank after refresh  
**✗ FAIL**: The cut strokes reappear after refresh

### 8. Test Multiple Refreshes
1. Refresh the page multiple times (5-10 times)
2. Each time, verify the cut area remains blank
3. **Expected Result**: Cut persists across all refreshes

### 9. Test Undo (Optional)
1. Click the **Undo button** (or Ctrl+Z)
2. **Expected Result**: The cut operation is undone, original strokes reappear
3. Click **Redo button** to reapply the cut

### 10. Test Multiple Cuts (Optional)
1. Draw several more strokes
2. Perform multiple cut operations in different areas
3. Refresh the page
4. **Expected Result**: All cut areas remain blank

## What Should Work

✅ **Immediate Cut Effect**: Cut takes effect as soon as you release the selection  
✅ **Persistence**: Cut remains effective after page refresh  
✅ **Multiple Cuts**: Can perform multiple cuts, all persist  
✅ **Undo/Redo**: Can undo cut operations and redo them  
✅ **Replacement Segments**: Parts of strokes outside cut area remain visible  

## What Indicates Success

When you cut a stroke that crosses the cut boundary:
- The part **inside the cut rectangle** disappears
- The parts **outside the cut rectangle** remain visible as separate stroke segments
- After refresh, the same visual result persists

## Debugging

### If cuts don't persist after refresh:

1. **Check browser console** (F12 → Console tab):
   - Look for errors related to `submitToDatabase`
   - Look for auth/token errors
   - Look for failed API calls

2. **Check Network tab** (F12 → Network tab):
   - Filter by XHR/Fetch
   - Look for POST requests to `/rooms/{roomId}/strokes`
   - Check if cut record is being submitted with `pathData.tool = "cut"`
   - Check if requests have `Authorization: Bearer {token}` header

3. **Check Backend logs**:
   ```bash
   # In the backend directory
   tail -f backend.log
   ```
   - Look for cut record detection messages
   - Look for Redis operations on `cut-stroke-ids:{roomId}`

### If you see authentication errors:

- Make sure you're logged in (check for token in localStorage)
- Try logging out and back in
- Check if the auth token is being passed to useCanvasSelection hook

## Expected Backend Behavior

When you perform a cut, the backend should:
1. Receive replacement segments (parts of strokes outside cut area)
2. Receive cut record with `pathData.tool = "cut"` and `originalStrokeIds` array
3. Store original stroke IDs in Redis set: `cut-stroke-ids:{roomId}`
4. When retrieving strokes, filter out IDs in the cut set

You can verify Redis directly:
```bash
redis-cli
> SMEMBERS cut-stroke-ids:{your-room-id}
```

This should show the IDs of strokes that have been cut.

## Success Criteria

The cut functionality is **WORKING** if:
- ✅ Cut takes effect immediately when you release the selection
- ✅ Cut area remains blank after refreshing the page multiple times
- ✅ Replacement segments (parts outside cut) remain visible
- ✅ Multiple cuts can be performed and all persist
- ✅ Undo restores the cut strokes correctly

## Test Results

After testing in the browser, document your results:

| Test Case | Expected | Result | Pass/Fail |
|-----------|----------|--------|-----------|
| Cut takes effect immediately | Cut area is blank | | |
| Cut persists after 1 refresh | Cut area is blank | | |
| Cut persists after 5 refreshes | Cut area is blank | | |
| Replacement segments visible | Parts outside cut remain | | |
| Undo restores cut strokes | Strokes reappear | | |
| Multiple cuts persist | All cuts remain | | |

---

**Note**: The automated tests have already confirmed the backend is working correctly. If you're still seeing issues in the browser, it's likely a frontend caching or state management issue. Make sure the frontend has recompiled with the latest changes.
