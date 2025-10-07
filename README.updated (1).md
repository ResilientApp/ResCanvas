# ResCanvas

This README was regenerated from the latest code to reflect the current API and setup.

## What is ResCanvas?
Collaborative drawing with room-scoped encryption and ResilientDB-backed persistence (via GraphQL).

## Repo Layout
```
backend/   # Flask API, Redis/Mongo integrations, GraphQL
frontend/  # React app (Create React App)
docs/      # API docs & OpenAPI spec
```

## Prerequisites
- Python 3.10+
- Node 18+
- Redis (localhost:6379)
- MongoDB (Atlas or local)
- ResilientDB GraphQL endpoint

## Backend Setup
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # then set values
python app.py          # starts on :10010
```
**Required env vars (see `backend/.env.example`):**
- `MONGO_ATLAS_URI` — Mongo connection string
- `RES_DB_BASE_URI` — ResilientDB REST base URL
- `RESILIENTDB_GRAPHQL_URI` — GraphQL URL
- `SIGNER_PUBLIC_KEY`, `SIGNER_PRIVATE_KEY` — for transaction signing
- `JWT_SECRET` — token signing secret
- `ROOM_MASTER_KEY_B64` — 32-byte base64 master; generate for prod

Optional: run the GraphQL proxy (port 9000)
```bash
python graphql_proxy.py
```

## Frontend Setup
```bash
cd frontend
npm install
npm start
```
Set `frontend/.env` if you need a non-default port or API URL.

## API: Start Here
- Human guide: [`docs/API.md`](docs/API.md)
- OpenAPI: [`docs/openapi.generated.yaml`](docs/openapi.generated.yaml)

## Typical Flow
1. **Register/Login** → get JWT.
2. **Create Room** (`public`/`private`/`secure`).
3. **Draw** via `POST /rooms/{roomId}/strokes` with stroke payload.
4. **Undo/Redo/Clear** as needed.
5. **Fetch** via `GET /rooms/{roomId}/strokes`.

## Development Notes
- Undo/redo stacks are per-user in Redis.
- Clear markers are stored in Redis and mirrored to ResilientDB (with Mongo recovery).
- Secure rooms require ed25519 signatures per stroke.
- Encrypted room content is AES-GCM per-room key, wrapped by a master key.

## Contributing
- Write tests in `backend/tests`
- Run lint/format and ensure unit tests pass
- Update `docs/API.md` if endpoints change

## License
Add license details here.


---

## API Route Reference (inline)

### `/admin/master-key`

**GET** — Introspect master key state (non-sensitive)

**Example**
```bash
curl -X GET 'http://localhost:10010/admin/master-key'
```

### `/admin/rotate-room-master`

**POST** — Rewrap room keys with new master

**Request body (application/json)**
```json
{
  "oldMasterB64": "<string>",
  "newMasterB64": "<string>"
}
```
**Example**
```bash
curl -X POST 'http://localhost:10010/admin/rotate-room-master' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### `/auth/login`

**POST** — Login and obtain JWT

**Request body (application/json)**
```json
{
  "username": "<string>",
  "password": "<string>"
}
```
**Example**
```bash
curl -X POST 'http://localhost:10010/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### `/auth/me`

**GET** — Get current user _(auth required)_

**Example**
```bash
curl -X GET 'http://localhost:10010/auth/me'
```

### `/auth/register`

**POST** — Register a new user

**Request body (application/json)**
```json
{
  "username": "<string>",
  "password": "<string>",
  "walletPubKey": "<string>"
}
```
**Example**
```bash
curl -X POST 'http://localhost:10010/auth/register' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### `/getCanvasData`

**GET** — Get canvas data (global)

**Parameters**
- `roomId` (optional, string) — in `query`
- `start` (optional, integer) — in `query`
- `end` (optional, integer) — in `query`
**Example**
```bash
curl -X GET 'http://localhost:10010/getCanvasData'
```

### `/getCanvasDataRoom`

**GET** — Get canvas data for a room

**Parameters**
- `roomId` (required, string) — in `query`
**Example**
```bash
curl -X GET 'http://localhost:10010/getCanvasDataRoom'
```

### `/graphql`

**POST** — Proxy GraphQL to ResilientDB

**Request body (application/json)**
```json
{}
```
**Example**
```bash
curl -X POST 'http://localhost:9000/graphql' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### `/metrics`

**GET** — Get latest metrics

**Example**
```bash
curl -X GET 'http://localhost:10010/metrics'
```

### `/redo`

**POST** — Redo last undone stroke (legacy/global)

**Request body (application/json)**
```json
{
  "userId": "<string>",
  "roomId": "<string>"
}
```
**Example**
```bash
curl -X POST 'http://localhost:10010/redo' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### `/rooms`

