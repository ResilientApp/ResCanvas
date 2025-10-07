# ResCanvas — Complete README

This document is a comprehensive, developer-oriented reference for ResCanvas: what it does, how it works, how to run it, and every major implementation detail you’ll need to develop, operate, or extend the system.

> **Audience:** maintainers, new developers, SREs, and any contributor who wants to understand internals (API, crypto, data model, deployment, operational considerations).

---

# Overview

ResCanvas is a collaborative drawing application with room-scoped access control, optional end-to-end encryption, and durable persistence backed by Redis, MongoDB and ResilientDB (via GraphQL). It offers both modern room-based APIs and legacy global endpoints for backwards compatibility.

Key goals:
- Real-time collaborative drawing UX (client-side canvas + stroke model).
- Room-based access control with optional per-room encryption.
- Per-user undo/redo semantics, room-scoped undo stacks, and reliable persistence.
- Strong server-side protections and optional cryptographic signing for authoritative workflows.

---

# Features (at a glance)

- User authentication (JWT).
- Room lifecycle: create, list, share, encrypt (private/secure), clear events.
- Stroke submission (room-scoped) with optional Ed25519 signature for secure rooms.
- Per-user undo/redo stacks (scoped either globally or per-room) implemented in Redis.
- Encrypted room content (AES-GCM) with per-room keys wrapped by a master key.
- Persistence: Redis (caching + undo stacks + metrics), MongoDB (strokes mirror), ResilientDB (GraphQL commits of canonical markers/transactions).
- Admin endpoints for master-key rotation and introspection.
- GraphQL proxy for local development.
- Benchmark tools and metrics collection.

---

# Repo layout (top-level overview)

```
backend/               # Flask backend, routes, services, tests
  app.py               # main Flask app - registers blueprints
  routes/              # HTTP route handlers (rooms, auth, strokes, undo/redo, admin...)
  services/            # DB, GraphQL integration, crypto helpers
  tests/               # pytest tests for server logic
  graphql_proxy.py     # simple proxy to upstream GraphQL server (optional)
frontend/              # React client
  src/                 # UI components, canvas logic, API wrappers
  .env.example         # frontend env example (REACT_APP_API_BASE)
docs/                  # generated OpenAPI & API guides
README-ResCanvas-Complete.md  # this file
```

---

# Requirements and prerequisites

- Python 3.10+ (backend)
- Node.js 18+ (frontend)
- Redis (default `localhost:6379` for dev)
- MongoDB (Atlas recommended for production)
- Optional: ResilientDB GraphQL endpoint (for transaction commits) — the GraphQL proxy is provided for local development.

Local dev machine RAM/CPU: modest (single-node). Production deployment should use separate Redis and Mongo instances and a container/orchestration platform (k8s, Docker Compose, etc.).

---

# Environment variables (backend)

Place these in `backend/.env` (copy from `.env.example`), and **do not** commit secrets.

- `MONGO_ATLAS_URI` / `MONGO_URI` — MongoDB connection string (Atlas or local).
- `RES_DB_BASE_URI` — ResilientDB REST base (used by some flows). Example: `https://resilient.example/v1`.
- `RESILIENTDB_GRAPHQL_URI` — GraphQL endpoint for ResilientDB (used by GraphQL commits and optional proxy).
- `SIGNER_PUBLIC_KEY` — hex public key used for signing operations with ResilientDB (or for transaction metadata).
- `SIGNER_PRIVATE_KEY` — corresponding hex private key (keep secret!).
- `RECIPIENT_PUBLIC_KEY` — recipient key used in some GraphQL payloads (often same as signer public key).
- `ROOM_MASTER_KEY_B64` — base64-encoded 32-byte master key used to wrap per-room AES keys (REQUIRED in production; auto-generated in dev fallback).
- `JWT_SECRET` — secret used to sign JWTs (HS256). Keep it secret in production.
- `JWT_ISSUER` — issuer string (default: `rescanvas`).
- `JWT_EXPIRES_SECS` — token expiry seconds (default: `1209600` = 14 days).
- Optional vault/Mongo settings keys if you configure secret storage.

**Important:** `ROOM_MASTER_KEY_B64` must be persisted in a secure vault for production. If lost, rooms encrypted under the previous master may be unrecoverable.

---

# Architecture (component-level)

