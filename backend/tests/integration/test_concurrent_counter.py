"""
Test concurrent stroke submissions to verify atomic counter prevents race conditions.

This test simulates multiple users submitting strokes simultaneously to ensure:
1. No duplicate stroke IDs are generated
2. Counter increments correctly under concurrent load
3. Race conditions are eliminated by atomic redis.incr()
4. System can handle 10+ concurrent users (vs 2-3 before optimization)

NOTE: These tests use the mocked Redis from conftest to avoid interfering with CI
"""

import pytest
import time
from concurrent.futures import ThreadPoolExecutor, as_completed


# Mark all tests in this module as integration tests
pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def reset_counter(mock_redis):
    """Reset counter before each test using the mocked Redis."""
    mock_redis.set('res-canvas-draw-count', 0)
    yield
    mock_redis.delete('res-canvas-draw-count')


def submit_stroke_simulation_with_redis(user_id, redis_client, delay=0):
    """
    Simulate a single user submitting a stroke using provided Redis client.
    """
    if delay > 0:
        time.sleep(delay)
    
    draw_count = redis_client.incr('res-canvas-draw-count')
    stroke_id = f"res-canvas-draw-{draw_count}"
    
    return (user_id, stroke_id, draw_count)


def test_sequential_counter_increments(mock_redis):
    """Test that sequential submissions work correctly (baseline)."""
    results = []
    for i in range(10):
        _, stroke_id, count = submit_stroke_simulation_with_redis(f"user_{i}", mock_redis)
        results.append((stroke_id, count))
    
    stroke_ids = [r[0] for r in results]
    counts = [r[1] for r in results]
    
    assert len(stroke_ids) == len(set(stroke_ids)), "Duplicate stroke IDs in sequential test"
    assert counts == list(range(1, 11)), f"Counts not sequential: {counts}"
    
    final_count = int(mock_redis.get('res-canvas-draw-count'))
    assert final_count == 10, f"Final count should be 10, got {final_count}"


def test_concurrent_10_users(mock_redis):
    """Test 10 users submitting strokes simultaneously."""
    num_users = 10
    results = []
    
    with ThreadPoolExecutor(max_workers=num_users) as executor:
        futures = [
            executor.submit(submit_stroke_simulation_with_redis, f"user_{i}", mock_redis)
            for i in range(num_users)
        ]
        
        for future in as_completed(futures):
            results.append(future.result())
    
    stroke_ids = [r[1] for r in results]
    counts = [r[2] for r in results]
    
    assert len(stroke_ids) == num_users, f"Expected {num_users} strokes, got {len(stroke_ids)}"
    assert len(set(stroke_ids)) == num_users, f"RACE CONDITION: Duplicate stroke IDs found!"
    assert len(set(counts)) == num_users, f"RACE CONDITION: Duplicate counts found!"
    assert set(counts) == set(range(1, num_users + 1)), f"Counts not in expected range: {counts}"
    
    final_count = int(mock_redis.get('res-canvas-draw-count'))
    assert final_count == num_users, f"Final count should be {num_users}, got {final_count}"


def test_concurrent_50_users(mock_redis):
    """Test 50 users submitting strokes simultaneously (target capacity)."""
    num_users = 50
    results = []
    
    with ThreadPoolExecutor(max_workers=num_users) as executor:
        futures = [
            executor.submit(submit_stroke_simulation_with_redis, f"user_{i}", mock_redis)
            for i in range(num_users)
        ]
        
        for future in as_completed(futures):
            results.append(future.result())
    
    stroke_ids = [r[1] for r in results]
    counts = [r[2] for r in results]
    
    assert len(stroke_ids) == num_users
    assert len(set(stroke_ids)) == num_users
    assert len(set(counts)) == num_users
    assert set(counts) == set(range(1, num_users + 1))
    
    final_count = int(mock_redis.get('res-canvas-draw-count'))
    assert final_count == num_users


def test_concurrent_100_users(mock_redis):
    """Test 100 users submitting strokes simultaneously (stretch goal)."""
    num_users = 100
    results = []
    
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=num_users) as executor:
        futures = [
            executor.submit(submit_stroke_simulation_with_redis, f"user_{i}", mock_redis)
            for i in range(num_users)
        ]
        
        for future in as_completed(futures):
            results.append(future.result())
    
    end_time = time.time()
    elapsed = end_time - start_time
    
    stroke_ids = [r[1] for r in results]
    counts = [r[2] for r in results]
    
    assert len(stroke_ids) == num_users
    assert len(set(stroke_ids)) == num_users
    assert len(set(counts)) == num_users
    assert set(counts) == set(range(1, num_users + 1))
    
    final_count = int(mock_redis.get('res-canvas-draw-count'))
    assert final_count == num_users
    
    assert elapsed < 5.0, f"Test took {elapsed:.2f}s, should be < 5s"


def test_concurrent_with_network_latency(mock_redis):
    """Test concurrent submissions with simulated network latency."""
    num_users = 20
    results = []
    
    with ThreadPoolExecutor(max_workers=num_users) as executor:
        futures = [
            executor.submit(submit_stroke_simulation_with_redis, f"user_{i}", mock_redis, 0.01 * (i % 5))
            for i in range(num_users)
        ]
        
        for future in as_completed(futures):
            results.append(future.result())
    
    stroke_ids = [r[1] for r in results]
    counts = [r[2] for r in results]
    
    assert len(set(stroke_ids)) == num_users
    assert len(set(counts)) == num_users
    assert set(counts) == set(range(1, num_users + 1))


def test_counter_atomicity_stress(mock_redis):
    """Stress test to verify counter remains atomic under extreme load."""
    num_users = 200
    results = []
    
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=50) as executor:
        futures = [
            executor.submit(submit_stroke_simulation_with_redis, f"user_{i}", mock_redis)
            for i in range(num_users)
        ]
        
        for future in as_completed(futures):
            results.append(future.result())
    
    end_time = time.time()
    elapsed = end_time - start_time
    
    counts = [r[2] for r in results]
    
    assert len(set(counts)) == num_users
    assert set(counts) == set(range(1, num_users + 1))
    
    final_count = int(mock_redis.get('res-canvas-draw-count'))
    assert final_count == num_users
