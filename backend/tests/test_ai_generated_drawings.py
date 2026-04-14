import time


def make_ai_stroke(drawing_id, parent_paste_id=None):
    path_data = {
        "tool": "shape",
        "type": "rectangle",
        "start": {"x": 10, "y": 10},
        "end": {"x": 40, "y": 40},
    }
    if parent_paste_id:
        path_data["parentPasteId"] = parent_paste_id

    stroke = {
        "drawingId": drawing_id,
        "color": "#000000",
        "lineWidth": 4,
        "pathData": path_data,
        "timestamp": int(time.time() * 1000),
    }
    if parent_paste_id:
        stroke["parentPasteId"] = parent_paste_id
    return {"stroke": stroke}


def test_ai_generated_drawings_are_grouped_for_undo_and_redo(client, test_room, auth_headers):
    room_id = str(test_room["_id"])
    batch_id = "ai_batch_1"

    for drawing_id in ("ai_child_1", "ai_child_2"):
        payload = make_ai_stroke(drawing_id, parent_paste_id=batch_id)
        response = client.post(
            f"/rooms/{room_id}/strokes",
            json={**payload, "skipUndoStack": True},
            headers=auth_headers,
        )
        assert response.status_code in (200, 201), response.get_json()

    batch_marker = {
        "stroke": {
            "drawingId": batch_id,
            "color": "#FFFFFF",
            "lineWidth": 1,
            "pathData": {
                "tool": "paste",
                "cut": False,
                "pastedDrawingIds": ["ai_child_1", "ai_child_2"],
                "aiGenerated": True,
            },
            "timestamp": int(time.time() * 1000),
        }
    }
    response = client.post(f"/rooms/{room_id}/strokes", json=batch_marker, headers=auth_headers)
    assert response.status_code in (200, 201), response.get_json()

    strokes = client.get(f"/rooms/{room_id}/strokes", headers=auth_headers).get_json()["strokes"]
    ids = {s.get("drawingId") or s.get("id") for s in strokes}
    assert {"ai_child_1", "ai_child_2", batch_id}.issubset(ids)

    undo_response = client.post(f"/rooms/{room_id}/undo", headers=auth_headers)
    assert undo_response.status_code == 200, undo_response.get_json()
    assert undo_response.get_json()["status"] == "ok"

    strokes_after_undo = client.get(f"/rooms/{room_id}/strokes", headers=auth_headers).get_json()["strokes"]
    ids_after_undo = {s.get("drawingId") or s.get("id") for s in strokes_after_undo}
    assert "ai_child_1" not in ids_after_undo
    assert "ai_child_2" not in ids_after_undo
    assert batch_id not in ids_after_undo

    redo_response = client.post(f"/rooms/{room_id}/redo", headers=auth_headers)
    assert redo_response.status_code == 200, redo_response.get_json()
    assert redo_response.get_json()["status"] == "ok"

    strokes_after_redo = client.get(f"/rooms/{room_id}/strokes", headers=auth_headers).get_json()["strokes"]
    ids_after_redo = {s.get("drawingId") or s.get("id") for s in strokes_after_redo}
    assert {"ai_child_1", "ai_child_2", batch_id}.issubset(ids_after_redo)
