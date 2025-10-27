# ResCanvas API Documentation

## Overview

**Base URL**: `rescanvas.resilientdb.com/` or `http://localhost:10010` (for development)

**API Version**: v1

**Authentication**: JWT Bearer tokens are required for most endpoints.

---

## API v1 Structure

ResCanvas API v1 provides a clean, RESTful interface organized around these core concepts:

1. **Canvas API** (`/api/v1/canvases/*`) - Canvas management, strokes, and history operations
2. **Collaborations API** (`/api/v1/collaborations/*`) - Invitations and collaboration management  
3. **Notifications API** (`/api/v1/notifications/*`) - User notifications
4. **Users API** (`/api/v1/users/*`) - User search and suggestions
5. **Auth API** (`/api/v1/auth/*`) - Authentication and user management

### Key Design Principles

- **Generic terminology**: Uses "canvas" instead of frontend-specific terminology
- **Consolidated endpoints**: Related operations grouped under logical paths
- **Proper HTTP methods**: Uses appropriate verbs (GET, POST, PATCH, DELETE)
- **RESTful structure**: Resources are clearly defined and hierarchical

---

## Authentication

All authentication endpoints are prefixed with `/api/v1/auth`.

### Register a New User

**POST** `/api/v1/auth/register`

Create a new user account.

**Request Body**:
```json
{
  "username": "alice",
  "password": "securePassword123",
  "walletPubKey": "optional_wallet_public_key_for_secure_canvases"
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
- `400`: Validation failed
- `409`: Username already taken

---

### Login

**POST** `/api/v1/auth/login`

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

### Get Current User

**GET** `/api/v1/auth/me`

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

### Logout

**POST** `/api/v1/auth/logout`

Invalidate the current session.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "status": "ok"
}
```

---

## Canvas API

All canvas endpoints are prefixed with `/api/v1/canvases`.

Canvases are collaborative drawing spaces where multiple users can work together.

### Canvas Types

- **public**: Visible to all users, anyone can join
- **private**: Hidden from listings, requires invitation or canvas ID
- **secure**: Like private, but requires wallet signatures for all strokes

---

### Create Canvas

**POST** `/api/v1/canvases`

