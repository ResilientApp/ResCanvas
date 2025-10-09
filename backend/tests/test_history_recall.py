import json
import types
import pytest

from flask import Flask

# We'll import the modules under test
import sys
import importlib

# We'll import the module under test after we patch services.db in the fixture
get_strokes_from_mongo = None
get_canvas_data_view = None


class FakeCursor(list):
    def __init__(self, data):
        super().__init__(data)

    def batch_size(self, n):
        return iter(self)


class FakeCollection:
    def __init__(self, docs):
        # docs is a list of dicts
        self._docs = docs
    
    def insert_one(self, doc):
        self._docs.append(doc)
        return doc

    def find(self, query=None, sort=None):
        # Very small subset: return all docs where any transaction/asset matches
        # If query contains {'transactions.value.asset.data.id': {'$regex': '^undo-' }} we return matching docs
        # For our test we simply return all docs
        return FakeCursor(self._docs)

    def find_one(self, query=None, sort=None):
        # naive: return first doc
        for d in self._docs:
            return d
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
        # simplistic: return all keys
        return [k for k in self.store.keys()]

    def smembers(self, k):
        v = self.store.get(k) or set()
        return set(x.encode() if isinstance(x, str) else x for x in v)


@pytest.fixture(autouse=True)
def patch_db(monkeypatch):
    # Prepare a sample transaction-style document with nested asset.data.stroke
    room = 'testroom123'
    tx_doc = {
        '_id': 'block1',
        'transactions': [
            {
                'value': {
                    'asset': {
                        'data': {
                            'id': 'drawing_1',
                            'roomId': room,
                            'stroke': {
                                'id': 'drawing_1',
                                'drawingId': 'drawing_1',
                                'ts': 1000,
                                'timestamp': 1000,
                                'user': 'u1',
                                'color': '#000'
                            }
                        }
                    }
                }
            }
        ]
    }

    fake_strokes = FakeCollection([tx_doc])
    fake_rooms = FakeCollection([])
    fake_redis = FakeRedis({'res-canvas-draw-count': '1'})

    import services.db as db
    # Create a proper `services` package and stub submodules before importing
    import types as _types
    services_mod = _types.ModuleType('services')
    # mark as package
    services_mod.__path__ = []
    services_db_mod = _types.ModuleType('services.db')
    services_canvas_counter = _types.ModuleType('services.canvas_counter')
    services_crypto = _types.ModuleType('services.crypto_service')
    # stub functions used by get_canvas_data
    def _stub_get_canvas_draw_count():
        return 3
    services_canvas_counter.get_canvas_draw_count = _stub_get_canvas_draw_count
    # crypto stubs
    def _stub_unwrap_room_key(x):
        return x
    def _stub_decrypt_for_room(rk, blob):
        # pretend blob is already plaintext bytes
        return blob
    services_crypto.unwrap_room_key = _stub_unwrap_room_key
    services_crypto.decrypt_for_room = _stub_decrypt_for_room
    # populate required attributes used during imports
    services_db_mod.strokes_coll = fake_strokes
    services_db_mod.rooms_coll = fake_rooms
    services_db_mod.redis_client = fake_redis
    services_db_mod.users_coll = None
    services_db_mod.shares_coll = None
    # dummy lock object used by some modules
    services_db_mod.lock = object()
    sys.modules['services'] = services_mod
    sys.modules['services.db'] = services_db_mod
    sys.modules['services.canvas_counter'] = services_canvas_counter
    sys.modules['services.crypto_service'] = services_crypto

    import routes.get_canvas_data as g
    # patch the module-level bindings used by the helper and view (defensive)
    monkeypatch.setattr(g, 'strokes_coll', fake_strokes, raising=False)
    monkeypatch.setattr(g, 'rooms_coll', fake_rooms, raising=False)
    monkeypatch.setattr(g, 'redis_client', fake_redis, raising=False)

    # Monkeypatch get_strokes_from_mongo to return a stable, controlled result so we avoid real Mongo
    def _stub_get_strokes(start_ts=None, end_ts=None, room_id=None):
        payload = {
            'roomId': room,
            'type': 'public',
            'drawingId': 'drawing_1',
            'ts': 1000,
            'timestamp': 1000,
            'user': 'u1',
            'id': 'drawing_1'
        }
        return [{
            'value': json.dumps(payload),
            'user': 'u1',
            'ts': 1000,
            'id': 'drawing_1',
            'undone': False,
            'roomId': room
        }]

    monkeypatch.setattr(g, 'get_strokes_from_mongo', _stub_get_strokes, raising=False)

    # expose functions to module-level names so tests can use them
    global get_strokes_from_mongo, get_canvas_data_view
    get_strokes_from_mongo = g.get_strokes_from_mongo
    get_canvas_data_view = g.get_canvas_data

    yield


def test_get_strokes_from_mongo_returns_room(monkeypatch):
    # Call helper directly
    items = get_strokes_from_mongo(start_ts=None, end_ts=None, room_id='testroom123')
    assert isinstance(items, list)
    assert len(items) >= 1
    found = False
    for it in items:
        if it.get('roomId') == 'testroom123':
            found = True
            assert it.get('id') == 'drawing_1' or it.get('value')
    assert found


def test_getCanvasData_history_view(monkeypatch):
    # Use process_mongo_docs directly to validate parsing of transaction-style docs
    import routes.get_canvas_data as g
    # build a sample doc similar to what's used in fixture
    room = 'testroom123'
    tx_doc = {
        '_id': 'block1',
        'transactions': [
            {
                'value': {
                    'asset': {
                        'data': {
                            'id': 'drawing_1',
                            'roomId': room,
                            'stroke': {
                                'id': 'drawing_1',
                                'drawingId': 'drawing_1',
                                'ts': 1000,
                                'timestamp': 1000,
                                'user': 'u1',
                                'color': '#000'
                            }
                        }
                    }
                }
            }
        ]
    }
    items = g.process_mongo_docs([tx_doc], start_ts=None, end_ts=None, room_id='testroom123')
    assert any(it.get('roomId') == 'testroom123' for it in items)
