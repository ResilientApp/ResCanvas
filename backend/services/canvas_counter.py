# services/canvas_counter.py

from services.db import redis_client, strokes_coll
from services.graphql_service import commit_transaction_via_graphql
from config import *
import logging
import threading

logger = logging.getLogger(__name__)

def get_canvas_draw_count():
    """
    Get the current canvas draw count.
    Returns the count from Redis (fast path) or MongoDB (fallback).
    """
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
    """
    Atomically increment the canvas draw count and return the NEW value.
    
    Uses redis.incr() which is atomic and thread-safe.
    The GraphQL commit happens asynchronously to avoid blocking stroke submissions.
        
    Returns:
        int: The NEW counter value (already incremented)
    """
    count = redis_client.incr('res-canvas-draw-count')
    
    try:
        threading.Thread(
            target=_async_commit_counter_to_blockchain,
            args=(count,),
            daemon=True
        ).start()
    except Exception as e:
        logger.error(f"Failed to start async counter commit thread: {e}")
    
    return count

def _async_commit_counter_to_blockchain(count: int):
    """
    Background thread that commits the counter value to ResilientDB via GraphQL.
    
    This happens asynchronously so stroke submissions aren't blocked by blockchain latency.
    If GraphQL is down, the commit is queued for retry.
    
    Args:
        count: The counter value to commit
    """
    try:
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
        logger.debug(f"Counter {count} committed to blockchain successfully")
        
    except Exception as e:
        logger.warning(f"Failed to commit counter {count} to blockchain: {e}")
        try:
            from services.graphql_retry_queue import add_to_retry_queue
            add_to_retry_queue(
                f"counter-{count}",
                {
                    "id": "res-canvas-draw-count",
                    "value": count,
                    "type": "counter_increment"
                }
            )
            logger.info(f"Counter {count} queued for retry")
        except Exception as retry_error:
            logger.error(f"Failed to queue counter {count} for retry: {retry_error}")

