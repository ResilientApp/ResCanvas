---
name: Room Welcome & Onboarding Notes
about: Add a per-room pinned welcome/banner that owners can edit to provide instructions and links.
title: "Room Welcome / Pinned Note"
labels: enhancement, frontend, backend, tiny
---

## Description

Add a "Room info / Welcome" panel where the room owner can pin a short welcome message or instructions that show on room entry.

## Current workflow

- Rooms have a `description` field but it's not surfaced prominently as a pinned note in the canvas view.

## Proposed solution

- Add an editable pinned note area in `Room.jsx` and a backend field `welcomeNote`. Only owner/admin can edit. Show a small banner in the canvas view with quick actions (copy room link, invite).

## Technical requirements

Files to create:
- `frontend/src/components/Room/WelcomeBanner.jsx`

Files to modify:
- `frontend/src/pages/Room.jsx` (add the banner & edit button)
- `backend/routes/rooms.py` (extend create/update to set `welcomeNote` or add new endpoint)

Skills: React, Flask + MongoDB update

Difficulty: Easy

## Key features

- Pinned editable welcome message (owner/admin)
- Quick actions: copy room link, invite user
- Collapse/expand banner

## Technical challenges

- Permission checks (use existing share/owner helper functions)
- Small DB schema change (add `welcomeNote` field to room)

## Getting started

1. Add PATCH route to update room metadata (or extend existing room update)
2. Add banner UI and edit modal visible to owner/admin

## Tests to add

- Unit: permission check prevents non-owner editing
- UI: banner visible to room members on entry

## Labels

enhancement frontend backend tiny
