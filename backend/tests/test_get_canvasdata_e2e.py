import time
import pytest


def test_getCanvasData_history_end_to_end(client, test_user, test_room, auth_headers):
    room_id = str(test_room['_id'])

    for i in range(3):
        stroke_data = {
            'stroke': {
                'drawingId': f'drawing_{i}',
                'color': f'#FF{i}{i}00',
                'lineWidth': i + 1,
                'pathData': [[100 + i*20, 100], [150 + i*20, 150]],
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
    assert len(data['strokes']) == 3

    ids = {s['drawingId'] for s in data['strokes']}
    assert 'drawing_0' in ids
    assert 'drawing_1' in ids
    assert 'drawing_2' in ids
