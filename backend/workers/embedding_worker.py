"""
Embedding Worker - Incremental Canvas Embedding Generation

Automatically generates and updates vector embeddings for canvases in the background.
This worker monitors for new/modified rooms and updates their embeddings without
requiring manual re-population.

Usage:
    python -m workers.embedding_worker [--interval SECONDS] [--batch-size N]
"""

import sys
import os
import time
import logging
import argparse
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Set
import threading
import signal

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.db import rooms_coll, strokes_coll, mongo_client
from services.embedding_service import embed_text, embed_image
from services.vector_search_service import store_canvas_embedding, get_collection_stats
from bson import ObjectId
import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s:%(lineno)d – %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger(__name__)

# Configuration
DEFAULT_UPDATE_INTERVAL = 300  # 5 minutes - how often to check for updates
DEFAULT_DEBOUNCE_PERIOD = 180  # 3 minutes - minimum time since last room update before embedding
DEFAULT_BATCH_SIZE = 10  # Process this many rooms per batch
DEFAULT_THUMBNAIL_SIZE = (512, 512)  # Thumbnail dimensions for visual embeddings

# Global state
_shutdown_requested = False
_last_processed_times: Dict[str, datetime] = {}  # room_id -> last embedding time


class CanvasRenderer:
    """
    Renders canvas strokes into a PIL Image for visual embedding generation.
    """
    
    @staticmethod
    def render_room_thumbnail(room_id: str, size: tuple = DEFAULT_THUMBNAIL_SIZE) -> Optional[bytes]:
        """
        Retrieve stored canvas thumbnail from MongoDB.
        
        Frontend uploads thumbnails via POST /api/rooms/<id>/thumbnail using canvas.toDataURL().
        This method retrieves the stored thumbnail bytes for embedding generation.
        
        Args:
            room_id: Room ID to get thumbnail for
            size: Unused (kept for API compatibility)
        
        Returns:
            PNG/JPEG image bytes, or None if no thumbnail available
        """
        try:
            room = rooms_coll.find_one(
                {'_id': ObjectId(room_id)}, 
                {'thumbnail': 1, 'thumbnailUpdatedAt': 1}
            )
            
            if not room:
                logger.debug(f"Room {room_id} not found")
                return None
            
            if 'thumbnail' not in room:
                logger.debug(f"No thumbnail stored for room {room_id}")
                return None
            
            thumbnail_bytes = room['thumbnail']
            
            # Validate it's actually binary image data
            if not isinstance(thumbnail_bytes, bytes):
                logger.warning(f"Invalid thumbnail type for room {room_id}: {type(thumbnail_bytes)}")
                return None
            
            if len(thumbnail_bytes) < 100:
                logger.warning(f"Thumbnail too small for room {room_id}: {len(thumbnail_bytes)} bytes")
                return None
            
            # Log when thumbnail was last updated (for debugging staleness)
            updated_at = room.get('thumbnailUpdatedAt')
            if updated_at:
                logger.debug(f"Retrieved thumbnail for room {room_id}: {len(thumbnail_bytes)} bytes "
                           f"(updated {updated_at})")
            else:
                logger.debug(f"Retrieved thumbnail for room {room_id}: {len(thumbnail_bytes)} bytes")
            
            return thumbnail_bytes
            
        except Exception as e:
            logger.exception(f"Failed to retrieve thumbnail for room {room_id}: {e}")
            return None


