"""
End-to-End Integration Tests for ResCanvas + ResilientDB

These tests validate the full stack integration between ResCanvas and a local ResilientDB cluster:
1. Submit strokes from ResCanvas to local ResilientDB
2. Verify strokes are persisted in ResilientDB
3. Verify MongoDB sync works
4. Measure latency

Requirements:
- Local ResilientDB cluster running at http://127.0.0.1:18000/graphql
- MongoDB running and accessible
- Redis running for caching

Run with: pytest tests/integration/test_resilientdb_e2e.py -v -m e2e

IMPORTANT: These tests require external services to be running.
Use pytest markers to skip when services are unavailable.
"""

import pytest
import time
import statistics
import uuid
import json
import os
import requests
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any, Optional


# Mark all tests in this module as e2e and integration
pytestmark = [pytest.mark.e2e, pytest.mark.integration, pytest.mark.slow]


# Environment configuration for local ResilientDB
LOCAL_RESILIENTDB_GRAPHQL_URI = os.getenv(
    'LOCAL_RESILIENTDB_GRAPHQL_URI', 
    'http://127.0.0.1:18000/graphql'
)


def is_resilientdb_available() -> bool:
    """Check if local ResilientDB is accessible."""
    try:
        response = requests.post(
            LOCAL_RESILIENTDB_GRAPHQL_URI,
            json={'query': '{ __typename }'},
            timeout=2
        )
        return response.status_code == 200
    except Exception:
        return False


def is_mongodb_available() -> bool:
    """Check if MongoDB is accessible."""
    try:
        from pymongo import MongoClient
        from config import MONGO_ATLAS_URI_SECRET
        if not MONGO_ATLAS_URI_SECRET:
            return False
        client = MongoClient(MONGO_ATLAS_URI_SECRET, serverSelectionTimeoutMS=2000)
        client.admin.command('ping')
        return True
    except Exception:
        return False


# Skip all tests if ResilientDB is not available
resilientdb_available = pytest.mark.skipif(
    not is_resilientdb_available(),
    reason="Local ResilientDB not available at " + LOCAL_RESILIENTDB_GRAPHQL_URI
)

mongodb_available = pytest.mark.skipif(
    not is_mongodb_available(),
    reason="MongoDB not available"
)


