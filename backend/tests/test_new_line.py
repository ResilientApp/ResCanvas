import json
import pytest

from app import app as flask_app
import services.db as db_module
import services.graphql_service as graphql_service


def test_submit_new_line_basic(monkeypatch):
    # Use fakeredis-like minimal dummy
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
    sample = {
        "user_id": "user1",
        "id": "line1",
        "strokes": [{"x": 1, "y": 2}],
        "meta": {"color": "#000"}
    }

    resp = client.post("/api/submitNewLine", json=sample)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["status"] == "success"
