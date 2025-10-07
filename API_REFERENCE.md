# ResCanvas API Reference

**Base URL:** `http://localhost:10010` (development)

**Authentication:** Most endpoints require JWT authentication via `Authorization: Bearer <token>` header.

---

## Authentication Endpoints

### POST `/auth/register`
Register a new user account.

**Request Body:**
```json
{
  "username": "string (required)",
  "password": "string (required)",
  "walletPubKey": "string (optional, hex public key)"
}
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "token": "JWT_TOKEN_STRING"
}
```

**Example:**
```bash
curl -X POST http://localhost:10010/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"secret123"}'
```

---

### POST `/auth/login`
Authenticate and receive JWT token.

**Request Body:**
```json
{
  "username": "string (required)",
  "password": "string (required)"
}
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "token": "JWT_TOKEN_STRING"
}
```

**Example:**
```bash
curl -X POST http://localhost:10010/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"secret123"}'
```

---

### GET `/auth/me`
Get current authenticated user information.

**Headers Required:**
- `Authorization: Bearer <token>`

**Response (200 OK):**
```json
{
  "status": "ok",
  "user": {
    "_id": "user_id",
    "username": "alice",
    "walletPubKey": "hex_string_or_null"
  }
}
```

**Example:**
```bash
curl -X GET http://localhost:10010/auth/me \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

---

## Room Endpoints

### POST `/rooms`
Create a new room.

**Headers Required:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "string (required)",
  "type": "public|private|secure (optional, default: public)"
}
```

**Response (201 Created):**
```json
{
  "status": "ok",
  "room": {
    "id": "room_id",
    "name": "Design Sync",
    "type": "private"
  }
}
```

**Room Types:**
- `public` - Visible to all users, no encryption
- `private` - Invite-only, encrypted strokes
- `secure` - Private + requires wallet signatures on all strokes

**Example:**
```bash
curl -X POST http://localhost:10010/rooms \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"name":"My Canvas","type":"private"}'
```

---

### GET `/rooms`
List rooms visible to the authenticated user (owned or shared).

**Headers Required:**
- `Authorization: Bearer <token>`

**Query Parameters (all optional):**
- `type` - Filter by room type (`public`, `private`, `secure`)
- `sort_by` - Sort field (default: `updatedAt`)
- `order` - Sort order: `asc` or `desc` (default: `desc`)
- `page` - Page number (default: 1)
- `per_page` - Items per page (default: 200, max: 500)
- `archived` - Include archived rooms: `1` or `0` (default: 0)

**Response (200 OK):**
```json
{
  "status": "ok",
  "items": [
    {
      "_id": "room_id",
      "name": "Design Sync",
      "type": "private",
      "ownerId": "user_id",
      "archived": false,
      "updatedAt": "2025-10-07T10:30:00Z"
    }
  ],
  "total": 42,
  "page": 1,
  "per_page": 200
}
```

**Examples:**
```bash
# Get all rooms
curl -X GET http://localhost:10010/rooms \
  -H 'Authorization: Bearer YOUR_TOKEN'

# Filter by type, paginated
curl -X GET 'http://localhost:10010/rooms?type=private&page=1&per_page=50' \
  -H 'Authorization: Bearer YOUR_TOKEN'

# Sort by name ascending
curl -X GET 'http://localhost:10010/rooms?sort_by=name&order=asc' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

---

### POST `/rooms/<roomId>/share`
Share a room with other users (owner only).

**Headers Required:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "usernames": ["bob", "charlie"]
}
```

**Response (200 OK):**
```json
{
  "status": "ok"
}
```

**Example:**
```bash
curl -X POST http://localhost:10010/rooms/ROOM_ID/share \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"usernames":["bob","charlie"]}'
```

---

## Stroke Endpoints

### POST `/rooms/<roomId>/strokes`
Submit a drawing stroke to a room.

