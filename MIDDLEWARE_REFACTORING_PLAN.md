# Server-Side Security Middleware Refactoring Plan

## Overview
This document tracks the comprehensive server-side security enforcement implementation across all backend routes.

## Objectives
1. **Authentication Enforcement**: All protected endpoints must verify JWT server-side via `@require_auth`
2. **Authorization Enforcement**: Room-specific endpoints must verify access permissions via `@require_room_access` or `@require_room_owner`
3. **Input Validation**: All endpoints receiving data must validate server-side via `@validate_request_data`
4. **Eliminate Client Trust**: Remove all inline `_authed_user()` calls and client-side-only validation

## Middleware Decorators Available
- `@require_auth` - Enforces authentication, injects `g.current_user` and `g.token_claims`
- `@require_auth_optional` - Attempts auth but continues without it
- `@require_room_access(room_id_param)` - Enforces room visibility (owner/member/public)
- `@require_room_owner(room_id_param)` - Enforces room ownership
- `@validate_request_data(schema)` - Server-side input validation, injects `g.validated_data`

## Route Refactoring Checklist

### backend/routes/rooms.py (25+ endpoints)
- [x] POST /rooms - ✅ Complete (create_room with @require_auth + @validate_request_data)
- [x] GET /rooms - ✅ Complete (list_rooms with @require_auth)
- [ ] GET /users/suggest - Add @require_auth
- [ ] GET /rooms/suggest - Add @require_auth
- [ ] POST /rooms/<roomId>/share - Add @require_auth + @require_room_owner + @validate_request_data
- [ ] POST /rooms/<roomId>/admin/fill_wrapped_key - Add @require_auth + @require_room_owner
- [ ] POST /rooms/<roomId>/strokes - Add @require_auth + @require_room_access + @validate_request_data (stroke validation)
- [ ] GET /rooms/<roomId>/strokes - Add @require_auth + @require_room_access
- [ ] POST /rooms/<roomId>/undo - Add @require_auth + @require_room_access
- [ ] GET /rooms/<roomId>/undo_redo_status - Add @require_auth + @require_room_access
- [ ] POST /rooms/<roomId>/redo - Add @require_auth + @require_room_access
- [ ] POST /rooms/<roomId>/reset_my_stacks - Add @require_auth + @require_room_access
- [ ] POST /rooms/<roomId>/clear - Add @require_auth + @require_room_owner
- [ ] GET /rooms/<roomId> - Add @require_auth + @require_room_access
- [ ] GET /rooms/<roomId>/members - Add @require_auth + @require_room_access
- [ ] PATCH /rooms/<roomId>/permissions - Add @require_auth + @require_room_owner + @validate_request_data
- [ ] PATCH /rooms/<roomId> - Add @require_auth + @require_room_owner + @validate_request_data
- [ ] POST /rooms/<roomId>/transfer - Add @require_auth + @require_room_owner + @validate_request_data
- [ ] POST /rooms/<roomId>/leave - Add @require_auth + @require_room_access
- [ ] DELETE /rooms/<roomId> - Add @require_auth + @require_room_owner
- [ ] POST /rooms/<roomId>/invite - Add @require_auth + @require_room_owner + @validate_request_data

### backend/routes/auth.py (5 endpoints)
- [ ] POST /auth/register - Add @validate_request_data (username/password validation)
- [ ] POST /auth/login - Add @validate_request_data (username/password validation)
- [ ] POST /auth/refresh - No auth decorator needed (validates refresh token from cookie)
- [ ] POST /auth/logout - Add @require_auth_optional (works with or without token)
- [ ] GET /auth/me - Add @require_auth

### backend/routes/new_line.py
- [ ] Review and add @require_auth + stroke validation

### backend/routes/submit_room_line.py
- [ ] Review and add @require_auth + @require_room_access + stroke validation

### backend/routes/clear_canvas.py
- [ ] Review and add @require_auth

### backend/routes/undo_redo.py
- [ ] Review and add @require_auth

### backend/routes/admin.py
- [ ] Review and add @require_auth with admin role check

### backend/routes/get_canvas_data.py
- [ ] Review and add @require_auth

### backend/routes/metrics.py
- [ ] Review - likely public endpoint, may use @require_auth_optional

### backend/routes/socketio_handlers.py
- [ ] Update WebSocket handlers to use middleware patterns
- [ ] Implement server-side JWT verification for socket connections
- [ ] Add room access validation for socket events

## Validation Schemas to Create

### Room Creation/Update Schema
```python
room_create_schema = {
    "name": {"validator": validate_room_name, "required": True},
    "type": {"validator": validate_room_type, "required": False},
    "description": {"validator": validate_string_optional(max_length=2000), "required": False}
}
```

### Stroke Data Schema
```python
stroke_schema = {
    "tool": {"validator": validate_tool_type, "required": True},
    "points": {"validator": validate_points_array, "required": True},
    "color": {"validator": validate_color, "required": True},
    "strokeWidth": {"validator": validate_line_width, "required": True},
    "roomId": {"validator": validate_object_id, "required": True}
}
```

### Share/Invite Schema
```python
share_schema = {
    "userId": {"validator": validate_member_id, "required": False},
    "username": {"validator": validate_username, "required": False},
    "role": {"validator": validate_member_role, "required": False}
}
```

## Testing Checklist
- [ ] All protected endpoints return 401 without valid JWT
- [ ] Expired JWTs are rejected with 401
- [ ] Invalid JWTs are rejected with 401
- [ ] Room access control works (owner/member/public visibility)
- [ ] Room owner operations are restricted to owners only
- [ ] Input validation rejects invalid data with 400
- [ ] Multi-tab authentication still works after server-side enforcement
- [ ] Socket.IO authentication works after middleware refactoring

## Implementation Priority
1. ✅ Complete rooms.py core endpoints (create, list, get, update, delete)
2. Complete rooms.py stroke endpoints (POST/GET strokes, undo, redo, clear)
3. Complete rooms.py collaboration endpoints (share, invite, members, permissions)
4. Update auth.py endpoints with validation
5. Update other route files (new_line, submit_room_line, etc.)
6. Refactor socketio_handlers.py for server-side auth
7. Comprehensive testing and validation

## Notes
- All error responses follow format: `{"status": "error", "message": "...", "code": "ERROR_CODE"}`
- Success responses follow format: `{"status": "ok", ...data}`
- Middleware injects `g.current_user`, `g.token_claims`, `g.validated_data` for handlers to use
- Remove all `_authed_user()` inline calls - use `g.current_user` instead
- Server-side validation is THE source of truth - client-side is UX only
