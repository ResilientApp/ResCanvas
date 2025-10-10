import json
import pytest

import services.canvas_counter as canvas_counter


class DummyRedis:
    def __init__(self):
        self.kv = {}

    def get(self, key):
        return self.kv.get(key)

    def set(self, key, value):
        self.kv[key] = value


class DummyColl:
    def __init__(self, value_doc=None):
        self.value_doc = value_doc

    def find_one(self, query, sort=None, **kwargs):
        # Return a fake transaction document compatible with canvas_counter.get_canvas_draw_count
        # Put the count in transactions.value.asset.data.value as a fallback
        if self.value_doc is not None:
            return self.value_doc
        return {
            "transactions": [
                {"value": {"asset": {"data": {"id": "res-canvas-draw-count", "value": 123}}}}
            ]
        }


def test_get_canvas_draw_count_from_redis(monkeypatch):
    dummy_r = DummyRedis()
    dummy_r.set("res-canvas-draw-count", 42)
    monkeypatch.setattr(canvas_counter, "redis_client", dummy_r)
    # request should return integer 42
    got = canvas_counter.get_canvas_draw_count()
    assert int(got) == 42


def test_get_canvas_draw_count_from_mongo_and_set_redis(monkeypatch):
    dummy_r = DummyRedis()
    dummy_coll = DummyColl()
    monkeypatch.setattr(canvas_counter, "redis_client", dummy_r)
    monkeypatch.setattr(canvas_counter, "strokes_coll", dummy_coll)


    monkeypatch.setattr(canvas_counter, "commit_transaction_via_graphql", lambda payload: "ok")

    val = canvas_counter.get_canvas_draw_count()
    # should read 123 from dummy document
    assert int(val) == 123
    # Redis should now have the value set
    assert dummy_r.get("res-canvas-draw-count") == 123
