---
name: Keyboard Shortcuts & Accessibility Shortcuts
about: Add keyboard shortcuts for common tools and an overlay explaining them; improve ARIA/accessibility for toolbar controls.
title: "Keyboard Shortcuts & Accessibility Improvements"
labels: enhancement, frontend, accessibility
---

## Description

Implement a keyboard shortcut manager with a set of core shortcuts and an overlay help modal (`?`). Improve ARIA labels and focus management for toolbar controls.

## Current workflow

- Most interactions are via mouse/toolbar. Keyboard access is incomplete and discoverability is low.

## Proposed solution

- Implement `useKeyboardShortcuts` hook that registers safe default shortcuts and exposes an overlay to list them. Disable global shortcuts while typing in focused inputs.

## Technical requirements

Files to create:
- `frontend/src/hooks/useKeyboardShortcuts.js`

Files to modify:
- `frontend/src/components/Canvas.js` (consume shortcuts manager)
- `frontend/src/components/Toolbar.js` (ensure ARIA labels/roles)
- `frontend/src/pages/Room.jsx` (add Help/Shortcuts quick entry)

Skills: React, accessibility (ARIA), keyboard event handling

Difficulty: Easy → Intermediate

## Key features

- Shortcuts: B (brush), L (line), R (rectangle), O (circle), V (select), Z (undo), Y/Ctrl+Shift+Z (redo), Space (pan), ? (show shortcuts)
- ARIA labels & accessible focus order for toolbar
- Shortcut overlay modal with copyable list

## Technical challenges

- Avoid interfering with browser or OS shortcuts (e.g., Ctrl/Cmd combinations)
- Ensure typing in inputs doesn’t trigger global shortcuts

## Getting started

1. Implement `useKeyboardShortcuts` exposing mapping and enable/disable hooks
2. Wire safe default shortcuts and add `?` overlay

## Tests to add

- Unit: mapping triggers correct callback
- UI: focus in input fields disables global shortcuts

## Labels

enhancement frontend accessibility