**GET** — List my rooms _(auth required)_

**Example**
```bash
curl -X GET 'http://localhost:10010/rooms'
```

**POST** — Create room _(auth required)_

**Request body (application/json)**
```json
{
  "name": "<string>",
  "type": "<string>"
}
```
**Example**
```bash
curl -X POST 'http://localhost:10010/rooms' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer $TOKEN' \
  -d '{}'
```

### `/rooms/{roomId}/clear`

**POST** — Clear strokes in room (marks clear timestamp) _(auth required)_

**Parameters**
- `roomId` (required, string) — in `path`
**Example**
```bash
curl -X POST 'http://localhost:10010/rooms/{roomId}/clear' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer $TOKEN' \
  -d '{}'
```

### `/rooms/{roomId}/redo`

**POST** — Redo last undone stroke (per-user stack) _(auth required)_

**Parameters**
- `roomId` (required, string) — in `path`
**Example**
```bash
curl -X POST 'http://localhost:10010/rooms/{roomId}/redo' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer $TOKEN' \
  -d '{}'
```

### `/rooms/{roomId}/share`

**POST** — Share room with users _(auth required)_

**Parameters**
- `roomId` (required, string) — in `path`
**Request body (application/json)**
```json
{
  "usernames": []
}
```
**Example**
```bash
curl -X POST 'http://localhost:10010/rooms/{roomId}/share' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer $TOKEN' \
  -d '{}'
```

### `/rooms/{roomId}/strokes`

**GET** — Get room strokes _(auth required)_

**Parameters**
- `roomId` (required, string) — in `path`
**Example**
```bash
curl -X GET 'http://localhost:10010/rooms/{roomId}/strokes'
```

**POST** — Add a stroke to a room _(auth required)_

**Parameters**
- `roomId` (required, string) — in `path`
**Request body (application/json)**
```json
{
  "stroke": {},
  "signature": "<string>",
  "signerPubKey": "<string>"
}
```
**Example**
```bash
curl -X POST 'http://localhost:10010/rooms/{roomId}/strokes' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer $TOKEN' \
  -d '{}'
```

### `/rooms/{roomId}/undo`

**POST** — Undo last stroke (per-user stack) _(auth required)_

**Parameters**
- `roomId` (required, string) — in `path`
**Example**
```bash
curl -X POST 'http://localhost:10010/rooms/{roomId}/undo' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer $TOKEN' \
  -d '{}'
```

### `/runBenchmarks`

**POST** — Run benchmarks now

**Request body (application/json)**
```json
{}
```
**Example**
```bash
curl -X POST 'http://localhost:10010/runBenchmarks' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### `/submitClearCanvasTimestamp`

**POST** — Clear canvas (global)

**Request body (application/json)**
```json
{
  "roomId": "<string>",
  "timestamp": 0
}
```
**Example**
```bash
curl -X POST 'http://localhost:10010/submitClearCanvasTimestamp' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### `/submitNewLine`

**POST** — Submit a new line (legacy/global)

**Request body (application/json)**
```json
{ /* see schemas in OpenAPI */ }
```
**Example**
```bash
curl -X POST 'http://localhost:10010/submitNewLine' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

### `/undo`

**POST** — Undo last stroke (legacy/global)

**Request body (application/json)**
```json
{
  "userId": "<string>",
  "roomId": "<string>"
}
```
**Example**
```bash
curl -X POST 'http://localhost:10010/undo' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

---

## Frontend–Backend Decoupling Analysis

**Current state:** The frontend references hard-coded backend base URLs in 5 files:
- `src/Blog.js`
- `src/MetricsDashboard.js`
- `src/canvasBackend.js`
- `src/api/auth.js`
- `src/api/rooms.js`

**Impact:** Hard-coded URLs couple the frontend to a specific host/port, complicate deployment.

**Fix (recommended):**

1. Centralize API base URL in a single module and source from env, e.g. `REACT_APP_API_BASE`.

2. Update all API calls to use the centralized base.

3. Provide `.env.example` entries and README instructions.


**Minimal patch:**

```diff

// frontend/src/api/auth.js
-const API_BASE = "http://127.0.0.1:10010";
+const API_BASE = process.env.REACT_APP_API_BASE || "http://127.0.0.1:10010";

```


Create `frontend/src/api/client.js`:

```js
export const API_BASE = process.env.REACT_APP_API_BASE || "http://127.0.0.1:10010";

export async function apiFetch(path, init={}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init.headers||{}) },
    ...init
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || res.statusText);
  return json;
}
```

Update **frontend/.env.example**:
```
REACT_APP_API_BASE=http://localhost:10010
```

