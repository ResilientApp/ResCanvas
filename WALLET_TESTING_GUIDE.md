# Wallet Integration Testing Guide

## Quick Reference: How to Test Wallet Integration

This guide walks you through testing the complete ResVault wallet integration for secure rooms.

---

## Prerequisites

### 1. Install ResVault Extension

**Chrome Web Store:** (or build from source)
```
Repository: https://github.com/apache/incubator-resilientdb-resvault
Clone and follow build instructions in the repository README
```

**Installation Steps:**
1. Visit Chrome Extensions page: `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the ResVault build directory
5. Verify extension icon appears in toolbar

### 2. Setup ResVault Wallet

1. Click the ResVault extension icon
2. Create a new wallet or import existing
3. Set a password
4. **Keep the extension unlocked during testing**

### 3. Start ResCanvas Services

**Terminal 1 - Backend:**
```bash
cd /home/ubuntu/resilient-apps/ResCanvas/backend
python3 app.py
# Should start on http://127.0.0.1:10010
```

**Terminal 2 - Frontend:**
```bash
cd /home/ubuntu/resilient-apps/ResCanvas/frontend
npm start
# Should start on http://localhost:10008
```

**Verify Screen Sessions (if using):**
```bash
screen -ls
# Should show:
# - rescanvas_backend
# - rescanvas_frontend
# - rescanvas_python_cache
```

---

## Test Procedure

### Test 1: Basic Wallet Connection

**Objective:** Verify WalletConnector appears and connects to ResVault

**Steps:**
1. Open browser: http://localhost:10008
2. Login with your account
3. Navigate to Dashboard
4. Click "Create Room"
5. Fill in room details:
   - **Name:** Test Secure Room
   - **Type:** Select "Secure"  Important!
   - **Description:** Testing wallet integration
6. Click "Create"
7. Open the newly created secure room

**Expected Results:**
-  WalletConnector component appears in top-left area
-  Shows "Connect Wallet" button
-  Displays "ResVault not connected" message
-  Background color is warning yellow/orange

**Screenshot Location:** Top-left, below the canvas header

### Test 2: Wallet Connection Flow

**Objective:** Connect ResVault wallet to the secure room

**Steps:**
1. Click "Connect Wallet" button on WalletConnector
2. Wait for ResVault extension popup (may take 1-2 seconds)
3. In the ResVault popup:
   - Review the connection request
   - Click "Allow" or "Connect"
4. Wait for connection confirmation

**Expected Results:**
-  ResVault popup appears
-  Popup shows connection request details
-  After approval, WalletConnector updates
-  Background color changes to success green
-  Shows "Wallet Connected" with checkmark icon
-  Displays shortened public key (e.g., "0x1234...5678")
-  "Disconnect" button appears

**Console Logs to Check:**
```javascript
// Open browser DevTools (F12) → Console tab
"Wallet connected: <full_public_key_hex>"
```

### Test 3: Drawing with Wallet Signature

**Objective:** Draw a stroke and verify it's signed automatically

**Steps:**
1. Ensure wallet is connected (from Test 2)
2. Select a drawing tool (pencil, brush, etc.)
3. Choose a color
4. Draw a stroke on the canvas
5. Release mouse button to complete the stroke

**Expected Results:**
-  Stroke appears on canvas immediately
-  No error messages
-  No "Please connect wallet" warning

**Console Logs to Check:**
```javascript
// Browser DevTools → Console
"Stroke signed for secure room: { signerPubKey: '1234...' }"
"About to submit stroke: { ... }"
```

**Network Request to Verify:**
1. Open DevTools → Network tab
2. Filter by "strokes"
3. Find the POST request to `/rooms/{roomId}/strokes`
4. Click on the request
5. Go to "Payload" or "Request" tab
6. Verify payload includes:
   ```json
   {
     "color": "#000000",
     "lineWidth": 5,
     "pathData": [...],
     "user": "your_username",
     "signature": "abc123...def456",  // ← Should be present
     "signerPubKey": "0x1234...5678"   // ← Should be present
   }
   ```

### Test 4: Drawing Without Wallet (Error Handling)

**Objective:** Verify drawing is blocked when wallet is not connected

**Steps:**
1. In the WalletConnector, click "Disconnect"
2. Confirm disconnection
3. Try to draw a stroke on the canvas

**Expected Results:**
-  WalletConnector shows "Connect Wallet" again
-  Background returns to warning color
-  When attempting to draw, a notification appears:
   - **Message:** "Please connect your wallet to draw in this secure room"
   - **Type:** Warning (yellow/orange)
-  No stroke is submitted to backend
-  No network request in DevTools

**Console Logs:**
```javascript
"Failed to sign stroke: Wallet not connected for secure room"
```

### Test 5: Backend Signature Verification

**Objective:** Confirm backend validates signatures correctly

**Steps:**
1. Reconnect wallet (Test 2)
2. Draw a stroke (Test 3)
3. Check backend terminal logs

**Expected Backend Logs:**
```
POST /rooms/<roomId>/strokes
Status: 201 Created
Signature verified successfully for secure room
Stroke saved with signature metadata
```

**If Signature is Invalid (manual test):**
- Backend should return 400 Bad Request
- Error message: "Invalid signature" or similar
- Stroke should NOT be saved

**Verify in Database:**
```bash
# Connect to MongoDB
mongosh "mongodb+srv://cluster0.sonmozx.mongodb.net/rescanvas"

