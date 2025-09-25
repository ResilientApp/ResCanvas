# Implementation Plan for ResCanvas

The goal is to build a real-time collaborative canvas application with secure user accounts, roles, rooms, and
notifications. Based on the existing **ResCanvas** codebase, the plan is organized into clear phases. Each
phase outlines the architectural changes and tasks needed. We build on the current code (which includes
basic auth routes, room creation, and a React front-end) and fill in missing features. We follow best
practices (e.g. short-lived JWTs ) and keep it simple (KISS/YAGNI).

## Phase 1: Authentication & User Roles

```
Enhance User Model: Extend the users collection to include a global role field (e.g. "admin" vs
default "user"). This supports future admin privileges. Initially all users can default to “user” (or
“viewer” role if we consider global roles).
Secure Registration/Login: The existing auth routes use bcrypt and issue JWTs. Ensure the JWT
expiration is short (minutes/hours) and implement refresh tokens on the backend. For
example, after login, issue an access token (short expiry) and a refresh token (longer expiry) stored
securely (e.g. HTTP-only cookie). Provide endpoints /auth/refresh to exchange a valid refresh
token for a new access token, following OAuth2 best practices.
JWT Strategy: Maintain the JWT payload (sub = user ID, username, exp ) as in existing code.
Verify tokens on each request. Do not put sensitive data in the JWT payload (minimize claims).
Use short expiry on access tokens and refresh them via the new refresh endpoint.
Password Security: Ensure passwords remain hashed with bcrypt as done. Consider adding email
confirmation or captcha if desired, but skip unless necessary (YAGNI).
Session Management: Store refresh tokens securely (e.g. HTTP-only secure cookies) and implement
refresh-token rotation or revocation logic to guard against theft. A simple one-use refresh rotation is
optional for now; at minimum, expire refresh tokens after a reasonable period.
```
## Phase 2: Database Schema & Backend Setup

```
Room Schema Extensions: In the rooms collection, add optional fields like description and
archived (boolean) or deletedAt timestamp. Add createdAt (already exists) and maybe
updatedAt for changes. A retention policy field (e.g. retentionDays) can be added for future
cleanup features.
Shares and Roles: The room_shares collection already tracks {roomId, userId, username,
role}. Extend it to allow roles "owner", "admin", "editor", and "viewer". By default, the
owner is set with role "owner". When inviting/sharing, allow specifying "editor" or "viewer"
(default to editor). Define what each role means in code: e.g. viewer cannot draw (POST strokes
should be forbidden), editor can draw, admin maybe can manage shares but isn’t primary owner.
Invites Collection: Create a new room_invites collection to handle pending invitations. Each
invite should include
{roomId, roomName, invitedUserId, invitedUsername, inviterId, inviterName,
role, status, createdAt}. Status can be "pending", "accepted", "declined".
```

```
Notifications Collection: Introduce a notifications or events collection to record events
(invites sent, accepted, ownership transferred, user left, etc). Each notification could include
{userId, type, message, link, read: false, createdAt}. Alternatively, notifications can
be generated on-the-fly from invites/events without storing; however, a collection allows marking
“read” status and history.
```
## Phase 3: Room CRUD and Ownership Management

```
Update Room Endpoints:
DELETE /rooms/<id>: Allow the owner to delete or archive a room. Deletion should remove the room
and all related strokes, shares, invites, and notifications. Archiving could simply set archived:
true and hide it from lists (and possibly disable drawing).
PATCH /rooms/<id>: Allow owner to update room metadata (e.g. name, description,
retentionDays). Ensure validation of fields.
POST /rooms/<id>/transfer: New endpoint for ownership transfer. Only the current owner may call
this. It takes a target user (who must already be a member) and makes them the new ownerId/
ownerName. Optionally, the previous owner’s share can be downgraded to editor. Send notifications
to both parties.
POST /rooms/<id>/leave: Allow a member (editor/viewer) to leave. This removes their entry from
room_shares. If the owner calls this without transferring ownership, return error or require
transfer first.
List and Filter Rooms: In the existing /rooms GET, include only non-archived rooms. Add
endpoints to fetch archived rooms or search. Possibly add a separate /rooms/<id> GET to fetch
room details (name, description, owner, type, etc).
```
## Phase 4: Sharing and Permissions (RBAC)

```
Sharing Endpoint: Enhance /rooms/<id>/share (POST) so that the owner can specify the role for
each user being invited/shared (e.g. {"usernames": ["alice"], "role": "editor"}). The
default from the UI can remain "editor". Reject invalid roles. Insert into room_invites
(pending state) instead of immediately adding to room_shares.
Role Management: Add an endpoint /rooms/<id>/permissions (PATCH) where the owner can
change a member’s role (editor/viewer). E.g. body {userId, role}. Update room_shares
accordingly. Also allow removing a member by role update to null or separate remove endpoint
(though leaving handles self-removal).
Enforce Roles in Code:
In stroke submission and other endpoints, check the member’s role: if role is "viewer", reject
drawing requests with 403. If "editor" or "owner" allow as appropriate.
Owner always has all rights. An optional per-room “admin” could have some management privileges
(but to keep it simple, owner is highest).
Autocomplete UI: For sharing usernames, implement an autocomplete dropdown. Frontend can
call a new endpoint /users/search?q=... (or reuse share by returning no-match error) to fetch
matching usernames. Use a library like Material-UI Autocomplete.
```
## Phase 5: Invitation Workflow

