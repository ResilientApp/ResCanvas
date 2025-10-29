# backend/tests/test_rate_limiting.py
"""
Comprehensive tests for API rate limiting.

Tests cover:
- Global rate limits (per IP)
- Endpoint-specific limits
- Authentication endpoint limits
- Stroke submission limits
- Room operation limits
- Rate limit headers
- 429 error responses
- Authenticated vs anonymous limits

NOTE: These tests are currently skipped in CI because they require real rate limiting
infrastructure which conflicts with the TESTING=1 environment variable that enables
MockLimiter. To run these tests manually:
  1. Unset TESTING environment variable
  2. Ensure Redis is running
  3. Run: pytest tests/test_rate_limiting.py
"""

import pytest
import os
import time
import json
from datetime import datetime, timezone
from flask import Flask

# Skip all tests in this module if TESTING=1 (MockLimiter is active)
pytestmark = pytest.mark.skipif(
    os.environ.get('TESTING') == '1',
    reason="Rate limiting tests require real limiter, but TESTING=1 forces MockLimiter"
)
from middleware.rate_limit import init_limiter, limiter
from services.db import redis_client


@pytest.fixture
def rate_limited_app(app):
    """Create app with rate limiting enabled for testing."""
    # Initialize rate limiter
    app.config['RATE_LIMIT_ENABLED'] = True
    app.config['RATE_LIMIT_STORAGE'] = 'redis://localhost:6379'
    init_limiter(app)
    return app


@pytest.fixture
def cleanup_rate_limits():
    """Clean up rate limit counters after each test."""
    yield
    # Clean up Redis keys used for rate limiting
    try:
        for key in redis_client.scan_iter("LIMITER/*"):
            redis_client.delete(key)
    except Exception:
        pass


@pytest.mark.unit
@pytest.mark.auth
class TestAuthenticationRateLimits:
    """Test rate limits on authentication endpoints."""
    
    def test_login_rate_limit(self, client, cleanup_rate_limits):
        """Test login endpoint has rate limit of 100/hour."""
        # Make requests until hitting limit
        for i in range(105):
            response = client.post('/auth/login', json={
                'username': f'user{i}',
                'password': 'password'
            })
            
            if i < 100:
                # Should accept first 100 requests (even if auth fails)
                assert response.status_code in [401, 400]  # Auth failure is OK
            else:
                # Should block after 100 requests
                assert response.status_code == 429
                data = response.get_json()
                assert data['error'] == 'rate_limit_exceeded'
                assert 'X-RateLimit-Limit' in response.headers
                assert 'Retry-After' in response.headers
                break
    
    def test_register_rate_limit(self, client, cleanup_rate_limits):
        """Test register endpoint has rate limit of 50/hour."""
        for i in range(55):
            response = client.post('/auth/register', json={
                'username': f'newuser{i}_{int(time.time())}',
                'password': 'password123'
            })
            
            if i < 50:
                # Should accept first 50 requests
                assert response.status_code in [201, 409, 400]
            else:
                # Should block after 50 requests
                assert response.status_code == 429
                data = response.get_json()
                assert 'rate_limit_exceeded' in data['error']
                break
    
    def test_refresh_rate_limit(self, client, cleanup_rate_limits):
        """Test refresh endpoint has rate limit of 200/hour."""
        # Refresh tokens don't need to be valid to test rate limiting
        for i in range(205):
            response = client.post('/auth/refresh')
            
            if i < 200:
                # Should accept first 200 requests (even if refresh fails)
                assert response.status_code in [401, 400]
            else:
                # Should block after 200 requests
                assert response.status_code == 429
                break


@pytest.mark.unit
@pytest.mark.stroke
class TestStrokeRateLimits:
    """Test rate limits on stroke submission endpoints."""
    
    def test_stroke_submission_rate_limit(self, client, auth_token, test_room, cleanup_rate_limits):
        """Test stroke submission limited to 300/minute."""
        room_id = test_room['id']
        
        # Rapidly submit strokes
        rate_limited = False
        for i in range(310):
            response = client.post(
                '/submitNewLineRoom',
                headers={'Authorization': f'Bearer {auth_token}'},
                json={
                    'roomId': room_id,
                    'value': {'pathData': [[i, i]], 'color': '#000000'}
                }
            )
            
            if response.status_code == 429:
                rate_limited = True
                data = response.get_json()
                assert data['error'] == 'rate_limit_exceeded'
                assert int(response.headers['X-RateLimit-Limit']) == 300
                break
        
        assert rate_limited, "Should hit rate limit before 310 requests"
    
    def test_undo_redo_rate_limit(self, client, auth_token, test_room, cleanup_rate_limits):
        """Test undo/redo operations limited to 60/minute."""
        room_id = test_room['id']
        
        # Rapidly undo
        for i in range(65):
            response = client.post(
                f'/rooms/{room_id}/undo',
                headers={'Authorization': f'Bearer {auth_token}'},
                json={'userId': 'testuser'}
            )
            
            if i < 60:
                assert response.status_code in [200, 400, 404]  # May fail but not rate limited
            else:
                assert response.status_code == 429
                break


