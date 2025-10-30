<img width="389" height="91" alt="image" src="https://github.com/user-attachments/assets/24a5606a-988c-43ea-9eee-ab19ed6628be" />

# About ResCanvas

## The existing problem
Drawing is an important aspect of art and free expression within a variety of domains. It has been used to express new ideas and works of art. Tools such as MS Paint allow for drawing to be achievable on the computer, with online tools extending that functionality over the cloud where users can share and collaborate on drawings and other digital works of art. For instance, both Google's Drawing and Canva's Draw application have a sharable canvas page between registered users to perform their drawings.

However, such online platforms store the drawing and user data in a centralized manner, making personal data easily trackable by their respective companies, and easily sharable to other third parties such as advertisers. Furthermore, the drawings can be censored by both private and public entities, such as governments and tracking agencies. Privacy is important, yet online collaboration is an essential part of many user's daily workflow. Thus, it is necessary to decentralize the data storage aspect of these online applications. It might seem that the closest working example of this is Reddit's pixel platform since all users can make edits on the same page. However, users' data are still stored centrally on their servers. Furthermore, the scope is limited to just putting one pixel at a time for each user on a rate limited basis.

## Overview of ResCanvas
Introducing ResCanvas, a breakthrough in web-based drawing platforms that utilizes ResilientDB to ensure that user's drawings are securely stored, allowing for multiple users to collaborate and create new works of art and express ideas freely without any limits, tracking, or censorship. The canvas drawing board is the core feature of ResCanvas, designed to allow users to perform drawings using their mouse or touchscreen interface. It is simple to use, yet it allows for infinite possibilities. **To the best of our knowledge, ResCanvas is the first ResilientDB application that combines the key breakthroughs in database decentralization brought forth by ResilientDB, with the power of expression that comes with art, bridging the gap between the arts and the sciences.**

ResCanvas is designed to seamlessly integrate drawings with the familiarity of online contribution between users using effective synchronization of each user's canvas drawing page. This allows for error-free consistency even when multiple users are drawing all at the same time. Multiple users are able to collaborate on a single canvas, and just as many things in life have strength in numbers, so too are the users on a canvas. One user could be working on one part of the art drawing while other users can finish another component of the drawing in a collaborative manner.

The key feature of ResCanvas is defined by having all drawings stored persistently within ResilientDB in a stroke by stroke manner. Each stroke is individually cached via in-memory data store using Redis serving as the frontend cache. This ensures that the end user is able to receive all the strokes from the other users regardless of the response latency of ResilientDB, greatly enhancing the performance for the end user. Furthermore, all users will be able to see each other's strokes under a decentralized context and without any use of a centralized server or system for processing requests and storing data.

## Key Features
* Multiple user concurrent drawing and viewable editing history on a per user, per room basis with custom room and user access controls and permissions for each room
* Drawing data and edit history is synchronized efficiently and consistently across all users within the canvas drawing room
* Fast, efficient loading of data from backend by leveraging the caching capabilities of the Redis frontend data storage framework
* Color and thickness selection tools to customize your drawings
* Persistent, secure storage of drawing data in ResilientDB allowing for censorship free expression
* No sharing of data to third parties, advertisers, government entities, .etc with decentralized storage, all user account information and data is stored in ResilientDB
* Responsive, intuitive UI inspired by Google's Material design theme used throughout the app, without the tracking and privacy issues of existing web applications
* Clear canvas ensures that data is erased for all users in the same room
* Server-side JWT authentication and authorization with robust backend middleware (`backend/middleware/auth.py`) that validates all tokens, enforces access controls, and prevents client-side bypasses
* Backend enforces security with all the authentication, verification, and authorization logic running on the server (clients cannot manipulate or circumvent security checks)
* Real time collaboration using Socket.IO for low latency stroke broadcasting, user notifications, and user activity communication with JWT-protected Socket.IO connections

## Detailed architecture and concepts
This section expands on the high-level overview and documents the key design concepts, data model, and important theory behind ResCanvas.

### Architectural components
Our application consists of several major components. 

The first one is the **frontend (React)**, which handles drawing input, local smoothing/coalescing of strokes, UI state (tools, color, thickness), optimistic local rendering, and Socket.IO for real-time updates. Thus the frontend handles the user facing side of ResCanvas and ensures a smooth UX while ensuring communication between this frontend layer and the backend. This layer also handles the storage of auth tokens in `localStorage` and its API wrappers (like `frontend/src/api/`) automatically attach JWT access tokens to all protected requests as well. The most important aspect of this layer in terms of security is that the frontend does not perform authentication or authorization logic - it simply presents credentials and tokens to the backend.