**Headers Required:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "stroke": {
    "color": "#000000",
    "lineWidth": 2,
    "pathData": [[x1, y1], [x2, y2], ...],
    "timestamp": 1730412345678
  },
  "signature": "hex_signature (required for secure rooms)",
  "signerPubKey": "hex_public_key (required for secure rooms)"
}
```

**Response (200 OK):**
```json
{
  "status": "ok"
}
```

**Note for Secure Rooms:**
- Strokes in `secure` rooms MUST include `signature` and `signerPubKey`
- Signature is Ed25519 signature of canonical JSON representation
- Server validates signature before accepting stroke

**Example:**
```bash
curl -X POST http://localhost:10010/rooms/ROOM_ID/strokes \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "stroke": {
      "color": "#ff0000",
      "lineWidth": 3,
      "pathData": [[10,10],[50,50]],
      "timestamp": 1730412345678
    }
  }'
```

---

### GET `/rooms/<roomId>/strokes`
Retrieve all strokes for a room.

**Headers Required:**
- `Authorization: Bearer <token>`

**Query Parameters (optional):**
- `start` - Start timestamp (filter strokes after this time)
- `end` - End timestamp (filter strokes before this time)

**Response (200 OK):**
```json
{
  "status": "ok",
  "strokes": [
    {
      "_id": "stroke_id",
      "roomId": "room_id",
      "user": "alice",
      "color": "#000000",
      "lineWidth": 2,
      "pathData": [[10,10],[50,50]],
      "ts": 1730412345678,
      "signature": "hex (for secure rooms)",
      "signerPubKey": "hex (for secure rooms)"
    }
  ]
}
```

**Example:**
```bash
# Get all strokes
curl -X GET http://localhost:10010/rooms/ROOM_ID/strokes \
  -H 'Authorization: Bearer YOUR_TOKEN'

# Get strokes in time range
curl -X GET 'http://localhost:10010/rooms/ROOM_ID/strokes?start=1730000000&end=1730999999' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

---

## Undo/Redo Endpoints

### POST `/rooms/<roomId>/undo`
Undo the last stroke by the current user.

**Headers Required:**
- `Authorization: Bearer <token>`

**Response (200 OK):**
```json
{
  "status": "ok",
  "undoAvailable": false,
  "redoAvailable": true
}
```

**Example:**
```bash
curl -X POST http://localhost:10010/rooms/ROOM_ID/undo \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

---

### POST `/rooms/<roomId>/redo`
Redo the last undone stroke by the current user.

**Headers Required:**
- `Authorization: Bearer <token>`

**Response (200 OK):**
```json
{
  "status": "ok",
  "undoAvailable": true,
  "redoAvailable": false
}
```

**Example:**
```bash
curl -X POST http://localhost:10010/rooms/ROOM_ID/redo \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

---

### GET `/rooms/<roomId>/undo_redo_status`
Check undo/redo availability for current user.

**Headers Required:**
- `Authorization: Bearer <token>`

**Response (200 OK):**
```json
{
  "status": "ok",
  "undoAvailable": true,
  "redoAvailable": false
}
```

---

### POST `/rooms/<roomId>/clear`
Clear all strokes in a room (marks a clear timestamp).

**Headers Required:**
- `Authorization: Bearer <token>`

**Response (200 OK):**
```json
{
  "status": "ok"
}
```

**Example:**
```bash
curl -X POST http://localhost:10010/rooms/ROOM_ID/clear \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

---

## User Search Endpoints

### GET `/users/search`
Search for users by username (for sharing rooms).

**Headers Required:**
- `Authorization: Bearer <token>`

**Query Parameters:**
- `q` - Search query (username prefix/substring)

**Response (200 OK):**
```json
{
  "status": "ok",
  "users": [
    {"username": "alice"},
    {"username": "alice_smith"}
  ]
}
```

**Example:**
```bash
curl -X GET 'http://localhost:10010/users/search?q=alice' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

---

## WebSocket Events

**Connection:** Connect to `ws://localhost:10010` with Socket.IO client

