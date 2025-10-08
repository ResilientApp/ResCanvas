---
name: Autosave & Local Recovery for Current Room
about: Add per-room autosave and a recovery prompt to persist recent edits locally and recover after browser crash/refresh.
title: "Autosave & Local Recovery for Current Room"
labels: enhancement, frontend, help wanted
---

## Description

Add a per-room autosave that persists recent strokes and canvas UI state locally (IndexedDB or localStorage) so a user can recover recent edits after a browser crash or accidental refresh.

## Current workflow

- If the browser refreshes or crashes while editing, unsent strokes and local UI state (toolbar, undo stack) can be lost.

## Proposed solution

- Persist recent strokes and toolbar state for the active room at short intervals and on `beforeunload`.
- On room load, detect stored recovery state and prompt the user to "Recover" or "Discard".

## Technical requirements

Files to create:
- `frontend/src/offline/autosave.js` (IndexedDB wrapper or light localStorage fallback)

Files to modify:
- `frontend/src/components/Canvas.js` (hook into autosave; show recovery prompt)
- `frontend/src/components/SafeSnackbar.jsx` (reuse for recovery notifications)

Skills needed: React hooks, IndexedDB (idb) or localStorage fallback.

Difficulty: Easy → Intermediate

## Key features

- Autosave recent strokes and toolbar state (color, lineWidth, drawMode)
- Recovery prompt on room entry if saved state exists
- Option to preview recovered strokes before applying
- Small storage footprint (rotate or cap to N strokes)

## Technical challenges

- Efficiently serializing `pathData` to keep storage small
- Merging recovered local strokes with server-authoritative strokes without duplicates

## Getting started

1. Implement `autosave.js` with simple put/get/clear for `rescanvas:autosave:{roomId}`
2. On every local stroke and at periodic intervals, persist unsent strokes and toolbar state
3. On room load, detect saved data and present a recover/preview dialog

## Tests to add

- Unit: autosave put/get/clear semantics
- Integration: simulate crash (clear in-memory) → reload room → autosave recovery works

## Labels

enhancement frontend help wanted
