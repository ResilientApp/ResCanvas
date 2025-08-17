import json
import pytest

from app import app as flask_app
import services.db as db_module
import services.graphql_service as graphql_service

def test_submit_new_line_basic(monkeypatch):
    # Dummy Redis and GraphQL
    class DummyRedis:
        def __init__(self):
            self.kv = {}
        def set(self, k, v):
            self.kv[k] = v
        def lpush(self, k, v):
            self.kv.setdefault(k, []).insert(0, v)
        def delete(self, k):
            self.kv.pop(k, None)

    dummy_redis = DummyRedis()
    monkeypatch.setattr(db_module, "redis_client", dummy_redis)
    monkeypatch.setattr(graphql_service, "commit_transaction_via_graphql", lambda payload: "ok")

    client = flask_app.test_client()
    import time
    ts = int(time.time() * 1000)

    # Build the nested value JSON the same way your app does
    value_obj = {
        "id": f"res-canvas-draw-test-{ts}",
        "ts": ts,
        "user": f"user1|{ts}",
        "drawingId": f"drawing_{ts}",
        "color": "#000000",
        "lineWidth": 5,
        "pathData": [{"x": 1, "y": 2}],
        "timestamp": ts,
        "brushStyle": "round",
        "order": ts,
        "txnId": "tx-test-000"
    }

    # The payload your backend expects
    sample = {
        "id": value_obj["id"],
        "ts": value_obj["ts"],
        "user": value_obj["user"],
        "value": json.dumps(value_obj)   # must be a string, not dict
    }

    # Locate the correct route
    submit_path = None
    for rule in flask_app.url_map.iter_rules():
        if "submitNewLine" in str(rule):
            submit_path = str(rule)
            break
    assert submit_path, "Could not find a route containing 'submitNewLine' in app.url_map"

    resp = client.post(submit_path, json=sample)
    print("Response:", resp.data)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["status"] == "success"