Create a new canvas.

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "name": "My Canvas",
  "type": "public",
  "description": "Optional canvas description"
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
    "id": "canvas_id_here",
    "name": "My Canvas",
    "type": "public"
  }
}
```

**Error Responses**:
- `400`: Validation failed
- `401`: Not authenticated

---

### List Canvases

**GET** `/api/v1/canvases`

List canvases accessible to the authenticated user.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Query Parameters**:
- `archived`: Include archived canvases (0 or 1, default: 0)
- `sort_by`: Sort field ("updatedAt", "createdAt", "name", "memberCount", default: "updatedAt")
- `order`: Sort order ("asc" or "desc", default: "desc")
- `page`: Page number (default: 1)
- `per_page`: Items per page (1-500, default: 200)
- `type`: Filter by canvas type ("public", "private", "secure")

**Response** (200 OK):
```json
{
  "rooms": [
    {
      "id": "canvas_id",
      "name": "Canvas Name",
      "type": "public",
      "ownerName": "alice",
      "description": "Canvas description",
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

### Get Canvas Details

**GET** `/api/v1/canvases/{canvasId}`

Get detailed information about a specific canvas.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "room": {
    "id": "canvas_id",
    "name": "Canvas Name",
    "type": "public",
    "ownerName": "alice",
    "ownerId": "user_id",
    "description": "Canvas description",
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
- `404`: Canvas not found

---

### Update Canvas

**PATCH** `/api/v1/canvases/{canvasId}`

Update canvas properties (owner/admin only).

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "name": "Updated Canvas Name",
  "description": "Updated description",
  "archived": false
}
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "room": {
    "id": "canvas_id",
    "name": "Updated Canvas Name",
    "description": "Updated description"
  }
}
```

**Error Responses**:
- `400`: Validation failed
- `401`: Not authenticated
- `403`: Not owner/admin

---

### Delete Canvas

**DELETE** `/api/v1/canvases/{canvasId}`

Delete a canvas (owner only).

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "status": "ok"
}
```

**Error Responses**:
- `401`: Not authenticated
- `403`: Not owner
- `404`: Canvas not found

---

### Share Canvas

**POST** `/api/v1/canvases/{canvasId}/share`

Share canvas with specific users.

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
- `owner`: Full control (only one per canvas)
- `admin`: Can manage members and settings
- `editor`: Can draw and modify content
- `viewer`: Read-only access

**Response** (201 Created):
```json
{
  "status": "ok",
  "shared": 2
}
```

**Error Responses**:
- `400`: Invalid users or roles
- `401`: Not authenticated
- `403`: Not owner/admin

---

### Get Canvas Members

**GET** `/api/v1/canvases/{canvasId}/members`

Get list of canvas members and their roles.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "members": [
    {
      "userId": "user_id",
      "username": "alice",
      "role": "owner",
      "joinedAt": "2024-01-01T00:00:00.000Z"
    },
    {
      "userId": "user_id_2",
      "username": "bob",
      "role": "editor",
      "joinedAt": "2024-01-02T00:00:00.000Z"
    }
  ]
}
```

---

### Invite User to Canvas

**POST** `/api/v1/canvases/{canvasId}/invite`

Invite a user to join the canvas.

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "username": "bob",
  "role": "editor"
}
```

**Response** (201 Created):
```json
{
  "status": "ok",
  "inviteId": "invite_id_here"
}
```

**Error Responses**:
- `400`: Invalid username or role
- `401`: Not authenticated
- `403`: Not owner/admin
- `404`: User not found

---

### Transfer Canvas Ownership

**POST** `/api/v1/canvases/{canvasId}/transfer`

Transfer canvas ownership to another member.

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "username": "bob"
}
```

**Response** (200 OK):
```json
{
  "status": "ok"
}
```

**Error Responses**:
- `400`: Target user not a member
- `401`: Not authenticated
- `403`: Not current owner
- `404`: Target user not found

---

### Leave Canvas

**POST** `/api/v1/canvases/{canvasId}/leave`

Leave a canvas (non-owners only).

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "status": "ok"
}
```

**Error Responses**:
- `400`: Owner cannot leave (must transfer first)
- `401`: Not authenticated
- `403`: Not a member

---

## Drawing Operations

### Get Strokes

**GET** `/api/v1/canvases/{canvasId}/strokes`

Retrieve all drawing strokes for a canvas.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "strokes": [
    {
      "id": "stroke_id",
      "userId": "user_id",
      "username": "alice",
      "points": [[10, 20], [15, 25], [20, 30]],
      "color": "#000000",
      "width": 2,
      "tool": "pen",
      "timestamp": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### Submit Stroke

**POST** `/api/v1/canvases/{canvasId}/strokes`

Submit a new drawing stroke to the canvas.

**Headers**:
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "points": [[10, 20], [15, 25], [20, 30]],
  "color": "#FF0000",
  "width": 3,
  "tool": "pen"
}
```

**Response** (201 Created):
```json
{
  "status": "ok",
  "strokeId": "stroke_id_here"
}
```

**Error Responses**:
- `400`: Invalid stroke data
- `401`: Not authenticated
- `403`: No write access

---

### Clear Canvas

**DELETE** `/api/v1/canvases/{canvasId}/strokes`

Clear all strokes from the canvas.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "cleared": true
}
```

**Error Responses**:
- `401`: Not authenticated
- `403`: No write access

---

## History Operations

All history operations are grouped under `/api/v1/canvases/{canvasId}/history`.

### Undo Last Stroke

**POST** `/api/v1/canvases/{canvasId}/history/undo`

Undo the last stroke made by the current user.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "undone": true
}
```

---

### Redo Undone Stroke

**POST** `/api/v1/canvases/{canvasId}/history/redo`

Redo the last undone stroke.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "redone": true
}
```

---

### Get History Status

**GET** `/api/v1/canvases/{canvasId}/history/status`

Get the current undo/redo status for the user.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "undo_available": true,
  "redo_available": false,
  "undo_count": 5,
  "redo_count": 0
}
```

---

### Reset History

**POST** `/api/v1/canvases/{canvasId}/history/reset`

Reset the undo/redo stacks for the current user.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "reset": true
}
```

