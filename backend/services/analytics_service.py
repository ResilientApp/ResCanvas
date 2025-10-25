"""
Simple analytics ingestion and query helpers.
This module stores anonymized events into MongoDB and provides small helpers
used by socket handlers and the aggregation worker.
"""
import time
import logging
from services.db import analytics_coll
from bson.objectid import ObjectId
from config import ANALYTICS_ENABLED

logger = logging.getLogger(__name__)


def _anonymize_user(user_id):
    """Return a deterministic anonymized user id for privacy-aware aggregation."""
    if not user_id:
        return None
    # Keep short hash-like form
    try:
        import hashlib
        return hashlib.sha1(str(user_id).encode('utf-8')).hexdigest()[:16]
    except Exception:
        return str(user_id)


def ingest_event(event: dict):
    """Ingest an analytics event into the analytics collection.

    Event shape (examples):
      {
        "roomId": "...",
        "userId": "...",
        "eventType": "stroke_created" | "join" | "leave" | "heartbeat",
        "payload": { ... },
        "ts": 1234567890
      }
    """
    if not ANALYTICS_ENABLED:
        return None
    try:
        ev = dict(event)
        ev.setdefault('ts', int(time.time() * 1000))
        # anonymize userId for privacy
        if 'userId' in ev and ev['userId']:
            ev['anonUserId'] = _anonymize_user(ev.get('userId'))
            ev.pop('userId', None)
        # ensure roomId string
        if 'roomId' in ev and isinstance(ev['roomId'], ObjectId):
            ev['roomId'] = str(ev['roomId'])
        analytics_coll.insert_one(ev)
        return ev
    except Exception:
        logger.exception('Failed to ingest analytics event')
        return None


def query_recent(roomId=None, limit=100):
    q = {} if not roomId else {"roomId": str(roomId)}
    try:
        docs = list(analytics_coll.find(q).sort([('ts', -1)]).limit(limit))
        return docs
    except Exception:
        logger.exception('Failed to query recent analytics events')
        return []
