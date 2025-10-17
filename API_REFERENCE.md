# ResCanvas API Documentation

## Overview

ResCanvas provides a RESTful API for building collaborative drawing applications on top of ResilientDB. This document shows how your external applications can integrate with ResCanvas's backend services.

**Base URL**: `rescanvas.resilientdb.com/` or `http://localhost:10010` (for development)

**API Version**: v1

**Authentication**: JWT Bearer tokens are required for most endpoints.

---

## Authentication

### Register a New User

**POST** `/auth/register`

Create a new user account.

**Request Body**:
```json
{
  "username": "alice",
  "password": "securePassword123",
  "walletPubKey": "optional_wallet_public_key_for_secure_rooms"
}
```

**Validation Rules**:
- `username`: 3-128 characters, alphanumeric + underscore, hyphen, dot only
- `password`: Minimum 6 characters, maximum 72 bytes (bcrypt limit)
- `walletPubKey`: Optional, up to 500 characters

**Response** (201 Created):
```json
{
  "status": "ok",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "username": "alice",
    "walletPubKey": "optional_wallet_key"
  }
}
```

**Error Responses**:
- `400`: Validation failed (see `errors` object in response)
- `409`: Username already taken

---

### Login

**POST** `/auth/login`

Authenticate and receive access token.

**Request Body**:
```json
{
  "username": "alice",
  "password": "securePassword123"
}
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "username": "alice",
    "walletPubKey": "optional_wallet_key"
  }
}
```

**Error Responses**:
- `400`: Validation failed
- `401`: Invalid credentials

---

### Refresh Token

**POST** `/auth/refresh`

Refresh an expired access token using the HttpOnly refresh cookie.

**Headers**: Include cookies from previous login

**Response** (200 OK):
```json
{
  "status": "ok",
  "token": "new_access_token_here"
}
```

**Error Responses**:
- `401`: Invalid or expired refresh token

---

### Get Current User

**GET** `/auth/me`

