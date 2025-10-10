import time
import pytest
from backend.app import app
from services.db import strokes_coll, redis_client



@pytest.fixture(autouse=True)
def cleanup():

    strokes_coll.delete_many({})
    try:
        for k in redis_client.scan_iter(match='*'):
            try:
                redis_client.delete(k)
            except Exception:
                pass
    except Exception:
        pass
    yield
    strokes_coll.delete_many({})
    try:
        for k in redis_client.scan_iter(match='*'):
            try:
                redis_client.delete(k)
            except Exception:
                pass
    except Exception:
        pass


def make_stroke(drawingId, user='testuser', pathData=None):
    return {
        'stroke': {
            'drawingId': drawingId,
            'color': '#000',
            'lineWidth': 1,
            'pathData': pathData or [{'x': 0, 'y': 0}, {'x': 1, 'y': 1}],
            'timestamp': int(time.time() * 1000),
            'user': user,
        }
    }


def test_cut_paste_undo_grouping():
    client = app.test_client()

    # Create a room via API to get a valid ObjectId string
    room_resp = client.post('/rooms?user=testuser|ts', json={'name': 'testroom', 'type': 'public'})
    assert room_resp.status_code in (200, 201)
    room_json = room_resp.get_json()
    assert room_json['status'] == 'ok'
    room_id = room_json['room']['id']

    # Create initial strokes
    for i in range(3):
        resp = client.post(f'/rooms/{room_id}/strokes?user=testuser|ts', json=make_stroke(f's{i}'))
        assert resp.status_code == 200

    # Submit replacement/pasted segments with skipUndoStack true
    pasted = []
    paste_record_id = 'paste_rec_1'
    for i in range(2):
        sd = make_stroke(f'new{i}')
        # attach parentPasteId so backend can group these child strokes
        sd['stroke']['parentPasteId'] = paste_record_id
        # also include in pathData for completeness
        sd['stroke']['pathData'] = {'parentPasteId': paste_record_id}
        resp = client.post(f'/rooms/{room_id}/strokes?user=testuser|ts', json={**sd, 'skipUndoStack': True})
        assert resp.status_code == 200
        pasted.append(sd['stroke']['drawingId'])

    # Submit single paste-record (one backend undoable op)
    paste_payload = make_stroke(paste_record_id)
    paste_payload['stroke']['pathData'] = {'tool': 'paste', 'pastedDrawingIds': pasted}
    resp = client.post(f'/rooms/{room_id}/strokes?user=testuser|ts', json=paste_payload)
    assert resp.status_code == 200

    # Confirm undo available
    status = client.get(f'/rooms/{room_id}/undo_redo_status?user=testuser|ts').get_json()
    assert status['undo_available'] is True

    # Undo once should undo the paste-record only
    resp = client.post(f'/rooms/{room_id}/undo?user=testuser|ts')
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['status'] == 'ok'

    # After undo, pasted strokes should be filtered
    strokes = client.get(f'/rooms/{room_id}/strokes?user=testuser|ts').get_json()
    ids = {s.get('id') or s.get('drawingId') for s in strokes['strokes']}
    assert 'new0' not in ids and 'new1' not in ids

    # Redo
    resp = client.post(f'/rooms/{room_id}/redo?user=testuser|ts')
    assert resp.status_code == 200
    body = resp.get_json()
    assert body['status'] == 'ok'

    # After redo, pasted strokes should reappear
    strokes = client.get(f'/rooms/{room_id}/strokes?user=testuser|ts').get_json()
    ids = {s.get('id') or s.get('drawingId') for s in strokes['strokes']}
    assert 'new0' in ids and 'new1' in ids