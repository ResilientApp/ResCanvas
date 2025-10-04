# ResCanvas AI Agent Instructions

### **Section 1: Workflow Requirements**

#### **Pre-Task Requirements**

Before each task, must first complete the following steps:
1. **Provide a full plan of my changes** - A clear, step-by-step todo list
2. **Provide a list of behaviors that I'll change** - What will work differently after my changes
3. **Provide a list of test cases to add** - How to verify the changes work correctly

Before adding any code, always check if possible to re-use or re-configure any existing code to achieve the result.

#### **Workflow Overview**

**Deeply Understand the Problem:** must analyze the request, considering all requirements, edge cases, and interactions with the existing codebase.

**Investigate the Codebase:** must explore all the code to identify key files, functions, and the root cause of the issue.

**Develop a Detailed Plan:** must create and display a clear, step-by-step todo list that will guide my implementation.

**Implement the Fix Incrementally:** must execute the plan by making small, targeted code changes, one step at a time.

**Debug as Needed:** must diagnose and resolve any errors or unexpected behaviors that arise during implementation.

**Iterate Until Fixed:** must continue the cycle of implementing and debugging until every step in my plan is complete and the problem is solved.

**Reflect and Validate:** must perform a final review of all changes to ensure they are high-quality and fully meet the original request.

### **Section 2: Development Environment & Screen Sessions**

#### **Screen-Based Development Workflow**

This project uses `screen` sessions to manage long-running processes. There are typically three active screens:

```
There are screens on:
        3072359.rescanvas_backend       (09/25/25 00:25:15)     (Detached)
        3034722.rescanvas_frontend      (09/24/25 07:22:09)     (Detached)
        257208.rescanvas_python_cache   (08/16/25 00:15:59)     (Detached)
```

#### **Critical Screen Management Rules**

**`rescanvas_backend` Screen:**
- **Command:** `python3 app.py` is already running
- **Behavior:** Auto-reloads when backend files are saved
- **Action:** **NEVER stop or restart this process** unless it has crashed due to syntax/indentation errors
- **Exception:** Only restart if the Python process has stopped running due to code errors

**`rescanvas_frontend` Screen:**
- **Command:** `npm start` is already running
- **Behavior:** Auto-reloads when frontend files are saved, displays compile errors but never crashes
- **Action:** **NEVER stop or restart this process under any circumstances**

**`rescanvas_python_cache` Screen:**
- **Command:** The `example.py` sync service is running
- **Behavior:** Continuously syncs data between ResilientDB and MongoDB
- **Action:** **NEVER touch, stop, restart, or modify this screen or its process**

#### **Development Commands (Reference Only)**

These commands are provided for reference only. **Do not use them** since the services are already running in screen sessions:

- Backend: `cd backend && python app.py` (runs on `http://0.0.0.0:10010`)
- Frontend: `cd frontend && npm start` (runs on `http://localhost:3000`)
- Sync Service: `cd backend/incubator-resilientdb-resilient-python-cache && python example.py`

---

### **Section 3: Project Architecture & Data Flow**

ResCanvas is a collaborative, decentralized drawing application. The core architectural goal is to ensure user drawings are stored securely and censorship-free on a decentralized ledger (ResilientDB), while providing a real-time, multi-user experience through a traditional web stack (React, Flask, Redis, MongoDB).

#### **Core Components**
- **Frontend (`frontend/`):** A React single-page application (SPA) using Material-UI. This is the user's entry point.
- **Backend (`backend/`):** A Python Flask application that serves a RESTful API for the frontend and handles real-time updates via Socket.IO.
- **`resilient-python-cache` (`backend/incubator-resilientdb-resilient-python-cache/`):** A separate, continuously running Python service (`example.py`) that acts as a data synchronization bridge. It listens for new transactions on ResilientDB and mirrors them into a MongoDB collection.
- **Redis:** A fast, in-memory cache used by the Flask backend to provide low-latency access to drawing data for active rooms.
- **MongoDB:** A persistent database that serves two roles:
    1.  Stores application metadata like user accounts, rooms, and permissions.
    2.  Acts as a persistent, queryable replica of the drawing data (strokes), populated by the `resilient-python-cache` service.
- **ResilientDB:** The decentralized, blockchain-based database. It is the ultimate, immutable source of truth for all drawing strokes.

#### **Architecture & Data Flow**

Understanding the data flow is critical. The system is designed to provide a fast user experience while ensuring data is permanently stored on a decentralized ledger.

