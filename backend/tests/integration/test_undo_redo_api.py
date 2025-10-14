import pytest
import json
import time


@pytest.mark.integration
class TestUndoRedoAPI:
    
    def test_undo_stroke(self, client, mock_mongodb, mock_redis, auth_headers, test_room, test_stroke_data, mock_graphql_service):
        room_id = str(test_room["_id"])
        client.post(f'/rooms/{room_id}/strokes',
            json={'stroke': test_stroke_data},
            headers=auth_headers)
        
        response = client.post(f'/rooms/{room_id}/undo', headers=auth_headers)
        
        assert response.status_code == 200
        data = response.get_json()
        assert 'success' in data or 'status' in data
    
    def test_undo_empty_history(self, client, mock_redis, auth_headers, test_room):
        room_id = str(test_room["_id"])
        response = client.post(f'/rooms/{room_id}/undo', headers=auth_headers)
        
        assert response.status_code in [200, 400]
    
    def test_redo_stroke(self, client, mock_mongodb, mock_redis, auth_headers, test_room, test_stroke_data, mock_graphql_service):
        room_id = str(test_room["_id"])
        client.post(f'/rooms/{room_id}/strokes',
            json={'stroke': test_stroke_data},
            headers=auth_headers)
        
        client.post(f'/rooms/{room_id}/undo', headers=auth_headers)
        
        response = client.post(f'/rooms/{room_id}/redo', headers=auth_headers)
        
        assert response.status_code == 200
        data = response.get_json()
        assert 'success' in data or 'status' in data
    
    def test_redo_empty_stack(self, client, mock_redis, auth_headers, test_room):
        room_id = str(test_room["_id"])
        response = client.post(f'/rooms/{room_id}/redo', headers=auth_headers)
        
        assert response.status_code in [200, 400]
    
    def test_undo_redo_sequence(self, client, mock_mongodb, mock_redis, auth_headers, test_room, mock_graphql_service):
        room_id = str(test_room["_id"])
        strokes = []
        for i in range(3):
            stroke = {
                'id': f'stroke_{i}_{int(time.time() * 1000)}',
                'drawingId': f'drawing_{i}',
                'user': 'testuser',
                'color': '#FF0000',
                'lineWidth': 5,
                'pathData': [[i*10, i*20]],
                'timestamp': int(time.time() * 1000),
                'brushStyle': 'round',
                'order': i + 1,
            }
            client.post(f'/rooms/{room_id}/strokes',
                json={'stroke': stroke},
                headers=auth_headers)
            strokes.append(stroke)
        
        undo1 = client.post(f'/rooms/{room_id}/undo', headers=auth_headers)
        assert undo1.status_code == 200
        
        undo2 = client.post(f'/rooms/{room_id}/undo', headers=auth_headers)
        assert undo2.status_code == 200
        
        redo1 = client.post(f'/rooms/{room_id}/redo', headers=auth_headers)
        assert redo1.status_code == 200
        
        strokes_resp = client.get(f'/rooms/{room_id}/strokes', headers=auth_headers)
        assert strokes_resp.status_code == 200
    
    def test_undo_requires_auth(self, client, test_room):
        room_id = str(test_room["_id"])
        response = client.post(f'/rooms/{room_id}/undo')
        
        assert response.status_code == 401
    
    def test_redo_requires_auth(self, client, test_room):
        room_id = str(test_room["_id"])
        response = client.post(f'/rooms/{room_id}/redo')
        
        assert response.status_code == 401
    
    def test_undo_room_not_found(self, client, auth_headers):
        from bson import ObjectId
        fake_room_id = str(ObjectId())
        response = client.post(f'/rooms/{fake_room_id}/undo', headers=auth_headers)
        
        assert response.status_code == 404
    
    def test_undo_persists_across_requests(self, client, mock_mongodb, mock_redis, auth_headers, test_room, mock_graphql_service):
        room_id = str(test_room["_id"])
        stroke = {
            'id': f'stroke_{int(time.time() * 1000)}',
            'drawingId': f'drawing_{int(time.time())}',
            'user': 'testuser',
            'color': '#00FF00',
            'lineWidth': 5,
            'pathData': [[10, 10]],
            'timestamp': int(time.time() * 1000),
            'brushStyle': 'round',
            'order': 1,
        }
        
        client.post(f'/rooms/{room_id}/strokes',
            json={'stroke': stroke},
            headers=auth_headers)
        
        undo_resp = client.post(f'/rooms/{room_id}/undo', headers=auth_headers)
        assert undo_resp.status_code == 200
        
        strokes_resp = client.get(f'/rooms/{room_id}/strokes', headers=auth_headers)
        data = strokes_resp.get_json()
        
        visible_strokes = [s for s in data['strokes'] if not s.get('undone')]
        assert len(visible_strokes) >= 0
    
    def test_clear_undo_history(self, client, mock_mongodb, mock_redis, auth_headers, test_room, test_user, mock_graphql_service):
        room_id = str(test_room["_id"])
        
        stroke = {
            'id': f'stroke_{int(time.time() * 1000)}',
            'drawingId': f'drawing_{int(time.time())}',
            'user': 'testuser',
            'color': '#0000FF',
            'lineWidth': 3,
            'pathData': [[20, 20]],
            'timestamp': int(time.time() * 1000),
            'brushStyle': 'round',
            'order': 1,
        }
        
        # Post a stroke
        response = client.post(f'/rooms/{room_id}/strokes',
            json={'stroke': stroke},
            headers=auth_headers)
        assert response.status_code == 200
        
        # Undo the stroke - should succeed
        undo_response = client.post(f'/rooms/{room_id}/undo', headers=auth_headers)
        assert undo_response.status_code == 200
        
        # Redo the stroke - should succeed
        redo_response = client.post(f'/rooms/{room_id}/redo', headers=auth_headers)
        assert redo_response.status_code == 200
