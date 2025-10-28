import time
import pytest


def test_get_strokes_from_mongo_returns_room(client, test_user, test_room, auth_headers):
    room_id = str(test_room['_id'])

    stroke_data = {
        'stroke': {
            'drawingId': 'drawing_1',
            'color': '#000000',
            'lineWidth': 2,
            'pathData': [[10, 10], [20, 20]],
            'timestamp': int(time.time() * 1000),
            'user': test_user['username']
        }
    }
    resp = client.post(f'/rooms/{room_id}/strokes', json=stroke_data, headers=auth_headers)
    assert resp.status_code in (200, 201)

    resp = client.get(f'/rooms/{room_id}/strokes', headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert 'strokes' in data
    strokes = data['strokes']
    assert len(strokes) >= 1

    found = False
    for stroke in strokes:
        if stroke.get('roomId') == room_id and stroke.get('drawingId') == 'drawing_1':
            found = True
            assert stroke.get('color') == '#000000'
            assert stroke.get('user') == test_user['username']
    assert found, "Could not find the stroke we just added"


def test_getCanvasData_history_view(client, test_user, test_room, auth_headers):
    room_id = str(test_room['_id'])

    for i in range(3):
        stroke_data = {
            'stroke': {
                'drawingId': f'history_stroke_{i}',
                'color': f'#00{i}0{i}0',
                'lineWidth': i + 1,
                'pathData': [[i*10, i*10], [i*10+10, i*10+10]],
                'timestamp': int(time.time() * 1000) + i,
                'user': test_user['username']
            }
        }
        resp = client.post(f'/rooms/{room_id}/strokes', json=stroke_data, headers=auth_headers)
        assert resp.status_code in (200, 201)

    resp = client.get(f'/rooms/{room_id}/strokes', headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    strokes = data['strokes']

    assert len(strokes) == 3
    for stroke in strokes:
        assert stroke.get('roomId') == room_id
        assert stroke['user'] == test_user['username']
