"""
GraphQL Commit Retry Queue

When ResilientDB GraphQL is down, stroke data is persisted to MongoDB but 
blockchain commits fail. This module queues failed commits and retries them
when the service becomes available again.

Architecture:
- Failed commits stored in Redis with stroke metadata
- Background worker retries periodically
- Successful retries are removed from queue
- Persistent across server restarts
"""

import json
import time
import logging
import redis.exceptions
from typing import Dict, Any, Optional
from services.db import redis_client
from services.graphql_service import commit_transaction_via_graphql
from config import SIGNER_PUBLIC_KEY, SIGNER_PRIVATE_KEY, RECIPIENT_PUBLIC_KEY

logger = logging.getLogger(__name__)

RETRY_QUEUE_KEY = "resilientdb:retry_queue"
RETRY_ATTEMPTS_KEY = "resilientdb:retry_attempts"
MAX_RETRY_ATTEMPTS = 1000
RETRY_EXPIRY_SECONDS = 7 * 24 * 3600  # Keep failed commits for 7 days

def add_to_retry_queue(stroke_id: str, asset_data: Dict[str, Any]) -> None:
    """
    Add a failed GraphQL commit to the retry queue.
    
    Args:
        stroke_id: Unique identifier for the stroke
        asset_data: The asset data that should have been committed to ResilientDB
    """
    try:
        # Check if this stroke is already in the queue (deduplication)
        existing_items = redis_client.zrange(RETRY_QUEUE_KEY, 0, -1)
        for item_json in existing_items:
            try:
                item = json.loads(item_json)
                if item.get("stroke_id") == stroke_id:
                    logger.warning(f"Stroke {stroke_id} already in retry queue, skipping duplicate")
                    return
            except:
                pass
        
        retry_item = {
            "stroke_id": stroke_id,
            "asset_data": asset_data,
            "timestamp": int(time.time() * 1000),
            "attempts": 0
        }
        
        # Use deterministic JSON serialization for consistent key
        retry_item_json = json.dumps(retry_item, sort_keys=True)
        
        # Store in Redis sorted set with timestamp as score for ordered processing
        redis_client.zadd(
            RETRY_QUEUE_KEY,
            {retry_item_json: time.time()}
        )
        
        logger.info(f"Added stroke {stroke_id} to GraphQL retry queue")
    except redis.exceptions.RedisError as e:
        # Critical: Redis is down, log prominently
        logger.critical(f"⚠️ REDIS DOWN: Cannot queue stroke {stroke_id} for retry: {e}")
        logger.critical(f"⚠️ Stroke {stroke_id} will NOT be synced to blockchain unless manually recovered")
    except Exception as e:
        logger.error(f"Failed to add stroke {stroke_id} to retry queue: {e}")


def get_pending_retries(limit: int = 100) -> list:
    """
    Get pending retry items from the queue.
    
    Args:
        limit: Maximum number of items to retrieve
        
    Returns:
        List of retry items (oldest first)
    """
    try:
        # Get oldest items first (FIFO)
        items = redis_client.zrange(RETRY_QUEUE_KEY, 0, limit - 1)
        return [json.loads(item) for item in items]
    except Exception as e:
        logger.error(f"Failed to get pending retries: {e}")
        return []


def remove_from_retry_queue(stroke_id: str, retry_item_json: str) -> None:
    """
    Remove a successfully committed item from the retry queue.
    
    Args:
        stroke_id: Stroke identifier
        retry_item_json: The JSON string of the retry item (used as Redis key)
                        MUST be the same JSON string used when adding (with sort_keys=True)
    """
    try:
        result = redis_client.zrem(RETRY_QUEUE_KEY, retry_item_json)
        if result > 0:
            logger.info(f"Removed stroke {stroke_id} from retry queue (success)")
        else:
            logger.warning(f"Stroke {stroke_id} not found in retry queue (may have been already removed)")
    except Exception as e:
        logger.error(f"Failed to remove stroke {stroke_id} from retry queue: {e}")


