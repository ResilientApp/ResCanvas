import pytest
import json
from unittest.mock import patch, MagicMock


class TestMetricsAPI:
    """Test metrics and benchmarking routes"""

    @patch('routes.metrics.run_all')
    def test_run_benchmarks_default_rounds(self, mock_run_all, client, auth_headers):
        """Test running benchmarks with default round counts"""
        mock_run_all.return_value = {
            'redis': {'avg_latency_ms': 1.2, 'success_rate': 1.0},
            'mongo': {'avg_latency_ms': 5.3, 'success_rate': 1.0},
            'graphql': {'avg_latency_ms': 120.0, 'success_rate': 0.9}
        }

        response = client.post(
            '/runBenchmarks',
            headers=auth_headers,
            json={}
        )

        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'ok'
        assert 'metrics' in data
        # Verify default rounds were used (20, 20, 3)
        mock_run_all.assert_called_once_with(rounds_redis=20, rounds_mongo=20, rounds_graphql=3)

    @patch('routes.metrics.run_all')
    def test_run_benchmarks_custom_rounds(self, mock_run_all, client, auth_headers):
        """Test running benchmarks with custom round counts"""
        mock_run_all.return_value = {'test': 'data'}

        response = client.post(
            '/runBenchmarks',
            headers=auth_headers,
            json={
                'rounds_redis': 50,
                'rounds_mongo': 30,
                'rounds_graphql': 5
            }
        )

        assert response.status_code == 200
        mock_run_all.assert_called_once_with(rounds_redis=50, rounds_mongo=30, rounds_graphql=5)

    @patch('routes.metrics.run_all')
    def test_run_benchmarks_error_handling(self, mock_run_all, client, auth_headers):
        """Test benchmark error handling"""
        mock_run_all.side_effect = Exception("Benchmark failed")

        response = client.post(
            '/runBenchmarks',
            headers=auth_headers,
            json={}
        )

        assert response.status_code == 500
        data = json.loads(response.data)
        assert data['status'] == 'error'
        assert 'Benchmark failed' in data['message']

    @patch('routes.metrics.redis_client')
    def test_get_metrics_success(self, mock_redis_client, client, auth_headers):
        """Test retrieving stored metrics"""
        metrics_data = {
            'redis': {'avg_latency_ms': 1.5},
            'timestamp': 1234567890
        }
        # Mock Redis to return metrics
        mock_redis_client.get.return_value = json.dumps(metrics_data).encode('utf-8')

        response = client.get(
            '/metrics',
            headers=auth_headers
        )

        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'ok'
        assert data['metrics'] == metrics_data

    def test_get_metrics_not_found(self, client, auth_headers, mock_redis):
        """Test retrieving metrics when none exist"""
        # Don't set any metrics in Redis

        response = client.get(
            '/metrics',
            headers=auth_headers
        )

        assert response.status_code == 404
        data = json.loads(response.data)
        assert data['status'] == 'error'
        assert 'No metrics available' in data['message']




class TestClearCanvasAPI:
    """Test clear canvas timestamp route"""

    @patch('routes.clear_canvas.get_canvas_draw_count')
    @patch('routes.clear_canvas.commit_transaction_via_graphql')
    def test_submit_clear_canvas_timestamp_no_room(self, mock_commit, mock_count, client, auth_headers, mock_redis):
        """Test submitting clear canvas timestamp without room ID"""
        mock_count.return_value = 42

        response = client.post(
            '/submitClearCanvasTimestamp',
            headers=auth_headers,
            json={'timestamp': 1234567890}
        )

        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'success'
        # Verify timestamp is present in response
        assert 'ts' in data

    @patch('routes.clear_canvas.get_canvas_draw_count')
    @patch('routes.clear_canvas.commit_transaction_via_graphql')
    def test_submit_clear_canvas_timestamp_with_room(self, mock_commit, mock_count, client, auth_headers, mock_redis):
        """Test submitting clear canvas timestamp with room ID"""
        mock_count.return_value = 100
        room_id = 'test-room-123'

        response = client.post(
            '/submitClearCanvasTimestamp',
            headers=auth_headers,
            json={
                'timestamp': 1234567890,
                'roomId': room_id
            }
        )

        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'success'
        # Verify room ID is in response
        assert data['room'] == room_id

    def test_submit_clear_canvas_timestamp_invalid_json(self, client, auth_headers):
        """Test clear canvas with invalid JSON"""
        response = client.post(
            '/submitClearCanvasTimestamp',
            headers={
                **auth_headers,
                'Content-Type': 'text/plain'
            },
            data='not json'
        )

        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'JSON body required' in data['message']

    @patch('routes.clear_canvas.get_canvas_draw_count')
    @patch('routes.clear_canvas.commit_transaction_via_graphql')
    def test_submit_clear_canvas_timestamp_uses_current_time(self, mock_commit, mock_count, client, auth_headers, mock_redis):
        """Test that current timestamp is used when not provided"""
        mock_count.return_value = 0

        response = client.post(
            '/submitClearCanvasTimestamp',
            headers=auth_headers,
            json={}
        )

        assert response.status_code == 200
        data = json.loads(response.data)
        # Timestamp should have been generated
        assert data['ts'] > 0