Get information about the currently authenticated user.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "user": {
    "username": "alice",
    "_id": "user_id_here",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Rooms

Rooms are collaborative canvases where multiple users can draw together.

### Room Types

- **public**: Visible to all users, anyone can join
- **private**: Hidden from listings, requires invitation or room ID
- **secure**: Like private, but requires wallet signatures for all strokes

---

### Create Room

**POST** `/rooms`

Create a new drawing room.

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "name": "My Drawing Room",
  "type": "public",
  "description": "Optional room description"
}
```

**Validation Rules**:
- `name`: 1-256 characters, required
- `type`: One of ["public", "private", "secure"], required
- `description`: Optional, max 500 characters

**Response** (201 Created):
```json
{
  "status": "ok",
  "room": {
    "id": "room_id_here",
    "name": "My Drawing Room",
    "type": "public"
  }
}
```

**Error Responses**:
- `400`: Validation failed
- `401`: Not authenticated

---

### List Rooms

**GET** `/rooms`

List rooms accessible to the authenticated user.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Query Parameters**:
- `archived`: Include archived rooms (0 or 1, default: 0)
- `sort_by`: Sort field ("updatedAt", "createdAt", "name", "memberCount", default: "updatedAt")
- `order`: Sort order ("asc" or "desc", default: "desc")
- `page`: Page number (default: 1)
- `per_page`: Items per page (1-500, default: 200)
- `type`: Filter by room type ("public", "private", "secure")

**Response** (200 OK):
```json
{
  "rooms": [
    {
      "id": "room_id",
      "name": "Room Name",
      "type": "public",
      "ownerName": "alice",
      "description": "Room description",
      "archived": false,
      "myRole": "owner",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "memberCount": 5
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 200
}
```

---

### Get Room Details

**GET** `/rooms/{roomId}`

Get detailed information about a specific room.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "room": {
    "id": "room_id",
    "name": "Room Name",
    "type": "public",
    "ownerName": "alice",
    "ownerId": "user_id",
    "description": "Room description",
    "archived": false,
    "myRole": "editor",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Responses**:
- `401`: Not authenticated
- `403`: Access denied
- `404`: Room not found

---

### Update Room

**PATCH** `/rooms/{roomId}`

Update room properties. Editors can change name and description; only owners can change type.

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "name": "Updated Room Name",
  "description": "Updated description",
  "type": "private"
}
```

**Response** (200 OK):
```json
{
  "room": {
    "id": "room_id",
    "name": "Updated Room Name",
    "description": "Updated description",
    "type": "private"
  }
}
```

**Error Responses**:
- `400`: Validation failed
- `401`: Not authenticated
- `403`: Insufficient permissions

---

### Delete Room

**DELETE** `/rooms/{roomId}`

Permanently delete a room (owner only).

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "message": "Room deleted"
}
```

---

### Share Room

**POST** `/rooms/{roomId}/share`

Invite users to a room or update their roles.

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "users": [
    {
      "username": "bob",
      "role": "editor"
    },
    {
      "username": "charlie",
      "role": "viewer"
    }
  ]
}
```

**Roles**:
- `owner`: Full control (only one per room)
- `editor`: Can draw and modify content
- `viewer`: Read-only access

**Response** (200 OK):
```json
{
  "status": "ok",
  "results": {
    "invited": [
      {
        "username": "bob",
        "role": "editor"
      }
    ],
    "updated": [
      {
        "username": "charlie",
        "role": "viewer"
      }
    ],
    "errors": []
  }
}
```

---

## Strokes (Drawing Data)

Strokes represent individual drawing actions (lines, shapes, etc.) on a canvas.

### Get Strokes

**GET** `/rooms/{roomId}/strokes`

Retrieve strokes from a room.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Query Parameters**:
- `start`: Start timestamp (epoch milliseconds)
- `end`: End timestamp (epoch milliseconds)

**Response** (200 OK):
```json
{
  "strokes": [
    {
      "drawingId": "unique_drawing_id",
      "userId": "user_id",
      "user": "alice",
      "color": "#000000",
      "lineWidth": 3,
      "pathData": [
        {"x": 100, "y": 150},
        {"x": 105, "y": 155}
      ],
      "timestamp": 1704067200000,
      "roomId": "room_id",
      "order": 1704067200000
    }
  ]
}
```

---

### Post Stroke

**POST** `/rooms/{roomId}/strokes`

Add a new stroke to the room.

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "stroke": {
    "drawingId": "unique_drawing_id",
    "color": "#FF0000",
    "lineWidth": 5,
    "pathData": [
      {"x": 100, "y": 150},
      {"x": 105, "y": 155}
    ],
    "timestamp": 1704067200000,
    "user": "alice",
    "roomId": "room_id"
  },
  "signature": "wallet_signature_for_secure_rooms",
  "signerPubKey": "wallet_public_key_for_secure_rooms"
}
```

**For Secure Rooms**: `signature` and `signerPubKey` are required and must be valid cryptographic signatures of the stroke data.

**Response** (200 OK):
```json
{
  "status": "ok",
  "stroke": {
    "drawingId": "unique_drawing_id",
    "timestamp": 1704067200000
  }
}
```

**Error Responses**:
- `400`: Validation failed or invalid signature
- `401`: Not authenticated
- `403`: Access denied

---

### Undo Last Action

**POST** `/rooms/{roomId}/undo`

Undo the last drawing action by the current user.

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "canUndo": false,
  "canRedo": true
}
```

---

### Redo Last Undo

**POST** `/rooms/{roomId}/redo`

Redo a previously undone action.

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "canUndo": true,
  "canRedo": false
}
```

---

### Clear Canvas

**POST** `/rooms/{roomId}/clear`

Clear all strokes from the room canvas (owner/editor only).

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "message": "Canvas cleared"
}
```

---

## Real-Time Communication

ResCanvas uses Socket.IO for real-time updates.

### Connection

**URL**: `ws://your-rescanvas-instance.com` or `ws://localhost:10010`

**Authentication**: Include JWT token in connection:

