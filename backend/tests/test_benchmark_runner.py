import pytest
import json

from benchmarks import benchmark_runner


class DummyRedis:
    def __init__(self):
        self.store = {}
    def ping(self):
        return True
    def set(self, k, v):
        self.store[k] = v
    def get(self, k):
        return self.store.get(k)


class DummyColl:
    def __init__(self):
        self._data = {}
        self._counter = 1
    def insert_one(self, doc):
        _id = self._counter
        self._counter = 1
        self._data[_id] = doc
        class R: pass
        r = R(); r.inserted_id = _id
        return r
    def find_one(self, q):
        return next(iter(self._data.values()), None)


def test_run_all_monkeypatched(monkeypatch):

    monkeypatch.setattr(benchmark_runner, "redis_client", DummyRedis())
    monkeypatch.setattr(benchmark_runner, "strokes_coll", DummyColl())

    class DummyResp:
        status_code = 200
        text = '{"data":{}}'
    monkeypatch.setattr("benchmarks.benchmark_runner.requests.post", lambda *a, **k: DummyResp())

    res = benchmark_runner.run_all(rounds_redis=2, rounds_mongo=2, rounds_graphql=1)
    assert "redis" in res and "mongo" in res and "graphql" in res
    assert isinstance(res["timestamp_ms"], int)
