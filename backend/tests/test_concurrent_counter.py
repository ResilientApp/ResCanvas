"""
Test concurrent stroke submissions to verify atomic counter prevents race conditions.

This test simulates multiple users submitting strokes simultaneously to ensure:
1. No duplicate stroke IDs are generated
2. Counter increments correctly under concurrent load
3. Race conditions are eliminated by atomic redis.incr()
4. System can handle 10+ concurrent users (vs 2-3 before optimization)
"""

import pytest
import sys
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

# Add backend to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.canvas_counter import increment_canvas_draw_count, get_canvas_draw_count
from services.db import redis_client


@pytest.fixture(autouse=True)
def reset_counter():
    """Reset counter before each test."""
    redis_client.set('res-canvas-draw-count', 0)
    yield
    # Cleanup after test
    redis_client.delete('res-canvas-draw-count')


def submit_stroke_simulation(user_id, delay=0):
    """
    Simulate a single user submitting a stroke.
    
    Args:
        user_id: Identifier for the simulated user
        delay: Optional delay before submission (simulates network latency)
    
    Returns:
        tuple: (user_id, stroke_id, draw_count)
    """
    if delay > 0:
        time.sleep(delay)
    
    # This is the critical path - increment counter and get stroke ID
    draw_count = increment_canvas_draw_count()
    stroke_id = f"res-canvas-draw-{draw_count}"
    
    return (user_id, stroke_id, draw_count)


def test_sequential_counter_increments():
    """Test that sequential submissions work correctly (baseline)."""
    results = []
    for i in range(10):
        _, stroke_id, count = submit_stroke_simulation(f"user_{i}")
        results.append((stroke_id, count))
    
    # Verify all IDs are unique and sequential
    stroke_ids = [r[0] for r in results]
    counts = [r[1] for r in results]
    
    assert len(stroke_ids) == len(set(stroke_ids)), "Duplicate stroke IDs in sequential test"
    assert counts == list(range(1, 11)), f"Counts not sequential: {counts}"
    
    # Verify final counter value
    final_count = get_canvas_draw_count()
    assert final_count == 10, f"Final count should be 10, got {final_count}"


def test_concurrent_10_users():
    """Test 10 users submitting strokes simultaneously."""
    num_users = 10
    results = []
    
    with ThreadPoolExecutor(max_workers=num_users) as executor:
        futures = [
            executor.submit(submit_stroke_simulation, f"user_{i}")
            for i in range(num_users)
        ]
        
        for future in as_completed(futures):
            results.append(future.result())
    
    # Extract stroke IDs and counts
    stroke_ids = [r[1] for r in results]
    counts = [r[2] for r in results]
    
    # Critical assertions
    assert len(stroke_ids) == num_users, f"Expected {num_users} strokes, got {len(stroke_ids)}"
    assert len(set(stroke_ids)) == num_users, f"RACE CONDITION: Duplicate stroke IDs found! {stroke_ids}"
    assert len(set(counts)) == num_users, f"RACE CONDITION: Duplicate counts found! {counts}"
    assert set(counts) == set(range(1, num_users + 1)), f"Counts not in expected range: {counts}"
    
    # Verify final counter
    final_count = get_canvas_draw_count()
    assert final_count == num_users, f"Final count should be {num_users}, got {final_count}"


def test_concurrent_50_users():
    """Test 50 users submitting strokes simultaneously (target capacity)."""
    num_users = 50
    results = []
    
    with ThreadPoolExecutor(max_workers=num_users) as executor:
        futures = [
            executor.submit(submit_stroke_simulation, f"user_{i}")
            for i in range(num_users)
        ]
        
        for future in as_completed(futures):
            results.append(future.result())
    
    # Extract stroke IDs and counts
    stroke_ids = [r[1] for r in results]
    counts = [r[2] for r in results]
    
    # Critical assertions
    assert len(stroke_ids) == num_users, f"Expected {num_users} strokes, got {len(stroke_ids)}"
    assert len(set(stroke_ids)) == num_users, f"RACE CONDITION: Duplicate stroke IDs at scale! {len(stroke_ids) - len(set(stroke_ids))} duplicates"
    assert len(set(counts)) == num_users, f"RACE CONDITION: Duplicate counts at scale! {len(counts) - len(set(counts))} duplicates"
    assert set(counts) == set(range(1, num_users + 1)), f"Counts not in expected range 1-{num_users}"
    
    # Verify final counter
    final_count = get_canvas_draw_count()
    assert final_count == num_users, f"Final count should be {num_users}, got {final_count}"


