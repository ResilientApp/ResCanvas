# services/canvas_counter.py

from services.db import redis_client, strokes_coll, lock
from services.graphql_service import commit_transaction_via_graphql
from config import *
import logging

logger = logging.getLogger(__name__)

def get_canvas_draw_count():
    count = redis_client.get('res-canvas-draw-count')

    if count is None:
        # If not in Redis, get from external API
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
                raise KeyError("Found block but no matching txn for res-canvas-draw-count")
        else:
            raise KeyError("No Mongo block found for res-canvas-draw-count")

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