```javascript
const socket = io('http://localhost:10010', {
  auth: {
    token: 'your_jwt_token_here'
  }
});
```

### Events

#### Join Room

**Emit**: `join_room`

```javascript
socket.emit('join_room', {
  roomId: 'room_id_here'
});
```

#### Leave Room

**Emit**: `leave_room`

```javascript
socket.emit('leave_room', {
  roomId: 'room_id_here'
});
```

#### Receive Stroke

**Listen**: `stroke`

```javascript
socket.on('stroke', (data) => {
  console.log('New stroke:', data.stroke);
  console.log('Room:', data.roomId);
});
```

#### Canvas Cleared

**Listen**: `canvas_cleared`

```javascript
socket.on('canvas_cleared', (data) => {
  console.log('Canvas cleared for room:', data.roomId);
});
```

---

## Error Handling

All error responses follow this format:

```json
{
  "status": "error",
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "errors": {
    "field1": "Field-specific error message",
    "field2": "Another field error"
  }
}
```

### Common Error Codes

- `NO_TOKEN`: No authentication token provided
- `INVALID_TOKEN`: Token is invalid or expired
- `AUTH_FAILED`: Authentication failed
- `INVALID_CLAIMS`: Token claims are invalid
- `USER_NOT_FOUND`: User does not exist
- `VALIDATION_ERROR`: Input validation failed
- `ACCESS_DENIED`: Insufficient permissions
- `ROOM_NOT_FOUND`: Room does not exist
- `INVALID_ROOM_ID`: Room ID format is invalid
- `OWNER_REQUIRED`: Action requires room ownership

### HTTP Status Codes

- `200`: Success
- `201`: Resource created
- `400`: Bad request (validation error)
- `401`: Unauthorized (authentication required)
- `403`: Forbidden (insufficient permissions)
- `404`: Not found
- `409`: Conflict (e.g., username already exists)
- `500`: Internal server error

---

## Useful Tips

### Authentication

1. **Store tokens securely**: Use httpOnly cookies or secure storage
2. **Refresh tokens proactively**: Refresh before expiration (tokens last 1 hour by default)
3. **Handle 401 errors gracefully**: Redirect to login or attempt token refresh

### Drawing Performance

1. **Batch strokes**: For better performance, consider buffering and sending multiple points at once
2. **Use Socket.IO for real-time**: Socket.IO provides lower latency than polling
3. **Implement local caching**: Cache room data and strokes locally to reduce API calls

### Error Handling

1. **Parse error responses**: Always check for `errors` object in validation failures
2. **Show user-friendly messages**: Convert technical error codes to readable messages
3. **Implement retry logic**: Retry failed requests with exponential backoff

### Security

1. **Validate input client-side**: Provide immediate feedback, but remember server-side validation is authoritative
2. **Use secure rooms for sensitive data**: Leverage wallet signatures for verifiable authorship
3. **Respect permissions**: Check `myRole` before attempting privileged operations

---

### Versioned API Endpoints (`/api/v1/*`)
**Structure**:
```
backend/api_v1/
├── __init__.py          # Main v1 blueprint registration
├── auth.py              # /api/v1/auth/* endpoints
├── rooms.py             # /api/v1/rooms/* endpoints
├── invites.py           # /api/v1/invites/* endpoints
├── notifications.py     # /api/v1/notifications/* endpoints
└── users.py             # /api/v1/users/* endpoints
```

**Endpoints Available**:

#### Authentication (`/api/v1/auth/*`)
```
POST   /api/v1/auth/register           - Create user account
POST   /api/v1/auth/login              - Authenticate user
POST   /api/v1/auth/refresh            - Refresh access token
POST   /api/v1/auth/logout             - Logout user
GET    /api/v1/auth/me                 - Get current user
POST   /api/v1/auth/change-password    - Change password
```

