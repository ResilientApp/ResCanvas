---
name: Presence Cursor Indicator
about: Add lightweight per-user cursor overlay showing other users' current pointer locations.
title: "Presence Cursor Indicator (lightweight)"
labels: enhancement, frontend, realtime
---

## Description

Add a per-user cursor overlay showing where other users are drawing (small dot + username), sent periodically via socket events. Minimal bandwidth and throttling.

## Current workflow

- Real-time collaboration exists (strokes, join/leave), but there are no live cursors.

## Proposed solution

- Emit `presence:cursor` events from the client (throttled) with normalized canvas coordinates; server relays to the room. Clients render small cursor markers for other users.

## Technical requirements

Files to create:
- `frontend/src/components/Presence/UserCursorOverlay.jsx`

Files to modify:
- `frontend/src/components/Canvas.js` (emit cursor positions, render overlay)
- `frontend/src/services/socket.js` (add presence event hook)
- `backend/services/socketio_service.py` or `backend/routes/socketio_handlers.py` (relay events)

Skills: Socket.io, coordinate normalization, Canvas overlay drawing

Difficulty: Easy → Intermediate

## Key features

- Throttled cursor updates to server
- Render remote cursors with color/initials
- Toggle presence in UI

## Technical challenges

- Bandwidth: ensure throttling and send only when moving
- Privacy: avoid leaking private info; send username only if allowed

## Getting started

1. Add client-side throttled emitter for mouse move while in canvas
2. Add overlay rendering and socket handlers for incoming cursor events

## Tests to add

- Unit: throttling logic
- Integration: two clients show each other's cursor

## Labels

enhancement realtime frontend small
