---
name: Image Import & Raster Placement
about: Allow users to import PNG/JPEG images and insert them onto the canvas as transformable raster items.
title: "Image Import & Raster Layer (Import PNG/JPEG)"
labels: enhancement, frontend, medium
---

## Description

Allow users to import an image (PNG/JPEG) and insert it onto the canvas as a raster item with basic transform controls (move/scale/rotate).

## Current workflow

- Users can draw but cannot import or place external images onto the canvas.

## Proposed solution

- Add an `ImageImporter` dialog to upload image files (client-side only). The image becomes an item with an id that can be moved and removed on the canvas. Persist placement metadata as stroke-like assets when saving to server.

## Technical requirements

Files to create:
- `frontend/src/components/Import/ImageImporter.jsx`

Files to modify:
- `frontend/src/components/Canvas.js` (handle image item rendering and transform handles)
- `frontend/src/lib/drawing.js` (represent imported-image items)
- `frontend/src/services/canvasBackendJWT.js` (optional: extend `postStroke` to support image metadata)

Skills needed: React, Canvas drawImage, FileReader API, transform UX

Difficulty: Intermediate

## Key features

- Import images via file input or drag-drop
- Place image, move/scale/rotate with simple handles
- Persist placement metadata to server as asset
- Basic crop/remove operations

## Technical challenges

- Large images: implement client-side resizing to save memory
- Decide on binary persistence strategy (direct upload vs base64 metadata)

## Getting started

1. Add `ImageImporter` that reads file and creates an in-memory Image
2. Add simple place/transform modes in `Canvas.js` for the image item
3. Persist placement metadata when user commits or on autosave

## Tests to add

- Unit: image importer reads file to data URL
- UI: imported image draggable and resizable

## Labels

enhancement frontend medium
