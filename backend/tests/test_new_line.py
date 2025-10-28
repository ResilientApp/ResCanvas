import json
import pytest
import time


def test_submit_new_line_basic(client, test_user, test_room, auth_headers):
    """Test submitting a stroke via the strokes endpoint (standard workflow)"""
    room_id = str(test_room['_id'])
    ts = int(time.time() * 1000)
    
    # Build stroke data
    stroke_data = {
        'stroke': {
            'drawingId': f'drawing_{ts}',
            'color': '#000000',
            'lineWidth': 5,
            'pathData': [{'x': 1, 'y': 2}],
            'timestamp': ts,
            'user': test_user['username']
        }
    }
    
    # Submit stroke via standard endpoint
    resp = client.post(f'/rooms/{room_id}/strokes', json=stroke_data, headers=auth_headers)
    assert resp.status_code in (200, 201), f"Stroke submission failed: {resp.get_json()}"
    data = resp.get_json()
    assert data['status'] in ('ok', 'success')
