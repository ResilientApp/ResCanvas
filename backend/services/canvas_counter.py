# services/canvas_counter.py

from services.db import redis_client, strokes_coll, lock
from services.graphql_service import commit_transaction_via_graphql
from config import *
import logging

logger = logging.getLogger(__name__)

def get_canvas_draw_count():
    count = redis_client.get('res-canvas-draw-count')

    if count is None:
        # Not in Redis: attempt to read latest persisted counter from Mongo/ResDB
        block = strokes_coll.find_one(
            {"transactions.value.asset.data.id": "res-canvas-draw-count"},
            sort=[("id", -1)]
        )
        if block:
            tx = next(
                (t for t in block["transactions"]
                if t.get("value", {}).get("asset", {}).get("data", {}).get("id") == "res-canvas-draw-count"),
                None
            )
            if tx:
                count = tx["value"]["asset"]["data"].get("value", 0)
                redis_client.set("res-canvas-draw-count", count)
            else:
                # No matching transaction found; initialize to zero
                count = 0
                try:
                    redis_client.set("res-canvas-draw-count", 0)
                except Exception:
                    pass
        else:
            # No persisted counter found; initialize to zero and return
            count = 0
            try:
                redis_client.set("res-canvas-draw-count", 0)
            except Exception:
                pass

    else:
        count = int(count)
    return count

def increment_canvas_draw_count():
    with lock:
        count = get_canvas_draw_count() + 1
        # Update in Redis
        redis_client.set('res-canvas-draw-count', count)
        # Update in external API
        increment_count = {
            "operation": "CREATE",
            "amount": 1,
            "signerPublicKey": SIGNER_PUBLIC_KEY,
            "signerPrivateKey": SIGNER_PRIVATE_KEY,
            "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
            "asset": {
                "data": {
                    "id": "res-canvas-draw-count",
                    "value": count
                }
            }
        }
        commit_transaction_via_graphql(increment_count)

    return count
