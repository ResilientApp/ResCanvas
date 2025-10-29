# Rate Limiting Documentation

## Overview

ResCanvas implements comprehensive API rate limiting to protect backend services from abuse, ensure fair resource allocation, and maintain system stability. The rate limiting system uses Redis for distributed counters and Flask-Limiter for enforcement.

## Rate Limit Tiers

### Global Limits (Per IP)

- **Anonymous users**: 1000 requests/hour
- **Authenticated users**: 5000 requests/hour

These limits apply to all API endpoints as a baseline.

### Authentication Endpoints

| Endpoint | Limit | Reason |
|----------|-------|--------|
| POST /auth/login | 100/hour | Prevent brute force attacks |
| POST /auth/register | 50/hour | Prevent spam accounts |
| POST /auth/refresh | 200/hour | Normal token refresh patterns |

### Stroke Operations

| Endpoint | Limit | Reason |
|----------|-------|--------|
| POST /submitNewLineRoom | 300/minute | Active drawing sessions |
| POST /rooms/\<id\>/strokes | 300/minute | Alternative stroke endpoint |
| POST /rooms/\<id\>/undo | 60/minute | Reasonable undo frequency |
| POST /rooms/\<id\>/redo | 60/minute | Reasonable redo frequency |

### Room Operations

| Endpoint | Limit | Reason |
|----------|-------|--------|
| POST /rooms | 10/hour | Prevent room spam |
| POST /submitClearCanvasTimestamp | 5/minute per room | Prevent clear spam |
| PUT /rooms/\<id\> | 20/minute | Normal editing frequency |

### Search & Discovery

| Endpoint | Limit | Reason |
|----------|-------|--------|
| GET /users/suggest | 30/minute | User search |
| GET /rooms/suggest | 30/minute | Room search |

## Configuration

### Environment Variables

All rate limits can be customized via environment variables:

```bash
# Enable/disable rate limiting
RATE_LIMIT_ENABLED=True

# Redis storage for rate limit counters
RATE_LIMIT_STORAGE=redis://localhost:6379

# Global limits
RATE_LIMIT_GLOBAL_HOURLY=1000
RATE_LIMIT_GLOBAL_AUTH_HOURLY=5000

# Authentication endpoints
RATE_LIMIT_LOGIN_HOURLY=100
RATE_LIMIT_REGISTER_HOURLY=50
RATE_LIMIT_REFRESH_HOURLY=200

# Stroke operations
RATE_LIMIT_STROKE_MINUTE=300
RATE_LIMIT_UNDO_REDO_MINUTE=60

# Room operations
RATE_LIMIT_ROOM_CREATE_HOURLY=10
RATE_LIMIT_ROOM_CLEAR_MINUTE=5
RATE_LIMIT_ROOM_UPDATE_MINUTE=20

# Search and discovery
RATE_LIMIT_SEARCH_MINUTE=30

# Burst protection
RATE_LIMIT_BURST_SECOND=10
```

### Disabling Rate Limiting

For development or testing, rate limiting can be disabled:

```bash
RATE_LIMIT_ENABLED=False
```

## Response Headers

All API responses include rate limit headers:

```http
X-RateLimit-Limit: 300        # Maximum requests allowed
X-RateLimit-Remaining: 245    # Requests remaining in window
X-RateLimit-Reset: 1730000000 # Unix timestamp when limit resets
```

When rate limited (429 response), additional header:

```http
Retry-After: 45               # Seconds to wait before retrying
```

## Error Response Format

When rate limit is exceeded (HTTP 429):

```json
{
  "status": "error",
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded. Please try again in 45 seconds."
}
```

## Frontend Integration

### Using the API Client

The enhanced API client (`frontend/src/api/apiClient.js`) automatically handles rate limits:

```javascript
import apiClient from './api/apiClient';

try {
  const room = await apiClient.post('/rooms', {
    name: 'My Room',
    type: 'public'
  });
} catch (error) {
  if (error.status === 429) {
    // Rate limited - auto-retry is already attempted
    console.log('Rate limited:', error.message);
  }
}
```

### Displaying Rate Limit Warnings

Use the `RateLimitWarning` component:

```javascript
import RateLimitWarning from './components/RateLimitWarning';

function MyComponent() {
  const [rateLimitInfo, setRateLimitInfo] = useState(null);

  try {
    await apiClient.post('/rooms/<id>/strokes', strokeData);
  } catch (error) {
    if (error.status === 429) {
      setRateLimitInfo({
        exceeded: true,
        limit: error.rateLimitInfo?.limit,
        remaining: 0,
        reset: error.rateLimitInfo?.reset,
      });
    }
  }

  return (
    <div>
      {rateLimitInfo && (
        <RateLimitWarning 
          rateLimitInfo={rateLimitInfo}
          onDismiss={() => setRateLimitInfo(null)}
        />
      )}
      {/* Your component content */}
    </div>
  );
}
```

