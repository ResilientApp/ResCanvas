"""
Vector search service using Qdrant for semantic canvas search.

This service manages storage and retrieval of canvas embeddings in Qdrant,
enabling semantic similarity search across canvases.
"""
import logging
import numpy as np
from typing import List, Dict, Any, Optional
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
from qdrant_client.http.exceptions import UnexpectedResponse
from config import QDRANT_HOST, QDRANT_PORT, QDRANT_COLLECTION_NAME, EMBEDDING_DIMENSION

logger = logging.getLogger(__name__)

# Global Qdrant client 
_qdrant_client: Optional[QdrantClient] = None


def get_qdrant_client() -> QdrantClient:
    # Get Qdrant client 
    global _qdrant_client

    # If client not initialized, create it
    if _qdrant_client is None:
        try:
            _qdrant_client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)
            logger.info(f"Connected to Qdrant at {QDRANT_HOST}:{QDRANT_PORT}")
            _ensure_collection_exists()
        except Exception as e:
            logger.error(f"Failed to connect to Qdrant: {e}")
            raise
    return _qdrant_client


def _ensure_collection_exists():
    # Create collection if it doesn't exist.
    client = _qdrant_client
    try:
        # Check if collection exists (should be a single collection name)
        collections = client.get_collections().collections
        collection_names = [c.name for c in collections]
        
        # If it doesnt exist create Qdrant collection
        if QDRANT_COLLECTION_NAME not in collection_names:
            logger.info(f"Creating Qdrant collection: {QDRANT_COLLECTION_NAME}")
            client.create_collection(
                collection_name=QDRANT_COLLECTION_NAME,
                vectors_config=VectorParams(
                    size=EMBEDDING_DIMENSION, # e.g., 512
                    distance=Distance.COSINE  # Cosine similarity for normalized embeddings
                )
            )
            logger.info(f"Collection {QDRANT_COLLECTION_NAME} created successfully")
        else:
            logger.debug(f"Collection {QDRANT_COLLECTION_NAME} already exists")
    except Exception as e:
        logger.error(f"Error ensuring collection exists: {e}")
        raise


def store_canvas_embedding(
    room_id: str,
    embedding: np.ndarray,
    metadata: Optional[Dict[str, Any]] = None
) -> bool:
    # Store or update a canvas embedding in Qdrant.x
    try:
        # Get Qdrant client
        client = get_qdrant_client()
        
        # Ensure embedding is a numpy array
        if not isinstance(embedding, np.ndarray):
            embedding = np.array(embedding, dtype=np.float32)
        
        # Ensure embedding is the right shape and type
        if embedding.ndim == 2:
            embedding = embedding.flatten()
        
        if len(embedding) != EMBEDDING_DIMENSION:
            logger.error(f"Embedding dimension mismatch: expected {EMBEDDING_DIMENSION}, got {len(embedding)}")
            return False
        
        # Prepare payload with metadata
        payload = metadata or {}
        payload['room_id'] = room_id
        
        # Use hashlib for consistent point IDs across worker restarts
        import hashlib
        point_id = int(hashlib.md5(room_id.encode()).hexdigest()[:15], 16)
        
        # Update the room (will update if exists, insert if new)
        client.upsert(
            collection_name=QDRANT_COLLECTION_NAME,
            points=[
                PointStruct(
                    id=point_id,
                    vector=embedding.tolist(), # Convert to list for Qdrant
                    payload=payload
                )
            ]
        )
        
        logger.info(f"Stored embedding for room_id={room_id}")
        return True
        
    except Exception as e:
        logger.exception(f"Failed to store embedding for room_id={room_id}: {e}")
        return False


