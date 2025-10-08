---
name: Rate Limiting for Posting Strokes
about: Add lightweight per-user per-room rate limiting to prevent spam/flooding of strokes.
title: "Rate Limiting & Abuse Controls for Posting Strokes"
labels: security, backend, medium
---

## Description

Add light-weight rate limiting per-user per-room for posting strokes to mitigate spam or accidental flood. Allow owners to configure limits per room.

## Current workflow

- There are no per-room posting rate controls; clients can spam strokes.

## Proposed solution

- Implement server-side configurable rate limiter on `POST /rooms/:id/strokes` using Redis token-bucket or sliding-window counters. Provide room settings UI to set limits.

## Technical requirements

Files to modify/create:
- `backend/routes/rooms.py` (wrap `post_stroke` with rate limiter check)
- `frontend/src/pages/RoomSettings.jsx` (UI to set limit)
- Use existing Redis client available in backend services

Skills: Redis counters, Flask middleware/route guards, React forms

Difficulty: Easy → Intermediate

## Key features

- Default rate (e.g., 20 strokes per 10s) configurable per room
- Return 429 with Retry-After header when limit exceeded
- Owner/admin override

## Technical challenges

- Defining what counts as a stroke (batched strokes?)
- Avoiding UX impact for legitimate fast drawing (allow burst capacity)

## Getting started

1. Implement Redis token bucket using key `rate:room:{roomId}:user:{userId}`
2. Add error message handling on frontend when receiving 429
3. Add RoomSettings UI to set per-room limit

## Tests to add

- Unit: token bucket behavior (refill, burst)
- Integration: hitting limit returns 429 and prevents POST

## Labels

security backend medium