---

## Collaborations API

All collaboration endpoints are prefixed with `/api/v1/collaborations`.

### List Invitations

**GET** `/api/v1/collaborations/invitations`

List all pending invitations for the current user.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "invitations": [
    {
      "id": "invite_id",
      "canvasId": "canvas_id",
      "canvasName": "Shared Canvas",
      "inviterName": "alice",
      "role": "editor",
      "status": "pending",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### Accept Invitation

**POST** `/api/v1/collaborations/invitations/{inviteId}/accept`

Accept a pending invitation.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "canvasId": "canvas_id_here"
}
```

---

### Decline Invitation

**POST** `/api/v1/collaborations/invitations/{inviteId}/decline`

Decline a pending invitation.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "status": "ok"
}
```

---

## Utilities

### Suggest Canvases

**GET** `/api/v1/canvases/suggest`

Get canvas suggestions for autocomplete (searches by name).

**Headers**:
```
Authorization: Bearer <access_token>
```

**Query Parameters**:
- `q`: Search query string

**Response** (200 OK):
```json
{
  "suggestions": [
    {
      "id": "canvas_id",
      "name": "Canvas Name",
      "type": "public"
    }
  ]
}
```

---

## Users API

All user endpoints are prefixed with `/api/v1/users`.

### Search Users

**GET** `/api/v1/users/search`

Search for users by username.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Query Parameters**:
- `q`: Search query string

**Response** (200 OK):
```json
{
  "users": [
    {
      "username": "alice",
      "id": "user_id"
    }
  ]
}
```

---

### Suggest Users

**GET** `/api/v1/users/suggest`

Get user suggestions for autocomplete.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Query Parameters**:
- `q`: Search query string

**Response** (200 OK):
```json
{
  "suggestions": [
    {
      "username": "alice",
      "id": "user_id"
    }
  ]
}
```

---

## Notifications API

All notification endpoints are prefixed with `/api/v1/notifications`.

### List Notifications

**GET** `/api/v1/notifications`

Get all notifications for the current user.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Query Parameters**:
- `unreadOnly`: Only show unread (true/false, default: false)

**Response** (200 OK):
```json
{
  "notifications": [
    {
      "id": "notif_id",
      "type": "invite",
      "message": "You were invited to join 'Canvas Name'",
      "link": "/canvases/canvas_id",
      "read": false,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

---

### Mark Notification as Read

**PATCH** `/api/v1/notifications/{notificationId}`

Mark a notification as read.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "status": "ok"
}
```

---

### Delete Notification

**DELETE** `/api/v1/notifications/{notificationId}`

Delete a notification.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "status": "ok"
}
```

---

### Clear All Notifications

**DELETE** `/api/v1/notifications`

Delete all notifications for the current user.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Response** (200 OK):
```json
{
  "status": "ok",
  "deleted": 5
}
```

---

## Error Handling

All API endpoints return consistent error responses:

```json
{
  "status": "error",
  "message": "Description of what went wrong"
}
```

Common HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation error)
- `401`: Unauthorized (authentication required)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `409`: Conflict (e.g., duplicate username)
- `500`: Internal Server Error

---

## Real-Time Communication

ResCanvas uses Socket.IO for real-time collaboration. Connect to the WebSocket server with your JWT token:

```javascript
import io from 'socket.io-client';

const socket = io('https://rescanvas.resilientdb.com', {
  auth: {
    token: 'your_jwt_token_here'
  }
});

// Join a canvas
socket.emit('join', { canvasId: 'canvas_id_here' });

// Listen for new strokes
socket.on('newStroke', (data) => {
  console.log('New stroke:', data);
});
```

### Socket Events

**Client → Server**:
- `join`: Join a canvas for real-time updates
- `leave`: Leave a canvas

**Server → Client**:
- `newStroke`: New stroke added to canvas
- `canvasCleared`: Canvas was cleared
- `memberJoined`: New member joined
- `memberLeft`: Member left

---

## Support

For issues or questions:
- GitHub: https://github.com/resilientdb/ResCanvas
- Documentation: https://github.com/resilientdb/ResCanvas/blob/main/README.md

---
