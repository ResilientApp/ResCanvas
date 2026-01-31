"""
Integration test fixtures for ResCanvas backend.

This conftest provides fixtures specific to integration and E2E tests,
including real database connections and ResilientDB client helpers.
"""

import pytest
import os
import uuid
import time
from typing import Dict, Any, Optional


# ============================================================================
# Environment Detection Fixtures
# ============================================================================

def is_resilientdb_available() -> bool:
    """Check if local ResilientDB is accessible."""
    try:
        import requests
        uri = os.getenv('LOCAL_RESILIENTDB_GRAPHQL_URI', 'http://127.0.0.1:18000/graphql')
        response = requests.post(
            uri,
            json={'query': '{ __typename }'},
            timeout=2
        )
        return response.status_code == 200
    except Exception:
        return False


def is_mongodb_available() -> bool:
    """Check if MongoDB is accessible for E2E tests."""
    try:
        from pymongo import MongoClient
        mongo_uri = os.getenv('MONGO_ATLAS_URI')
        if not mongo_uri:
            return False
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=2000)
        client.admin.command('ping')
        return True
    except Exception:
        return False


def is_redis_available() -> bool:
    """Check if Redis is accessible."""
    try:
        import redis
        r = redis.Redis(
            host=os.getenv('REDIS_HOST', 'localhost'),
            port=int(os.getenv('REDIS_PORT', 6379))
        )
        return r.ping()
    except Exception:
        return False


@pytest.fixture(scope='session')
def resilientdb_available():
    """Session-scoped fixture indicating ResilientDB availability."""
    return is_resilientdb_available()


@pytest.fixture(scope='session')
def mongodb_available():
    """Session-scoped fixture indicating MongoDB availability."""
    return is_mongodb_available()


@pytest.fixture(scope='session')
def redis_available():
    """Session-scoped fixture indicating Redis availability."""
    return is_redis_available()


# ============================================================================
# ResilientDB E2E Fixtures
# ============================================================================

@pytest.fixture(scope='function')
def e2e_room_id():
    """Generate a unique room ID for E2E tests."""
    return f'e2e-room-{uuid.uuid4().hex[:12]}'


@pytest.fixture(scope='function')
def e2e_user():
    """Generate test user info for E2E tests."""
    return {
        'id': f'e2e-user-{uuid.uuid4().hex[:8]}',
        'username': f'testuser_{int(time.time())}',
        'public_key': 'test-public-key',
    }


@pytest.fixture(scope='function')
def resilientdb_client():
    """
    Create a ResilientDB client for E2E tests.
    
    This fixture creates a real client that connects to local ResilientDB.
    Skip the test if ResilientDB is not available.
    """
    if not is_resilientdb_available():
        pytest.skip("Local ResilientDB not available")
    
    from tests.integration.test_resilientdb_e2e import ResilientDBClient
    return ResilientDBClient()


@pytest.fixture(scope='function')
def mongodb_client():
    """
    Create a MongoDB client for E2E tests.
    
    This fixture creates a real client for verifying MongoDB sync.
    Skip the test if MongoDB is not available.
    """
    if not is_mongodb_available():
        pytest.skip("MongoDB not available")
    
    from tests.integration.test_resilientdb_e2e import MongoDBClient
    return MongoDBClient()


@pytest.fixture(scope='function')
def stroke_factory():
    """Provide the StrokeFactory for creating test stroke data."""
    from tests.integration.test_resilientdb_e2e import StrokeFactory
    return StrokeFactory


# ============================================================================
# Latency Measurement Fixtures
# ============================================================================

class LatencyTracker:
    """Helper class for tracking latency measurements."""
    
    def __init__(self):
        self.latencies = []
    
    def record(self, latency_ms: float):
        """Record a latency measurement."""
        self.latencies.append(latency_ms)
    
    def get_stats(self) -> Dict[str, float]:
        """Get latency statistics."""
        if not self.latencies:
            return {}
        
        import statistics
        sorted_lat = sorted(self.latencies)
        
        return {
            'count': len(self.latencies),
            'min': min(self.latencies),
            'max': max(self.latencies),
            'mean': statistics.mean(self.latencies),
            'median': statistics.median(self.latencies),
            'stdev': statistics.stdev(self.latencies) if len(self.latencies) > 1 else 0,
            'p50': statistics.median(sorted_lat),
            'p90': sorted_lat[int(len(sorted_lat) * 0.90) - 1] if len(sorted_lat) >= 10 else sorted_lat[-1],
            'p99': sorted_lat[int(len(sorted_lat) * 0.99) - 1] if len(sorted_lat) >= 100 else sorted_lat[-1],
        }
    
    def reset(self):
        """Reset latency measurements."""
        self.latencies = []


@pytest.fixture(scope='function')
def latency_tracker():
    """Provide a latency tracker for performance tests."""
    return LatencyTracker()


# ============================================================================
# Test Data Cleanup Fixtures
# ============================================================================

@pytest.fixture(scope='function')
def cleanup_mongodb():
    """
    Fixture that provides cleanup function for MongoDB test data.
    
    Usage:
        def test_something(cleanup_mongodb):
            room_id = 'test-room-123'
            # ... test code ...
            cleanup_mongodb(room_id)
    """
    rooms_to_cleanup = []
    
    def _register_cleanup(room_id: str):
        rooms_to_cleanup.append(room_id)
    
    yield _register_cleanup
    
    # Cleanup after test
    if rooms_to_cleanup and is_mongodb_available():
        try:
            from tests.integration.test_resilientdb_e2e import MongoDBClient
            client = MongoDBClient()
            for room_id in rooms_to_cleanup:
                client.cleanup_room(room_id)
        except Exception:
            pass  # Best effort cleanup


# ============================================================================
# Environment Configuration Fixtures
# ============================================================================

@pytest.fixture(scope='function')
def local_resilientdb_config():
    """
    Configure environment for local ResilientDB testing.
    
    This fixture sets up environment variables to point to local ResilientDB.
    Original values are restored after the test.
    """
    original_uri = os.environ.get('RESILIENTDB_GRAPHQL_URI')
    local_uri = os.environ.get(
        'LOCAL_RESILIENTDB_GRAPHQL_URI',
        'http://127.0.0.1:18000/graphql'
    )
    
    os.environ['RESILIENTDB_GRAPHQL_URI'] = local_uri
    
    yield {
        'graphql_uri': local_uri,
        'original_uri': original_uri,
    }
    
    # Restore original value
    if original_uri:
        os.environ['RESILIENTDB_GRAPHQL_URI'] = original_uri
    elif 'RESILIENTDB_GRAPHQL_URI' in os.environ:
        del os.environ['RESILIENTDB_GRAPHQL_URI']


# ============================================================================
# Performance Testing Markers
# ============================================================================

def pytest_configure(config):
    """Register custom markers for E2E tests."""
    config.addinivalue_line(
        "markers", "requires_resilientdb: mark test as requiring ResilientDB"
    )
    config.addinivalue_line(
        "markers", "requires_mongodb: mark test as requiring MongoDB"
    )
    config.addinivalue_line(
        "markers", "requires_redis: mark test as requiring Redis"
    )
    config.addinivalue_line(
        "markers", "performance: mark test as a performance/benchmark test"
    )