**Frontend**: React + Canvas. The UI is responsible for drawing paths, composing stroke objects (color, lineWidth, pathData, timestamp), and calling backend APIs to persist strokes and fetch changes. The frontend holds a local undo/redo stack but synchronizes undo/redo via server APIs (per-user stacks stored in Redis).

**Backend**: Flask app structured into Blueprints. Key folders:
- `routes/` — HTTP handlers (auth, rooms, strokes, undo/redo, metric endpoints, admin utilities).
- `services/` — helpers for DB (Mongo + Redis), GraphQL commits, crypto (wrap/unwarp, AES-GCM), and counters.

**Persistence & cache**:
- **Redis**: undo/redo stacks (`<roomId>:<userId>:undo` / `<roomId>:<userId>:redo`), clear timestamps (keys like `clear-canvas-timestamp` / `clear-canvas-timestamp:<roomId>`), and lightweight metrics (`rescanvas:metrics:latest`) and counters (`res-canvas-draw-count`).
- **Mongo**: canonical strokes mirror, rooms, users, shares, settings collections. Indexes are created on important fields (`username` unique, `roomId` + `ts` for strokes, `ownerId`/`type` for rooms, etc.).
- **ResilientDB (GraphQL)**: important markers are committed to provide canonical history and off-chain backup/mirroring.

**Cryptography**:
- Per-room encryption: AES-GCM (32-byte key) used to encrypt stroke payloads for `private` and `secure` rooms. The per-room AES key is wrapped using the master key and stored as `{ "nonce": "b64", "ct": "b64" }`.
- Secure rooms: require an Ed25519 signature for each stroke. Server verifies a canonical JSON message before accepting the stroke.

---

# Data model (documents)

These are the key Mongo collections and the shape of documents (examples):

**users**
```json
{
  "_id": ObjectId("..."),
  "username": "alice",
  "pwd": "<bcrypt hash>",
  "walletPubKey": "<hex, optional>",
  // ...metadata
}
```

**rooms**
```json
{
  "_id": ObjectId("..."),
  "name": "Design Sync",
  "ownerId": "<user ObjectId string>",
  "type": "public" | "private" | "secure",
  "wrappedKey": { "nonce": "b64", "ct": "b64" } // for private/secure
}
```

**strokes** (mirror)
```json
{
  "_id": ObjectId("..."),
  "roomId": "6710f...",
  "user": "alice",
  "color": "#000000",
  "lineWidth": 2,
  "pathData": [[x,y],[x,y],...],
  "ts": 1730412345678,
  // When encrypted, `blob` field holds {'nonce':b64,'ct':b64}
}
```

**shares**
```json
{ "roomId": "...", "userId": "..." }
```

**settings**
- Persistent settings, including stored `room_master_key_b64` if Vault is not used.

---

# API reference (explanatory; full curl + examples)

Below each endpoint is described as: purpose, auth, request shape, response shape, and examples.

> NOTE: This document aims to be exhaustive. Use the `docs/openapi.generated.yaml` if you want a machine-readable spec (Swagger/Postman import).

## Auth endpoints

### `POST /auth/register`
**Purpose:** Create a user account.
**Auth:** none
**Request** (JSON)
```json
{ "username":"alice", "password":"secret", "walletPubKey":"<hex, optional>" }
```
**Response**
```json
{ "status": "ok", "token": "<JWT>" }
```
**Example** (curl)
```bash
curl -X POST http://localhost:10010/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"secret"}'
```

**Client notes**: Store the JWT in `localStorage` or secure cookie. Use `Authorization: Bearer <JWT>` header for authenticated routes.

---

### `POST /auth/login`
**Purpose:** Authenticate and issue JWT.
**Auth:** none
**Request**
```json
{ "username":"alice", "password":"secret" }
```
**Response**
```json
{ "status": "ok", "token": "<JWT>" }
```

**Client example (JS)**
```js
const res = await fetch(`${API_BASE}/auth/login`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ username, password })
});
const j = await res.json();
localStorage.setItem('token', j.token);
```

---

## Room endpoints (auth required)

### `POST /rooms`
**Purpose:** Create a new room.
**Auth:** Bearer token required
**Request**
```json
{ "name": "Design Sync", "type": "public" }
```
**Behavior:**
- If `type` is `private` or `secure`, server generates a random 32-byte per-room AES key, wraps it with the master `ROOM_MASTER_KEY_B64`, and stores the wrapped result in `rooms.wrappedKey`.

