---
name: Stroke Selection Export
about: Export a selected set of strokes to a portable JSON project clip for sharing/importing.
title: "Export Selected Strokes to Project File"
labels: enhancement, frontend, small
---

## Description

Enable selecting a set of strokes (marquee or by id) and export them as a portable JSON `.resproj` file that can be imported into another room.

## Current workflow

- Users can request canvas level exports, but there is no selection export feature.

## Proposed solution

- Implement selection (bounding-box) and an export flow that packages selected strokes into a JSON project file. Provide an import flow to paste the clip into another room with remapped IDs.

## Technical requirements

Files to create:
- `frontend/src/components/Export/SelectionExport.jsx`

Files to modify:
- `frontend/src/components/Canvas.js` (selection UI and export trigger)
- `frontend/src/utils/exporters/projectSerializer.js` (serialize/deserialize)

Skills: React, file downloads (Blob), serialization

Difficulty: Easy → Intermediate

## Key features

- Select strokes (bounding-box)
- Export `.resproj` JSON with stroke metadata and optional thumbnails
- Import into another room with ID remapping and placement options

## Technical challenges

- Avoid ID collisions on import (remap IDs)
- Respect private/secure room rules (disallow export if strokes are encrypted)

## Getting started

1. Implement selection bounding-box in `Canvas`
2. Serialize selected strokes into JSON and trigger download
3. Implement import UI to accept `.resproj` files and insert strokes

## Tests to add

- Unit: serializer round-trip
- Integration: import into room produces expected strokes

## Labels

enhancement frontend small