This brings us to the **backend (Flask + Flask-SocketIO)**, which serves as the authoritative security boundary and data handler for the application. The backend validates all JWT tokens server-side using middleware (`backend/middleware/auth.py`), enforces room membership and permissions, verifies client-side signatures for secure rooms, encrypts/decrypts strokes for private/secure rooms, commits transactions to ResilientDB via GraphQL, and also retrieves data as needed according to the frontend's request. All protected API routes and Socket.IO connections require valid JWT access tokens sent via `Authorization: Bearer <token>` header. Since the backend performs all security checks, clients cannot bypass authentication or authorization and must go through the backend for all sensitive requests. Furthermore, when working with private or secure rooms, the backend handles encryption/decryption and room key management as well (`backend/services/crypto_service.py` and `submit_room_line.py`).

Going into deeper detail with regards to the backend, it interacts with several other key components. The first one is **ResilientDB**, the persistent, decentralized, immutable transaction log where strokes are ultimately stored, and the core essence of this application. Strokes are written as transactions so the full history is auditable and censorship-resistant. Through the `resilient-python-cache` library, ResilientDB synchronizes data blocks with **MongoDB (canvasCache)**. MongoDB is a warm persistent cache and queryable replica of strokes so the backend can serve reads without contacting ResilientDB directly for every request. This essentially serves as a sync bridge that mirrors ResilientDB into MongoDB. 

From MongoDB, our backend handles the syncronization of data with **Redis**, which is a short-lived, in-memory store keyed by room for fast read/write and undo/redo operations. Redis is intentionally ephemeral as it allows quick synchronization of live sessions while ResilientDB acts as the long-term durable store. Furthermore, this Redis cache can be hosted by any trusted node, and thus ensures that the security and privacy guarantees of ResilientDB are still preserved while ensuring fast performance. It can be said that our backend is also another sync bridge layer, that of between MongoDB and Redis.

### Data model and stroke format
ResCanvas uses a simple, compact stroke model that is friendly for network transport and decentralized commits. A typical base stroke data payload (JSON) contains the following data:

  - drawingId: unique per-user or per-drawing session
  - userId: author id (when available/allowed)
  - color: hex or named value
  - lineWidth: numeric stroke thickness
  - pathData: an array of (x,y) points, optionally compressed (delta-encoded)
  - timestamp: client-side timestamp for ordering and replay
  - metadata: optional fields for signing, encryption info, transform/offsets

Note that the path data should be kept compact. The frontend coalesces mouse/touch events and optionally delta-encodes paths before sending to the backend to reduce network bandwidth. For secure rooms, each stroke includes an on-chain/verifiable signature and any necessary auxiliary data to perform signature verification. Custom strokes, stamps, and other types of data will have additional data fields that are relevant to them, such as the stroke style, stamp size, among others.

### Undo/redo and edit history
Undo/redo is implemented through per-room, per-user stacks stored in Redis (ephemeral). Each user action that mutates the canvas pushes an entry to the user's undo stack and updates the live room state in Redis. Redo pops from a redo stack and applies the strokes again via the same commit flow (including related signing and encryption rules). Because ResilientDB is immutable, undo/redo on the client is implemented as additional strokes that semantically represent an "undo" (for example a delta or a tombstone stroke) by using a separate metadata layer that signals removal in replay. The visible client behavior is immediate, while the authoritative history in ResilientDB preserves the full append only log.

### Consistency, concurrency and ordering
Multiple users can draw simultaneously since the system is designed for eventual consistency with low-latency broadcast, where each stroke is broadcast immediately via Socket.IO to all connected room participants. This allows the application to provide near real-time feedback. The backend attempts to persist strokes to ResilientDB and caches (Redis/MongoDB). If ResilientDB write is delayed, clients still see strokes from the Socket.IO broadcast and from Redis while waiting for the backend to finishing writing the stroke data. Ordering is primarily guided by timestamps and the sequence of commits in ResilientDB. When replaying history, the authoritative order comes from the ResilientDB transaction log so all data and their ordering is preserved even if the canvas itself is cleared, strokes are undone, or even if the entire canvas room is deleted by the user.