@pytest.mark.unit
@pytest.mark.room
class TestRoomOperationRateLimits:
    """Test rate limits on room management operations."""
    
    def test_room_creation_rate_limit(self, client, auth_token, cleanup_rate_limits):
        """Test room creation limited to 10/hour."""
        for i in range(12):
            response = client.post(
                '/rooms',
                headers={'Authorization': f'Bearer {auth_token}'},
                json={
                    'name': f'Test Room {i}_{int(time.time())}',
                    'type': 'public'
                }
            )
            
            if i < 10:
                assert response.status_code == 201
            else:
                assert response.status_code == 429
                data = response.get_json()
                assert 'rate_limit_exceeded' in data['error']
                break
    
    def test_room_clear_rate_limit(self, client, test_room, cleanup_rate_limits):
        """Test canvas clear limited to 5/minute per room."""
        room_id = test_room['id']
        
        for i in range(7):
            response = client.post(
                '/submitClearCanvasTimestamp',
                json={'roomId': room_id, 'ts': int(time.time() * 1000)}
            )
            
            if i < 5:
                assert response.status_code in [200, 400]
            else:
                assert response.status_code == 429
                break
    
    def test_search_rate_limit(self, client, auth_token, cleanup_rate_limits):
        """Test search endpoints limited to 30/minute."""
        for i in range(35):
            response = client.get(
                '/users/suggest?q=test',
                headers={'Authorization': f'Bearer {auth_token}'}
            )
            
            if i < 30:
                assert response.status_code == 200
            else:
                assert response.status_code == 429
                break


@pytest.mark.integration
class TestRateLimitHeaders:
    """Test that rate limit headers are properly set."""
    
    def test_rate_limit_headers_present(self, client, auth_token):
        """Test that rate limit headers are included in responses."""
        response = client.get('/rooms', headers={'Authorization': f'Bearer {auth_token}'})
        
        # Headers should be present (even on success)
        assert 'X-RateLimit-Limit' in response.headers
        assert 'X-RateLimit-Remaining' in response.headers
        assert int(response.headers['X-RateLimit-Remaining']) >= 0
    
    def test_rate_limit_429_response_format(self, client, cleanup_rate_limits):
        """Test that 429 responses have correct format."""
        # Trigger rate limit on login
        for _ in range(105):
            response = client.post('/auth/login', json={
                'username': 'test', 'password': 'test'
            })
        
        assert response.status_code == 429
        data = response.get_json()
        
        # Check error response format
        assert data['status'] == 'error'
        assert data['error'] == 'rate_limit_exceeded'
        assert 'message' in data
        
        # Check headers
        assert 'X-RateLimit-Limit' in response.headers
        assert 'X-RateLimit-Remaining' in response.headers
        assert 'X-RateLimit-Reset' in response.headers
        assert 'Retry-After' in response.headers
        
        # Verify Retry-After is reasonable
        retry_after = int(response.headers['Retry-After'])
        assert 0 < retry_after <= 3600  # Should be within an hour


@pytest.mark.integration
class TestAuthenticatedVsAnonymousLimits:
    """Test different rate limits for authenticated vs anonymous users."""
    
    def test_authenticated_users_higher_global_limit(self, client, auth_token, cleanup_rate_limits):
        """Authenticated users should have higher global limits."""
        # This is more of a configuration test
        # In production, authenticated users get 5000/hour vs 1000/hour for anonymous
        
        # Make authenticated request
        response = client.get('/rooms', headers={'Authorization': f'Bearer {auth_token}'})
        
        # Check that limit is higher for authenticated users
        limit = int(response.headers.get('X-RateLimit-Limit', 0))
        assert limit > 1000  # Should be 5000 for authenticated
    
    def test_anonymous_requests_lower_limit(self, client, cleanup_rate_limits):
        """Anonymous users should have lower global limits."""
        # Make request without auth
        response = client.get('/rooms')
        
        # Should have lower limit
        if 'X-RateLimit-Limit' in response.headers:
            limit = int(response.headers['X-RateLimit-Limit'])
            assert limit <= 1000  # Anonymous limit


@pytest.mark.integration
class TestRateLimitCORSCompatibility:
    """Test that rate limit errors include proper CORS headers."""
    
    def test_429_includes_cors_headers(self, client, cleanup_rate_limits):
        """Test that 429 responses include CORS headers."""
        # Trigger rate limit
        for _ in range(105):
            response = client.post('/auth/login', 
                headers={'Origin': 'http://localhost:3000'},
                json={'username': 'test', 'password': 'test'}
            )
        
        assert response.status_code == 429
        
        # CORS headers should be present
        assert 'Access-Control-Allow-Origin' in response.headers
        assert 'Access-Control-Allow-Credentials' in response.headers


@pytest.mark.integration  
class TestRateLimitRecovery:
    """Test that rate limits reset properly."""
    
    @pytest.mark.slow
    def test_rate_limit_resets_after_window(self, client, cleanup_rate_limits):
        """Test that rate limits reset after time window."""
        # This test would need to wait for actual time to pass
        # In a real scenario, you'd use time mocking or shorter windows for testing
        pytest.skip("Requires time manipulation or long wait")


@pytest.mark.unit
class TestRateLimitConfiguration:
    """Test rate limit configuration and environment variables."""
    
    def test_rate_limiting_can_be_disabled(self, app):
        """Test that rate limiting can be disabled via config."""
        app.config['RATE_LIMIT_ENABLED'] = False
        test_limiter = init_limiter(app)
        
        assert test_limiter is not None
        # When disabled, limiter should be created but not enforced
    
    def test_custom_rate_limits_from_env(self, app, monkeypatch):
        """Test that rate limits can be customized via environment variables."""
        monkeypatch.setenv('RATE_LIMIT_LOGIN_HOURLY', '50')
        monkeypatch.setenv('RATE_LIMIT_STROKE_MINUTE', '100')
        
        # Re-import config to pick up new values
        from importlib import reload
        import config
        reload(config)
        
        assert config.RATE_LIMIT_LOGIN_HOURLY == 50
        assert config.RATE_LIMIT_STROKE_MINUTE == 100
