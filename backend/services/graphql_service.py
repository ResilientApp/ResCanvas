
import json
import requests
import logging
import time
import urllib3
from config import *
from .db import strokes_coll

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

logger = logging.getLogger(__name__)

def commit_transaction_via_graphql(payload: dict) -> str:
    mutation = """
    mutation PostTransaction($data: PrepareAsset!) {
      postTransaction(data: $data) { id }
    }

    def persist_undo_state(self, stroke_obj: dict, undone: bool, ts: int, marker_id: str = None):
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
        return self.persist_undo_state(
            stroke_obj=redo_data,
            undone=False,            ts=redo_data.get('timestamp', int(time.time() * 1000)),
            marker_id=redo_data.get('id')
        )

    def get_undo_markers(self, room_id: str = None, user_id: str = None):
        try:
            query = {}

            if room_id:
                query["$or"] = [
                    {"transactions.value.asset.data.roomId": room_id},
                    {"transactions.value.asset.data.value": {"$regex": f'"roomId":\\s*"{room_id}"'}}
                ]

            docs = strokes_coll.find(query)
            markers = []

            for doc in docs:
                for tx in doc.get('transactions', []):
                    tx_value = tx.get('value', {})
                    if isinstance(tx_value, str):
                        try:
                            tx_value = json.loads(tx_value)
                        except:
                            continue

                    asset_data = tx_value.get('asset', {}).get('data', {})
                    marker_id = asset_data.get('id')

                    if marker_id and (marker_id.startswith('undo-') or marker_id.startswith('redo-')):
                        marker_info = {
                            'id': marker_id,
                            'undone': asset_data.get('undone'),
                            'ts': asset_data.get('ts'),
                            'value': asset_data.get('value')
                        }
                        markers.append(marker_info)
                        logger.debug(f"Found marker: {marker_id} (undone: {asset_data.get('undone')})")

            logger.debug(f"Retrieved {len(markers)} undo/redo markers from MongoDB")
            return markers

        except Exception:
            logger.exception("Failed to retrieve undo markers from MongoDB")
            return []