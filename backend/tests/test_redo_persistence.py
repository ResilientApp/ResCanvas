
import time
import pytest


def test_basic_undo_redo_flow(client, test_user, test_room, auth_headers):
    room_id = str(test_room["_id"])

    for i in range(3):
        stroke_data = {
            "stroke": {
                "drawingId": f"stroke_{i}_{int(time.time() * 1000)}",
                "color": "#FF0000",
                "lineWidth": 5,
                "pathData": [[100 + i*50, 100], [150 + i*50, 150]],
                "timestamp": int(time.time() * 1000),
                "user": test_user["username"]
            }
        }
        resp = client.post(f"/rooms/{room_id}/strokes", json=stroke_data, headers=auth_headers)
        assert resp.status_code in (200, 201)

    resp = client.get(f"/rooms/{room_id}/strokes", headers=auth_headers)
    assert resp.status_code == 200
    strokes = resp.get_json()["strokes"]
    assert len(strokes) == 3

    for i in range(2):
        resp = client.post(f"/rooms/{room_id}/undo", headers=auth_headers)
        assert resp.status_code == 200
        assert resp.get_json()["status"] == "ok"

    resp = client.get(f"/rooms/{room_id}/strokes", headers=auth_headers)
    assert resp.status_code == 200
    strokes = resp.get_json()["strokes"]
    assert len(strokes) == 1

    resp = client.post(f"/rooms/{room_id}/redo", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"

    resp = client.get(f"/rooms/{room_id}/strokes", headers=auth_headers)
    assert resp.status_code == 200
    strokes = resp.get_json()["strokes"]
    assert len(strokes) == 2


def test_redo_clears_on_new_stroke(client, test_user, test_room, auth_headers):
    room_id = str(test_room["_id"])

    for i in range(2):
        stroke_data = {"stroke": {"drawingId": f"stroke_{i}", "color": "#FF0000", "lineWidth": 5, "pathData": [[100, 100], [150, 150]], "timestamp": int(time.time() * 1000), "user": test_user["username"]}}
        resp = client.post(f"/rooms/{room_id}/strokes", json=stroke_data, headers=auth_headers)
        assert resp.status_code in (200, 201)

    resp = client.post(f"/rooms/{room_id}/undo", headers=auth_headers)
    assert resp.status_code == 200

    new_stroke = {"stroke": {"drawingId": "new_stroke", "color": "#00FF00", "lineWidth": 3, "pathData": [[200, 200], [250, 250]], "timestamp": int(time.time() * 1000), "user": test_user["username"]}}
    resp = client.post(f"/rooms/{room_id}/strokes", json=new_stroke, headers=auth_headers)
    assert resp.status_code in (200, 201)

    resp = client.get(f"/rooms/{room_id}/undo_redo_status", headers=auth_headers)
    assert resp.status_code == 200
    status = resp.get_json()
    assert status["redo_available"] is False


def test_multiple_undo_redo_cycles(client, test_user, test_room, auth_headers):
    room_id = str(test_room["_id"])

    for i in range(4):
        stroke_data = {"stroke": {"drawingId": f"cycle_{i}", "color": "#0000FF", "lineWidth": 2, "pathData": [[i*30, i*30], [i*30+20, i*30+20]], "timestamp": int(time.time() * 1000), "user": test_user["username"]}}
        resp = client.post(f"/rooms/{room_id}/strokes", json=stroke_data, headers=auth_headers)
        assert resp.status_code in (200, 201)

    for i in range(4):
        resp = client.post(f"/rooms/{room_id}/undo", headers=auth_headers)
        assert resp.status_code == 200

    resp = client.get(f"/rooms/{room_id}/strokes", headers=auth_headers)
    strokes = resp.get_json()["strokes"]
    assert len(strokes) == 0

    for i in range(2):
        resp = client.post(f"/rooms/{room_id}/redo", headers=auth_headers)
        assert resp.status_code == 200

    resp = client.get(f"/rooms/{room_id}/strokes", headers=auth_headers)
    strokes = resp.get_json()["strokes"]
    assert len(strokes) == 2


def test_undo_redo_status_accuracy(client, test_user, test_room, auth_headers):
    room_id = str(test_room["_id"])

    resp = client.get(f"/rooms/{room_id}/undo_redo_status", headers=auth_headers)
    assert resp.status_code == 200
    status = resp.get_json()
    assert status["undo_available"] is False
    assert status["redo_available"] is False

    stroke_data = {"stroke": {"drawingId": "status_test", "color": "#000000", "lineWidth": 1, "pathData": [[10, 10], [20, 20]], "timestamp": int(time.time() * 1000), "user": test_user["username"]}}
    resp = client.post(f"/rooms/{room_id}/strokes", json=stroke_data, headers=auth_headers)
    assert resp.status_code in (200, 201)

    resp = client.get(f"/rooms/{room_id}/undo_redo_status", headers=auth_headers)
    assert resp.status_code == 200
    status = resp.get_json()
    assert status["undo_available"] is True


def test_undo_redo_with_cache_clear(client, test_user, test_room, auth_headers, mock_redis):
    room_id = str(test_room["_id"])

    for i in range(3):
        stroke_data = {"stroke": {"drawingId": f"persist_{i}", "color": "#FF00FF", "lineWidth": 4, "pathData": [[50 + i*40, 50], [100 + i*40, 100]], "timestamp": int(time.time() * 1000), "user": test_user["username"]}}
        resp = client.post(f"/rooms/{room_id}/strokes", json=stroke_data, headers=auth_headers)
        assert resp.status_code in (200, 201)

    for i in range(2):
        resp = client.post(f"/rooms/{room_id}/undo", headers=auth_headers)
        assert resp.status_code == 200

    resp = client.post(f"/rooms/{room_id}/redo", headers=auth_headers)
    assert resp.status_code == 200

    resp = client.get(f"/rooms/{room_id}/strokes", headers=auth_headers)
    strokes_before = resp.get_json()["strokes"]
    assert len(strokes_before) == 2

    mock_redis.flushdb()

    resp = client.get(f"/rooms/{room_id}/strokes", headers=auth_headers)
    assert resp.status_code == 200
    strokes_after = resp.get_json()["strokes"]
    assert len(strokes_after) >= 1


def test_undo_without_strokes(client, test_user, test_room, auth_headers):
    room_id = str(test_room["_id"])
    resp = client.post(f"/rooms/{room_id}/undo", headers=auth_headers)
    assert resp.status_code in (200, 400)


def test_redo_without_undo(client, test_user, test_room, auth_headers):
    room_id = str(test_room["_id"])

    stroke_data = {"stroke": {"drawingId": "redo_test", "color": "#FFFF00", "lineWidth": 2, "pathData": [[30, 30], [60, 60]], "timestamp": int(time.time() * 1000), "user": test_user["username"]}}
    resp = client.post(f"/rooms/{room_id}/strokes", json=stroke_data, headers=auth_headers)
    assert resp.status_code in (200, 201)

    resp = client.post(f"/rooms/{room_id}/redo", headers=auth_headers)
    assert resp.status_code in (200, 400)
