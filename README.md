# About ResCanvas

## The existing problem
Drawing is an important aspect of art and free expression within a variety of domains. It has been used to express new ideas and works of art. Tools such as MS Paint allow for drawing to be achievable on the computer, with online tools extending that functionality over the cloud where users can share and collaborate on drawings and other digital works of art. For instance, both Google's Drawing and Canva's Draw application have a sharable canvas page between registered users to perform their drawings.

However, such online platforms store the drawing and user data in a centralized manner, making personal data easily trackable by their respective companies, and easily sharable to other third parties such as advertisers. Furthermore, the drawings can be censored by both private and public entities, such as governments and tracking agencies. Privacy is important, yet online collaboration is an essential part of many user's daily workflow. Thus, it is necessary to decentralize the data storage aspect of these online applications. It might seem that the closest working example of this is Reddit's pixel platform since all users can make edits on the same page. However, users' data are still stored centrally on their servers. Furthermore, the scope is limited to just putting one pixel at a time for each user on a rate limited basis.

## Overview of ResCanvas
Introducing ResCanvas, a breakthrough in web-based drawing platforms that utilizes ResilientDB to ensure that user's drawings are securely stored, allowing for multiple users to collaborate and create new works of art and express ideas freely without any limits, tracking, or censorship. The canvas drawing board is the core feature of ResCanvas, designed to allow users to perform drawings using their mouse or touchscreen interface. It is simple to use, yet it allows for infinite possibilities. **To the best of our knowledge, ResCanvas is the first ResilientDB application that combines the key breakthroughs in database decentralization brought forth by ResilientDB, with the power of expression that comes with art, bridging the gap between the arts and the sciences.**

ResCanvas is designed to seamlessly integrate drawings with the familiarity of online contribution between users using effective synchronization of each user's canvas drawing page. This allows for error-free consistency even when multiple users are drawing all at the same time. Multiple users are able to collaborate on a single canvas, and just as many things in life have strength in numbers, so too are the users on a canvas. One user could be working on one part of the art drawing while other users can finish another component of the drawing in a collaborative manner.

The key feature of ResCanvas is defined by having all drawings stored persistently within ResilientDB in a stroke by stroke manner. Each stroke is individually cached via in-memory data store using Redis serving as the frontend cache. This ensures that the end user is able to receive all the strokes from the other users regardless of the response latency of ResilientDB, greatly enhancing the performance for the end user. Furthermore, all users will be able to see each other's strokes under a decentralized context and without any use of a centralized server or system for processing requests and storing data.

## Key Features
* Multiple user concurrent drawing and viewable editing history on a per user, per room basis with custom room and user access controls and permissions
* Drawing data and edit history is synchronized efficiently and consistently across all users within the canvas drawing room
* Fast, efficient loading of data from backend by leveraging the caching capabilities of the Redis frontend data storage framework
* Color and thickness selection tools to customize your drawings
* Persistent, secure storage of drawing data in ResilientDB allowing for censorship free expression
* No sharing of data to third parties, advertisers, government entities, .etc with decentralized storage, all user account information and data is stored in ResilientDB
* Responsive, intuitive UI inspired by Google's Material design theme used throughout the app, without the tracking and privacy issues of Google's web applications
* Clear canvas ensures that data is erased for all users in the same room
* JWT-based authentication for API and Socket.IO access (login via `/auth/login`, include `Authorization: Bearer <token>`)
* Real-time collaboration using Socket.IO for low-latency stroke broadcasting, user notifications, and more

## At a glance
A room-based, JWT-authenticated collaborative drawing application with a React frontend and a Flask backend. This provides real-time collaborative canvases (rooms) with low-latency stroke broadcasting (Socket.IO) and persistent stroke storage.
- Backend: Flask + Flask-SocketIO. Routes live under `backend/routes/` (notably `auth.py`, `rooms.py`, `submit_room_line.py`).
- Frontend: React (create-react-app) in `frontend/` — uses `socket.io-client` and stores auth in `localStorage`.
- Storage & cache: Redis for fast room-scoped caching and undo/redo. MongoDB is used as a mirror/persistent cache collection (`canvasCache.strokes`).

