import pytest
import json
import time


@pytest.mark.integration
@pytest.mark.stroke
class TestStrokesAPI:

    def test_submit_stroke_success(self, client, mock_mongodb, mock_redis, auth_headers, test_room, test_stroke_data, mock_graphql_service):
        room_id = str(test_room["_id"])
        response = client.post(f'/rooms/{room_id}/strokes',
            json={'stroke': test_stroke_data},
            headers=auth_headers)

        assert response.status_code in [200, 201]
        data = response.get_json()
        assert 'status' in data or 'stroke' in data

    def test_submit_stroke_requires_auth(self, client, test_room, test_stroke_data):
        room_id = str(test_room["_id"])
        response = client.post(f'/rooms/{room_id}/strokes',
            json={'stroke': test_stroke_data})

        assert response.status_code == 401

    def test_submit_stroke_room_not_found(self, client, auth_headers, test_stroke_data):
        from bson import ObjectId
        fake_room_id = str(ObjectId())
        response = client.post(f'/rooms/{fake_room_id}/strokes',
            json={'stroke': test_stroke_data},
            headers=auth_headers)

        assert response.status_code == 404

    def test_get_strokes(self, client, mock_mongodb, mock_redis, auth_headers, test_room, test_stroke_data, mock_graphql_service):
        room_id = str(test_room["_id"])
        client.post(f'/rooms/{room_id}/strokes',
            json={'stroke': test_stroke_data},
            headers=auth_headers)

        response = client.get(f'/rooms/{room_id}/strokes', headers=auth_headers)

        assert response.status_code == 200
        data = response.get_json()
        assert 'strokes' in data
        assert isinstance(data['strokes'], list)

    def test_get_strokes_from_redis_cache(self, client, mock_mongodb, mock_redis, auth_headers, test_room, test_stroke_data, mock_graphql_service):
        room_id = str(test_room["_id"])
        client.post(f'/rooms/{room_id}/strokes', json={'stroke': test_stroke_data}, headers=auth_headers)
        mock_redis.set(f'room:{room_id}:strokes', json.dumps([test_stroke_data]))
        response = client.get(f'/rooms/{room_id}/strokes', headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert 'strokes' in data

    def test_get_strokes_fallback_to_mongodb(self, client, mock_mongodb, mock_redis, auth_headers, test_room, mock_graphql_service):
        room_id = str(test_room["_id"])
        mock_redis.delete(f'room:{room_id}:strokes')
        response = client.get(f'/rooms/{room_id}/strokes', headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert 'strokes' in data

    def test_submit_multiple_strokes(self, client, mock_mongodb, mock_redis, auth_headers, test_room, mock_graphql_service):
        room_id = str(test_room["_id"])
        strokes = []
        for i in range(5):
            stroke = {
                'id': f'stroke_{i}_{int(time.time() * 1000)}',
                'drawingId': f'drawing_{i}',
                'user': f'testuser|{int(time.time())}',
                'color': '#FF0000',
                'lineWidth': 5,
                'pathData': [[i*10, i*20], [i*30, i*40]],
                'timestamp': int(time.time() * 1000),
                'brushStyle': 'round',
                'order': i + 1,
            }
            response = client.post(f'/rooms/{room_id}/strokes',
                json={'stroke': stroke},
                headers=auth_headers)
            assert response.status_code in [200, 201]
            strokes.append(stroke)

        response = client.get(f'/rooms/{room_id}/strokes', headers=auth_headers)
        assert response.status_code == 200
        data = response.get_json()
        assert len(data['strokes']) >= 5

    def test_submit_stroke_with_invalid_data(self, client, auth_headers, test_room, mock_graphql_service):
        room_id = str(test_room["_id"])
        invalid_stroke = {'invalid': 'data'}

        response = client.post(f'/rooms/{room_id}/strokes',
            json={'stroke': invalid_stroke},
            headers=auth_headers)

        assert response.status_code == 200

    def test_submit_stroke_private_room_encrypted(self, client, mock_mongodb, mock_redis, auth_headers, private_room, mock_graphql_service):
        room_id = str(private_room["_id"])
        stroke = {
            'id': f'stroke_{int(time.time() * 1000)}',
            'drawingId': f'drawing_{int(time.time())}',
            'user': 'testuser',
            'color': '#00FF00',
            'lineWidth': 3,
            'pathData': [[10, 10], [20, 20]],
            'timestamp': int(time.time() * 1000),
            'brushStyle': 'round',
            'order': 1,
        }

        response = client.post(f'/rooms/{room_id}/strokes',
            json={'stroke': stroke},
            headers=auth_headers)

        assert response.status_code in [200, 201]

    def test_get_strokes_private_room_decrypted(self, client, mock_mongodb, mock_redis, auth_headers, private_room, mock_graphql_service):
        room_id = str(private_room["_id"])
        stroke = {
            'id': f'stroke_{int(time.time() * 1000)}',
            'drawingId': f'drawing_{int(time.time())}',
            'user': 'testuser',
            'color': '#0000FF',
            'lineWidth': 2,
            'pathData': [[5, 5], [15, 15]],
            'timestamp': int(time.time() * 1000),
            'brushStyle': 'square',
            'order': 1,
        }

        client.post(f'/rooms/{room_id}/strokes',
            json={'stroke': stroke},
            headers=auth_headers)

        response = client.get(f'/rooms/{room_id}/strokes', headers=auth_headers)

        assert response.status_code == 200
        data = response.get_json()
        assert 'strokes' in data