**Writing a Stroke (User draws a line):**
1.  **Frontend:** User draws on the canvas. On mouse-release, the stroke data is sent to the Flask Backend API (e.g., `POST /rooms/<id>/strokes`).
2.  **Flask Backend:**
    a. Receives the stroke and immediately writes it to **ResilientDB** via its GraphQL API. This ensures the data is permanently and immutably stored.
    b. Simultaneously, it pushes the same stroke data into the **Redis** cache for the corresponding room.
    c. It then broadcasts the new stroke via **Socket.IO** to other users in the same room for a real-time experience.

**Reading Strokes (User opens a canvas):**
1.  **Frontend:** Requests all strokes for a specific room from the Flask Backend (`GET /rooms/<id>/strokes`).
2.  **Flask Backend:**
    a. First, it attempts to fetch the strokes from the **Redis** cache. If available, it returns them immediately.
    b. If the data is not in Redis, it queries the **MongoDB** `strokes` collection, which serves as the warm, persistent cache.
    c. The retrieved strokes are sent back to the frontend.

**Background Data Synchronization (The Bridge):**
- The `resilient-python-cache` service (`example.py`) runs independently and continuously.
- It monitors **ResilientDB** for new transactions (i.e., new strokes).
- When a new stroke is detected, the service processes it and inserts it into the `canvasCache.strokes` collection in **MongoDB**. This is how the MongoDB cache is kept in sync with the ultimate source of truth in ResilientDB.

#### **Environment Configuration & Secrets**

There are two separate `.env` files for the two Python services.

**For the main Flask Backend (`backend/.env`):**
This file connects the backend to MongoDB for metadata and to ResilientDB for writing strokes.
```properties
# Connects to MongoDB for user/room metadata
MONGO_ATLAS_URI=mongodb+srv://<user>:<password>@cluster0.sonmozx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0

# ResilientDB credentials for writing transactions
SIGNER_PUBLIC_KEY=...
SIGNER_PRIVATE_KEY=...

# ResilientDB API endpoints
RESILIENTDB_BASE_URI=https://crow.resilientdb.com
RESILIENTDB_GRAPHQL_URI=https://cloud.resilientdb.com/graphql
```

**For the Sync Service (`backend/incubator-resilientdb-resilient-python-cache/.env`):**
This file configures the bridge service to connect to the correct MongoDB database and collection where it will store the mirrored stroke data.
```properties
# MongoDB connection where strokes from ResilientDB are stored
MONGO_URL="mongodb+srv://<user>:<password>@cluster0.sonmozx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
MONGO_DB="canvasCache"
MONGO_COLLECTION="strokes"
```

---

### **Section 4: Critical Issue - Dual Frontend Authentication Systems**

**CRITICAL**: The backend has a complete JWT authentication and room-based RBAC system. However, the frontend is in a transitional state with **TWO CONFLICTING AUTH SYSTEMS**:

1.  **Legacy System (`App.js`, `canvasBackend.js`, `Canvas.js`):** This is the original, **FULLY WORKING** system with complete canvas functionality including:
    - **Complete room management** - users can create, join, and switch between rooms
    - **Full canvas features** - drawing strokes, shapes, undo/redo, cut/paste, color selection, line width
    - **Real-time collaboration** - multiple users drawing simultaneously in the same room
    - **User authentication** - simple username strings passed as query parameters (e.g., `?user=username|timestamp`)
    - **Complete reference implementation** in `ResCanvas-main/` folder shows the fully working system

2.  **New JWT System (`pages/Login.jsx`, `pages/Dashboard.jsx`, `api/auth.js`):** This is the modern authentication system being developed. It uses JWT tokens stored in `localStorage` and sends them in `Authorization: Bearer <token>` headers for authenticated requests.

**CRITICAL REQUIREMENT**: When implementing the JWT system integration, you must:
- **Preserve the EXACT USER EXPERIENCE** - every feature that works in the legacy system must work identically for the end user in the new JWT system
- **Maintain functionality, not authentication method** - users should be able to draw, undo, redo, switch rooms, collaborate in real-time exactly as they do now, but with proper JWT authentication instead of username strings
- **No new bugs or degraded performance** - the JWT version must be as stable, fast, and reliable as the legacy system
- **Test user workflows thoroughly** - ensure drawing experience, collaboration, room management feel identical to users
- **Reference the working implementation** - study `ResCanvas-main/` to understand the expected user experience and functionality
- **Adopt user experience, replace authentication** - the goal is to keep the same smooth user experience while upgrading to secure JWT authentication

**Your primary task is to migrate from simple username authentication to JWT authentication while preserving the identical user experience and functionality.** A detailed plan can be found in `LLM_COMPLETE_INTEGRATION_PLAN.md`.

---

### **Section 5: Execution & Safety Principles**