### ResilientDB theory: why and how we use it here
ResilientDB is used as an immutable, decentralized transaction log. There are several key properties that we rely on. 

The first one is that of **immutability**, where once a stroke is committed, it cannot be altered silently. This increases trust and accountability. The second one is **decentralization**, since no single host controls the persistent copy of strokes, reducing censorship and central data harvesting. The third key property that we rely on is **auditability** as the entire canvas history can be inspected and verified against the ResilientDB ledger. This ensures transparency as anyone can view and verify the user's drawing history and actions taken on the application, and serves as a key deterrent against malicious activity on the canvas.

By treating each stroke as a transaction, we now achieve a chronological, tamper-evident history of canvas changes. Anyone can verify and review the changes to the canvas as the ground truth source of information. The sync bridge mirrors transactions into MongoDB so read queries don't need to hit ResilientDB for every request, while Redis caching further enhances the performance from the UX standpoint by caching the data from MongoDB on an in-memory basis within a trusted node. Removal operations such as undo and redo, as well as clear canvas/room deletions are simulated using time stamp markers to achieve the same effects without altering the historical backend data as well. This hierarchical relationship between ResilientDB, MongoDB, and Redis essentially serves as an unique balance between user experience, security, and privacy.

### Private rooms vs Secure rooms
Recall that public rooms allow anyone to access and draw in them, and so all the data is publically accessible by all registered users without needing to perform decryption and obtaining an access key to the room. In private rooms, access is restricted as only invited users or those with the room key can join such rooms. Strokes may be encrypted so only members with the room key can decrypt. The backend participates in wrapping/unwrapping room keys using `ROOM_MASTER_KEY_B64`. This allows users who want additional privacy while drawing contents containing sensitive or personal information to be able to do so without the risk of exposing all their raw drawings to the general public.