## Authentication
Authentication uses JWT access tokens plus an HttpOnly refresh token cookie, and this process happens server side for enhanced security. Clients can't bypass this protection since authorization and verification all happens in the backend.
- Login/refresh/logout endpoints: `/auth/login`, `/auth/refresh`, `/auth/logout` (see `backend/routes/auth.py`).
- Access tokens: JWTs signed with `JWT_SECRET`. Send as `Authorization: Bearer <token>` for protected REST and Socket.IO connections.
- Refresh tokens: HttpOnly cookie (server-managed). The backend middleware enforces token validation and injects `g.current_user` for handlers.

## Important endpoints
- Create/list rooms: POST/GET `/rooms`
- Room details: GET `/rooms/<roomId>`
- Post stroke: POST `/rooms/<roomId>/strokes` (requires auth and room access)
- Get strokes: GET `/rooms/<roomId>/strokes` (works with or without auth but returns membership-scoped data when authenticated)
- Undo/redo/clear: `/rooms/<roomId>/undo`, `/rooms/<roomId>/redo`, `/rooms/<roomId>/clear`

For secure rooms (type `secure`) strokes must be signed client-side; the backend validates signatures in `submit_room_line.py`.

## Key configuration (backend)
See `backend/config.py` and set the following environment variables as appropriate (examples shown in the repository's `.env` usage):
- `MONGO_ATLAS_URI` / `MONGO_URI` — MongoDB connection string
- `JWT_SECRET` — HMAC secret for signing access tokens
- `ACCESS_TOKEN_EXPIRES_SECS`, `REFRESH_TOKEN_EXPIRES_SECS` — token lifetimes
- `REFRESH_TOKEN_COOKIE_NAME`, `REFRESH_TOKEN_COOKIE_SECURE`, `REFRESH_TOKEN_COOKIE_SAMESITE`
- `ROOM_MASTER_KEY_B64` — used to (re)wrap room keys for private/secure rooms
- `SIGNER_PUBLIC_KEY`, `SIGNER_PRIVATE_KEY`, `RECIPIENT_PUBLIC_KEY` — used when committing strokes via the GraphQL service

The code loads environment variables via `python-dotenv` in `backend/config.py`.

## Run locally (quick dev)
1. Backend
   - Create and activate a Python venv inside `backend/` and install requirements:
     - python3 -m venv venv
     - source venv/bin/activate
     - pip install -r requirements.txt
   - Ensure Redis and MongoDB are accessible to the backend.
   - Run the backend from the project root:
     - python backend/app.py

2. Frontend
   - From the `frontend/` directory:
     - npm install
     - npm start

Authentication example (curl):
  - Login to obtain access token (also sets refresh cookie):
    curl -X POST http://127.0.0.1:10010/auth/login -H "Content-Type: application/json" -d '{"username":"testuser","password":"testpass"}'
  - Post a stroke (replace `<token>` and `<roomId>`):
    curl -X POST http://127.0.0.1:10010/rooms/<roomId>/strokes -H "Content-Type: application/json" -H "Authorization: Bearer <token>" -d '{"drawingId":"d1","color":"#000","lineWidth":3,"pathData":[],"timestamp": 1696940000000}'

## Key files and locations
- `backend/app.py` — Flask entrypoint and Socket.IO initialization
- `backend/routes/auth.py` — login/refresh/logout and `@require_auth` middleware usage
- `backend/routes/rooms.py` — all room CRUD and stroke endpoints
- `backend/routes/submit_room_line.py` — detailed stroke handling, encryption for private/secure rooms, signature verification
- `backend/services/` — DB, GraphQL commit helper, Socket.IO helpers, crypto utilities
- `frontend/src/` — React app, API clients under `frontend/src/api/`, `frontend/src/services/` contains socket and canvas helpers

## Notes for contributors
- All protected API routes and Socket.IO connections expect JWT access tokens via `Authorization: Bearer <token>`; the backend enforces token signature and expiry server-side.
- When working with private or secure rooms, the backend will encrypt/decrypt strokes and may require a room wrapped key. See `backend/services/crypto_service.py` and `submit_room_line.py` for details.

## Contributors
* Henry Chou - Team Leader and Full Stack Developer
* Varun Ringnekar - Full Stack Developer
* Chris Ruan - Frontend Developer
* Shaokang Xie - Backend Developer
* Yubo Bai - Frontend Developer

## Detailed architecture and concepts

This section expands on the high-level overview and documents the key design concepts, data model, and important theory behind ResCanvas.

### Architectural components
- Frontend (React): handles drawing input, local smoothing/coalescing of strokes, UI state (tools, color, thickness), optimistic local rendering, and Socket.IO for real-time updates. The app stores auth state in `localStorage` and the frontend API wrappers attach JWT access tokens for protected calls.
- Backend (Flask + Flask-SocketIO): receives stroke writes, performs room membership checks, optionally verifies client-side signatures (secure rooms), encrypts strokes for private/secure rooms, commits transactions to ResilientDB (via GraphQL) and writes to Redis and MongoDB caches for low-latency reads.
- ResilientDB: the persistent, decentralized, immutable transaction log where strokes are ultimately stored. Strokes are written as transactions so the full history is auditable and censorship-resistant.
- Redis: short-lived, in-memory store keyed by room for fast read/write and undo/redo operations. Redis is intentionally ephemeral: it allows quick synchronization of live sessions while ResilientDB acts as the long-term durable store.
- MongoDB (canvasCache): a warm persistent cache and queryable replica of strokes so the backend can serve reads without contacting ResilientDB directly for every request. A sync bridge mirrors ResilientDB into MongoDB.

### Data model and stroke format
ResCanvas uses a simple, compact stroke model that is friendly for network transport and decentralized commits. A typical stroke (JSON) contains the following data:

- drawingId: unique per-user or per-drawing session
- userId: author id (when available/allowed)
- color: hex or named value
- lineWidth: numeric stroke thickness
- pathData: an array of (x,y) points, optionally compressed (delta-encoded)
- timestamp: client-side timestamp for ordering and replay
- metadata: optional fields for signing, encryption info, transform/offsets

Note that the path data should be kept compact. The frontend coalesces mouse/touch events and optionally delta-encodes paths before sending to the backend to reduce network bandwidth. For secure rooms, each stroke includes an on-chain/verifiable signature and any necessary auxiliary data to perform signature verification.

### Consistency, concurrency and ordering
Multiple users can draw simultaneously since the system is designed for eventual consistency with low-latency broadcast, where each stroke is broadcast immediately via Socket.IO to all connected room participants. This allows the application to provide near real-time feedback. The backend attempts to persist strokes to ResilientDB and caches (Redis/MongoDB). If ResilientDB write is delayed, clients still see strokes from the Socket.IO broadcast and from Redis while waiting for the backend to finishing writing the stroke data. Ordering is primarily guided by timestamps and the sequence of commits in ResilientDB. When replaying history, the authoritative order comes from the ResilientDB transaction log.

### ResilientDB theory (why and how we use it)
ResilientDB is used as an immutable, decentralized transaction log. Key properties we rely on:

- Immutability: once a stroke is committed, it cannot be altered silently. This increases trust and accountability.
- Decentralization: no single host controls the persistent copy of strokes, reducing censorship and central data harvesting.
- Auditability: the entire canvas history can be inspected and verified against the ResilientDB ledger.

By treating each stroke as a transaction, we now achieve a chronological, tamper-evident history of canvas changes and so anyone can verfy and review the changes to the canvas as the ground truth source of information. The sync bridge mirrors transactions into MongoDB so read queries don't need to hit ResilientDB for every request, while redis caching further enhances the perforance from the UX standpoint by caching the data from MongoDB on an in-memory basis within a trusted node. Removal operations such as undo and redo, as well as clear canvas/room deletions are simulated using time stamp markers to achieve the same effects without altering the historical backend data as well.

### Private rooms vs Secure rooms
In private rooms, access is restricted as only invited users or those with the room key can join such rooms. Strokes may be encrypted so only members with the room key can decrypt. The backend participates in wrapping/unwrapping room keys using `ROOM_MASTER_KEY_B64`. 

Secure rooms go further and expand upon the protections of private rooms by requiring client-side signing of strokes with a cryptographic wallet (such as ResVault). Each stroke is signed by the user's wallet private key and the signature is stored with the stroke. This enables verifiable authorship — anyone can confirm a stroke was created by the owner of a given wallet address. See `WALLET_TESTING_GUIDE.md` for details about ResVault and how to use it with ResCanvas, of which the backend validates signatures for secure rooms in `backend/routes/submit_room_line.py`.

### Security, privacy and threat model
ResCanvas aims to improve user privacy and resist centralized censorship, but there are trade-offs and responsibilities as shown below.

- Threats mitigated:
  - Central server compromise: persistent data is stored on ResilientDB and mirrored to MongoDB, reducing a single point of failure.
  - Data harvesting by a platform operator: decentralized storage and client-side signing for secure rooms reduce linkability and provide verifiability.

- Limitations and assumptions:
  - Frontend devices can still execute untrusted code (browser). Compromise of a user's device or browser extension can leak keys or manipulate strokes before signing.
  - ResilientDB endpoints and graph commit endpoints used by the backend must remain available and trusted by the backend operators. If those services are compromised, ledger inclusion or availability may be affected.

Security practices implemented:
- JWT authentication and HttpOnly refresh cookies to protect session tokens from XSS.
- Signature verification on server-side for secure rooms.
- Optional encryption of strokes for private rooms using per-room wrapped keys.

### Wallet integration and signature flow (for secure rooms)
1. User connects wallet (such as ResVault) via the frontend UI and grants signing permissions.
2. When drawing in a secure room, the frontend prepares the stroke payload and asks ResVault to sign the serialized stroke or a deterministic hash of it.
3. The signed payload (signature + public key or address) is sent to the backend along with the stroke.
4. The backend verifies the signature before accepting and committing the stroke to persistent storage.

### Undo/redo and edit history
Undo/redo is implemented through per-room, per-user stacks stored in Redis (ephemeral). Each user action that mutates the canvas pushes an entry to the user's undo stack and updates the live room state in Redis. Redo pops from a redo stack and applies the strokes again via the same commit flow (including related signing and encryption rules). Because ResilientDB is immutable, undo/redo on the client is implemented as additional strokes that semantically represent an "undo" (for example a delta or a tombstone stroke) by using a separate metadata layer that signals removal in replay. The visible client behavior is immediate, while the authoritative history in ResilientDB preserves the full append only log.

### Developer workflows and testing
This project includes tests in `backend/tests/` and frontend tests in `frontend/tests/`. Recommended development flow:

1. Backend virtualenv: `python3 -m venv venv && source venv/bin/activate && pip install -r backend/requirements.txt`
2. Start local Redis and MongoDB instances (or point to cloud instances using environment variables).
3. Run backend unit tests: `pytest backend/tests`.
4. Frontend: `cd frontend && npm install && npm test` for unit tests and Playwright for E2E.

Additions to test coverage we recommend:
- Signature verification happy and unhappy paths for secure rooms.
- Private room encryption/decryption roundtrips.
- Undo/redo stack persistence and behavior during reconnection.
- If real-time updates stop, check Redis connectivity and Socket.IO logs for any GraphQL commit errors.
- When ResilientDB commits fail, strokes should still be cached in Redis and mirrored to MongoDB by the sync bridge until the graph endpoint recovers.

---