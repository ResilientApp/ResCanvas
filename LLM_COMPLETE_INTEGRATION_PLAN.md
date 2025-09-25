# ResCanvas Complete Integration Plan for LLMs

## Current State Analysis

The ResCanvas project has **TWO PARALLEL FRONTEND SYSTEMS** that need to be unified:

### System 1: Legacy Canvas App (Currently Active)
- **Entry Point**: `App.js` (main route "/" renders this)
- **Authentication**: Simple username strings (`username|timestamp`)
- **Canvas**: Original drawing functionality with global API calls
- **State**: All in App.js component state
- **API Pattern**: Query params like `?user=username|timestamp`

### System 2: Modern JWT Pages (Partially Implemented)
- **Entry Point**: `index.js` Layout component with routing
- **Authentication**: JWT tokens with proper headers
- **Pages**: Login, Register, Dashboard, Room, Profile, RoomSettings
- **Components**: NotificationsMenu
- **API**: Proper JWT headers, room-based endpoints
- **Socket.IO**: JWT-based real-time communication

### Backend: Fully Implemented ✅
- JWT authentication with refresh tokens
- Room-based RBAC (owner/admin/editor/viewer roles)
- Invitations system with pending/accepted/declined states
- Notifications system
- Real-time Socket.IO with room broadcasting
- Encryption for private/secure rooms

## The Core Problem

Users currently land on the legacy `App.js` system, but all the new features (rooms, auth, notifications) are only accessible through the modern system. The two systems are completely isolated and don't share state or functionality.

## LLM Implementation Plan

### Phase 1: Route & Authentication Unification

**Goal**: Make the modern JWT system the primary entry point and migrate legacy canvas functionality.

#### Step 1.1: Update Default Route
- **File**: `frontend/src/index.js`
- **Action**: Change default route from `<App />` to redirect logic
- **Logic**: 
  - If no JWT token → redirect to `/login`
  - If valid JWT token → redirect to `/dashboard`
  - Keep `/legacy` route for original App.js during transition

#### Step 1.2: Create Unified Layout Component
- **File**: `frontend/src/components/Layout.jsx`
- **Action**: Extract layout logic from index.js
- **Features**:
  - Global auth state management
  - Persistent token storage/refresh
  - Navigation bar with notifications
  - Route protection (redirect to /login if no auth)

#### Step 1.3: Convert App.js to JWT-based Component
- **File**: `frontend/src/App.js`
- **Action**: Replace username strings with JWT auth
- **Changes**:
  - Remove `loginOpen`, `currentUsername` state
  - Accept `auth` prop instead
  - Update all API calls to use JWT headers
  - Remove login dialog (handled by separate Login page)

### Phase 2: Canvas & Drawing System Integration

**Goal**: Migrate canvas functionality to work with room-based JWT APIs.

#### Step 2.1: Update Canvas Component
- **File**: `frontend/src/Canvas.js`
- **Action**: Integrate with JWT room system
- **Changes**:
  - Accept `auth` and `roomId` props instead of `currentUser` string
  - Update stroke submission to use `/rooms/{id}/strokes` endpoint
  - Integrate Socket.IO with JWT authentication
  - Add permission checks (disable drawing for viewers)

#### Step 2.2: Update canvasBackend.js
- **File**: `frontend/src/canvasBackend.js`
- **Action**: Replace all legacy API calls
- **Changes**:
  - Replace `user=username` with `Authorization: Bearer ${token}`
  - Update endpoints from global (`/submitNewLine`) to room-based (`/rooms/{id}/strokes`)
  - Remove functions like `listRooms`, `createRoom` (use api/rooms.js instead)
  - Update undo/redo to work with room context

#### Step 2.3: Create RoomCanvas Component
- **File**: `frontend/src/components/RoomCanvas.jsx`
- **Action**: Room-aware wrapper for Canvas
- **Features**:
  - Loads room details and permissions
  - Handles Socket.IO room joining/leaving
  - Manages room-specific state (strokes, users)
  - Provides context to Canvas component

### Phase 3: Room Management Integration

**Goal**: Connect all room features to a cohesive UI.

#### Step 3.1: Enhance Dashboard Component
- **File**: `frontend/src/pages/Dashboard.jsx`
- **Action**: Add missing UI features
- **Features**:
  - Room creation with all types (public/private/secure)
  - Invitations management (send/receive)
  - Room settings access
  - Member management
  - Room deletion/archiving

#### Step 3.2: Complete Room Page
- **File**: `frontend/src/pages/Room.jsx`
- **Action**: Integrate with RoomCanvas
- **Features**:
  - Room info display (name, type, members, permissions)
  - Settings button for owners
  - Leave room functionality
  - Permission-based UI (hide controls for viewers)