**Response (example)**
```json
{ "status":"ok", "room": { "id":"<roomId>", "name":"Design Sync", "type":"private" } }
```

**Client example**
```js
await apiFetch('/rooms', { method: 'POST', body: JSON.stringify({ name:'X', type:'private' }) });
```

---

### `GET /rooms`
**Purpose:** List rooms owned or shared to the user.
**Auth:** Bearer token
**Response**
```json
{ "status":"ok", "items": [ {"id":"...","name":"...","type":"private"} ] }
```

---

### `POST /rooms/{roomId}/share` (owner only)
**Purpose:** Share a room with other users.
**Auth:** Bearer token (owner only)
**Request**
```json
{ "usernames": ["bob","charlie"] }
```
**Response**
```json
{ "status":"ok" }
```

---

## Strokes

### `POST /rooms/{roomId}/strokes`
**Purpose:** Submit a stroke to a room. The stroke will be stored and (for private/secure) encrypted.
**Auth:** Bearer token

**Example stroke payload**
```json
{
  "stroke": {
    "color":"#000000",
    "lineWidth":2,
    "pathData":[[10,10],[42,42]],
    "timestamp": 1730412345678
  },
  "signature": "<hex>",
  "signerPubKey": "<hex>"
}
```

**Server responsibilities**
- Validate JWT and membership in the room.
- Validate signature (for `secure` rooms) using Ed25519 and canonical JSON.
- If `private`/`secure`, encrypt stroke payload using per-room AES-GCM (key is unwrapped from `rooms.wrappedKey`).
- Persist a mirror document in Mongo; push undo stacks in Redis; commit certain markers/transactions to ResilientDB GraphQL if configured.

**Response**
```json
{ "status":"success", "message":"Line submitted successfully" }
```

**cURL example**
```bash
curl -X POST http://localhost:10010/rooms/<roomId>/strokes \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"stroke":{"color":"#000","lineWidth":2,"pathData":[[10,10],[42,42]]}}'
```

**Notes on signature**
- The server canonicalizes the data with `json.dumps(..., separators=(",", ":"), sort_keys=True).encode()` and verifies with Ed25519.
- **JS signing example** (tweetnacl + hex helpers):
```js
import nacl from 'tweetnacl';
import { encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

function toHex(u8){ return Array.from(u8).map(b=>b.toString(16).padStart(2,'0')).join(''); }
function fromHex(hex){ const bytes=new Uint8Array(hex.length/2); for(let i=0;i<bytes.length;i++) bytes[i]=parseInt(hex.substr(i*2,2),16); return bytes; }

const message = JSON.stringify({ roomId, user:username, color, lineWidth, pathData, timestamp }, Object.keys(obj).sort(), 0);
const msgBytes = decodeUTF8(message);
const signature = nacl.sign.detached(msgBytes, secretKeyUint8Array);
const signatureHex = toHex(signature);
```

(Important: you must build exactly the same canonical JSON as server.)

---

### `GET /rooms/{roomId}/strokes`
**Purpose:** Retrieve strokes for a room, decrypted server-side for private/secure rooms.
**Auth:** Bearer token (user must have access)

**Response**
```json
{ "status":"ok", "items": [ /* stroke objects (decrypted if needed) */ ] }
```

**Notes**
- The server respects clear markers (see Clear endpoints) and uses `ts` ordering for clients to replay strokes.

---

## Undo / Redo / Clear

### `POST /rooms/{roomId}/undo` and `/redo`
**Purpose:** Per-user undo/redo.
**Auth:** Bearer token

**Semantics**:
- Server maintains Redis lists:
  - Per-room per-user undo: `${roomId}:${userId}:undo`
  - Per-room per-user redo: `${roomId}:${userId}:redo`
- For legacy global undo/redo, keys are `${userId}:undo` and `${userId}:redo`.
- `undo` pops last stroke for the user and publishes a marker so `GET` endpoints ignore it; it also persists a marker to ResilientDB/Mongo.

**Response**
```json
{ "status": "ok" }
```

### `POST /rooms/{roomId}/clear`
**Purpose:** Mark a clear timestamp for a room.
**Auth:** Bearer token (room owner/member as implemented)