**Authentication:** Include JWT token in connection auth:
```javascript
import { io } from 'socket.io-client';
const socket = io('http://localhost:10010', {
  auth: { token: 'YOUR_JWT_TOKEN' }
});
```

### Client Events (emit)

#### `join_room`
Join a room to receive real-time updates.

**Payload:**
```json
{
  "roomId": "room_id"
}
```

**Example:**
```javascript
socket.emit('join_room', { roomId: 'ROOM_ID' });
```

---

#### `leave_room`
Leave a room to stop receiving updates.

**Payload:**
```json
{
  "roomId": "room_id"
}
```

---

### Server Events (listen)

#### `stroke`
Receive new stroke from another user.

**Payload:**
```json
{
  "roomId": "room_id",
  "stroke": {
    "color": "#000000",
    "lineWidth": 2,
    "pathData": [[10,10],[50,50]],
    "timestamp": 1730412345678
  },
  "user": "alice"
}
```

**Example:**
```javascript
socket.on('stroke', (data) => {
  console.log('New stroke from', data.user);
  // Render stroke on canvas
});
```

---

#### `notification`
Receive general notifications (room invites, shares, etc).

**Payload:**
```json
{
  "type": "room_share|invite|...",
  "message": "You were invited to...",
  "data": { /* contextual data */ }
}
```

**Example:**
```javascript
socket.on('notification', (data) => {
  console.log('Notification:', data.message);
});
```

---

#### `undo`
Another user undid a stroke.

**Payload:**
```json
{
  "roomId": "room_id",
  "strokeId": "stroke_id"
}
```

---

#### `redo`
Another user redid a stroke.

**Payload:**
```json
{
  "roomId": "room_id",
  "strokeId": "stroke_id"
}
```

---

#### `clear`
Room was cleared.

**Payload:**
```json
{
  "roomId": "room_id",
  "timestamp": 1730412345678
}
```

---

## Error Responses

All endpoints return consistent error format:

```json
{
  "status": "error",
  "message": "Error description"
}
```

**Common HTTP Status Codes:**
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (room/user doesn't exist)
- `500` - Internal Server Error

---

## Rate Limiting & Pagination Best Practices

**For API Clients:**
1. Use pagination for `/rooms` endpoint when dealing with many rooms
2. Filter results server-side using query parameters (type, archived, etc.)
3. Implement exponential backoff for failed requests
4. Cache room lists locally and refresh periodically
5. Use WebSocket events for real-time updates instead of polling

**Server-Side Filtering Benefits:**
- Reduced network bandwidth
- Faster client-side rendering
- Consistent filtering logic
- Better performance for large datasets

---

## Authentication Flow

**Registration/Login Flow:**
1. Client calls `/auth/register` or `/auth/login`
2. Server returns JWT token
3. Client stores token in localStorage/sessionStorage
4. Client includes token in `Authorization: Bearer <token>` header for all subsequent requests
5. Client includes token in Socket.IO connection auth

**Token Refresh:**
- Tokens expire after 14 days (configurable)
- Client should handle 401 responses by redirecting to login
- Future: implement token refresh endpoint

---

## Implementation Notes

**Backend Modularity:**
- All endpoints use consistent authentication via `_authed_user()` helper
- Filtering and pagination performed server-side
- Business logic stays in backend (no client-side authorization)
- RESTful design allows any frontend to consume the API

**Client Integration:**
- Frontend should send all filter/pagination parameters
- Use provided query parameters for server-side operations
- No need for client-side filtering of large datasets
- WebSocket connection required for real-time collaboration

---

## Source Code References

- **Routes:** `backend/routes/`
  - `auth.py` - Authentication endpoints
  - `rooms.py` - Room CRUD, strokes, undo/redo
  - `metrics.py` - Performance metrics
  - `admin.py` - Admin utilities

- **Services:** `backend/services/`
  - `db.py` - MongoDB and Redis connections
  - `crypto_service.py` - Encryption, signature verification
  - `socketio_service.py` - Real-time event handlers

---

**Last Updated:** October 7, 2025  
**API Version:** 1.0