# Query for strokes with signatures
db.strokes.findOne({
  roomId: "your_room_id",
  walletSignature: { $exists: true },
  walletPubKey: { $exists: true }
})

# Should return document with:
# - walletSignature: "hex_string"
# - walletPubKey: "hex_string"
```

### Test 6: Multi-User Collaboration

**Objective:** Test secure room with multiple users

**Steps:**
1. Open second browser (or incognito window)
2. Login with different account
3. Navigate to the same secure room
4. Both users connect their wallets
5. User A draws a stroke
6. User B observes the stroke appear in real-time
7. User B draws a stroke
8. User A observes the stroke

**Expected Results:**
-  Both users can connect wallets independently
-  Strokes appear in real-time for all users
-  Each stroke is signed by its creator
-  Signature metadata is preserved per stroke

### Test 7: Room Type Validation

**Objective:** Verify WalletConnector only appears in secure rooms

**Steps:**
1. Create or open a **Public** room
2. Check for WalletConnector

**Expected Results:**
-  WalletConnector does NOT appear
-  Drawing works normally without wallet
-  No signature required or sent

**Steps:**
1. Create or open a **Private** room
2. Check for WalletConnector

**Expected Results:**
-  WalletConnector does NOT appear
-  Drawing works normally without wallet
-  No signature required or sent

**Steps:**
1. Open a **Secure** room
2. Check for WalletConnector

**Expected Results:**
-  WalletConnector DOES appear
-  Wallet connection required for drawing
-  All strokes must be signed

---

## Troubleshooting

### Issue: WalletConnector doesn't appear

**Check:**
-  Room type is "secure" (not public or private)
-  Frontend build is latest: `npm run build`
-  Hard refresh browser: Ctrl+Shift+R (Cmd+Shift+R on Mac)
-  Check browser console for errors

**Fix:**
```bash
cd frontend
npm install
npm start
# Hard refresh browser
```

### Issue: "Connect Wallet" button does nothing

**Check:**
-  ResVault extension is installed
-  Extension is unlocked (click icon to verify)
-  Browser console for errors
-  Network tab for blocked requests

**Fix:**
1. Click ResVault extension icon
2. Unlock wallet if locked
3. Try connecting again
4. Check popup blocker settings

### Issue: "Wallet not connected" error when drawing

**Check:**
-  WalletConnector shows "Connected" status
-  Green background on WalletConnector
-  Public key is displayed

**Fix:**
```javascript
// In browser console:
localStorage.clear(); // Clear any stale state
location.reload();    // Reload page
// Reconnect wallet
```

### Issue: Backend rejects signature

**Check Backend Logs:**
```
Error: Invalid signature
OR
Error: Signature required for secure room
```

**Common Causes:**
1. **Canonical JSON mismatch** - Frontend and backend serialize differently
2. **Wrong public key** - Signing key doesn't match submitted pubkey
3. **Timestamp drift** - System clocks out of sync

**Debug Steps:**
```javascript
// In frontend console:
const stroke = {
  roomId: "room_id",
  user: "username",
  color: "#000000",
  lineWidth: 5,
  pathData: [0, 0, 10, 10],
  timestamp: Date.now()
};

