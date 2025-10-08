---
name: Room Search & Tagging Improvements
about: Add fuzzy search and optional tags for rooms to improve discoverability.
title: "Room Search Improvements: Fuzzy Search & Tagging"
labels: enhancement, backend, frontend, medium
---

## Description

Improve room discovery by adding fuzzy search (contains/text) and optional tags on rooms that can be filtered from the dashboard.

## Current workflow

- `rooms/suggest` uses prefix, case-insensitive matching and there are no tags per room.

## Proposed solution

- Add optional `tags` array to room documents and implement fuzzy search using Mongo text index or improved regex fallback. Add frontend filter UI for tags.

## Technical requirements

Files to modify/create:
- `backend/routes/rooms.py` (extend create/update to accept `tags`; add text index or suggest logic)
- `frontend/src/pages/Dashboard.jsx` (tag filter UI)
- `frontend/src/api/rooms.js` (add `searchByTags` function)

Skills: Mongo text indexes, React forms

Difficulty: Intermediate

## Key features

- Tags per room (owner can set)
- Fuzzy search (contains/text) on room name/description
- Filter by tags on Dashboard

## Technical challenges

- Avoid expensive regex scans on large collections; prefer `text` index where possible
- Provide safe migration or index creation strategy

## Getting started

1. Add optional `tags` to room creation flow in frontend and backend
2. Create Mongo text index for `name` and `description` (migration or on startup)
3. Update `rooms/suggest` to use `$text` and fallback to regex

## Tests to add

- Integration: fuzzy search returns expected rooms

## Labels

enhancement backend frontend search medium
