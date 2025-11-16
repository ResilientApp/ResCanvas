"""
Background Worker for GraphQL Retry Queue

This worker runs periodically to retry failed ResilientDB GraphQL commits.
When the GraphQL service is down, stroke commits are queued. This worker
automatically syncs them when the service becomes available again.

Run this in a separate process:
    python3 workers/graphql_retry_worker.py
    
Or in a screen session:
    screen -S rescanvas_retry_worker -dm python3 workers/graphql_retry_worker.py
"""

import time
import logging
import sys
import os

# Add parent directory to path to import from backend
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from services.graphql_retry_queue import process_retry_queue, get_queue_size

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s:%(lineno)d – %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
RETRY_INTERVAL_SECONDS = 60  # Process queue every 60 seconds
BATCH_SIZE = 50  # Process up to 50 items per batch

def main():
    """Main worker loop."""
    logger.info("GraphQL Retry Worker starting...")
    logger.info(f"Configuration: RETRY_INTERVAL={RETRY_INTERVAL_SECONDS}s, BATCH_SIZE={BATCH_SIZE}")
    
    iteration = 0
    
    try:
        while True:
            iteration += 1
            
            try:
                # Check queue size
                queue_size = get_queue_size()
                
                if queue_size > 0:
                    logger.info(f"Iteration {iteration}: Processing retry queue ({queue_size} items pending)")
                    
                    # Process batch
                    stats = process_retry_queue(max_items=BATCH_SIZE)
                    
                    if stats['success'] > 0 or stats['failed'] > 0:
                        remaining = get_queue_size()
                        logger.info(
                            f"Batch complete: {stats['success']} synced, "
                            f"{stats['failed']} failed, {stats['skipped']} skipped. "
                            f"Remaining: {remaining}"
                        )
                else:
                    if iteration % 10 == 1:  # Log every 10 iterations when idle
                        logger.debug(f"💤 Iteration {iteration}: Queue empty, waiting...")
                
            except KeyboardInterrupt:
                raise  # Re-raise to exit gracefully
            except Exception as e:
                logger.error(f"Error in worker iteration {iteration}: {e}")
                logger.exception("Full traceback:")
            
            # Wait before next iteration
            time.sleep(RETRY_INTERVAL_SECONDS)
            
    except KeyboardInterrupt:
        logger.info("Worker stopped by user (Ctrl+C)")
    except Exception as e:
        logger.error(f"Worker crashed: {e}")
        logger.exception("Full traceback:")
        sys.exit(1)

if __name__ == "__main__":
    main()
