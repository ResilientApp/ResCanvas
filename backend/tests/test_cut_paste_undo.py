import os
import time
import pytest
from app import app

os.environ['JWT_SECRET'] = 'test-secret-key-do-not-use-in-production'


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


def test_cut_paste_undo_grouping(client, test_user, test_room, auth_headers):
    room_id = str(test_room['_id'])

    for i in range(3):
        resp = client.post(f'/rooms/{room_id}/strokes', json=make_stroke(f's{i}'), headers=auth_headers)
        assert resp.status_code in (200, 201), f"Stroke creation failed: {resp.get_json()}"

    pasted = []
    paste_record_id = 'paste_rec_1'
    for i in range(2):
        sd = make_stroke(f'new{i}')
        sd['stroke']['parentPasteId'] = paste_record_id
        sd['stroke']['pathData'] = {'parentPasteId': paste_record_id}
        resp = client.post(f'/rooms/{room_id}/strokes', json={**sd, 'skipUndoStack': True}, headers=auth_headers)
        assert resp.status_code in (200, 201), f"Pasted stroke creation failed: {resp.get_json()}"
        pasted.append(sd['stroke']['drawingId'])

    paste_payload = make_stroke(paste_record_id)
    paste_payload['stroke']['pathData'] = {'tool': 'paste', 'pastedDrawingIds': pasted}
    resp = client.post(f'/rooms/{room_id}/strokes', json=paste_payload, headers=auth_headers)
    assert resp.status_code in (200, 201), f"Paste record creation failed: {resp.get_json()}"

    status = client.get(f'/rooms/{room_id}/undo_redo_status', headers=auth_headers).get_json()
    assert status['undo_available'] is True

    resp = client.post(f'/rooms/{room_id}/undo', headers=auth_headers)
    assert resp.status_code == 200, f"Undo failed: {resp.get_json()}"
    body = resp.get_json()
    assert body['status'] == 'ok'

    strokes_resp = client.get(f'/rooms/{room_id}/strokes', headers=auth_headers)
    assert strokes_resp.status_code == 200, f"Get strokes failed: {strokes_resp.get_json()}"
    strokes = strokes_resp.get_json()
    ids = {s.get('id') or s.get('drawingId') for s in strokes['strokes']}
    assert 'new0' not in ids and 'new1' not in ids, f"Pasted strokes should be hidden after undo, but found: {ids}"

    resp = client.post(f'/rooms/{room_id}/redo', headers=auth_headers)
    assert resp.status_code == 200, f"Redo failed: {resp.get_json()}"
    body = resp.get_json()
    assert body['status'] == 'ok'

    strokes = client.get(f'/rooms/{room_id}/strokes', headers=auth_headers).get_json()
    ids = {s.get('id') or s.get('drawingId') for s in strokes['strokes']}
    assert 'new0' in ids and 'new1' in ids