### Automatic Retry with Backoff

The rate limit handler includes automatic retry:

```javascript
import { retryWithBackoff } from './utils/rateLimitHandler';

const result = await retryWithBackoff(
  async () => {
    return await apiClient.post('/endpoint', data);
  },
  {
    maxAttempts: 3,
    baseDelay: 1000,
    onRetry: (attempt, delay) => {
      console.log(`Retrying attempt ${attempt} after ${delay}ms`);
    }
  }
);
```

## Backend Implementation

### Adding Rate Limits to New Endpoints

1. **Import the limiter**:

```python
from middleware.rate_limit import limiter
from config import RATE_LIMIT_STROKE_MINUTE
```

2. **Apply decorator**:

```python
@my_blueprint.route('/my-endpoint', methods=['POST'])
@require_auth
@limiter.limit(f"{RATE_LIMIT_STROKE_MINUTE}/minute")
def my_endpoint():
    # Your endpoint logic
    pass
```

3. **Room-specific limits**:

```python
@limiter.limit("5/minute", key_func=lambda: request.get_json().get('roomId'))
def room_specific_endpoint():
    pass
```

### Custom Rate Limit Functions

For complex scenarios:

```python
from middleware.rate_limit import user_rate_limit, room_specific_limit

@my_blueprint.route('/endpoint', methods=['POST'])
@user_rate_limit("100/hour")  # Per authenticated user
def my_endpoint():
    pass
```

## Monitoring & Logging

### Rate Limit Violations

Rate limit violations are automatically logged:

```
WARNING: Rate limit exceeded: user_id=abc123, ip=192.168.1.1, endpoint=submit_stroke, method=POST
```

### Redis Inspection

Check current rate limit counters:

```bash
redis-cli
> KEYS LIMITER/*
> GET LIMITER/<key>
```

### Metrics

Monitor rate limit hits in your logging/metrics system. Key metrics:

- Number of 429 responses per endpoint
- Top rate-limited IPs/users
- Rate limit reset frequency
- Average retry attempts

## Testing

### Unit Tests

Run rate limiting tests:

```bash
cd backend
pytest tests/test_rate_limiting.py -v
```

### Manual Testing

Test rate limits with rapid requests:

```bash
# Test login rate limit (should block after 100 requests)
for i in {1..105}; do
  curl -X POST http://localhost:10010/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"test"}'
  echo ""
done
```

## Best Practices

### For Developers

1. **Always check response headers** - Monitor `X-RateLimit-Remaining`
2. **Implement retry logic** - Use exponential backoff
3. **Handle 429 gracefully** - Show user-friendly messages
4. **Queue requests** - Don't spam the API
5. **Cache responses** - Reduce unnecessary requests

### For Operations

1. **Monitor Redis** - Ensure rate limit counters are working
2. **Adjust limits** - Based on actual usage patterns
3. **Set alerts** - For abnormal rate limit hits
4. **Log violations** - Track abuse patterns

## Troubleshooting

### Rate Limits Not Working

1. Check Redis connection:
   ```bash
   redis-cli ping
   ```

2. Verify environment variables:
   ```bash
   echo $RATE_LIMIT_ENABLED
   echo $RATE_LIMIT_STORAGE
   ```

3. Check limiter initialization in `app.py`

### False Positives

If legitimate users are being rate limited:

1. Check if limits are too restrictive
2. Verify IP detection is working correctly
3. Consider whitelisting specific IPs/users
4. Adjust limits via environment variables

### Redis Memory Issues

If Redis memory is growing:

1. Rate limit keys expire automatically
2. Check TTL on keys: `redis-cli TTL LIMITER/<key>`
3. Consider separate Redis instance for rate limiting

## Security Considerations

1. **Rate limits are server-side** - Never trust client-side throttling
2. **Per-IP tracking** - Prevents distributed abuse
3. **Authentication-aware** - Different limits for authenticated users
4. **Bypass protection** - Limits cannot be circumvented client-side
5. **Graceful degradation** - If Redis fails, requests still succeed (swallow_errors=True)

## Future Enhancements

Potential improvements:

- [ ] Adaptive rate limiting based on server load
- [ ] Whitelist/blacklist support
- [ ] Per-user custom limits
- [ ] Geographic rate limiting
- [ ] Real-time rate limit dashboard
- [ ] Machine learning for abuse detection