**Behavior**:
- Sets Redis keys: `clear-canvas-timestamp` and a per-room legacy key like `clear-canvas-timestamp:<roomId>` or similar, so subsequent reads filter to `ts > clearAfter`.
- Optionally persists a marker to ResilientDB for recovery.

**Response**
```json
{ "status": "ok" }
```

---

## Legacy endpoints (back-compat)

- `POST /submitNewLine` — legacy stroke submission; keep for older clients but prefer new room endpoints.
- `POST /undo` / `POST /redo` — legacy per-user global stacks.
- `GET /getCanvasData` & `GET /getCanvasDataRoom` — legacy fetch endpoints that respect clear markers. Prefer `GET /rooms/{roomId}/strokes`.

If you maintain clients, plan a migration to the room-specific APIs.

---

## Admin & metrics

### `GET /metrics`
- Returns latest benchmark metrics (Redis-backed).

### `POST /runBenchmarks`
- Run the benchmark runner to collect current performance metrics.

### `POST /admin/rotate-room-master`
**Purpose:** Rewrap all per-room keys from an old master key to a new master key.
**Request**
```json
{ "oldMasterB64": "<old>", "newMasterB64": "<optional new>" }
```
**Careful**: if you lose the old master key and you have rooms encrypted with it, you cannot rewrap those rooms—those rooms become unrecoverable.

---

## GraphQL (ResilientDB) integration

The backend uses a GraphQL mutation to commit transactions to ResilientDB; the mutation name is `PostTransaction` with a `PrepareAsset` input. This is used to persist canonical markers such as `res-canvas-draw-count` and per-stroke markers used for recovery.

**Sample GraphQL body**
```json
{ "query": "mutation PostTransaction($data: PrepareAsset!) { postTransaction(data: $data) { id } }", "variables": { "data": { /* PrepareAsset payload */}}}
```

**Local dev**: use `graphql_proxy.py` to forward `/graphql` to the upstream GraphQL server. The proxy simply streams the upstream response.

---

# Crypto & signing details (deep dive)

## Per-room encryption (AES-GCM)
- Keys: random 32 bytes (server-generated for `private` & `secure` rooms).
- Encrypt: `AESGCM(room_key).encrypt(nonce, plaintext, None)` where `nonce` is 12 random bytes.
- Store: `{ "nonce": base64(nonce), "ct": base64(ciphertext) }` (store as `wrapped` or `blob` in Mongo depending on flow).
- Wrap the per-room key with the master using an AEAD (or the system’s wrap function) and store the wrapped blob in room document.

## Master key
- Name: `ROOM_MASTER_KEY_B64` (base64 32 bytes). Prefer storing in Vault (HashiCorp, AWS Secrets Manager) in production.

## Signature verification (secure rooms)
- Client signs **canonical JSON** produced with `sort_keys=True` and separators `(',', ':')` (no whitespace) — this ensures deterministic canonicalization.
- Server verifies using PyNaCl (`VerifyKey`) and rejects on failure.
- **Canonicalization must be identical** between client and server. Use the provided example code.

## Example: verify in Python (server-side)
```py
import nacl.signing, nacl.encoding
vk = nacl.signing.VerifyKey(pubkey_hex, encoder=nacl.encoding.HexEncoder)
msg = json.dumps({"roomId":..., "user":..., "pathData":..., "timestamp":...}, separators=(',', ':'), sort_keys=True).encode()
vk.verify(msg, bytes.fromhex(signature_hex))
```

## Example: sign in JS with `tweetnacl`
```js
import nacl from 'tweetnacl';
import {decodeUTF8, encodeUTF8} from 'tweetnacl-util';

function canonical(obj){ return JSON.stringify(obj, Object.keys(obj).sort(), 0); }
const message = canonical({roomId, user, color, lineWidth, pathData, timestamp});
const sig = nacl.sign.detached(decodeUTF8(message), secretKeyUint8Array);
const hexSig = Array.from(sig).map(b=>b.toString(16).padStart(2,'0')).join('');
```

---

# Redis key conventions and semantics

(These are the canonical patterns used in the backend code.)

