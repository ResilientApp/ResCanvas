---
name: Notifications Center Improvements
about: Add filterable notification categories and quick actions (accept invite, mark read) in the Notifications menu.
title: "Notifications Center: Filters & Actionable Items"
labels: enhancement, frontend, backend, medium
---

## Description

Enhance the `NotificationsMenu` with categories (Invites, Shares, System) and quick actions (Accept/Ignore invite, Mark read). Persist notification read/unread state via backend endpoints.

## Current workflow

- Notifications exist but filtering and quick actions are limited.

## Proposed solution

- Add tabbed filters, quick action buttons for invites, and backend endpoints to act on or mark notifications as read.

## Technical requirements

Files to modify/create:
- `frontend/src/components/NotificationsMenu.jsx` (UI with filters & actions)
- `frontend/src/services/notifications.js` (client wrappers)
- `backend/routes/notifications.py` (endpoints: mark read, act on invite)

Skills: React, Flask, Mongo updates

Difficulty: Easy → Intermediate

## Key features

- Filters: All / Invites / Shares / System
- Quick action buttons for invites (Accept / Ignore)
- Mark all read and per-item read toggles
- Pagination for many notifications

## Technical challenges

- Race conditions when two clients act on same invite (make backend idempotent)
- Keeping socket notifications consistent after action

## Getting started

1. Extend frontend `NotificationsMenu` with category tabs and action buttons
2. Add backend endpoints `POST /notifications/:id/act` and `POST /notifications/:id/read`

## Tests to add

- Integration: accepting invite adds user to `shares_coll`
- Unit: marking read toggles DB field

## Labels

enhancement frontend backend medium
