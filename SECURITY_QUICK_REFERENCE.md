# Server-Side Security Implementation - Quick Reference

## How It Works

### Before (Client-Side Only) ❌
```python
@rooms_bp.route("/rooms", methods=["POST"])
def create_room():
    claims = _authed_user()  # Inline, repeated everywhere
    if not claims:
        return jsonify({"status":"error","message":"Unauthorized"}), 401
    
    data = request.get_json(force=True) or {}
    name = data.get("name", "").strip()  # No validation
    # ... rest of logic
```

**Problems:**
- Authentication logic duplicated in every endpoint
- No server-side input validation
- Easy to forget security checks
- Client could bypass by sending fake JWTs

### After (Server-Side Enforced) ✅
```python
@rooms_bp.route("/rooms", methods=["POST"])
@require_auth  # Enforces JWT verification
@validate_request_data({
    "name": {"validator": validate_room_name, "required": True},
    "type": {"validator": validate_room_type, "required": False},
})
def create_room():
    user = g.current_user      # Injected by middleware
    claims = g.token_claims    # Verified JWT claims
    data = g.validated_data    # Pre-validated input
    
    # Business logic only - security is guaranteed
    name = data.get("name")
    # ...
```

**Benefits:**
- ✅ JWT verified server-side (signature + expiration)
- ✅ User existence confirmed in database
- ✅ Input validated before handler runs
- ✅ Clean, readable code
- ✅ Impossible to bypass

## Decorator Usage Patterns

### Pattern 1: Basic Authentication
```python
@require_auth
def list_rooms():
    user = g.current_user  # Guaranteed to exist
```

### Pattern 2: Room Access Control
```python
@require_auth
@require_room_access(room_id_param="roomId")
def get_room(roomId):
    user = g.current_user
    room = g.current_room  # Guaranteed accessible
```

### Pattern 3: Room Ownership
```python
@require_auth
@require_room_owner(room_id_param="roomId")
def delete_room(roomId):
    user = g.current_user
    room = g.current_room  # Guaranteed owned by user
```

### Pattern 4: With Input Validation
```python
@require_auth
@require_room_access(room_id_param="roomId")
@validate_request_data({
    "color": {"validator": validate_color, "required": True},
    "strokeWidth": {"validator": validate_line_width, "required": True}
})
def add_stroke(roomId):
    user = g.current_user
    room = g.current_room
    data = g.validated_data  # Pre-validated
```

### Pattern 5: Optional Authentication
```python
@require_auth_optional
def public_metrics():
    user = g.current_user  # May be None
    if user:
        # Return personalized metrics
    else:
        # Return public metrics
```

## Validation Schema Reference

### Room Schema
```python
room_create_schema = {
    "name": {"validator": validate_room_name, "required": True},
    "type": {"validator": validate_room_type, "required": False},
    "description": {"validator": validate_optional_string(max_length=2000), "required": False}
}
```

### Stroke Schema
```python
stroke_schema = {
    "tool": {"validator": validate_tool_type, "required": True},
    "points": {"validator": validate_points_array, "required": True},
    "color": {"validator": validate_color, "required": True},
    "strokeWidth": {"validator": validate_line_width, "required": True}
}
```

### Share Schema
```python
share_schema = {
    "usernames": {"validator": validate_usernames_array, "required": False},
    "users": {"validator": validate_share_users_array, "required": False},
    "role": {"validator": validate_member_role, "required": False}
}
```

## Error Response Format

### Authentication Error (401)
```json
{
    "status": "error",
    "message": "Invalid or expired token",
    "code": "INVALID_TOKEN"
}
```

### Authorization Error (403)
```json
{
    "status": "error",
    "message": "Access denied to this room",
    "code": "ACCESS_DENIED"
}
```

### Validation Error (400)
```json
{
    "status": "error",
    "message": "Room name must be at least 1 character",
    "code": "VALIDATION_ERROR",
    "field": "name"
}
```

## Frontend Integration

### Making Authenticated Requests
```javascript
// frontend/src/api/*.js

const token = localStorage.getItem('token');
const response = await fetch(`${API_URL}/rooms`, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        name: 'My Room',
        type: 'private'
    })
});

if (response.status === 401) {
    // Token expired - redirect to login
    localStorage.removeItem('auth');
    window.location.href = '/login';
}
```

### Checking Auth Status Server-Side
```javascript
// Verify token is still valid server-side
const response = await fetch(`${API_URL}/api/auth/check`, {
    headers: { 'Authorization': `Bearer ${token}` }
});

const { authenticated, user } = await response.json();
if (!authenticated) {
    // Server says token is invalid
    handleLogout();
}
```

## Security Checklist for New Endpoints

When adding a new protected endpoint:

- [ ] Add `@require_auth` decorator
- [ ] If room-specific, add `@require_room_access` or `@require_room_owner`
- [ ] If accepting input, add `@validate_request_data` with schema
- [ ] Use `g.current_user` instead of parsing JWT manually
- [ ] Use `g.current_room` for room data (if applicable)
- [ ] Use `g.validated_data` for request input
- [ ] Return consistent error format (401/403/400)
- [ ] Test with: no token, invalid token, expired token, wrong permissions

## Common Mistakes to Avoid

❌ **Don't do this:**
```python
# Parsing JWT manually (duplicates middleware logic)
token = request.headers.get('Authorization', '').replace('Bearer ', '')
claims = jwt.decode(token, JWT_SECRET)
```

✅ **Do this instead:**
```python
# Use middleware-injected data
@require_auth
def my_endpoint():
    claims = g.token_claims
```

---

❌ **Don't do this:**
```python
# Client-side-only validation
data = request.get_json()
name = data.get("name")  # No validation!
```

✅ **Do this instead:**
```python
# Server-side validation enforced
@validate_request_data({
    "name": {"validator": validate_room_name, "required": True}
})
def my_endpoint():
    data = g.validated_data
    name = data.get("name")  # Guaranteed valid
```

---

❌ **Don't do this:**
```python
# Trusting client-sent user ID
user_id = request.json.get("userId")
user = users_coll.find_one({"_id": ObjectId(user_id)})
```

✅ **Do this instead:**
```python
# Use server-verified user from middleware
@require_auth
def my_endpoint():
    user = g.current_user  # From verified JWT + DB lookup
```

## Performance Considerations

### JWT Validation
- Currently validates on every request (secure but may be slow at scale)
- **Future optimization:** Add Redis caching layer for validated tokens
- **Future optimization:** Short TTL cache (30 seconds) for user lookups

### Database Queries
- Room access checks query `shares_coll` on every request
- **Future optimization:** Cache room membership in Redis with TTL
- **Future optimization:** Denormalize frequently-accessed data

### Best Practices
- Keep middleware decorators lightweight
- Move expensive operations to background tasks where possible
- Use database indexes on frequently-queried fields (userId, roomId, etc.)

## Summary

**Server-side security is now the source of truth.**

- Client-side validation = UX only
- Server-side validation = ENFORCEMENT
- All protected endpoints verify JWT server-side
- All input is validated before processing
- Room access is cryptographically verified

**The middleware pattern makes security:**
- ✅ Explicit (decorators are visible)
- ✅ Consistent (same logic everywhere)
- ✅ Maintainable (single source of truth)
- ✅ Secure (impossible to bypass)
