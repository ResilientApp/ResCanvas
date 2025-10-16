# ResCanvas JavaScript SDK

Official JavaScript client library for the ResCanvas collaborative drawing platform.

## Installation

```bash
npm install @rescanvas/client
```

## Quick Start

```javascript
import ResCanvasClient from '@rescanvas/client';

// Initialize client
const client = new ResCanvasClient({
  baseUrl: 'https://your-rescanvas-instance.com',
  apiVersion: 'v1' // Uses /api/v1/* endpoints
});

// Register new user
const { token, user } = await client.auth.register({
  username: 'alice',
  password: 'securePassword123'
});

// Login
const { token, user } = await client.auth.login({
  username: 'alice',
  password: 'securePassword123'
});

// Create a room
const room = await client.rooms.create({
  name: 'My Drawing Room',
  type: 'public' // or 'private' or 'secure'
});

// List accessible rooms
const rooms = await client.rooms.list({
  sortBy: 'createdAt',
  order: 'desc'
});

// Submit a drawing stroke
await client.rooms.addStroke(room.id, {
  pathData: [
    { x: 100, y: 100 },
    { x: 200, y: 150 },
    { x: 300, y: 200 }
  ],
  color: '#000000',
  lineWidth: 2,
  user: user.username
});

// Get all strokes in a room
const strokes = await client.rooms.getStrokes(room.id);

// Undo last stroke
await client.rooms.undo(room.id);

// Redo undone stroke
await client.rooms.redo(room.id);

// Real-time collaboration
client.socket.connect(token);
client.socket.joinRoom(room.id);
client.socket.on('new_line', (stroke) => {
  console.log('New stroke received:', stroke);
});
```

## API Reference

### Authentication

#### `client.auth.register(credentials)`
Create a new user account.

**Parameters:**
- `credentials.username` (string): Username (3-128 chars, alphanumeric + underscore/hyphen/dot)
- `credentials.password` (string): Password (min 6 chars)
- `credentials.walletPubKey` (string, optional): Wallet public key for secure rooms

**Returns:** `Promise<{token: string, user: object}>`

#### `client.auth.login(credentials)`
Authenticate and receive access token.

**Parameters:**
- `credentials.username` (string): Username
- `credentials.password` (string): Password

**Returns:** `Promise<{token: string, user: object}>`

#### `client.auth.refresh()`
Refresh expired access token using stored refresh token.

**Returns:** `Promise<{token: string}>`

#### `client.auth.logout()`
Logout and invalidate refresh token.

**Returns:** `Promise<{status: string}>`

#### `client.auth.getMe()`
Get current authenticated user information.

**Returns:** `Promise<{user: object}>`

### Rooms

#### `client.rooms.create(roomData)`
Create a new collaborative drawing room.

**Parameters:**
- `roomData.name` (string): Room name (1-256 chars, required)
- `roomData.type` (string): Room type - "public", "private", or "secure" (required)
- `roomData.description` (string, optional): Room description (max 500 chars)

**Returns:** `Promise<{room: object}>`

#### `client.rooms.list(options)`
List rooms accessible to the authenticated user.

**Parameters:**
- `options.includeArchived` (boolean, optional): Include archived rooms
- `options.sortBy` (string, optional): Sort field - "createdAt", "updatedAt", "name"
- `options.order` (string, optional): Sort order - "asc" or "desc"
- `options.page` (number, optional): Page number for pagination
- `options.per_page` (number, optional): Items per page

**Returns:** `Promise<{rooms: array, pagination: object}>`

#### `client.rooms.get(roomId)`
Get details for a specific room.

**Parameters:**
- `roomId` (string): Room ID

**Returns:** `Promise<{room: object}>`

#### `client.rooms.update(roomId, updates)`
Update room settings.

**Parameters:**
- `roomId` (string): Room ID
- `updates.name` (string, optional): New room name
- `updates.description` (string, optional): New description
- `updates.archived` (boolean, optional): Archive status

**Returns:** `Promise<{room: object}>`

#### `client.rooms.delete(roomId)`
Delete a room (owner only).

**Parameters:**
- `roomId` (string): Room ID

**Returns:** `Promise<{status: string}>`

#### `client.rooms.share(roomId, users)`
Share room with multiple users.

**Parameters:**
- `roomId` (string): Room ID
- `users` (array): Array of `{username: string, role: string}` (role: "owner", "editor", "viewer")

**Returns:** `Promise<{status: string, results: array}>`

#### `client.rooms.getMembers(roomId)`
Get list of room members with their roles.

**Parameters:**
- `roomId` (string): Room ID

**Returns:** `Promise<{members: array}>`

#### `client.rooms.getStrokes(roomId, options)`
Get drawing strokes for a room.

**Parameters:**
- `roomId` (string): Room ID
- `options.since` (number, optional): Timestamp to get strokes after
- `options.until` (number, optional): Timestamp to get strokes before

**Returns:** `Promise<{strokes: array}>`

#### `client.rooms.addStroke(roomId, stroke)`
Submit a new drawing stroke to a room.

**Parameters:**
- `roomId` (string): Room ID
- `stroke.pathData` (array): Array of {x, y} points
- `stroke.color` (string): Stroke color (hex format)
- `stroke.lineWidth` (number): Line width in pixels
- `stroke.user` (string, optional): Username
- `stroke.tool` (string, optional): Drawing tool name

**Returns:** `Promise<{status: string, stroke: object}>`

#### `client.rooms.undo(roomId)`
Undo the last stroke submitted by the current user.

**Parameters:**
- `roomId` (string): Room ID

**Returns:** `Promise<{status: string, undone: object}>`