def search_by_embedding(
    query_embedding: np.ndarray,
    top_k: int = 50,
    filters: Optional[Dict[str, Any]] = None,
    score_threshold: float = 0.0
) -> List[Dict[str, Any]]:
    # Search for similar canvases using vector similarity.
    try:
        # Get Qdrant client
        client = get_qdrant_client()
        
        # Ensure embedding is the right shape
        if query_embedding.ndim == 2:
            query_embedding = query_embedding.flatten()
        
        if len(query_embedding) != EMBEDDING_DIMENSION:
            logger.error(f"Query embedding dimension mismatch: expected {EMBEDDING_DIMENSION}, got {len(query_embedding)}")
            return []
        
        # Build Qdrant filter if provided
        qdrant_filter = None
        if filters:
            conditions = []
            for key, value in filters.items():
                conditions.append(
                    FieldCondition(key=key, match=MatchValue(value=value))
                )
            if conditions:
                qdrant_filter = Filter(must=conditions)
        
        # Perform vector search
        search_result = client.search(
            collection_name=QDRANT_COLLECTION_NAME,
            query_vector=query_embedding.tolist(), # Convert to list for Qdrant
            limit=top_k,
            query_filter=qdrant_filter,
            score_threshold=score_threshold
        )
        
        # Format results
        results = []
        for hit in search_result:
            result = {
                'room_id': hit.payload.get('room_id'),
                'score': float(hit.score),
                **hit.payload  # Include all metadata
            }
            results.append(result)
        
        logger.info(f"Vector search returned {len(results)} results (top_k={top_k})")
        return results
        
    except Exception as e:
        logger.exception(f"Vector search failed: {e}")
        return []


def update_canvas_embedding(
    room_id: str,
    new_embedding: np.ndarray,
    metadata: Optional[Dict[str, Any]] = None
) -> bool:
    # Update an existing canvas embedding.
    return store_canvas_embedding(room_id, new_embedding, metadata)


def delete_canvas_embedding(room_id: str) -> bool:
    # Delete a canvas embedding from Qdrant.
    try:
        # Get Qdrant client
        client = get_qdrant_client()

        import hashlib
        point_id = int(hashlib.md5(room_id.encode()).hexdigest()[:15], 16)

        # Delete the room
        client.delete(
            collection_name=QDRANT_COLLECTION_NAME,
            points_selector=[point_id]
        )
        
        logger.info(f"Deleted embedding for room_id={room_id}")
        return True
        
    except Exception as e:
        logger.exception(f"Failed to delete embedding for room_id={room_id}: {e}")
        return False


def batch_store_embeddings(embeddings: List[Dict[str, Any]]) -> int:
    # Store multiple embeddings in batch (more efficient).
    try:
        # Get Qdrant client
        client = get_qdrant_client()
        points = []
        
        for item in embeddings:
            room_id = item['room_id']
            embedding = item['embedding']
            metadata = item.get('metadata', {})
            
            # Prepare embedding
            if embedding.ndim == 2:
                embedding = embedding.flatten()
            
            if len(embedding) != EMBEDDING_DIMENSION:
                logger.warning(f"Skipping room_id={room_id} due to dimension mismatch")
                continue
            
            # Prepare payload
            payload = metadata.copy()
            payload['room_id'] = room_id
            
            #point_id = hash(room_id) & 0x7FFFFFFFFFFFFFFF
            # Use hashlib for consistent point IDs across worker restarts
            import hashlib
            point_id = int(hashlib.md5(room_id.encode()).hexdigest()[:15], 16)
            
            points.append(
                PointStruct(
                    id=point_id,
                    vector=embedding.tolist(),
                    payload=payload
                )
            )
        
        if points:
            client.upsert(
                collection_name=QDRANT_COLLECTION_NAME,
                points=points
            )
            logger.info(f"Batch stored {len(points)} embeddings")
            return len(points)
        
        return 0
        
    except Exception as e:
        logger.exception(f"Batch store failed: {e}")
        return 0


def get_collection_stats() -> Dict[str, Any]:
    # Get statistics about the vector collection.
    try:
        # Get Qdrant client
        client = get_qdrant_client()
        collection_info = client.get_collection(collection_name=QDRANT_COLLECTION_NAME)
        
        return {
            'collection_name': QDRANT_COLLECTION_NAME,
            'vectors_count': collection_info.vectors_count,
            'points_count': collection_info.points_count,
            'status': collection_info.status,
            'config': {
                'dimension': EMBEDDING_DIMENSION,
                'distance': 'COSINE'
            }
        }
    except Exception as e:
        logger.exception(f"Failed to get collection stats: {e}")
        return {'error': str(e)}
