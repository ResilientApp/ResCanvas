---
name: Stroke Author Avatar Support
about: Show author avatars (gravatar/identicon) across UI for strokes and room lists.
title: "Stroke Author Avatars & Identicons"
labels: enhancement, frontend, small
---

## Description

Add avatars for stroke authors across the UI (hover tooltip, room activity list). Use profile images if available, otherwise generate identicons or initials.

## Current workflow

- Strokes and owners are shown by username only; there are no avatars.

## Proposed solution

- Implement a reusable `UserAvatar` component and use it in `StrokeVerificationBadge`, `MetricsDashboard`, and room lists.

## Technical requirements

Files to create:
- `frontend/src/components/Avatar/UserAvatar.jsx`

Files to modify:
- `frontend/src/components/StrokeVerificationBadge.jsx` (include avatar)
- `frontend/src/components/MetricsDashboard.js` (show avatars)
- `frontend/src/pages/Dashboard.jsx` (room lists)

Skills: React, optional identicon generation library

Difficulty: Easy

## Key features

- Avatar component with initials fallback
- Small caching for avatar fetches
- Tooltip with username, role, last-active

## Technical challenges

- Avatar source: fallback to identicon if no profile pic
- Keep effects minimal to page load

## Getting started

1. Implement `UserAvatar.jsx` (props: username, size, src)
2. Replace username-only displays with avatar + username components

## Tests to add

- UI: avatar renders initials when no src

## Labels

enhancement frontend small
