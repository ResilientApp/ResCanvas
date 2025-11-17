<p align="center">
  <img width="389" height="91" alt="image" src="https://github.com/user-attachments/assets/24a5606a-988c-43ea-9eee-ab19ed6628be" />
</p>

_**<p align="center">Real-time creativity, backed by decentralized trust and resiliency.</p>**_
**<p align="center">By Henry Chou and Chris Ruan</p>**

# ResCanvas
ResCanvas is a decentralized, real-time collaborative drawing platform built on top of ResilientDB. It provides a modern web-based canvas that supports multi-user drawing, room-based collaboration, secure access controls, and persistent on-chain storage of stroke data.

Unlike traditional drawing tools that store artwork on centralized servers, ResCanvas records all drawing activity as immutable transactions in ResilientDB. This ensures verifiable history, censorship resistance, and transparent data integrity while preserving a responsive user experience.

## Why ResCanvas
Existing cloud drawing tools offer convenience, but rely entirely on centralized infrastructure. Data can be monitored, modified, or removed, and users have no direct control over how their work is stored or shared. Platforms such as Figma, Google Drawings, and Canva offer collaborative features, but they all depend on trust in a single service operator.

ResCanvas addresses these limitations by combining a familiar drawing interface with decentralized storage. Strokes are committed to a fault-tolerant, verifiable transaction ledger, while Redis and MongoDB maintain fast caches for real-time and historical access. The platform supports both public and private rooms, authenticated collaboration, and optional cryptographic signatures for high-trust environments.