#### `client.rooms.redo(roomId)`
Redo a previously undone stroke.

**Parameters:**
- `roomId` (string): Room ID

**Returns:** `Promise<{status: string, redone: object}>`

#### `client.rooms.clear(roomId)`
Clear all strokes from the room canvas.

**Parameters:**
- `roomId` (string): Room ID

**Returns:** `Promise<{status: string, clearedAt: number}>`

### Invitations

#### `client.invites.list()`
List all pending invitations for the current user.

**Returns:** `Promise<{invites: array}>`

#### `client.invites.accept(inviteId)`
Accept a room invitation.

**Parameters:**
- `inviteId` (string): Invitation ID

**Returns:** `Promise<{status: string, room: object}>`

#### `client.invites.decline(inviteId)`
Decline a room invitation.

**Parameters:**
- `inviteId` (string): Invitation ID

**Returns:** `Promise<{status: string}>`

### Notifications

#### `client.notifications.list()`
List all notifications for the current user.

**Returns:** `Promise<{notifications: array}>`

#### `client.notifications.markRead(notificationId)`
Mark a notification as read.

**Parameters:**
- `notificationId` (string): Notification ID

**Returns:** `Promise<{status: string}>`

#### `client.notifications.delete(notificationId)`
Delete a specific notification.

**Parameters:**
- `notificationId` (string): Notification ID

**Returns:** `Promise<{status: string}>`

#### `client.notifications.clear()`
Delete all notifications.

**Returns:** `Promise<{status: string}>`

### Real-Time Collaboration

#### `client.socket.connect(token)`
Connect to Socket.IO server for real-time updates.

**Parameters:**
- `token` (string): JWT access token

#### `client.socket.joinRoom(roomId)`
Join a room for real-time collaboration.

**Parameters:**
- `roomId` (string): Room ID

#### `client.socket.leaveRoom(roomId)`
Leave a room.

**Parameters:**
- `roomId` (string): Room ID

#### `client.socket.on(event, callback)`
Listen for real-time events.

**Events:**
- `new_line` - New stroke added to room
- `undo_line` - Stroke undone
- `redo_line` - Stroke redone
- `clear_canvas` - Canvas cleared
- `user_joined` - User joined room
- `user_left` - User left room

## Configuration

```javascript
const client = new ResCanvasClient({
  baseUrl: 'https://api.rescanvas.com', // Required
  apiVersion: 'v1', // Default: 'v1'
  timeout: 30000, // Request timeout in ms, Default: 30000
  retries: 3, // Number of retries for failed requests, Default: 3
  onTokenExpired: async () => {
    // Custom handler for token expiration
    // Return new token or throw error
  }
});
```

## Error Handling

```javascript
try {
  await client.rooms.create({ name: 'Test', type: 'public' });
} catch (error) {
  if (error.status === 401) {
    // Unauthorized - token expired
    console.error('Please log in again');
  } else if (error.status === 400) {
    // Validation error
    console.error('Invalid input:', error.body.errors);
  } else if (error.status === 403) {
    // Forbidden - insufficient permissions
    console.error('You do not have permission');
  } else {
    // Other errors
    console.error('An error occurred:', error.message);
  }
}
```

## Examples

### Complete Drawing App

```javascript
import ResCanvasClient from '@rescanvas/client';

class DrawingApp {
  constructor() {
    this.client = new ResCanvasClient({
      baseUrl: 'https://rescanvas.example.com',
      apiVersion: 'v1'
    });
    this.currentRoom = null;
    this.token = null;
  }

  async login(username, password) {
    const { token, user } = await this.client.auth.login({ username, password });
    this.token = token;
    this.client.socket.connect(token);
    return user;
  }

  async createRoom(name, type = 'public') {
    const { room } = await this.client.rooms.create({ name, type });
    this.currentRoom = room;
    this.client.socket.joinRoom(room.id);
    this.setupRoomListeners();
    return room;
  }

  setupRoomListeners() {
    this.client.socket.on('new_line', (stroke) => {
      this.drawStroke(stroke);
    });

    this.client.socket.on('clear_canvas', () => {
      this.clearCanvas();
    });

    this.client.socket.on('undo_line', (undoData) => {
      this.removeStroke(undoData.strokeId);
    });
  }

  async drawLocalStroke(pathData, color, lineWidth) {
    // Draw locally first for immediate feedback
    this.drawStroke({ pathData, color, lineWidth });

    // Submit to server
    try {
      await this.client.rooms.addStroke(this.currentRoom.id, {
        pathData,
        color,
        lineWidth
      });
    } catch (error) {
      console.error('Failed to submit stroke:', error);
      // Handle error (e.g., revert local drawing)
    }
  }

  drawStroke(stroke) {
    // Your canvas drawing logic here
    console.log('Drawing stroke:', stroke);
  }

  clearCanvas() {
    // Your canvas clearing logic here
    console.log('Clearing canvas');
  }

  removeStroke(strokeId) {
    // Your stroke removal logic here
    console.log('Removing stroke:', strokeId);
  }
}

// Usage
const app = new DrawingApp();
await app.login('alice', 'password');
await app.createRoom('My Masterpiece');
await app.drawLocalStroke([{x:0, y:0}, {x:100, y:100}], '#FF0000', 3);
```

## License

Apache 2.0 - See LICENSE file for details

## Contributing

Contributions are welcome! Please see our [Contributing Guide](../../CONTRIBUTING.md).

## Support

- GitHub Issues: https://github.com/ResilientApp/ResCanvas/issues
- Documentation: https://rescanvas.docs.example.com
- Email: support@rescanvas.example.com