```
Create Invites: As above, when sharing a private/secure room, create a pending invite entry instead
of immediate access. The invite record includes inviter, invitee, role, and timestamp.
Invitation Endpoints:
GET /invites: Return a list of pending invitations for the current user (from room_invites where
invitedUserId = current user and status = "pending").
POST /invites/<inviteId>/accept: Mark the invite as accepted, move it into room_shares with the
specified role, and remove or mark the invite as accepted. Also send an in-app notification to the
inviter and other members if needed.
POST /invites/<inviteId>/decline: Mark as declined. Optionally notify the inviter of the declination.
Frontend – Dashboard Invites: Update the Dashboard UI to show pending invites. This could be a
list at the top or a notifications bell. Each invite can have Accept/Decline buttons, calling the above
endpoints. On accept, refresh the room list. On decline, just remove the invite from the UI.
Notifications on Invite: When an invite is created, generate a notification for the invited user (e.g.
“Alice invited you to Room X ”). After accept/decline, generate a notification to the inviter (e.g. “Bob
accepted your invite to Room X ” or “declined”). Use the notifications collection or push event (see
next).
```
## Phase 6: Notifications & Real-Time Updates

```
Backend Notifications: Use the notifications collection to record events like invitations,
acceptances, ownership transfers, users leaving, etc. Each notification should have a type and a
human-readable message, and optionally a link (e.g. /rooms/<id>). Mark as unread by default.
Push/Poll Strategy: For “push” notifications, integrate WebSockets (e.g. with Flask-SocketIO or a
Node.js socket server) so that events can be emitted to the user’s client in real time. For example,
when an invite is created, emit an event to that user’s socket (if online) and store in DB. Otherwise, at
login or on Dashboard load, fetch unread notifications. WebSockets provide low-latency updates for
real-time collaboration.
Frontend Notifications UI: In the React dashboard, add a notifications icon or panel. Show unread
counts. Clicking it shows a list of notifications (invites, join alerts, transfer alerts). Each can link to
appropriate view or action. Mark notifications read when viewed.
Real-Time Canvas Collaboration: Ensure that canvas updates are broadcast to all room members
instantly. The existing code commits strokes to a database, but to be truly real-time, implement a
WebSocket channel per room: when a user posts a stroke, emit that stroke to other users in the
same room so their canvases update without polling. This follows standard best practice “Use
WebSockets for low-latency communication” in real-time collaborative apps. The Canvas
component can subscribe to these socket events.
Conflict Handling: (Advanced/optional) If needed, use simple locking or CRDT techniques to handle
simultaneous draws. At minimum, ensure strokes are time-stamped and applied in order. Use a
lightweight JSON message format for strokes as in current code.
```
## Phase 7: Frontend Enhancements & User Experience

```
Dashboard Improvements: The existing Dashboard should be updated to:
Display all room types (public, private, secure) the user has access to, possibly separated by section
or tags.
```

```
Include a UI for archived/deleted rooms if supported (or allow un-deleting).
Show room members and roles (optional), e.g. small avatar stack or count and owner name.
Provide Leave (for members) and Delete/Archive buttons (for owners) on each room card.
Room Settings Page: Add a “Settings” view for each room (accessible by owner/admin). This allows
changing name, description, type (public/private/secure), and retention policy. Include a retention
dropdown (e.g. “delete after X days” or “never”) if implemented.
Invite & Notifications UI:
Show pending invites and notifications prominently on the dashboard. Use badges or dialogs.
For sharing, replace the comma-input with an autocomplete multiselect if possible. Provide feedback
when share invites are sent (e.g. a Snackbar).
Role-Based UI: If a user has only viewer access, disable drawing tools in the Canvas and show a
notice like “View-only”. The Canvas component’s props can include permissions to disable certain
actions.
Preferences/Settings Page: (Optional) A simple user settings page (e.g. /profile) where users
can change password or logout. If wallets are integrated, show wallet info.
Testing & Feedback: Use testing frameworks (Jest/React Testing Library) to verify components. Test
API routes with tools like Postman or automated tests.
```
## Phase 8: Security, Stability, and Best Practices

```
Access Control: In every backend route, enforce authentication and check roles. Ensure only owners
can manage rooms, only invited users can join, etc. Use the JWT sub and the room_shares
collection. Prevent privilege escalation.
Token Handling: Follow token best practices: short-lived access tokens , secure refresh flow ,
HTTPS-only cookies. Do not expose secrets. Verify JWT iss and exp.
Data Validation: Sanitize all inputs (use proper schema validation). In the code, ensure room
names/descriptions have length limits and disallow XSS.
Error Handling & Logging: Improve error responses (return consistent JSON with error codes). Log
important actions (e.g. login, room creation) for audit.
Performance & Scaling: MongoDB should have indexes (as in db.py). Consider Redis for real-time
pub/sub if using socket.io (already used for undo/redo stacks).
Final Testing: Perform end-to-end tests of flows: user signup/login, create rooms, invite/accept,
drawing in two browser sessions, leaving rooms, transferring ownership. Ensure no missing gaps.
```
**Key References:** We use JWTs with short expiration and refresh tokens for session management.
For real-time collaboration (canvas drawing and notifications), we will use WebSockets to broadcast updates
immediately. All new endpoints and UI components should fit within the existing React/Flask
architecture, reusing components where possible and adding new ones only as needed (YAGNI). This
phased plan ensures each feature is built on a stable foundation, maximizing usability and security.

```

