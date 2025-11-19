import pytest
from unittest.mock import patch, MagicMock


@pytest.mark.unit
class TestCanvasCounter:
    
    @patch('services.canvas_counter.redis_client')
    @patch('services.canvas_counter.strokes_coll')
    def test_get_canvas_draw_count_from_redis(self, mock_strokes, mock_redis_client):
        from services.canvas_counter import get_canvas_draw_count
        
        mock_redis_client.get.return_value = b'42'
        
        count = get_canvas_draw_count()
        
        assert count == 42
    
    @patch('services.canvas_counter.redis_client')
    @patch('services.canvas_counter.strokes_coll')
    def test_get_canvas_draw_count_not_in_redis_fallback_to_mongo(self, mock_strokes, mock_redis_client):
        from services.canvas_counter import get_canvas_draw_count
        
        mock_redis_client.get.return_value = None
        
        mock_block = {
            "transactions": [{
                "value": {
                    "asset": {
                        "data": {
                            "id": "res-canvas-draw-count",
                            "value": 100
                        }
                    }
                }
            }]
        }
        
        mock_strokes.find_one.return_value = mock_block
        
        count = get_canvas_draw_count()
        
        assert count == 100
        mock_redis_client.set.assert_called_once_with("res-canvas-draw-count", 100)
    
    @patch('services.canvas_counter.threading.Thread')
    @patch('services.canvas_counter.commit_transaction_via_graphql')
    @patch('services.canvas_counter.redis_client')
    @patch('services.canvas_counter.strokes_coll')
    def test_increment_canvas_draw_count(self, mock_strokes, mock_redis_client, mock_commit, mock_thread):
        from services.canvas_counter import increment_canvas_draw_count
        
        # Mock redis.incr() to return 11 (simulating increment from 10 to 11)
        mock_redis_client.incr.return_value = 11
        
        count = increment_canvas_draw_count()
        
        assert count == 11
        # Verify incr was called with the correct key
        mock_redis_client.incr.assert_called_once_with('res-canvas-draw-count')
        # Verify the async thread was started (GraphQL commit happens in background)
        assert mock_thread.called