## Key Features
- Multi-user real-time drawing with immediate stroke broadcast.
- Room-based collaboration system with access controls.
  - Supports multiple collaboration models:
    - **Public Rooms:** Open access with shared drawing history.
    - **Private Rooms:** Access-limited rooms where strokes may be encrypted.
    - **Secure Rooms:** Require client-side wallet signing (e.g., [ResVault](https://chromewebstore.google.com/detail/resvault/ejlihnefafcgfajaomeeogdhdhhajamf?pli=1)). Each stroke includes a verifiable signature.
- Persistent storage through ResilientDB, ensuring an immutable edit history.
- Redis caching for low-latency updates and undo/redo operations.
- MongoDB warm cache synchronized with the ledger through the `resilient-python-cache` sync bridge service.
- Secure server-side authentication and authorization using JWTs.
  - Backend enforces all membership and permission checks.
- Optional encrypted strokes and user-level cryptographic signing for secure rooms.
- Responsive React frontend styled with Material Design principles.

## Architecture Overview
ResCanvas is composed of four main layers.

### Frontend (React)
The frontend implements the drawing tools, canvas rendering, session state, and real-time updates via Socket.IO. It performs local smoothing and batching of strokes and attaches JWT access tokens to authenticated requests. It does not enforce security logic; validation occurs in the backend.

### Backend (Flask + Socket.IO)
The backend forms the trust boundary of the application:

- Validates JWT tokens and enforces room permissions.
- Receives stroke submissions and commits them to ResilientDB using GraphQL.
- Emits live updates through Socket.IO to all participants in a room.
- Manages undo/redo stacks and caching of data in Redis.
- Handles optional encryption and signature verification for private and secure rooms.

### ResilientDB
ResilientDB is the authoritative ledger. Every stroke is written as a transaction and included in a block after consensus. This provides ordering, immutability, and verifiable authorship for all drawing activity.

### MongoDB & Redis Caching Layer
A lightweight synchronization service (`resilient-python-cache`) listens to ResilientDB block streams, parses new transactions, and mirrors them into MongoDB. This provides a fast and queryable history view. Redis stores ephemeral state such as recent strokes and undo/redo queues.

Because ResilientDB is append-only, certain operations, such as undo and redo actions, are represented as semantic overlays rather than destructive modifications. The backend records these actions into the Redis caching layer and, when required, writes reversible markers to the ledger. Clients then replay strokes based on the authoritative ordering in ResilientDB.

# ResCanvas Setup Guide
This guide provides complete instructions to deploy ResCanvas locally, including setup for the cache layer, backend, and frontend.

## Prerequisites

Before starting, ensure the following dependencies are installed:

- **Python** ≥ 3.10 and ≤ 3.12  
- **Node.js** (LTS version via `nvm install --lts`)  
- **npm** (latest version)
- **Redis**
- **MongoDB Atlas** account with a working connection URI

## Step 0: MongoDB Account Setup

1. Go to [https://account.mongodb.com/account/login](https://account.mongodb.com/account/login) and **log in or register**.  
2. Create a **project** and **cluster** (if not already existing).  
3. Within your cluster, click **Connect → Drivers** and copy the connection string from **Step 3**
4. Keep this MongoDB connection URI for use in later `.env` files.

## Step 1: Clone the Repository

```bash
git clone https://github.com/ResilientApp/ResCanvas.git
cd ResCanvas
```

Check your Python installation:

```bash
python3 --version
```

## Step 2: Resilient Python Cache (First Terminal Window)

This cache layer synchronizes strokes between MongoDB and ResilientDB.

### Setup

```bash
cd backend/incubator-resilientdb-resilient-python-cache/
pip install resilient-python-cache
```

Create a `.env` file in this directory with the following content
(replace everything between brackets):

```
MONGO_URL = "[URI_COPIED_FROM_MONGODB_CONNECTION]"
MONGO_DB = "canvasCache"
MONGO_COLLECTION = "strokes"
```

### Start the Cache Service

```bash
python3 example.py
```
This starts a MongoDB caching service that syncs data with ResilientDB via the `resilientdb://crow.resilientdb.com` endpoint defined in `cache.py`.

## Step 3: Backend Setup (Second Terminal Window)

The backend handles authentication, REST APIs, and interfaces with ResilientDB.

### Create Virtual Environment & Install Dependencies

```bash
cd backend/
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Generate Keys

```bash
python gen_keys.py
```

Copy the printed public and private keys.

### Create .env File

Create a new `.env` under the backend/ folder with the following contents
(replace values between brackets):

```
MONGO_ATLAS_URI=[URI_COPIED_FROM_MONGODB_CONNECTION]
SIGNER_PUBLIC_KEY=[PUBLIC_KEY_COPIED_FROM_GEN_KEYS_PY]
SIGNER_PRIVATE_KEY=[PRIVATE_KEY_COPIED_FROM_GEN_KEYS_PY]
RESILIENTDB_BASE_URI=https://crow.resilientdb.com
RESILIENTDB_GRAPHQL_URI=https://cloud.resilientdb.com/graphql
```

## Step 4: Redis Setup

Redis is required for caching and backend operations.

### macOS (Homebrew)

```bash
brew install redis
brew services start redis
```

### Ubuntu (APT)

```bash
sudo apt-get update
sudo apt-get install -y redis-server
sudo systemctl restart redis.service
```

### Verify Redis

```bash
redis-cli ping
```
Expected output: PONG

### Optional Fix (bcrypt Error)

If you encounter bcrypt issues, run:

```bash
pip install 'passlib>=1.7.4' 'bcrypt>=4.1.2,<5'
```

### Start the Backend

```bash
python app.py
```

## Step 5: Frontend Setup (Third Terminal Window)

The frontend provides the ResCanvas web UI.

```bash
cd frontend/
nvm install --lts
nvm use --lts
npm i -g npm
npm install
npm start
```
The app should now be running at `http://localhost:[...]`

# Important endpoints
- Create/list rooms: POST/GET `/rooms`
- Room details: GET `/rooms/<roomId>`
- Post stroke: POST `/rooms/<roomId>/strokes` (requires auth and room access)
- Get strokes: GET `/rooms/<roomId>/strokes` (works with or without auth but returns membership-scoped data when authenticated)
- Undo/redo/clear: `/rooms/<roomId>/undo`, `/rooms/<roomId>/redo`, `/rooms/<roomId>/clear`

## Authentication Endpoints
- **Login**: `POST /auth/login` — Validates credentials server-side, returns access token and sets refresh cookie.
- **Refresh**: `POST /auth/refresh` — Issues new access token using the refresh cookie.
- **Logout**: `POST /auth/logout` — Invalidates refresh token and clears cookie.
- **Registration**: `POST /auth/register` — Creates new user account with password hashing.
- **Current User**: `GET /auth/me` — Returns authenticated user's profile (requires valid access token).

For secure rooms (type `secure`) strokes must be signed client-side; the backend validates signatures in `submit_room_line.py`.

# API for External Applications
ResCanvas provides a versioned REST API (`/api/v1/*`) for external applications to integrate collaborative drawing functionality. This generalized API layer allows developers to build third-party apps, mobile clients, integrations, and automation tools on top of ResCanvas.

## Canvas API Features

**Canvas API** (`/api/v1/canvases/*`) - Generic, RESTful canvas management
- Decoupled from frontend-specific terminology
- Consolidated endpoint structure (e.g., `/history/*` for undo/redo operations)
- Proper HTTP method semantics (DELETE for clearing, not POST)
- Uses `canvasId` parameter for broader applicability
- **See**: [API_REFERENCE.md](./API_REFERENCE.md) for complete documentation
     
**Consolidated History Operations**:
- `/api/v1/canvases/{canvasId}/history/undo` - Undo last action
- `/api/v1/canvases/{canvasId}/history/redo` - Redo action
- `/api/v1/canvases/{canvasId}/history/status` - Get undo/redo status
- `/api/v1/canvases/{canvasId}/history/reset` - Reset history
- `DELETE /api/v1/canvases/{canvasId}/strokes` - Clear canvas (RESTful)

**Proper HTTP Method Usage**:
- DELETE for clearing strokes
- PATCH for updates, DELETE for removals

## Versioned API Endpoints
All API v1 endpoints are prefixed with `/api/v1` as shown below.

**Authentication** (`/api/v1/auth/*`):
- `POST /api/v1/auth/register` — Register new user
- `POST /api/v1/auth/login` — Login and obtain JWT token
- `POST /api/v1/auth/refresh` — Refresh access token
- `POST /api/v1/auth/logout` — Logout and invalidate tokens
- `GET /api/v1/auth/me` — Get current user info
- `POST /api/v1/auth/change-password` — Change password

**Canvases** (`/api/v1/canvases/*`):
- `POST /api/v1/canvases` — Create new canvas
- `GET /api/v1/canvases` — List accessible canvases
- `GET /api/v1/canvases/{id}` — Get canvas details
- `PATCH /api/v1/canvases/{id}` — Update canvas settings
- `DELETE /api/v1/canvases/{id}` — Delete canvas
- `POST /api/v1/canvases/{id}/strokes` — Add stroke to canvas
- `GET /api/v1/canvases/{id}/strokes` — Get all canvas strokes
- `DELETE /api/v1/canvases/{id}/strokes` — Clear canvas
- `POST /api/v1/canvases/{id}/history/undo` — Undo last stroke
- `POST /api/v1/canvases/{id}/history/redo` — Redo undone stroke
- `GET /api/v1/canvases/{id}/history/status` — Get undo/redo status
- `POST /api/v1/canvases/{id}/history/reset` — Reset history
- `POST /api/v1/canvases/{id}/share` — Share canvas with users
- `GET /api/v1/canvases/{id}/members` — Get canvas members
- `POST /api/v1/canvases/{id}/leave` — Leave shared canvas
- `POST /api/v1/canvases/{id}/invite` — Invite users to canvas

**Collaboration** (`/api/v1/collaborations/*`):
- `GET /api/v1/collaborations/invitations` — List pending invitations
- `POST /api/v1/collaborations/invitations/{id}/accept` — Accept invitation
- `POST /api/v1/collaborations/invitations/{id}/decline` — Decline invitation

**Notifications** (`/api/v1/notifications/*`):
- `GET /api/v1/notifications` — List notifications
- `POST /api/v1/notifications/{id}/mark-read` — Mark as read
- `DELETE /api/v1/notifications/{id}` — Delete notification
- `DELETE /api/v1/notifications` — Clear all notifications
- `GET /api/v1/notifications/preferences` — Get preferences
- `PATCH /api/v1/notifications/preferences` — Update preferences

**Users** (`/api/v1/users/*`):
- `GET /api/v1/users/search?q={query}` — Search users
- `GET /api/v1/users/suggest` — Get user suggestions

## Testing the API
Comprehensive test suites are available as well:

```bash
# Backend API v1 tests (Canvas API)
cd backend
pytest tests/test_api_v1_canvases.py -v

# All API v1 tests
pytest tests/test_api_v1*.py -v
```

## Quick Example: Canvas API
```bash
# Login
TOKEN=$(curl -X POST http://localhost:10010/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}' \
  | jq -r '.token')

# Create canvas
CANVAS_ID=$(curl -X POST http://localhost:10010/api/v1/canvases \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Canvas","type":"public"}' \
  | jq -r '.room.id')

# Add stroke
curl -X POST http://localhost:10010/api/v1/canvases/$CANVAS_ID/strokes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stroke": {
      "drawingId": "stroke-123",
      "color": "#FF0000",
      "lineWidth": 3,
      "pathData": [{"x":10,"y":20},{"x":30,"y":40}],
      "timestamp": 1704067200000,
      "user": "alice"
    }
  }'

# Get strokes
curl -X GET http://localhost:10010/api/v1/canvases/$CANVAS_ID/strokes \
  -H "Authorization: Bearer $TOKEN"

# Undo last action
curl -X POST http://localhost:10010/api/v1/canvases/$CANVAS_ID/history/undo \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Clear canvas
curl -X DELETE http://localhost:10010/api/v1/canvases/$CANVAS_ID/strokes \
  -H "Authorization: Bearer $TOKEN"
```

## Contributing to the API
We welcome contributions! The API layer is designed to be extended with new endpoints. Please see `CONTRIBUTING.md` for guidelines before you start.

# Key configuration (backend)
See `backend/config.py` and set the following environment variables as appropriate (examples shown in the repository's `.env` usage):
- `MONGO_ATLAS_URI` / `MONGO_URI` — MongoDB connection string
- `JWT_SECRET` — HMAC secret for signing access tokens
- `ACCESS_TOKEN_EXPIRES_SECS`, `REFRESH_TOKEN_EXPIRES_SECS` — token lifetimes
- `REFRESH_TOKEN_COOKIE_NAME`, `REFRESH_TOKEN_COOKIE_SECURE`, `REFRESH_TOKEN_COOKIE_SAMESITE`
- `ROOM_MASTER_KEY_B64` — used to (re)wrap room keys for private/secure rooms
- `SIGNER_PUBLIC_KEY`, `SIGNER_PRIVATE_KEY`, `RECIPIENT_PUBLIC_KEY` — used when committing strokes via the GraphQL service

The code loads environment variables via `python-dotenv` in `backend/config.py`.

# Authentication examples (curl):
  - Login to obtain access token (also sets refresh cookie):
    ```
    curl -X POST http://127.0.0.1:10010/auth/login -H "Content-Type: application/json" -d '{"username":"testuser","password":"testpass"}'
  - Post a stroke (replace `<token>` and `<roomId>`):
    ```
    curl -X POST http://127.0.0.1:10010/rooms/<roomId>/strokes -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d '{"drawingId":"d1","color":"#000","lineWidth":3,"pathData":[],"timestamp": 1696940000000}'

# Developer workflows and testing

## Quick Start Testing

ResCanvas has a comprehensive test suite with tests that are covering both the backend and frontend:

```bash
# Fast optimized testing which is recommended for development
./scripts/run_all_tests_parallel.sh --fast

# Full test suite with coverage
./scripts/run_all_tests_parallel.sh

# Tests with sequential script
./scripts/run_all_tests_unified.sh
```

## Test Suite Breakdown

- **Backend Tests** (99 tests):
  - Unit tests: `pytest tests/unit/ -v`
  - Integration tests: `pytest tests/integration/ -v`
  - E2E tests: `pytest tests/test_*.py -v`
  
- **Frontend Unit Tests** (139 tests):
  - Run with Jest: `cd frontend && npm test`
  - Parallel by default (4 workers)
  
- **Frontend E2E Tests** (56 tests):
  - Playwright: `cd frontend && npx playwright test`
  - Tests auth, rooms, collaboration, drawing, error handling

## CI/CD Integration

**GitHub Actions workflows** automatically test every push and PR:

- **Full Test Suite** (`ci-tests.yml`): Matrix testing across Python 3.10/3.11 and Node 20.x/22.x
- **Quick Check** (`ci-quick.yml`): Fast feedback loop for PRs

**CI Setup Notes:**

- **Key Generation**: The workflows automatically run `gen_keys.py` to generate signing keys as per the README setup instructions. This requires `PyNaCl` and `base58` packages (now included in requirements.txt).
- **MongoDB Connection**: In GitHub Actions, the MongoDB service is accessible at hostname `mongodb` (not `localhost`). The workflows use `mongodb://testuser:testpass@mongodb:27017/?authSource=admin`.
- **Environment variable names**: The backend expects `JWT_SECRET` (not `JWT_SECRET_KEY`) and `RES_DB_BASE_URI`/`RESILIENTDB_BASE_URI` for ResilientDB endpoint configuration.
- **Codecov uploads**: If the repository is private, set a `CODECOV_TOKEN` secret in Settings → Secrets → Actions. The workflows skip Codecov upload if the token is not defined.
- **Manual trigger**: Actions → CI - Full Test Suite → Run workflow

# Contributors
* Henry Chou - Team Leader and Full Stack Developer
* Varun Ringnekar - Full Stack Developer
* Chris Ruan - Frontend Developer
* Shaokang Xie - Backend Developer
* Yubo Bai - Frontend Developer