// Check canonical JSON:
const canonical = JSON.stringify(stroke, null, 0).replace(/\s+/g, '');
console.log('Canonical JSON:', canonical);
```

**Backend Verification:**
```python
# In backend/routes/rooms.py, add debug logging:
import json
print("Frontend canonical:", received_message)
print("Backend canonical:", json.dumps(stroke_data, separators=(',', ':'), sort_keys=True))
# Should match exactly
```

### Issue: Strokes not appearing after signing

**Check:**
-  Network request succeeds (200/201 status)
-  Backend logs show success
-  Socket.IO connection active
-  Room is not archived or view-only

**Fix:**
1. Check browser console for Socket.IO errors
2. Verify backend Socket.IO is running
3. Try refreshing the canvas: Reload page
4. Check MongoDB for the stroke:
   ```javascript
   db.strokes.find({ roomId: "room_id" }).sort({ timestamp: -1 }).limit(5)
   ```

---

## Success Criteria

###  All Tests Pass When:

1. **WalletConnector Integration:**
   - Appears only in secure rooms
   - Positioned correctly (top-left)
   - Shows connection status accurately

2. **Connection Flow:**
   - Connect button triggers ResVault popup
   - Approval connects successfully
   - Disconnect works correctly
   - State persists during drawing session

3. **Signature Flow:**
   - Drawing in secure room requires wallet
   - Strokes are signed automatically
   - Signature and pubkey sent to backend
   - Backend verifies signatures correctly
   - Invalid signatures rejected

4. **User Experience:**
   - Clear error messages
   - Graceful handling of missing extension
   - No unexpected errors in console
   - Smooth drawing experience when connected

5. **Security:**
   - Public rooms don't require wallet
   - Private rooms don't require wallet
   - Secure rooms enforce wallet requirement
   - Signature verification prevents tampering

---

## Performance Benchmarks

### Expected Performance:

**Connection Time:**
- ResVault popup: < 2 seconds
- Wallet connection: < 1 second
- Total: < 3 seconds

**Signing Overhead:**
- Per stroke: < 50ms
- Should not be noticeable to user

**Network Latency:**
- POST /strokes: Same as without wallet (~100-300ms)
- Signature adds negligible overhead

### Red Flags:

-  Connection takes > 5 seconds
-  Drawing feels laggy or delayed
-  Multiple popup prompts per stroke
-  Frequent disconnections

**If performance is poor:**
1. Check ResVault extension health
2. Verify browser performance (other tabs)
3. Check network connection
4. Review browser console for repeated errors

---

## Documentation References

- **API Reference:** See `API_REFERENCE.md` for endpoint details
- **Wallet Integration Status:** See `TASK3_WALLET_INTEGRATION_STATUS.md`
- **Testing Report:** See `TESTING_REPORT.md` for automated test results
- **ResVault Repository:** https://github.com/apache/incubator-resilientdb-resvault

---

## Reporting Issues

When reporting issues, include:

1. **Environment:**
   - Browser version
   - ResVault extension version
   - Operating system

2. **Steps to Reproduce:**
   - Exact actions taken
   - Expected vs actual behavior

3. **Logs:**
   - Browser console output
   - Backend terminal output
   - Network tab screenshots

4. **Screenshots:**
   - WalletConnector state
   - Error messages
   - Network requests

---

**Testing Guide Version:** 1.0  
**Last Updated:** October 7, 2025  
**Status:** Complete - Ready for user verification