Secure rooms go further and expand upon the protections of private rooms by requiring client-side signing of strokes with a cryptographic wallet (such as [ResVault](https://chromewebstore.google.com/detail/resvault/ejlihnefafcgfajaomeeogdhdhhajamf?pli=1)). Each stroke is signed by the user's wallet private key and the signature is stored with the stroke. This enables verifiable authorship since anyone can confirm a stroke was created by the owner of a given wallet address. See `WALLET_TESTING_GUIDE.md` for details about ResVault and how to use it with ResCanvas, of which the backend validates signatures for secure rooms in `backend/routes/submit_room_line.py`.

#### Wallet integration and signature flow for secure rooms
1. User connects wallet (such as ResVault) via the frontend UI and grants signing permissions.
2. When drawing in a secure room, the frontend prepares the stroke payload and asks ResVault to sign the serialized stroke or a deterministic hash of it.
3. The signed payload (signature + public key or address) is sent to the backend along with the stroke.
4. The backend verifies the signature before accepting and committing the stroke to persistent storage.

### Security, privacy and threat model
ResCanvas aims to improve user privacy and resist centralized censorship, and so we mitigated several threats in our application. One of the most significant threats that many web based applications face today is **Central server compromise**, since many existing applications are based on a centralized sever and store important data there. However, in ResCanvas, persistent data is stored on ResilientDB and mirrored to MongoDB, which reduces a single point of failure due to the decentralized nature of ResilientDB.

We also prevent **data harvesting by a platform operator** from occurring in the first place as decentralized storage and client-side signing for secure rooms reduce linkability and provide verifiability. This ensures that user's data is not being collected for third party usage, for instance, which could result in data being leveraged for commercial purposes and malicious intent. This assurance in user's data security is also guaranteed through our prevention of **client-side authentication bypasses**. All authentication, authorization, and access control logic runs server-side. The backend middleware validates tokens, checks permissions, and enforces room access rules. Even the most malicious of clients cannot manipulate or circumvent security checks because of this middleware.

Other security protections that ResCanvas offers includes handling the situation where there could be **token theft via XSS**. We manage this risk by having refresh tokens be stored in HttpOnly cookies that cannot be accessed by JavaScript, protecting long-lived sessions from cross-site scripting attacks. Additionally, we prevent **CSRF attacks** by having refresh cookies use `SameSite` attribute. Using this kind of attribute prevents cross-site request forgery from occurring. We also prevent **signature forgery** for secure rooms since the backend verifies cryptographic signatures server-side. This protection ensures that strokes cannot be attributed to users who didn't create them in the first place.

Despite these significant protections that ResCanvas offers, there are several key trade-offs and assumptions that are worth mentioning. 

For instance, there is still a risk that the application can suffer from **frontend device compromise**. While the backend enforces all security decisions, if a user's device or browser is compromised, attackers could steal access tokens from `localStorage` or wallet keys before signing. So access tokens are short-lived (15 minutes by default) to minimize exposure and refresh tokens in HttpOnly cookies are protected from JavaScript access.

The core functionality of ResCanvas still depends on the **availability of ResilientDB**. ResilientDB endpoints and GraphQL commit endpoints used by the backend must remain available and trusted by backend operators. If those services are compromised, ledger inclusion or availability may be affected. However, the probability of this occurring is extremely low due to the decentralized, blockchain nature of ResilientDB.

Furthermore, certain backend layers and services, such as Redis and MongoDB, rely on the user's level of **backend trust**. Users must trust the backend operators to correctly implement and enforce security policies, and also ensure that those backend layers and services are running on trusted nodes. Having nodes that are trustworthy to the user is essential as the backend has access to certain data such as unencrypted strokes for public rooms.

### JWT-Based Authentication
- **Access Tokens**: Short-lived JWTs signed with `JWT_SECRET` (default: 15 minutes). Clients must include the token in the `Authorization: Bearer <token>` header for all protected API calls and Socket.IO connections.
- **Refresh Tokens**: Long-lived tokens (default: 7 days) stored in secure, HttpOnly cookies (`SameSite=Lax` or `Strict`). These cannot be accessed by JavaScript, protecting against XSS attacks.
- **Token Refresh**: When an access token expires, clients call `/auth/refresh` to obtain a new access token using the refresh cookie. The backend validates the refresh token server-side.

### Backend Middleware (`backend/middleware/auth.py`)
All protected routes and Socket.IO handlers use the following decorators:
- **`@require_auth`**: Validates JWT signature, checks expiration, and loads the authenticated user into `g.current_user`. Rejects invalid or expired tokens.
- **`@require_auth_optional`**: Allows both authenticated and anonymous access. Authenticated users get enhanced features (e.g., membership-scoped data).
- **`@require_room_access`**: Enforces room-level permissions. Verifies that the authenticated user has appropriate access (owner, editor, viewer) to the requested room.

### Authentication Endpoints
- **Login**: `POST /auth/login` — Validates credentials server-side, returns access token and sets refresh cookie.
- **Refresh**: `POST /auth/refresh` — Issues new access token using the refresh cookie.
- **Logout**: `POST /auth/logout` — Invalidates refresh token and clears cookie.
- **Registration**: `POST /auth/register` — Creates new user account with password hashing.
- **Current User**: `GET /auth/me` — Returns authenticated user's profile (requires valid access token).

## Important endpoints
- Create/list rooms: POST/GET `/rooms`
- Room details: GET `/rooms/<roomId>`
- Post stroke: POST `/rooms/<roomId>/strokes` (requires auth and room access)
- Get strokes: GET `/rooms/<roomId>/strokes` (works with or without auth but returns membership-scoped data when authenticated)
- Undo/redo/clear: `/rooms/<roomId>/undo`, `/rooms/<roomId>/redo`, `/rooms/<roomId>/clear`

For secure rooms (type `secure`) strokes must be signed client-side; the backend validates signatures in `submit_room_line.py`.

## API for External Applications
ResCanvas provides a versioned REST API (`/api/v1/*`) for external applications to integrate collaborative drawing functionality. This generalized API layer allows developers to build third-party apps, mobile clients, integrations, and automation tools on top of ResCanvas.

### Canvas API Features

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

### Versioned API Endpoints
All API v1 endpoints are prefixed with `/api/v1` as shown below.

**Authentication** (`/api/v1/auth/*`):
- `POST /api/v1/auth/register` — Register new user
- `POST /api/v1/auth/login` — Login and obtain JWT token
- `POST /api/v1/auth/refresh` — Refresh access token
- `POST /api/v1/auth/logout` — Logout and invalidate tokens
- `GET /api/v1/auth/me` — Get current user info
- `POST /api/v1/auth/change-password` — Change password

**Canvases** (`/api/v1/canvases/*`) - **RECOMMENDED**:
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

### Testing the API
Comprehensive test suites are available as well:

```bash
# Backend API v1 tests (Canvas API)
cd backend
pytest tests/test_api_v1_canvases.py -v

# All API v1 tests
pytest tests/test_api_v1*.py -v
```

### Quick Example: Canvas API
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

### Contributing to the API

We welcome contributions! The API layer is designed to be extended with new endpoints. Please see `CONTRIBUTING.md` for guidelines before you start.

## Key configuration (backend)
See `backend/config.py` and set the following environment variables as appropriate (examples shown in the repository's `.env` usage):
- `MONGO_ATLAS_URI` / `MONGO_URI` — MongoDB connection string
- `JWT_SECRET` — HMAC secret for signing access tokens
- `ACCESS_TOKEN_EXPIRES_SECS`, `REFRESH_TOKEN_EXPIRES_SECS` — token lifetimes
- `REFRESH_TOKEN_COOKIE_NAME`, `REFRESH_TOKEN_COOKIE_SECURE`, `REFRESH_TOKEN_COOKIE_SAMESITE`
- `ROOM_MASTER_KEY_B64` — used to (re)wrap room keys for private/secure rooms
- `SIGNER_PUBLIC_KEY`, `SIGNER_PRIVATE_KEY`, `RECIPIENT_PUBLIC_KEY` — used when committing strokes via the GraphQL service

The code loads environment variables via `python-dotenv` in `backend/config.py`.

---

# ResCanvas Setup Guide
ResCanvas is a decentralized collaborative drawing platform that integrates **ResilientDB**, **MongoDB**, and **Redis** for data consistency, caching, and persistence.  
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

### Fix Missing Packages (Temporary)

Run these if import errors occur:

```bash
pip install python-dotenv
pip install --upgrade motor
```

### Start the Cache Service

```bash
python3 example.py
```

> This starts a MongoDB caching service that syncs data with ResilientDB via the
resilientdb://crow.resilientdb.com endpoint defined in `cache.py`.

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

> The app should now be running at http://localhost:3000

---

## Authentication examples (curl):
  - Login to obtain access token (also sets refresh cookie):
    ```
    curl -X POST http://127.0.0.1:10010/auth/login -H "Content-Type: application/json" -d '{"username":"testuser","password":"testpass"}'
  - Post a stroke (replace `<token>` and `<roomId>`):
    ```
    curl -X POST http://127.0.0.1:10010/rooms/<roomId>/strokes -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d '{"drawingId":"d1","color":"#000","lineWidth":3,"pathData":[],"timestamp": 1696940000000}'

### Developer workflows and testing

#### Quick Start Testing

ResCanvas has a comprehensive test suite with tests that are covering both the backend and frontend:

```bash
# Fast optimized testing which is recommended for development
./scripts/run_all_tests_parallel.sh --fast

# Full test suite with coverage
./scripts/run_all_tests_parallel.sh

# Tests with sequential script
./scripts/run_all_tests_unified.sh
```

#### Test Suite Breakdown

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

#### CI/CD Integration

**GitHub Actions workflows** automatically test every push and PR:

- **Full Test Suite** (`ci-tests.yml`): Matrix testing across Python 3.10/3.11 and Node 20.x/22.x
- **Quick Check** (`ci-quick.yml`): Fast feedback loop for PRs

**CI Setup Notes:**

- **Key Generation**: The workflows automatically run `gen_keys.py` to generate signing keys as per the README setup instructions. This requires `PyNaCl` and `base58` packages (now included in requirements.txt).
- **MongoDB Connection**: In GitHub Actions, the MongoDB service is accessible at hostname `mongodb` (not `localhost`). The workflows use `mongodb://testuser:testpass@mongodb:27017/?authSource=admin`.
- **Environment variable names**: The backend expects `JWT_SECRET` (not `JWT_SECRET_KEY`) and `RES_DB_BASE_URI`/`RESILIENTDB_BASE_URI` for ResilientDB endpoint configuration.
- **Codecov uploads**: If the repository is private, set a `CODECOV_TOKEN` secret in Settings → Secrets → Actions. The workflows skip Codecov upload if the token is not defined.
- **Manual trigger**: Actions → CI - Full Test Suite → Run workflow

## Contributors
* Henry Chou - Team Leader and Full Stack Developer
* Varun Ringnekar - Full Stack Developer
* Chris Ruan - Frontend Developer
* Shaokang Xie - Backend Developer
* Yubo Bai - Frontend Developer
