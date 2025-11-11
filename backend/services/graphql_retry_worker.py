"""
Background thread for GraphQL retry queue processing

This module runs a background thread within the Flask application
to automatically retry failed ResilientDB commits. No separate
process needed - starts automatically when Flask starts.
"""

import threading
import time
import logging
from services.graphql_retry_queue import process_retry_queue, get_queue_size

logger = logging.getLogger(__name__)

# Configuration
RETRY_INTERVAL_SECONDS = 60
BATCH_SIZE = 50

# Thread control
_retry_thread = None
_stop_event = threading.Event()


def _retry_worker_loop():
    """Background worker that processes the retry queue periodically."""
    # Wait a bit for Redis/MongoDB to be fully ready before starting
    time.sleep(2)
    
    logger.info("🚀 GraphQL Retry Worker started (background thread)")
    logger.info(f"Configuration: RETRY_INTERVAL={RETRY_INTERVAL_SECONDS}s, BATCH_SIZE={BATCH_SIZE}")
    
    iteration = 0
    
    while not _stop_event.is_set():
        iteration += 1
        
        try:
            queue_size = get_queue_size()
            
            if queue_size > 0:
                logger.info(f"📊 Iteration {iteration}: Processing retry queue ({queue_size} items pending)")
                
                stats = process_retry_queue(max_items=BATCH_SIZE)
                
                if stats['success'] > 0 or stats['failed'] > 0:
                    remaining = get_queue_size()
                    logger.info(
                        f"✅ Batch complete: {stats['success']} synced, "
                        f"{stats['failed']} failed, {stats['skipped']} skipped. "
                        f"Remaining: {remaining}"
                    )
            else:
                if iteration % 10 == 1:  # Log every 10 iterations when idle
                    logger.debug(f"💤 Iteration {iteration}: Queue empty")
        
        except Exception as e:
            logger.error(f"❌ Error in retry worker iteration {iteration}: {e}")
            logger.exception("Full traceback:")
        
        # Wait with ability to interrupt on shutdown
        _stop_event.wait(RETRY_INTERVAL_SECONDS)
    
    logger.info("🛑 GraphQL Retry Worker stopped")


def start_retry_worker():
    """
    Start the background retry worker thread.
    Called automatically when Flask app starts.
    """
    global _retry_thread
    
    if _retry_thread is not None and _retry_thread.is_alive():
        logger.warning("Retry worker already running")
        return
    
    _stop_event.clear()
    _retry_thread = threading.Thread(
        target=_retry_worker_loop,
        name="GraphQLRetryWorker",
        daemon=True  # Will stop when main process exits
    )
    _retry_thread.start()
    logger.info("GraphQL Retry Worker thread started")


def stop_retry_worker():
    """
    Stop the background retry worker thread.
    Called automatically when Flask app shuts down.
    """
    global _retry_thread
    
    if _retry_thread is None or not _retry_thread.is_alive():
        logger.warning("Retry worker not running")
        return
    
    logger.info("Stopping GraphQL Retry Worker...")
    _stop_event.set()
    _retry_thread.join(timeout=5)
    
    if _retry_thread.is_alive():
        logger.warning("Retry worker did not stop cleanly")
    else:
        logger.info("Retry worker stopped successfully")
    
    _retry_thread = None


def is_worker_running():
    """Check if the retry worker is currently running."""
    return _retry_thread is not None and _retry_thread.is_alive()
