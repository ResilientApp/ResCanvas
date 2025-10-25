import sys
import types
import time


class FakeColl:
    def __init__(self):
        self.storage = []

    def insert_one(self, doc):
        # emulate pymongo returning an InsertOneResult-like object
        self.storage.append(dict(doc))
        class R: pass
        r = R()
        r.inserted_id = len(self.storage) - 1
        return r

    def find(self, q=None):
        # return all docs matching roomId if provided
        q = q or {}
        room = q.get('roomId')
        if room:
            return [d for d in self.storage if d.get('roomId') == room]
        return list(self.storage)


def test_ingest_and_query_recent(monkeypatch):
    # Inject a fake services.db module to avoid importing real dependencies (redis/mongo)
    fake_db = types.ModuleType('services.db')
    fake_analytics = FakeColl()
    fake_db.analytics_coll = fake_analytics
    sys.modules['services.db'] = fake_db

    # Now import the analytics service (it will import services.db from sys.modules)
    import services.analytics_service as analytics_service

    ev = analytics_service.ingest_event({
        'roomId': 'room-test-1',
        'userId': 'user-123',
        'eventType': 'stroke_created',
        'payload': {'color': '#ff0000'},
        'ts': int(time.time() * 1000)
    })

    assert ev is not None
    # userId should be removed and anonUserId present
    assert 'anonUserId' in ev and 'userId' not in ev

    recent = analytics_service.query_recent('room-test-1', limit=10)
    assert isinstance(recent, list)
    assert len(recent) >= 1
    # Ensure stored doc contains our eventType
    assert any(r.get('eventType') == 'stroke_created' for r in recent)