- **Per-room per-user undo**: `${roomId}:${userId}:undo` — Redis list (LPUSH for pushes).
- **Per-room per-user redo**: `${roomId}:${userId}:redo` — Redis list.
- **Legacy global undo**: `${userId}:undo` and `${userId}:redo`.
- **Clear markers**: `clear-canvas-timestamp` (global), and `clear-canvas-timestamp:<roomId>` for room-scoped clears — storing ms timestamps.
- **Counters**: `res-canvas-draw-count` — kept in Redis and optionally persisted to ResilientDB.
- **Metrics**: `rescanvas:metrics:latest` — serialized benchmark results.

**Operational note:** Redis is used as the source of truth for undo stacks; if Redis is flushed (FLUSHALL), the app still recovers strokes from Mongo and can re-synchronize counts/markers when GraphQL/Mongo mirrors exist — but a flush will remove per-user stacks until re-built.

---

# Tests

Backend tests live under `backend/tests/`. Run them with:
```bash
cd backend
pytest -q
```

There are unit tests for canvas counter, transaction flows, and submitNewLine behavior. Add tests for new routes and add integration tests for auth + rooms.

---

# Local development & debugging

1. `cp backend/.env.example backend/.env` and populate values.
2. Start Redis and Mongo locally (or point to cloud instances via env vars).
3. Start backend:
```bash
cd backend
python app.py    # dev (debug=True), serves on :10010
```
4. Start GraphQL proxy if using GraphQL integration locally:
```bash
python graphql_proxy.py  # serves on :9000 and proxies to configured GRAPHQL_URL
```
5. Start frontend with `npm start` in `frontend/` (set `REACT_APP_API_BASE` if needed).

**Common issues & fixes**
- `redis.exceptions.ConnectionError`: Redis not running on localhost:6379 — start Redis or set correct host/port in `services/db.py`.
- `pymongo.errors.ServerSelectionTimeoutError`: Mongo not reachable — check `MONGO_URI`.
- JWT auth 401s: verify `JWT_SECRET` match across env and tokens; confirm client sends `Authorization: Bearer <token>` header.
- Signature verification fails: ensure client uses canonical JSON with `sort_keys=True` and separators `(',',':')` and the exact fields used by server.
- Missing `ROOM_MASTER_KEY_B64`: backend generates an ephemeral one for dev, but production must provide it.

---

# Frontend integration & decoupling (step-by-step)

**Current status (from codebase analysis):** several frontend files hard-code backend base URLs (e.g., `frontend/src/api/auth.js`, `frontend/src/api/rooms.js`, `frontend/src/canvasBackend.js`). This couples the UI to `http://127.0.0.1:10010` for dev.

**Goal:** centralize base URL and create a small API client library used by every module.

**Steps (recommended)**
1. Create `frontend/src/api/client.js` with an `API_BASE` exported from `process.env.REACT_APP_API_BASE || 'http://localhost:10010'` and helper `apiFetch(path, opts)` which always sets `Content-Type` and `Authorization` header if token present.
2. Replace all `fetch('http://127.0.0.1:10010/...')` calls with `apiFetch('/...')`.
3. Add `frontend/.env.example` with `REACT_APP_API_BASE=http://localhost:10010`.
4. Remove other hard-coded URL constants and ensure tests pass.

**Minimal client example** (repeatable):
```js
export const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:10010';
export async function apiFetch(path, init={}){
  const headers = { 'Content-Type':'application/json', ...(init.headers||{}) };
  const token = localStorage.getItem('token');
  if(token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, { ...init, headers });
  const json = await res.json().catch(()=> ({}));
  if(!res.ok) throw new Error(json.message||res.statusText);
  return json;
}
```

**Why it matters:** centralizing the base URL enables different deployments (staging/production) by setting `REACT_APP_API_BASE` and avoids code changes.

---

# Production considerations

**Deployment architecture**
- Serve backend behind a reverse proxy (Nginx), use gunicorn with multiple workers, or a WSGI server appropriate for Flask. Example:
  - `gunicorn -w 4 app:app -b 0.0.0.0:10010`
- Use HTTPS and terminate TLS at the reverse proxy.
- Redis & Mongo should be external managed services (e.g., Redis Cluster, Mongo Atlas) for persistence & HA.
- Consider running GraphQL commits on a separate worker process if commit volume is high.