#### Rooms (`/api/v1/rooms/*`)
```
POST   /api/v1/rooms                           - Create room
GET    /api/v1/rooms                           - List rooms
GET    /api/v1/rooms/<id>                      - Get room details
PATCH  /api/v1/rooms/<id>                      - Update room
DELETE /api/v1/rooms/<id>                      - Delete room
POST   /api/v1/rooms/<id>/share                - Share room
GET    /api/v1/rooms/<id>/members              - Get members
PATCH  /api/v1/rooms/<id>/permissions          - Update permissions
POST   /api/v1/rooms/<id>/transfer             - Transfer ownership
POST   /api/v1/rooms/<id>/leave                - Leave room
GET    /api/v1/rooms/<id>/strokes              - Get strokes
POST   /api/v1/rooms/<id>/strokes              - Add stroke
POST   /api/v1/rooms/<id>/undo                 - Undo stroke
POST   /api/v1/rooms/<id>/redo                 - Redo stroke
POST   /api/v1/rooms/<id>/clear                - Clear canvas
GET    /api/v1/rooms/<id>/undo-redo-status     - Get undo/redo status
POST   /api/v1/rooms/<id>/reset-stacks         - Reset undo/redo
POST   /api/v1/rooms/<id>/invite               - Invite user
GET    /api/v1/rooms/suggest                   - Autocomplete rooms
```

#### Users (`/api/v1/users/*`)
```
GET    /api/v1/users/search    - Search users
GET    /api/v1/users/suggest   - Autocomplete users
```

#### Invitations (`/api/v1/invites/*`)
```
GET    /api/v1/invites                  - List invitations
POST   /api/v1/invites/<id>/accept      - Accept invitation
POST   /api/v1/invites/<id>/decline     - Decline invitation
```

#### Notifications (`/api/v1/notifications/*`)
```
GET    /api/v1/notifications                       - List notifications
DELETE /api/v1/notifications                       - Clear all
POST   /api/v1/notifications/<id>/mark-read        - Mark as read
DELETE /api/v1/notifications/<id>                  - Delete notification
GET    /api/v1/notifications/preferences           - Get preferences
PATCH  /api/v1/notifications/preferences           - Update preferences
```

---

### Use REST API Directly

External apps can make direct HTTP requests to `/api/v1/*` endpoints:

```bash
# Register user
curl -X POST https://api.rescanvas.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "alice", "password": "password123"}'

# Response: {"status": "ok", "token": "eyJ...", "user": {...}}

# Create room
curl -X POST https://api.rescanvas.com/api/v1/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJ..." \
  -d '{"name": "My Room", "type": "public"}'

# Response: {"status": "ok", "room": {...}}
```

```bash
# Register
curl -X POST http://localhost:10010/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "testpass123"}'

# Expected: {"status": "ok", "token": "...", "user": {...}}

# Login
curl -X POST http://localhost:10010/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "testpass123"}'

# Expected: {"status": "ok", "token": "...", "user": {...}}
```

```bash
# Get token from login response
TOKEN="your_token_here"

# Create room
curl -X POST http://localhost:10010/api/v1/rooms \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name": "Test Room", "type": "public"}'

# Expected: {"status": "ok", "room": {...}}

# List rooms
curl -X GET http://localhost:10010/api/v1/rooms \
  -H "Authorization: Bearer $TOKEN"

# Expected: {"status": "ok", "rooms": [...]}
```

```bash
ROOM_ID="your_room_id_here"

# Submit stroke
curl -X POST http://localhost:10010/api/v1/rooms/$ROOM_ID/strokes \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "pathData": [{"x": 0, "y": 0}, {"x": 100, "y": 100}],
    "color": "#000000",
    "lineWidth": 2
  }'

# Expected: {"status": "ok", "stroke": {...}}
```

```bash
# Get strokes
curl -X GET http://localhost:10010/api/v1/rooms/$ROOM_ID/strokes \
  -H "Authorization: Bearer $TOKEN"

# Expected: {"status": "ok", "strokes": [...]}
```

---

## Support

- **Readme Documentation**: [https://github.com/ResilientApp/ResCanvas/blob/main/README.md](https://github.com/ResilientApp/ResCanvas/blob/main/README.md)