def increment_retry_attempts(stroke_id: str) -> int:
    """
    Increment retry attempt counter for a stroke.
    
    Args:
        stroke_id: Stroke identifier
        
    Returns:
        Current retry attempt count
    """
    try:
        key = f"{RETRY_ATTEMPTS_KEY}:{stroke_id}"
        attempts = redis_client.incr(key)
        redis_client.expire(key, RETRY_EXPIRY_SECONDS)
        return attempts
    except Exception as e:
        logger.error(f"Failed to increment retry attempts for {stroke_id}: {e}")
        return 0


def get_retry_attempts(stroke_id: str) -> int:
    """Get current retry attempt count for a stroke."""
    try:
        key = f"{RETRY_ATTEMPTS_KEY}:{stroke_id}"
        attempts = redis_client.get(key)
        return int(attempts) if attempts else 0
    except Exception:
        return 0


def process_retry_queue(max_items: int = 50) -> Dict[str, int]:
    """
    Process pending GraphQL commit retries.
    
    Args:
        max_items: Maximum number of items to process in this batch
        
    Returns:
        Dictionary with success/failure counts
    """
    stats = {"success": 0, "failed": 0, "skipped": 0}
    
    try:
        pending_items = get_pending_retries(max_items)
        
        if not pending_items:
            logger.debug("No pending GraphQL retries")
            return stats
        
        logger.info(f"Processing {len(pending_items)} pending GraphQL retries")
        
        for item in pending_items:
            stroke_id = item.get("stroke_id")
            asset_data = item.get("asset_data")
            
            if not stroke_id or not asset_data:
                logger.warning(f"Invalid retry item: {item}")
                stats["skipped"] += 1
                continue
            
            # Check if we've exceeded max retry attempts
            attempts = get_retry_attempts(stroke_id)
            if attempts >= MAX_RETRY_ATTEMPTS:
                logger.error(f"Stroke {stroke_id} exceeded max retry attempts ({MAX_RETRY_ATTEMPTS}), removing from queue")
                remove_from_retry_queue(stroke_id, json.dumps(item))
                stats["skipped"] += 1
                continue
            
            # Attempt to commit to ResilientDB
            try:
                prep = {
                    "operation": "CREATE",
                    "amount": 1,
                    "signerPublicKey": SIGNER_PUBLIC_KEY,
                    "signerPrivateKey": SIGNER_PRIVATE_KEY,
                    "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
                    "asset": {"data": asset_data}
                }
                
                txn_id = commit_transaction_via_graphql(prep)
                logger.info(f"✅ RETRY SUCCESS: Stroke {stroke_id} committed to ResilientDB: {txn_id}")
                
                # Remove from queue on success - use deterministic JSON serialization
                retry_item_json = json.dumps(item, sort_keys=True)
                remove_from_retry_queue(stroke_id, retry_item_json)
                stats["success"] += 1
                
            except Exception as e:
                # Increment attempts and keep in queue
                new_attempts = increment_retry_attempts(stroke_id)
                logger.warning(f"⚠️ RETRY FAILED (attempt {new_attempts}/{MAX_RETRY_ATTEMPTS}): Stroke {stroke_id}: {str(e)}")
                stats["failed"] += 1
        
        if stats["success"] > 0 or stats["failed"] > 0:
            logger.info(f"Retry batch complete: {stats['success']} success, {stats['failed']} failed, {stats['skipped']} skipped")
        
    except Exception as e:
        logger.error(f"Error processing retry queue: {e}")
    
    return stats


def get_queue_size() -> int:
    """Get the current size of the retry queue."""
    try:
        return redis_client.zcard(RETRY_QUEUE_KEY)
    except Exception:
        return 0


def clear_retry_queue() -> int:
    """
    Clear all pending retries from the queue.
    WARNING: This will discard all queued GraphQL commits.
    
    Returns:
        Number of items cleared
    """
    try:
        count = redis_client.zcard(RETRY_QUEUE_KEY)
        redis_client.delete(RETRY_QUEUE_KEY)
        logger.warning(f"Cleared {count} items from GraphQL retry queue")
        return count
    except Exception as e:
        logger.error(f"Failed to clear retry queue: {e}")
        return 0
