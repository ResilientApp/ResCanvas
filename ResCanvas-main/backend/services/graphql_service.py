# services/graphql_service.py

import json
import requests
import logging
import time
from config import *
from .db import strokes_coll

logger = logging.getLogger(__name__)

def commit_transaction_via_graphql(payload: dict) -> str:
    mutation = """
    mutation PostTransaction($data: PrepareAsset!) {
      postTransaction(data: $data) { id }
    }
    """
    body = {
        "query": mutation,
        "variables": {"data": payload},
        "operationName": "PostTransaction"
    }

    resp = requests.post(
        GRAPHQL_URL,
        json=body,
        headers={**HEADERS, "Content-Type": "application/json"}
    )

    # Parse JSON (or raise if it isn't JSON)
    try:
        result = resp.json()
    except ValueError:
        logger.error("GraphQL did not return JSON:", resp.text)
        resp.raise_for_status()
    
    logger.error(f"[GraphQL {resp.status_code}] response:")
    logger.error(json.dumps(result, indent=2))

    if result.get("errors"):
        errs = result["errors"]
        raise RuntimeError(f"GraphQL errors: {errs}")

    if resp.status_code // 100 != 2:
        raise RuntimeError(f"HTTP {resp.status_code} from GraphQL")

    return result["data"]["postTransaction"]["id"]


class GraphQLService:
    """Helper class for undo/redo persistent state management (legacy compatibility)."""
    
    def persist_undo_state(self, stroke_obj: dict, undone: bool, ts: int, marker_id: str = None):
        """Persist an undo/redo marker to GraphQL service for MongoDB mirroring."""
        try:
            asset_data = {
                "ts": ts,
                "value": json.dumps(stroke_obj, separators=(",", ":")),
                "undone": bool(undone)
            }
            if marker_id:
                asset_data["id"] = marker_id
            
            payload = {
                "operation": "CREATE",
                "amount": 1,
                "signerPublicKey": SIGNER_PUBLIC_KEY,
                "signerPrivateKey": SIGNER_PRIVATE_KEY,
                "recipientPublicKey": RECIPIENT_PUBLIC_KEY,
                "asset": {"data": asset_data}
            }
            return commit_transaction_via_graphql(payload)
        except Exception:
            logger.exception("GraphQL commit failed for undo/redo persist")
            return None
    
    def persist_redo_state(self, redo_data: dict):
        """Persist redo state for marker removal (legacy compatibility)."""
        # For redo, we're removing an undo marker, so persist the redo action
        return self.persist_undo_state(
            stroke_obj=redo_data,
            undone=False,  # redo means not undone
            ts=redo_data.get('timestamp', int(time.time() * 1000)),
            marker_id=redo_data.get('id')
        )
    
    def get_undo_markers(self, room_id: str = None, user_id: str = None):
        """Get all persistent undo markers from MongoDB mirror (legacy compatibility).
        
        This method now properly handles both undo and redo operations by:
        1. Collecting ALL markers for each stroke (both undone=True and undone=False)
        2. Finding the most recent marker for each stroke by timestamp
        3. Only considering a stroke "undone" if its most recent marker has undone=True
        """
        try:
            # The GraphQL transactions end up in MongoDB mirrored from ResDB
            # Look for transactions with undo markers in the asset data
            query = {}
            
            if room_id:
                # If room-specific, look for transactions related to this room
                query["$or"] = [
                    {"transactions.value.asset.data.roomId": room_id},
                    {"transactions.value.asset.data.value": {"$regex": f'"roomId":\\s*"{room_id}"'}}
                ]
            
            docs = strokes_coll.find(query)
            all_markers = {}  # stroke_id -> list of markers
            
            for doc in docs:
                for tx in doc.get('transactions', []):
                    tx_value = tx.get('value', {})
                    # Handle case where value might be a string (JSON serialized)
                    if isinstance(tx_value, str):
                        try:
                            tx_value = json.loads(tx_value)
                        except:
                            continue
                    
                    asset_data = tx_value.get('asset', {}).get('data', {})
                    marker_id = asset_data.get('id')
                    
                    # Collect ALL undo markers (both undone=True and undone=False)
                    if marker_id and marker_id.startswith('undo-'):
                        stroke_id = marker_id[5:]  # Remove 'undo-' prefix
                        marker_info = {
                            'id': marker_id,
                            'stroke_id': stroke_id,
                            'undone': bool(asset_data.get('undone', False)),
                            'ts': asset_data.get('ts', 0),
                            'value': asset_data.get('value')
                        }
                        
                        if stroke_id not in all_markers:
                            all_markers[stroke_id] = []
                        all_markers[stroke_id].append(marker_info)
                        
                        logger.debug(f"Found marker: {marker_id}, undone={marker_info['undone']}, ts={marker_info['ts']}")
            
            # Now determine the final undo state for each stroke
            final_undo_markers = []
            for stroke_id, markers in all_markers.items():
                # Sort markers by timestamp to find the most recent
                markers.sort(key=lambda x: x['ts'])
                most_recent_marker = markers[-1]  # Last (most recent) marker
                
                logger.debug(f"Stroke {stroke_id}: {len(markers)} markers, most recent undone={most_recent_marker['undone']}")
                
                # Only include strokes that are currently in "undone" state
                if most_recent_marker['undone']:
                    final_undo_markers.append(most_recent_marker)
                    logger.debug(f"Stroke {stroke_id} is marked as undone (most recent marker)")
                else:
                    logger.debug(f"Stroke {stroke_id} is NOT undone (most recent marker shows redone)")
            
            logger.debug(f"Retrieved {len(final_undo_markers)} effective undo markers from MongoDB (out of {len(all_markers)} total strokes with markers)")
            return final_undo_markers
            
        except Exception:
            logger.exception("Failed to retrieve undo markers from MongoDB")
            return []