def test_concurrent_100_users():
    """Test 100 users submitting strokes simultaneously (stretch goal)."""
    num_users = 100
    results = []
    
    start_time = time.time()
    
    with ThreadPoolExecutor(max_workers=num_users) as executor:
        futures = [
            executor.submit(submit_stroke_simulation, f"user_{i}")
            for i in range(num_users)
        ]
        
        for future in as_completed(futures):
            results.append(future.result())
    
    end_time = time.time()
    elapsed = end_time - start_time
    
    # Extract stroke IDs and counts
    stroke_ids = [r[1] for r in results]
    counts = [r[2] for r in results]
    
    # Critical assertions
    assert len(stroke_ids) == num_users, f"Expected {num_users} strokes, got {len(stroke_ids)}"
    assert len(set(stroke_ids)) == num_users, f"RACE CONDITION: Duplicate stroke IDs at 100 users! {len(stroke_ids) - len(set(stroke_ids))} duplicates"
    assert len(set(counts)) == num_users, f"RACE CONDITION: Duplicate counts at 100 users!"
    
    # Performance assertion: should complete in reasonable time with atomic operations
    # With old lock: ~8 seconds (80ms * 100), with atomic: < 1 second
    print(f"\n100 concurrent users completed in {elapsed:.2f} seconds")
    assert elapsed < 5.0, f"Too slow: {elapsed:.2f}s (atomic operations should be fast)"
    
    # Verify final counter
    final_count = get_canvas_draw_count()
    assert final_count == num_users, f"Final count should be {num_users}, got {final_count}"


def test_concurrent_with_network_latency():
    """Test concurrent submissions with simulated network latency."""
    num_users = 20
    results = []
    
    with ThreadPoolExecutor(max_workers=num_users) as executor:
        futures = [
            executor.submit(submit_stroke_simulation, f"user_{i}", delay=0.01 * (i % 5))
            for i in range(num_users)
        ]
        
        for future in as_completed(futures):
            results.append(future.result())
    
    # Extract stroke IDs and counts
    stroke_ids = [r[1] for r in results]
    counts = [r[2] for r in results]
    
    # Critical assertions
    assert len(set(stroke_ids)) == num_users, f"RACE CONDITION: Duplicate stroke IDs with latency!"
    assert len(set(counts)) == num_users, f"RACE CONDITION: Duplicate counts with latency!"
    assert set(counts) == set(range(1, num_users + 1)), "Counts not in expected range"


def test_counter_atomicity_stress():
    """
    Stress test: Verify atomicity under extreme concurrent load.
    
    This test hammers the counter with many rapid increments from multiple threads
    to detect any race conditions in the atomic redis.incr() implementation.
    """
    num_increments = 1000
    num_threads = 10
    results = []
    
    def rapid_fire_increments(thread_id, count):
        """Perform multiple rapid increments from a single thread."""
        thread_results = []
        for i in range(count):
            draw_count = increment_canvas_draw_count()
            thread_results.append(draw_count)
        return thread_results
    
    increments_per_thread = num_increments // num_threads
    
    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = [
            executor.submit(rapid_fire_increments, tid, increments_per_thread)
            for tid in range(num_threads)
        ]
        
        for future in as_completed(futures):
            results.extend(future.result())
    
    # Critical assertions
    assert len(results) == num_increments, f"Expected {num_increments} increments, got {len(results)}"
    assert len(set(results)) == num_increments, f"RACE CONDITION: {len(results) - len(set(results))} duplicate counts!"
    assert set(results) == set(range(1, num_increments + 1)), "Some counts missing or duplicated"
    
    # Verify final counter
    final_count = get_canvas_draw_count()
    assert final_count == num_increments, f"Final count should be {num_increments}, got {final_count}"


if __name__ == "__main__":
    # Run tests with verbose output
    pytest.main([__file__, "-v", "-s"])