class EmbeddingWorker:
    """Background worker for incremental embedding updates."""
    
    def __init__(self, 
                 update_interval: int = DEFAULT_UPDATE_INTERVAL,
                 debounce_period: int = DEFAULT_DEBOUNCE_PERIOD,
                 batch_size: int = DEFAULT_BATCH_SIZE):
        """
        Initialize the embedding worker.
        
        Args:
            update_interval: How often (seconds) to check for room updates
            debounce_period: Minimum time (seconds) since room update before embedding
            batch_size: Maximum rooms to process per iteration
        """
        self.update_interval = update_interval
        self.debounce_period = debounce_period
        self.batch_size = batch_size
        self.renderer = CanvasRenderer()
        
        # Track which rooms we've already processed
        self.processed_rooms: Set[str] = set()
        
        logger.info(f"Initialized EmbeddingWorker: update_interval={update_interval}s, "
                   f"debounce_period={debounce_period}s, batch_size={batch_size}")
    
    def should_process_room(self, room: Dict) -> bool:
        """
        Determine if a room should have its embedding updated.
        
        Conditions for processing:
        1. Room was created/updated recently
        2. Sufficient time has passed since last update (debouncing)
        3. Room doesn't already have current embedding
        4. Room is not archived
        """
        room_id = str(room['_id'])
        
        # Skip archived rooms
        if room.get('archived'):
            return False
        
        # Check when room was last updated
        updated_at = room.get('updatedAt') or room.get('createdAt')
        if not updated_at:
            return False
        
        # Debounce: Don't embed if room was updated very recently
        # (might still be actively being edited)
        time_since_update = datetime.utcnow() - updated_at
        if time_since_update.total_seconds() < self.debounce_period:
            logger.debug(f"Room {room_id} updated {time_since_update.total_seconds()}s ago, "
                        f"waiting for debounce period ({self.debounce_period}s)")
            return False
        
        # Check if we've already processed this room recently
        last_processed = _last_processed_times.get(room_id)
        if last_processed:
            # Only re-process if room was updated after our last embedding
            if updated_at <= last_processed:
                return False
        
        return True
    
    def find_rooms_to_update(self) -> List[Dict]:
        """
        Find rooms that need embedding updates.
        
        Strategy:
        1. Query rooms updated in the last (update_interval + debounce_period)
        2. Filter to those that meet processing criteria
        3. Limit to batch_size
        """
        try:
            # Look for rooms updated since our last check (with some overlap)
            lookback_window = self.update_interval + self.debounce_period
            cutoff_time = datetime.utcnow() - timedelta(seconds=lookback_window)
            
            # Query rooms that have been updated but not too recently
            query = {
                'archived': {'$ne': True},
                'updatedAt': {'$gte': cutoff_time}
            }
            
            rooms = list(rooms_coll.find(query).sort('updatedAt', 1).limit(self.batch_size * 2))
            
            # Filter using our processing logic
            to_process = [room for room in rooms if self.should_process_room(room)]
            
            # Limit batch size
            to_process = to_process[:self.batch_size]
            
            logger.info(f"Found {len(to_process)} rooms to process (from {len(rooms)} candidates)")
            return to_process
            
        except Exception as e:
            logger.exception(f"Failed to find rooms to update: {e}")
            return []
    
    def generate_embedding_for_room(self, room: Dict) -> bool:
        """
        Generate and store embedding for a single room.
        
        Process:
        1. Extract text metadata (name, description)
        2. Attempt to render canvas thumbnail
        3. Generate text embedding (always)
        4. Generate image embedding (if thumbnail available)
        5. Combine embeddings if both available
        6. Store in Qdrant
        
        Args:
            room: Room document from MongoDB
            
        Returns:
            True if embedding was successfully generated and stored
        """
        room_id = str(room['_id'])
        room_name = room.get('name', '')
        room_desc = room.get('description', '')
        room_type = room.get('type', 'public')
        room_owner = room.get('ownerName', '')
        
        try:
            logger.info(f"Processing room '{room_name}' (id={room_id})")
            
            # 1. Generate text embedding (from name + description)
            text = f"{room_name}. {room_desc}" if room_desc else room_name
            text_embedding = None
            
            if text.strip():
                text_embedding = embed_text([text])
                logger.debug(f"  Generated text embedding: shape={text_embedding.shape}")
            
            # 2. Attempt to render canvas thumbnail
            thumbnail_bytes = self.renderer.render_room_thumbnail(room_id)
            image_embedding = None
            
            if thumbnail_bytes:
                # Save thumbnail temporarily and generate embedding
                import tempfile
                with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
                    tmp.write(thumbnail_bytes)
                    tmp_path = tmp.name
                
                try:
                    image_embedding = embed_image(tmp_path)
                    logger.debug(f"  Generated image embedding: shape={image_embedding.shape}")
                finally:
                    os.unlink(tmp_path)
            else:
                logger.debug(f"  No thumbnail available, using text-only embedding")
            
            # 3. Combine embeddings if we have both
            if text_embedding is not None and image_embedding is not None:
                # Hybrid embedding: weighted combination
                # Flatten to 1D
                text_vec = np.asarray(text_embedding).reshape(-1).astype(np.float32)
                img_vec = np.asarray(image_embedding).reshape(-1).astype(np.float32)
                
                # L2-normalize
                # text_norm = np.linalg.norm(text_vec)
                # img_norm = np.linalg.norm(img_vec)
                # if text_norm > 0:
                #     text_vec = text_vec / text_norm
                # if img_norm > 0:
                #     img_vec = img_vec / img_norm
                
                # Weighted combination (image-heavy since visual search is primary)
                weight_text = 0.4
                weight_image = 0.6
                combined = weight_text * text_vec + weight_image * img_vec
                
                # Re-normalize
                comb_norm = np.linalg.norm(combined)
                if comb_norm > 0:
                    combined = combined / comb_norm
                
                final_embedding = combined.reshape(1, -1)
                logger.info(f"  Combined text+image embedding (weights: {weight_text}/{weight_image})")
                
            elif text_embedding is not None:
                final_embedding = text_embedding
                logger.info(f"  Using text-only embedding")
                
            elif image_embedding is not None:
                final_embedding = image_embedding
                logger.info(f"  Using image-only embedding")
                
            else:
                logger.warning(f"  No embedding could be generated for room {room_id}")
                return False
            
            # 4. Store in Qdrant
            success = store_canvas_embedding(
                room_id=room_id,
                embedding=final_embedding,
                metadata={
                    'name': room_name,
                    'description': room_desc,
                    'type': room_type,
                    'ownerName': room_owner,
                    'updated_at': room.get('updatedAt', datetime.utcnow()).isoformat(),
                    'has_visual': thumbnail_bytes is not None
                }
            )
            
            if success:
                logger.info(f"Successfully stored embedding for '{room_name}'")
                _last_processed_times[room_id] = datetime.utcnow()
                return True
            else:
                logger.error(f"Failed to store embedding for '{room_name}'")
                return False
                
        except Exception as e:
            logger.exception(f"Failed to generate embedding for room {room_id}: {e}")
            return False
    
    def run_iteration(self) -> Dict:
        """
        Run one iteration of the worker loop.
        """
        start_time = time.time()
        
        # Find rooms that need updates
        rooms_to_process = self.find_rooms_to_update()
        
        if not rooms_to_process:
            logger.debug("No rooms to process in this iteration")
            return {
                'processed': 0,
                'success': 0,
                'failed': 0,
                'duration_seconds': time.time() - start_time
            }
        
        # Process each room
        success_count = 0
        failed_count = 0
        
        for room in rooms_to_process:
            if _shutdown_requested:
                logger.info("Shutdown requested, stopping iteration")
                break
            
            try:
                if self.generate_embedding_for_room(room):
                    success_count += 1
                else:
                    failed_count += 1
            except Exception as e:
                logger.exception(f"Error processing room {room.get('_id')}: {e}")
                failed_count += 1
        
        duration = time.time() - start_time
        
        stats = {
            'processed': len(rooms_to_process),
            'success': success_count,
            'failed': failed_count,
            'duration_seconds': duration
        }
        
        logger.info(f"Iteration complete: {stats}")
        return stats
    
    def run(self):
        """
        Main worker loop. Runs indefinitely until shutdown.
        """
        logger.info("Embedding worker started")
        logger.info(f"Configuration: update_interval={self.update_interval}s, "
                   f"debounce={self.debounce_period}s, batch_size={self.batch_size}")
        
        # Print initial Qdrant stats
        try:
            stats = get_collection_stats()
            logger.info(f"Qdrant collection: {stats.get('collection_name')}, "
                       f"points: {stats.get('points_count')}")
        except Exception as e:
            logger.warning(f"Could not fetch Qdrant stats: {e}")
        
        iteration = 0
        
        while not _shutdown_requested:
            iteration += 1
            logger.info(f"--- Iteration {iteration} ---")
            
            try:
                stats = self.run_iteration()
                
                # Log summary
                if stats['processed'] > 0:
                    logger.info(f"Processed {stats['processed']} rooms "
                              f"({stats['success']} success, {stats['failed']} failed) "
                              f"in {stats['duration_seconds']:.1f}s")
                
            except Exception as e:
                logger.exception(f"Error in worker iteration: {e}")
            
            # Sleep until next iteration
            if not _shutdown_requested:
                logger.debug(f"Sleeping for {self.update_interval}s")
                for _ in range(self.update_interval):
                    if _shutdown_requested:
                        break
                    time.sleep(1)
        
        logger.info("Embedding worker shutting down gracefully")


def signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    global _shutdown_requested
    logger.info(f"Received signal {signum}, initiating shutdown...")
    _shutdown_requested = True


def main():
    """Main entry point for the embedding worker."""
    parser = argparse.ArgumentParser(
        description='Background worker for incremental canvas embedding generation'
    )
    parser.add_argument(
        '--interval',
        type=int,
        default=DEFAULT_UPDATE_INTERVAL,
        help=f'Update check interval in seconds (default: {DEFAULT_UPDATE_INTERVAL})'
    )
    parser.add_argument(
        '--debounce',
        type=int,
        default=DEFAULT_DEBOUNCE_PERIOD,
        help=f'Debounce period in seconds (default: {DEFAULT_DEBOUNCE_PERIOD})'
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f'Maximum rooms per batch (default: {DEFAULT_BATCH_SIZE})'
    )
    parser.add_argument(
        '--once',
        action='store_true',
        help='Run once and exit (for testing)'
    )
    
    args = parser.parse_args()
    
    # Set up signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Create and run worker
    worker = EmbeddingWorker(
        update_interval=args.interval,
        debounce_period=args.debounce,
        batch_size=args.batch_size
    )
    
    if args.once:
        logger.info("Running in single-iteration mode")
        stats = worker.run_iteration()
        logger.info(f"Single iteration complete: {stats}")
    else:
        worker.run()
    
    logger.info("Embedding worker exited")


if __name__ == '__main__':
    main()
