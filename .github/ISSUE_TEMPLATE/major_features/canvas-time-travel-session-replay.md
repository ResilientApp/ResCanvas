---
name: "Canvas Time-Travel / Session Replay"
about: "Add time-lapse replay, scrubbing, and exportable recording."
title: "Canvas Time-Travel / Session Replay (Playback and Exportable Recording)"
labels: ["enhancement", "frontend", "backend", "media", "export", "help wanted"]
---

### Description
Allow users to replay a canvas session as a time-lapse animation, scrub through history, and export the replay as an animated GIF / MP4. This greatly improves collaboration awareness and provides a “how it was made” export.

### Current Workflow
- Users can view current canvas or request history slices, but there's no replay UI or scrubbable time-travel player.

### Proposed Solution
Add a "Replay" player that requests strokes for a room in a time range (server-side support for ranged stroke queries exists in `rooms.get_strokes`), plays them in order with adjustable speed, provides scrub bar, and exports animation to GIF/MP4 client-side (or server-side fallback for very large canvases).

### Technical Requirements
#### Files to Create:
- `frontend/src/components/Replay/ReplayPlayer.jsx`
- `frontend/src/components/Replay/ReplayControls.jsx`
- `frontend/src/utils/replayExporter.js` (GIF/MP4 generation helpers / worker)

#### Files to Modify:
- `Room.jsx` (add "Replay" entry / button)
- `Canvas.js` (add a "playback" mode for rendering strokes sequentially)

#### Backend Enhancements (optional for server-side export or streaming):
- `backend/routes/replay_export.py` (endpoint `POST /rooms/:id/replay/export` to request server-side export for very large sessions)
- `backend/services/video_export_worker.py` (background worker - e.g., using imageio + ffmpeg)

### Skills Needed
- React + canvas animation
- Timing & deterministic replay (ordering/stable timestamps)
- Client-side GIF/MP4 generation (workers) or server-side image/ffmpeg pipelines

### Difficulty
Intermediate → Advanced (if server-side export added)

### Key Features to Implement
- Scrubbable player UI with speed multiplier (0.25x - 4x)
- Live metadata overlay (who drew each stroke and timestamp)
- Export to animated GIF (client-side) and optional server-side MP4 for long sessions
- Seamless fallbacks if backend cannot export large files
- Bookmark/share links to specific replay timestamps

### Technical Challenges
- Memory/performance when loading many strokes
- Deterministic rendering across clients (canvas coordinate normalization)
- Exporting long-duration replays (size vs fidelity tradeoffs)

### Getting Started
1. Add a small prototype `ReplayPlayer` that fetches strokes with start/end via `GET /rooms/:id/strokes?start=...&end=...`
2. Implement time-sequencing logic and basic controls
3. Add client-side GIF exporter using a WebWorker and a library (gif.js or gif-encoder via wasm)
4. Optionally add server-side export path for heavy jobs

### Tests to Add
- **Unit**: replay sequencer orders strokes correctly based on `ts`
- **Integration**: export small sequence → resulting GIF contains expected frames
- **UI**: scrub bar (seek to timestamp X shows strokes up to X)

### Resources
- gif.js, ccapture.js, ffmpeg for server-side export