#### 1. Minimize Scope of Change
*   Implement the smallest possible change that satisfies the request.
*   Do not modify unrelated code or refactor for style unless explicitly asked.

#### 2. Preserve Existing Behavior
*   Ensure your changes are surgical and do not alter existing functionalities or APIs.
*   Maintain the project's existing architectural and coding patterns.

#### 3. Handle Ambiguity Safely
*   If a request is unclear, state your assumption and proceed with the most logical interpretation.

#### 4. Ensure Reversibility
*   Write changes in a way that makes them easy to understand and revert.
*   Avoid cascading or tightly coupled edits that make rollback difficult.

#### 5. Log, Don't Implement, Unscoped Ideas
*   If you identify a potential improvement outside the task's scope, add it as a code comment.
*   **Example:** `// NOTE: This function could be further optimized by caching results.`

#### 6. Forbidden Actions (Unless Explicitly Permitted)
*   Do not perform global refactoring.
*   Do not add new dependencies (e.g., npm packages, Python libraries).
*   Do not change formatting or run a linter on an entire file.

---

### **Section 6: Code Quality & Delivery**

#### **Code Quality Standards**
*   **Clarity:** Use descriptive names. Keep functions short and single-purpose.
*   **Consistency:** Match the style and patterns of the surrounding code.
*   **Error Handling:** Use `try/catch` or `try/except` for operations that can fail.
*   **Security:** Sanitize inputs. Never hardcode secrets.

#### **Codebase Conventions & Patterns**

**Authentication Flow (Frontend)**
Always use the JWT-based pattern for new features.

```javascript
// ✅ Correct pattern (use this) in frontend/src/api/*.js
import { API_URL } from './apiConfig'; // Use the configured base URL

const token = localStorage.getItem('token');
const response = await fetch(`${API_URL}/rooms`, {
  headers: { 'Authorization': `Bearer ${token}` }
});

// ❌ Legacy/Incorrect pattern (found in canvasBackend.js, needs refactoring)
const response = await fetch('/api/endpoint?user=username|timestamp');
```

**Room-Based vs. Global Canvas**
The application is moving from a single "global" canvas to multiple "rooms". Always prefer room-based endpoints.

-   **Legacy:** `/getCanvasData`, `/submitNewLine`
-   **Modern:** `GET /rooms/{id}/strokes`, `POST /rooms/{id}/strokes`

---

### **Section 7: Key Files & Directories**
-   `LLM_COMPLETE_INTEGRATION_PLAN.md`: The strategic plan for completing the frontend migration.
-   `ResCanvas-main/`: **COMPLETE REFERENCE IMPLEMENTATION** - The original, fully working ResCanvas with all features (rooms, drawing tools, undo/redo, shapes, real-time collaboration). Must always study this to understand expected functionality.
-   `backend/app.py`: Main Flask application entry point.
-   `backend/routes/`: Location of all backend API endpoint definitions.
-   `backend/incubator-resilientdb-resilient-python-cache/example.py`: The core logic for the ResilientDB-to-MongoDB sync service.
-   `frontend/src/App.js`: The current "legacy" main React component with working canvas and room functionality.
-   `frontend/src/Canvas.js`: The core canvas drawing component with complete drawing tools, undo/redo, shapes.
-   `frontend/src/canvasBackend.js`: The "legacy" API communication file with working room and canvas endpoints.
-   `frontend/src/pages/`: Contains the "modern" JWT-based pages (`Dashboard.jsx`, `Login.jsx`) that need integration.
-   `frontend/src/api/`: Home for "modern" frontend API client functions to replace legacy calls.

---

### **Section 8: Integration of Wallet (ResVault) into Secure Rooms **

**Private Room (baseline)**
- Hidden from public listings.  
- Accessible only with the room ID or invitation.  
- Lightweight privacy (no enforced cryptographic guarantees).  

**Secure Room (builds on private room)**
- Secure rooms extend private rooms by adding wallet-based cryptographic enforcement.
- Adds **cryptographic guarantees and accountability**.  
- Requires **cryptographic wallet integration** (via [ResVault](https://github.com/resilientdb/incubator-resilientdb-resvault)).  
- All strokes and shapes must be **signed with the user’s wallet private key**.  
- Ensures verifiable authorship and prevents impersonation.  
- Drawings are **encrypted** for additional protection.  
- UI must display **verification metadata** (e.g., hover tooltip showing wallet address and signature verification).  
- The **functional flow** of secure rooms:  
   1. User logs in with account.  
   2. User connects wallet (ResVault).  
   3. In a secure room, every stroke/shape is signed.  
   4. Other participants can verify signatures + see authorship metadata.  