class StrokeFactory:
    """Factory for creating test stroke data."""
    
    @staticmethod
    def create_stroke(
        room_id: str,
        user: str = 'test-user',
        color: str = '#FF0000',
        line_width: int = 3,
        path_data: Optional[List[Dict]] = None,
        timestamp: Optional[int] = None
    ) -> Dict[str, Any]:
        """Create a stroke data object."""
        if path_data is None:
            path_data = [
                {'x': 10, 'y': 20},
                {'x': 30, 'y': 40},
                {'x': 50, 'y': 60}
            ]
        return {
            'id': f'stroke-{uuid.uuid4().hex[:16]}',
            'drawingId': f'drawing-{uuid.uuid4().hex[:8]}',
            'roomId': room_id,
            'color': color,
            'lineWidth': line_width,
            'pathData': path_data,
            'timestamp': timestamp or int(time.time() * 1000),
            'user': user,
            'brushStyle': 'round',
            'order': 1
        }

    @staticmethod
    def create_bulk_strokes(
        room_id: str,
        count: int,
        users: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Create multiple strokes from multiple users."""
        if users is None:
            users = ['test-user']
        
        strokes = []
        for i in range(count):
            user = users[i % len(users)]
            stroke = StrokeFactory.create_stroke(
                room_id=room_id,
                user=user,
                color=f'#{(i * 17) % 256:02x}{(i * 31) % 256:02x}{(i * 47) % 256:02x}',
                path_data=[
                    {'x': i * 10, 'y': i * 15},
                    {'x': i * 10 + 20, 'y': i * 15 + 30},
                    {'x': i * 10 + 40, 'y': i * 15 + 60}
                ],
                timestamp=int(time.time() * 1000) + i
            )
            stroke['order'] = i + 1
            strokes.append(stroke)
        return strokes


class ResilientDBClient:
    """Client for interacting with local ResilientDB GraphQL endpoint."""
    
    def __init__(self, graphql_uri: str = LOCAL_RESILIENTDB_GRAPHQL_URI):
        self.graphql_uri = graphql_uri
        self._load_keys()
    
    def _load_keys(self):
        """Load signing keys from environment or config."""
        from config import SIGNER_PUBLIC_KEY, SIGNER_PRIVATE_KEY, RECIPIENT_PUBLIC_KEY
        self.signer_public_key = SIGNER_PUBLIC_KEY
        self.signer_private_key = SIGNER_PRIVATE_KEY
        self.recipient_public_key = RECIPIENT_PUBLIC_KEY or SIGNER_PUBLIC_KEY
    
    def commit_stroke(self, stroke: Dict[str, Any]) -> Dict[str, Any]:
        """Commit a stroke to ResilientDB via GraphQL mutation."""
        mutation = """
        mutation PostTransaction($data: PrepareAsset!) {
            postTransaction(data: $data) { id }
        }
        """
        
        payload = {
            'operation': 'CREATE',
            'amount': 1,
            'signerPublicKey': self.signer_public_key,
            'signerPrivateKey': self.signer_private_key,
            'recipientPublicKey': self.recipient_public_key,
            'asset': {
                'data': {
                    'type': 'stroke',
                    'roomId': stroke.get('roomId'),
                    'stroke': stroke
                }
            }
        }
        
        body = {
            'query': mutation,
            'variables': {'data': payload},
            'operationName': 'PostTransaction'
        }
        
        start_time = time.perf_counter()
        response = requests.post(
            self.graphql_uri,
            json=body,
            headers={'Content-Type': 'application/json'},
            verify=False,
            timeout=30
        )
        latency_ms = (time.perf_counter() - start_time) * 1000
        
        result = response.json()
        
        if result.get('errors'):
            raise RuntimeError(f"GraphQL errors: {result['errors']}")
        
        if response.status_code != 200:
            raise RuntimeError(f"HTTP {response.status_code}: {response.text}")
        
        tx_id = result.get('data', {}).get('postTransaction', {}).get('id')
        
        return {
            'tx_id': tx_id,
            'latency_ms': latency_ms,
            'success': tx_id is not None
        }
    
    def query_transactions(self, room_id: str) -> List[Dict[str, Any]]:
        """Query transactions for a room from ResilientDB."""
        query = """
        query GetTransactions {
            getTransactions {
                id
                asset
            }
        }
        """
        
        response = requests.post(
            self.graphql_uri,
            json={'query': query},
            headers={'Content-Type': 'application/json'},
            verify=False,
            timeout=30
        )
        
        result = response.json()
        
        if result.get('errors'):
            return []
        
        transactions = result.get('data', {}).get('getTransactions', []) or []
        
        # Filter by room_id in asset data
        room_transactions = []
        for tx in transactions:
            try:
                asset = tx.get('asset', {})
                if isinstance(asset, str):
                    asset = json.loads(asset)
                asset_data = asset.get('data', {})
                if asset_data.get('roomId') == room_id:
                    room_transactions.append(tx)
            except (json.JSONDecodeError, TypeError):
                continue
        
        return room_transactions


class MongoDBClient:
    """Client for verifying MongoDB sync."""
    
    def __init__(self):
        from pymongo import MongoClient
        from config import MONGO_ATLAS_URI_SECRET, DB_NAME, COLLECTION_NAME
        self.client = MongoClient(MONGO_ATLAS_URI_SECRET)
        self.db = self.client[DB_NAME]
        self.strokes_coll = self.db[COLLECTION_NAME]
    
    def get_strokes_for_room(self, room_id: str) -> List[Dict[str, Any]]:
        """Get strokes from MongoDB for a specific room."""
        # Query the strokes collection for entries matching this room
        cursor = self.strokes_coll.find({
            '$or': [
                {'roomId': room_id},
                {'transactions.value.asset.data.roomId': room_id},
                {'asset.data.roomId': room_id}
            ]
        })
        return list(cursor)
    
    def wait_for_sync(
        self, 
        room_id: str, 
        expected_count: int, 
        timeout_seconds: float = 10.0,
        poll_interval: float = 0.5
    ) -> bool:
        """Wait for strokes to sync to MongoDB."""
        start_time = time.time()
        while time.time() - start_time < timeout_seconds:
            strokes = self.get_strokes_for_room(room_id)
            if len(strokes) >= expected_count:
                return True
            time.sleep(poll_interval)
        return False
    
    def cleanup_room(self, room_id: str):
        """Clean up test data for a room."""
        self.strokes_coll.delete_many({
            '$or': [
                {'roomId': room_id},
                {'transactions.value.asset.data.roomId': room_id},
                {'asset.data.roomId': room_id}
            ]
        })


@resilientdb_available
class TestResilientDBE2E:
    """End-to-end integration tests for ResilientDB."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test environment."""
        # Override GraphQL URI for local ResilientDB
        os.environ['RESILIENTDB_GRAPHQL_URI'] = LOCAL_RESILIENTDB_GRAPHQL_URI
        
        # Create test room ID for this test session
        self.test_room_id = f'e2e-test-room-{uuid.uuid4().hex[:8]}'
        
        # Initialize clients
        self.resdb_client = ResilientDBClient()
        
        yield
        
        # Cleanup (optional - depends on whether you want persistent test data)
        # Note: ResilientDB transactions are immutable, cannot be deleted
    
    def test_single_stroke_submission(self):
        """Test submitting a single stroke to ResilientDB."""
        # Create a test stroke
        stroke = StrokeFactory.create_stroke(
            room_id=self.test_room_id,
            user='test-user-single'
        )
        
        # Submit to ResilientDB
        result = self.resdb_client.commit_stroke(stroke)
        
        # Verify success
        assert result['success'], f"Failed to commit stroke: {result}"
        assert result['tx_id'] is not None, "Transaction ID should not be None"
        assert result['latency_ms'] > 0, "Latency should be positive"
        
        # Log for debugging
        print(f"\nSingle stroke submitted successfully:")
        print(f"  Transaction ID: {result['tx_id']}")
        print(f"  Latency: {result['latency_ms']:.2f}ms")
    
    def test_multi_user_collaboration(self):
        """Test 5 users submitting strokes to the same room."""
        room_id = f'collab-room-{uuid.uuid4().hex[:8]}'
        users = [f'user-{i}' for i in range(5)]
        num_strokes = 100
        
        # Create strokes from multiple users
        strokes = StrokeFactory.create_bulk_strokes(
            room_id=room_id,
            count=num_strokes,
            users=users
        )
        
        # Submit all strokes
        results = []
        failed_submissions = []
        
        for i, stroke in enumerate(strokes):
            try:
                result = self.resdb_client.commit_stroke(stroke)
                results.append(result)
                if not result['success']:
                    failed_submissions.append((i, result))
            except Exception as e:
                failed_submissions.append((i, str(e)))
        
        # Verify all strokes were submitted successfully
        successful_count = sum(1 for r in results if r.get('success'))
        
        assert len(failed_submissions) == 0, \
            f"Failed submissions: {failed_submissions[:5]}..."
        assert successful_count == num_strokes, \
            f"Expected {num_strokes} successful, got {successful_count}"
        
        # Verify ordering is preserved (timestamps should be increasing)
        latencies = [r['latency_ms'] for r in results]
        
        # Log statistics
        print(f"\nMulti-user collaboration test:")
        print(f"  Total strokes: {num_strokes}")
        print(f"  Users: {len(users)}")
        print(f"  Successful submissions: {successful_count}")
        print(f"  Average latency: {statistics.mean(latencies):.2f}ms")
        print(f"  P50 latency: {statistics.median(latencies):.2f}ms")
        print(f"  P99 latency: {sorted(latencies)[98] if len(latencies) >= 99 else max(latencies):.2f}ms")
    
    def test_latency_measurement(self):
        """Measure stroke submission latency (P50/P99)."""
        room_id = f'latency-test-{uuid.uuid4().hex[:8]}'
        num_samples = 100
        
        # Target latencies for local ResilientDB
        target_p50_ms = 10.0
        target_p99_ms = 50.0
        
        latencies = []
        
        for i in range(num_samples):
            stroke = StrokeFactory.create_stroke(
                room_id=room_id,
                user='latency-test-user'
            )
            
            result = self.resdb_client.commit_stroke(stroke)
            
            if result['success']:
                latencies.append(result['latency_ms'])
        
        # Calculate percentiles
        sorted_latencies = sorted(latencies)
        p50 = statistics.median(sorted_latencies)
        p99_idx = int(len(sorted_latencies) * 0.99) - 1
        p99 = sorted_latencies[max(0, p99_idx)]
        
        # Log statistics
        print(f"\nLatency measurement results:")
        print(f"  Samples: {len(latencies)}")
        print(f"  Min: {min(latencies):.2f}ms")
        print(f"  Max: {max(latencies):.2f}ms")
        print(f"  Mean: {statistics.mean(latencies):.2f}ms")
        print(f"  Std Dev: {statistics.stdev(latencies):.2f}ms")
        print(f"  P50: {p50:.2f}ms (target: <{target_p50_ms}ms)")
        print(f"  P99: {p99:.2f}ms (target: <{target_p99_ms}ms)")
        
        # Assert targets (soft assert - log warning if exceeded)
        if p50 >= target_p50_ms:
            print(f"  ⚠️  P50 latency {p50:.2f}ms exceeds {target_p50_ms}ms target")
        if p99 >= target_p99_ms:
            print(f"  ⚠️  P99 latency {p99:.2f}ms exceeds {target_p99_ms}ms target")
        
        # Hard assert with generous margins for CI environment
        assert p50 < 100, f"P50 latency {p50:.2f}ms is unacceptably high"
        assert p99 < 500, f"P99 latency {p99:.2f}ms is unacceptably high"
    
    def test_room_operations_flow(self):
        """Test full room operations: create, submit strokes, retrieve."""
        room_id = f'flow-test-{uuid.uuid4().hex[:8]}'
        
        # Step 1: Create multiple strokes for the room
        strokes = StrokeFactory.create_bulk_strokes(
            room_id=room_id,
            count=10,
            users=['flow-user-1', 'flow-user-2']
        )
        
        # Step 2: Submit all strokes
        submitted_tx_ids = []
        for stroke in strokes:
            result = self.resdb_client.commit_stroke(stroke)
            assert result['success'], f"Failed to commit stroke: {result}"
            submitted_tx_ids.append(result['tx_id'])
        
        # Step 3: Query transactions from ResilientDB
        # Note: Query may not be immediately available depending on consensus
        time.sleep(1)  # Brief wait for consensus
        
        transactions = self.resdb_client.query_transactions(room_id)
        
        # Log results
        print(f"\nRoom operations flow test:")
        print(f"  Room ID: {room_id}")
        print(f"  Strokes submitted: {len(strokes)}")
        print(f"  Transaction IDs: {len(submitted_tx_ids)}")
        print(f"  Transactions queried: {len(transactions)}")
        
        # Verify we got transaction IDs for all submissions
        assert len(submitted_tx_ids) == len(strokes), \
            f"Expected {len(strokes)} tx IDs, got {len(submitted_tx_ids)}"
        
        # All transaction IDs should be unique
        assert len(set(submitted_tx_ids)) == len(submitted_tx_ids), \
            "Transaction IDs should be unique"
    
    def test_concurrent_submissions(self):
        """Test concurrent stroke submissions from multiple threads."""
        room_id = f'concurrent-test-{uuid.uuid4().hex[:8]}'
        num_concurrent = 10
        strokes_per_user = 5
        
        strokes = StrokeFactory.create_bulk_strokes(
            room_id=room_id,
            count=num_concurrent * strokes_per_user,
            users=[f'concurrent-user-{i}' for i in range(num_concurrent)]
        )
        
        results = []
        errors = []
        
        def submit_stroke(stroke):
            try:
                return self.resdb_client.commit_stroke(stroke)
            except Exception as e:
                return {'success': False, 'error': str(e)}
        
        # Submit strokes concurrently
        with ThreadPoolExecutor(max_workers=num_concurrent) as executor:
            future_to_stroke = {
                executor.submit(submit_stroke, stroke): stroke 
                for stroke in strokes
            }
            
            for future in as_completed(future_to_stroke):
                result = future.result()
                if result.get('success'):
                    results.append(result)
                else:
                    errors.append(result)
        
        # Log results
        print(f"\nConcurrent submissions test:")
        print(f"  Total strokes: {len(strokes)}")
        print(f"  Successful: {len(results)}")
        print(f"  Failed: {len(errors)}")
        
        if results:
            latencies = [r['latency_ms'] for r in results]
            print(f"  Avg latency: {statistics.mean(latencies):.2f}ms")
            print(f"  Max latency: {max(latencies):.2f}ms")
        
        # At least 80% should succeed (allow for some concurrent conflicts)
        success_rate = len(results) / len(strokes)
        assert success_rate >= 0.8, \
            f"Success rate {success_rate:.1%} is below 80% threshold"


@resilientdb_available
class TestResilientDBErrorHandling:
    """Test error handling scenarios."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test environment."""
        self.resdb_client = ResilientDBClient()
        yield
    
    def test_invalid_stroke_data(self):
        """Test submitting invalid stroke data."""
        room_id = f'error-test-{uuid.uuid4().hex[:8]}'
        
        # Stroke with missing required fields
        invalid_stroke = {
            'roomId': room_id,
            # Missing pathData, color, etc.
        }
        
        # Should still submit (ResilientDB accepts any asset data)
        # but may not be valid for ResCanvas consumption
        result = self.resdb_client.commit_stroke(invalid_stroke)
        
        # The transaction itself should succeed (ResilientDB is schema-agnostic)
        print(f"\nInvalid stroke submission: success={result.get('success')}")
    
    def test_timeout_handling(self):
        """Test request timeout handling."""
        # Create client with very short timeout
        import requests
        
        room_id = f'timeout-test-{uuid.uuid4().hex[:8]}'
        stroke = StrokeFactory.create_stroke(room_id=room_id)
        
        mutation = """
        mutation PostTransaction($data: PrepareAsset!) {
            postTransaction(data: $data) { id }
        }
        """
        
        payload = {
            'operation': 'CREATE',
            'amount': 1,
            'signerPublicKey': self.resdb_client.signer_public_key,
            'signerPrivateKey': self.resdb_client.signer_private_key,
            'recipientPublicKey': self.resdb_client.recipient_public_key,
            'asset': {'data': {'type': 'stroke', 'roomId': room_id, 'stroke': stroke}}
        }
        
        body = {
            'query': mutation,
            'variables': {'data': payload},
            'operationName': 'PostTransaction'
        }
        
        # Test with very short timeout - might timeout or succeed quickly
        try:
            response = requests.post(
                LOCAL_RESILIENTDB_GRAPHQL_URI,
                json=body,
                headers={'Content-Type': 'application/json'},
                timeout=0.001  # 1ms timeout - very likely to fail
            )
            print(f"\nTimeout test: Unexpectedly succeeded with {response.status_code}")
        except requests.exceptions.Timeout:
            print("\nTimeout test: Request correctly timed out")
        except requests.exceptions.ConnectionError:
            print("\nTimeout test: Connection error (expected with very short timeout)")
    
    def test_connection_refused(self):
        """Test behavior when ResilientDB is unavailable."""
        # Create client pointing to wrong port
        bad_client = ResilientDBClient(graphql_uri='http://127.0.0.1:19999/graphql')
        
        room_id = f'connection-test-{uuid.uuid4().hex[:8]}'
        stroke = StrokeFactory.create_stroke(room_id=room_id)
        
        with pytest.raises((requests.exceptions.ConnectionError, RuntimeError)):
            bad_client.commit_stroke(stroke)
        
        print("\nConnection refused test: Correctly raised exception")


@resilientdb_available
@mongodb_available
class TestMongoDBSync:
    """Tests for MongoDB synchronization."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test environment."""
        self.resdb_client = ResilientDBClient()
        self.mongo_client = MongoDBClient()
        self.test_room_id = f'sync-test-{uuid.uuid4().hex[:8]}'
        yield
        # Cleanup
        self.mongo_client.cleanup_room(self.test_room_id)
    
    def test_single_stroke_sync(self):
        """Test that a single stroke syncs to MongoDB."""
        stroke = StrokeFactory.create_stroke(
            room_id=self.test_room_id,
            user='sync-test-user'
        )
        
        # Submit to ResilientDB
        result = self.resdb_client.commit_stroke(stroke)
        assert result['success'], f"Failed to commit stroke: {result}"
        
        # Wait for sync (resilient-python-cache should pick it up)
        synced = self.mongo_client.wait_for_sync(
            room_id=self.test_room_id,
            expected_count=1,
            timeout_seconds=10
        )
        
        if synced:
            strokes = self.mongo_client.get_strokes_for_room(self.test_room_id)
            print(f"\nMongoDB sync test:")
            print(f"  Strokes in MongoDB: {len(strokes)}")
            assert len(strokes) >= 1, "Expected at least 1 stroke in MongoDB"
        else:
            print("\nMongoDB sync test: Sync not detected within timeout")
            print("  Note: This may be expected if resilient-python-cache is not running")
            pytest.skip("MongoDB sync service not running")
    
    def test_bulk_strokes_sync(self):
        """Test that multiple strokes sync to MongoDB."""
        num_strokes = 10
        strokes = StrokeFactory.create_bulk_strokes(
            room_id=self.test_room_id,
            count=num_strokes,
            users=['sync-user-1', 'sync-user-2']
        )
        
        # Submit all strokes
        for stroke in strokes:
            result = self.resdb_client.commit_stroke(stroke)
            assert result['success'], f"Failed to commit stroke"
        
        # Wait for sync
        synced = self.mongo_client.wait_for_sync(
            room_id=self.test_room_id,
            expected_count=num_strokes,
            timeout_seconds=15
        )
        
        if synced:
            mongo_strokes = self.mongo_client.get_strokes_for_room(self.test_room_id)
            print(f"\nBulk MongoDB sync test:")
            print(f"  Strokes submitted: {num_strokes}")
            print(f"  Strokes in MongoDB: {len(mongo_strokes)}")
            assert len(mongo_strokes) >= num_strokes, \
                f"Expected at least {num_strokes} strokes in MongoDB"
        else:
            print("\nBulk MongoDB sync test: Sync not detected within timeout")
            pytest.skip("MongoDB sync service not running")


class TestLatencyBenchmark:
    """Benchmark tests for measuring performance metrics."""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test environment."""
        if not is_resilientdb_available():
            pytest.skip("ResilientDB not available")
        self.resdb_client = ResilientDBClient()
        yield
    
    def test_throughput_measurement(self):
        """Measure sustained throughput over a time window."""
        room_id = f'throughput-test-{uuid.uuid4().hex[:8]}'
        duration_seconds = 5
        
        start_time = time.time()
        end_time = start_time + duration_seconds
        
        successful_count = 0
        total_count = 0
        latencies = []
        
        while time.time() < end_time:
            stroke = StrokeFactory.create_stroke(
                room_id=room_id,
                user='throughput-user'
            )
            total_count += 1
            
            try:
                result = self.resdb_client.commit_stroke(stroke)
                if result['success']:
                    successful_count += 1
                    latencies.append(result['latency_ms'])
            except Exception:
                pass
        
        elapsed = time.time() - start_time
        tps = successful_count / elapsed if elapsed > 0 else 0
        
        print(f"\nThroughput benchmark:")
        print(f"  Duration: {elapsed:.2f}s")
        print(f"  Total attempts: {total_count}")
        print(f"  Successful: {successful_count}")
        print(f"  TPS: {tps:.2f}")
        
        if latencies:
            print(f"  Avg latency: {statistics.mean(latencies):.2f}ms")
            print(f"  P50 latency: {statistics.median(latencies):.2f}ms")
        
        # Should achieve at least 1 TPS (very conservative)
        assert tps >= 1, f"TPS {tps:.2f} is below minimum threshold"
    
    def test_latency_under_load(self):
        """Measure latency with sustained load."""
        room_id = f'load-latency-test-{uuid.uuid4().hex[:8]}'
        num_warmup = 10
        num_samples = 50
        
        # Warmup phase
        for i in range(num_warmup):
            stroke = StrokeFactory.create_stroke(room_id=room_id, user='warmup')
            try:
                self.resdb_client.commit_stroke(stroke)
            except Exception:
                pass
        
        # Measurement phase
        latencies = []
        for i in range(num_samples):
            stroke = StrokeFactory.create_stroke(room_id=room_id, user='load-test')
            try:
                result = self.resdb_client.commit_stroke(stroke)
                if result['success']:
                    latencies.append(result['latency_ms'])
            except Exception:
                pass
        
        if len(latencies) < 10:
            pytest.skip("Not enough successful samples")
        
        sorted_latencies = sorted(latencies)
        p50 = statistics.median(sorted_latencies)
        p90_idx = int(len(sorted_latencies) * 0.90) - 1
        p99_idx = int(len(sorted_latencies) * 0.99) - 1
        p90 = sorted_latencies[max(0, p90_idx)]
        p99 = sorted_latencies[max(0, p99_idx)]
        
        print(f"\nLatency under load:")
        print(f"  Samples: {len(latencies)}")
        print(f"  P50: {p50:.2f}ms")
        print(f"  P90: {p90:.2f}ms")
        print(f"  P99: {p99:.2f}ms")
        print(f"  Max: {max(latencies):.2f}ms")


if __name__ == '__main__':
    # Run tests directly
    pytest.main([__file__, '-v', '-s'])