#### Step 3.3: Room Settings Implementation
- **File**: `frontend/src/pages/RoomSettings.jsx`
- **Action**: Complete room management UI
- **Features**:
  - Edit room name/description
  - Manage room type and privacy
  - Member role management
  - Invitation management
  - Room deletion/archiving
  - Transfer ownership

### Phase 4: Real-time & Notifications Integration

**Goal**: Complete real-time collaboration features.

#### Step 4.1: Enhance Socket.IO Integration
- **File**: `frontend/src/socket.js`
- **Action**: Add room-specific event handling
- **Features**:
  - Room-based stroke broadcasting
  - User join/leave notifications
  - Invitation notifications
  - Room update notifications

#### Step 4.2: Complete Notifications System
- **File**: `frontend/src/components/NotificationsMenu.jsx`
- **Action**: Add all notification types
- **Features**:
  - Invitation notifications with accept/decline actions
  - Room activity notifications
  - User join/leave notifications
  - System notifications

#### Step 4.3: Backend Socket.IO Enhancement
- **File**: `backend/routes/socketio_handlers.py`
- **Action**: Add JWT authentication and room events
- **Features**:
  - JWT token verification for socket connections
  - Room-based event broadcasting
  - User presence tracking
  - Notification delivery

### Phase 5: User Experience & Polish

**Goal**: Create seamless user flows and fix UX issues.

#### Step 5.1: Navigation Flow
- **Action**: Create logical user journeys
- **Features**:
  - Landing page redirects to login or dashboard
  - Breadcrumb navigation
  - Back buttons and navigation consistency
  - Deep linking to rooms

#### Step 5.2: State Management
- **Action**: Centralize state management
- **Features**:
  - Global auth context
  - Room state management
  - Optimistic UI updates
  - Error handling and retry logic

#### Step 5.3: Mobile & Responsive Design
- **Action**: Ensure all new components are responsive
- **Features**:
  - Mobile-friendly room management
  - Touch-friendly canvas interactions
  - Responsive navigation

### Phase 6: Testing & Bug Fixes

**Goal**: Ensure all features work end-to-end.

#### Step 6.1: Integration Testing
- **Action**: Test complete user workflows
- **Flows**:
  - User registration → room creation → drawing → sharing
  - Invitation flow: send → receive → accept → collaborate
  - Permission changes: owner → change role → test restrictions
  - Real-time: multiple users drawing simultaneously

#### Step 6.2: API Consistency
- **Action**: Ensure frontend matches backend expectations
- **Checks**:
  - All JWT endpoints have proper headers
  - Room IDs are passed correctly
  - Socket.IO events match backend handlers
  - Error responses are handled gracefully

#### Step 6.3: Performance Optimization
- **Action**: Optimize real-time performance
- **Features**:
  - Efficient stroke batching
  - Socket.IO connection management
  - Canvas rendering optimization
  - Memory leak prevention

## Implementation Priorities

### Critical Path (Must complete first):
1. **Phase 1.1-1.3**: Route unification and auth system
2. **Phase 2.1-2.2**: Canvas JWT integration
3. **Phase 3.1**: Basic Dashboard room management

### Secondary Features:
4. **Phase 3.2-3.3**: Complete room management
5. **Phase 4.1-4.2**: Real-time features
6. **Phase 5.1-5.2**: UX improvements

### Polish & Testing:
7. **Phase 6**: Testing and bug fixes

## Key Files That Need Major Changes

### Frontend Files to Modify:
1. `frontend/src/index.js` - Route logic
2. `frontend/src/App.js` - Convert to JWT
3. `frontend/src/Canvas.js` - Room integration
4. `frontend/src/canvasBackend.js` - API modernization
5. `frontend/src/pages/Dashboard.jsx` - Feature completion
6. `frontend/src/pages/Room.jsx` - Canvas integration

### Frontend Files to Create:
1. `frontend/src/components/Layout.jsx`
2. `frontend/src/components/RoomCanvas.jsx`
3. `frontend/src/contexts/AuthContext.jsx`

### Backend Files to Verify:
1. `backend/routes/socketio_handlers.py` - JWT socket auth
2. `backend/routes/rooms.py` - Missing endpoints
3. `backend/routes/auth.py` - Refresh token logic

## Success Criteria

- ✅ Single authentication system (JWT only)
- ✅ All features accessible through unified UI
- ✅ Real-time collaboration working end-to-end
- ✅ Room-based permissions enforced in UI
- ✅ Invitations and notifications functional
- ✅ Mobile-responsive interface
- ✅ No authentication conflicts or dead-end pages

This plan provides LLMs with a clear, step-by-step approach to unify your two frontend systems while preserving all the backend work you've completed.