**Scaling & performance**
- The critical path is stroke submission throughput. Measure and tune `pipelines`: reduce synchronous GraphQL commits in the hot path if they cause latency — consider asynchronous commit via a background worker and publish acknowledgements to client immediately.
- Redis memory: maintain list sizes (undo stacks) limits to avoid runaway memory use — consider trimming lists on push (LTRIM) or restricting history depth per user.
- Mongo indexing: ensure `strokes` has index on `{ roomId:1, ts:1 }` for efficient reads.

**Monitoring & backups**
- Enable Redis persistence (RDB/AOF) and monitor memory usage / eviction.
- Ensure Mongo backups (Atlas snapshots) are configured.
- Log critical GraphQL failures and have alerting (e.g., Sentry integration or Prometheus + Grafana for metrics) for high error rates.

**Security**
- Protect `SIGNER_PRIVATE_KEY` and `ROOM_MASTER_KEY_B64` in a vault.
- Use HTTPS for frontend/backends and for GraphQL endpoint.
- Rate-limit endpoints to prevent abuse.
- Configure CSP on frontend hosting and secure cookie flags if you use cookies for auth.

---

# Troubleshooting checklist

- `503` / `connection refused` -> check Nginx/reverse proxy and gunicorn processes.
- Auth failures -> inspect `JWT_SECRET` and token expiry.
- `Invalid signature` errors on secure rooms -> ensure client canonicalizes exactly the same JSON and signs with the correct private key.
- Undo/Redo unexpectedly lost -> check for Redis FLUSH events or server restarts; ensure Redis persistence is enabled, and consider upgrading to Redis Cluster for production.
- GraphQL commits failing -> check `RESILIENTDB_GRAPHQL_URI` and `SIGNER_PRIVATE_KEY` configured and that GraphQL proxy (if used) can reach upstream.

---

# Developer notes & guidelines

- When adding routes, update `docs/openapi.generated.yaml` (or regenerate the docs) and add tests under `backend/tests/`.
- Keep crypto code centralized in `services/crypto_service.py` and avoid duplicating logic.
- For any client-side changes to canonical signing, add an automated test that signs a canonical JSON and verifies server acceptance.
- When making changes that affect the undo/redo stack semantics, update both server and frontend logic carefully—undo/redo is sensitive to order and marker persistence.

---

# Maintenance & runbooks (short)

**Rotate master key (runbook)**
1. Ensure you have `oldMasterB64` available (from Vault or a secure copy).
2. POST `/admin/rotate-room-master` with `oldMasterB64` and optionally `newMasterB64`.
3. Monitor the `roomsRewrapped` and `errors` fields in response. Investigate rooms with rewrap failures; manual recovery may be needed.

**Recover after Redis flush**
1. If Redis lost undo/redo stacks, the application can reconstruct canonical stroke list from Mongo.
2. Recompute counters from Mongo or ResilientDB commit logs and re-populate Redis keys (`res-canvas-draw-count`) if needed.

---

# Example end-to-end (sequence)

1. `POST /auth/register` → obtain token.
2. `POST /rooms` (type `private`) → receive `roomId`.
3. Client keeps local stroke list and sends `POST /rooms/{roomId}/strokes` for each stroke.
4. Server stores strokes (encrypted), pushes to redis undo stack: `${roomId}:${userId}:undo`, and persists mirror to Mongo.
5. Another client polls `GET /rooms/{roomId}/strokes` (or uses a socket/sync mechanism) to update UI.
6. User hits Undo → `POST /rooms/{roomId}/undo` → server pops undo stack, sets a marker, and returns status.

---

# Where to start for new devs

1. Read this README. Open `backend/app.py` and step through blueprint registration.
2. Run locally with local Redis & Mongo; confirm `python app.py` starts on :10010.
3. Use the provided `frontend/src/api` call sites to understand UX flows and draw a quick stroke from the browser while watching backend logs.
4. Add a small unit test in `backend/tests` that creates a user, logs in, creates a room, and posts a stroke—run `pytest`.

---

# Final notes & next steps

- This document is intended to be a complete single-source reference for the codebase as currently implemented. If you want, I can (a) produce a smaller quick-reference cheat-sheet, (b) produce a `CONTRIBUTING.md` focusing on PR & code style rules, or (c) refactor the frontend to fully remove the remaining hard-coded URL usages and generate a patched zip.

If you want me to copy this into `backend/README.md` or commit an updated file in a branch, tell me which path and I will produce a downloadable `.md` file ready to add to your repo.

---

*End of README*

