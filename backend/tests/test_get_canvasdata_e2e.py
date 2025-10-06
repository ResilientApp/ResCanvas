import sys
import json
import types
from flask import Flask


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = docs or []

    def find(self, q=None, sort=None):
        # return iterator over docs
        return iter(self.docs)

    def find_one(self, q=None, sort=None):
        # naive matching for queries that check transactions.value.asset.data.id or roomId
        if not q:
            return self.docs[0] if self.docs else None
        # if roomId in query
        for d in self.docs:
            try:
                if isinstance(q, dict) and ('roomId' in q and d.get('roomId') == q.get('roomId')):
                    return d
                # check transactions key queries
                if 'transactions.value.asset.data.id' in q:
                    # simplistic: return first doc with transactions
                    if d.get('transactions'):
                        return d
            except Exception:
                continue
        return None


class FakeRedis:
    def __init__(self, store=None):
        self.store = store or {}

    def get(self, k):
        v = self.store.get(k)
        if v is None:
            return None
        if isinstance(v, str):
            return v.encode()
        return v

    def set(self, k, v):
        self.store[k] = v

    def keys(self, pattern):
        # simple pattern support: prefix* -> keys that start with prefix
        try:
            if pattern and pattern.endswith('*'):
                prefix = pattern[:-1]
                return [k for k in self.store.keys() if k.startswith(prefix)]
        except Exception:
            pass
        return list(self.store.keys())

    def smembers(self, k):
        v = self.store.get(k) or set()
        return set(x.encode() if isinstance(x, str) else x for x in v)


def test_getCanvasData_history_end_to_end(monkeypatch):
    # Prepare fake services package and submodules before importing routes.get_canvas_data
    services_pkg = types.ModuleType('services')
    services_pkg.__path__ = []

    # Prepare fake DB collections
    room_id = 'e2e-room-1'

    # Build three drawing entries: pre-clear, clear_marker, post-clear
    pre = {
        'id': 'drawing_pre',
        'roomId': room_id,
        'ts': 1000,
        'timestamp': 1000,
        'user': 'tester',
        'type': 'public'
    }
    clear_marker = {
        'type': 'clear_marker',
        'roomId': room_id,
        'user': 'tester',
        'ts': 1500
    }
    post = {
        'id': 'drawing_post',
        'roomId': room_id,
        'ts': 2000,
        'timestamp': 2000,
        'user': 'tester',
        'type': 'public'
    }

    # Put them into redis as res-canvas-draw-0..2 so getCanvasData will read them directly
    fake_redis_store = {
        'res-canvas-draw-0': json.dumps(pre),
        'res-canvas-draw-1': json.dumps(clear_marker),
        'res-canvas-draw-2': json.dumps(post),
        # counters used by get_canvas_data
        'res-canvas-draw-count': '3'
    }

    fake_redis = FakeRedis(fake_redis_store)

    fake_strokes_coll = FakeCollection(docs=[
        # For completeness include a transaction-style block too
        {
            '_id': 'blk1',
            'transactions': [
                {'value': {'asset': {'data': {'id': 'drawing_pre', 'roomId': room_id, 'stroke': {'id': 'drawing_pre', 'ts': 1000}}}}}
            ]
        }
    ])

    fake_rooms_coll = FakeCollection(docs=[{'_id': room_id, 'wrappedKey': None}])

    # Build and inject services submodules
    services_db = types.ModuleType('services.db')
    services_db.strokes_coll = fake_strokes_coll
    services_db.rooms_coll = fake_rooms_coll
    services_db.redis_client = fake_redis
    services_db.users_coll = None
    services_db.shares_coll = None
    services_db.lock = object()

    services_canvas = types.ModuleType('services.canvas_counter')
    services_canvas.get_canvas_draw_count = lambda: 3

    services_crypto = types.ModuleType('services.crypto_service')
    services_crypto.unwrap_room_key = lambda x: x
    services_crypto.decrypt_for_room = lambda rk, blob: blob

    sys.modules['services'] = services_pkg
    sys.modules['services.db'] = services_db
    sys.modules['services.canvas_counter'] = services_canvas
    sys.modules['services.crypto_service'] = services_crypto

    # Now import the module under test
    import importlib
    routes = importlib.import_module('routes.get_canvas_data')

    # Call the Flask view in a request context (history mode start=0)
    app = Flask(__name__)
    with app.test_request_context(f'/getCanvasData?roomId={room_id}&start=0'):
        resp = routes.get_canvas_data()
        # Expect HTTP 200
        assert isinstance(resp, tuple)
        body, status = resp
        assert status == 200
        data = body.get_json()
        assert data['status'] == 'success'
        # Should include the pre-clear drawing
        ids = [d.get('id') for d in data['data']]
        assert 'drawing_pre' in ids
        assert 'drawing_post' in ids
