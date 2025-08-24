# routes/submit_room_line.py
from flask import Blueprint, request, jsonify
import json, time, traceback, logging
from bson import ObjectId
from services.graphql_service import commit_transaction_via_graphql
from services.db import redis_client, strokes_coll, rooms_coll, shares_coll
from services.canvas_counter import get_canvas_draw_count, increment_canvas_draw_count
from services.crypto_service import unwrap_room_key, encrypt_for_room
import nacl.signing, nacl.encoding
from config import SIGNER_PUBLIC_KEY, SIGNER_PRIVATE_KEY, RECIPIENT_PUBLIC_KEY

logger = logging.getLogger(__name__)
submit_room_line_bp = Blueprint('submit_room_line', __name__)

@submit_room_line_bp.route('/submitNewLineRoom', methods=['POST'])
def submit_room_line():
    try:
        data = request.get_json(force=True) or {}
        user = data.get('user') or request.headers.get('X-User') or 'anon'
        roomId = data.get('roomId')
        payload_value = data.get('value')
        signature = data.get('signature')
        signerPubKey = data.get('signerPubKey')

        if not roomId:
            return jsonify({'status': 'error', 'message': 'roomId required'}), 400

        # Fetch room metadata
        room = rooms_coll.find_one({'_id': ObjectId(roomId)})
        if not room:
            return jsonify({'status': 'error', 'message': 'room not found'}), 404
        room_type = room.get('type', 'public')

        drawing = payload_value
        # 1) bytes -> str
        if isinstance(drawing, (bytes, bytearray)):
            try:
                drawing = drawing.decode('utf-8')
            except Exception:
                drawing = ''
        # 2) str -> dict (if JSON)
        if isinstance(drawing, str):
            try:
                drawing = json.loads(drawing)
            except Exception:
                drawing = {"raw": drawing}
        # 3) Repair case: client accidentally sent a whole cache wrapper as "value"
        #    e.g. {"id": "...", "user": "...", "ts": 123, "value": "{...stroke...}", "roomId": "..."}
        if isinstance(drawing, dict) and 'value' in drawing and isinstance(drawing['value'], (str, bytes)):
            inner = drawing['value']
            try:
                if isinstance(inner, (bytes, bytearray)):
                    inner = inner.decode('utf-8')
                possible_stroke = json.loads(inner)
                # Prefer the inner stroke if it looks like a stroke (has pathData/drawingId)
                if isinstance(possible_stroke, dict) and ('pathData' in possible_stroke or 'drawingId' in possible_stroke):
                    drawing = possible_stroke
            except Exception:
                pass

        if not isinstance(drawing, dict):
            drawing = {}

        # Force roomId + user + canonical timestamp in the stroke
        drawing['roomId'] = roomId
        if not drawing.get('user'):
            drawing['user'] = user
        ts = drawing.get('timestamp') or drawing.get('ts') or int(time.time() * 1000)
        drawing['timestamp'] = int(ts)

        # Secure room: verify signature over canonical message
        if room_type == 'secure':
            if not (signature and signerPubKey):
                return jsonify({'status': 'error', 'message': 'signature required for secure room'}), 400
            try:
                vk = nacl.signing.VerifyKey(signerPubKey, encoder=nacl.encoding.HexEncoder)
                msg = json.dumps({
                    'roomId': roomId,
                    'user': drawing['user'],
                    'color': drawing.get('color'),
                    'lineWidth': drawing.get('lineWidth'),
                    'pathData': drawing.get('pathData'),
                    'timestamp': drawing['timestamp']
                }, separators=(',', ':'), sort_keys=True).encode()
                vk.verify(msg, bytes.fromhex(signature))
            except Exception:
                logger.exception('signature verification failed')
                return jsonify({'status': 'error', 'message': 'bad signature'}), 400

        draw_count = get_canvas_draw_count()
        stroke_id = f"res-canvas-draw-{draw_count}"
        drawing['id'] = drawing.get('id') or stroke_id
        drawing.pop('undone', None)  # ensure no stray 'undone' flag travels inside the stroke

        cache_entry = {
            "id": stroke_id,
            "user": user,
            "ts": drawing['timestamp'],
            "deletion_date_flag": "",
            "undone": False,
            "value": json.dumps(drawing, ensure_ascii=False),
            "roomId": roomId,
        }
        redis_client.set(stroke_id, json.dumps(cache_entry))
        increment_canvas_draw_count()

        try:
            if isinstance(drawing, dict) and drawing.get("cut") and drawing.get("originalStrokeIds"):
                redis_client.sadd("cut-stroke-ids", *drawing.get("originalStrokeIds", []))
        except Exception as _e:
            logger.warning(f"submit_room_line: failed to update cut-stroke-ids: {_e}")


        if room_type in ('private', 'secure'):
            rk = unwrap_room_key(room['wrappedKey'])
            enc = encrypt_for_room(rk, json.dumps(drawing).encode())

            strokes_coll.insert_one({
                'roomId': roomId,
                'ts': drawing['timestamp'],
                'blob': enc,
                'type': room_type
            })

            asset_data = {
                'roomId': roomId,
                'type': room_type,
                'id': drawing.get('id'),
                'ts': drawing.get('timestamp'),
                'user': drawing.get('user'),
                'encrypted': enc
            }

        else:
            # Public rooms: store plaintext for easy recovery with identical shape to non-room commits
            strokes_coll.insert_one({
                'roomId': roomId,
                'ts': drawing['timestamp'],
                'stroke': drawing,
                'type': 'public'
            })

            asset_data = {
                'roomId': roomId,
                'type': 'public',
                'id': drawing.get('id'),
                'ts': drawing.get('timestamp'),
                'user': drawing.get('user'),
                'value': json.dumps(drawing)
            }


        # Commit to ResilientDB (GraphQL)
        prep = {
            'operation': 'CREATE',
            'amount': 1,
            'signerPublicKey': SIGNER_PUBLIC_KEY,
            'signerPrivateKey': SIGNER_PRIVATE_KEY,
            'recipientPublicKey': RECIPIENT_PUBLIC_KEY,
            'asset': {'data': asset_data}
        }
        commit_transaction_via_graphql(prep)

        # === Room-scoped undo/redo stacks ===
        key_base = f"{roomId}:{user}"
        redis_client.lpush(f"{key_base}:undo", json.dumps(drawing))
        redis_client.delete(f"{key_base}:redo")

        return jsonify({'status': 'success', 'id': stroke_id}), 201

    except Exception as e:
        logger.exception('submitNewLineRoom failed')
        return jsonify({'status': 'error', 'message': str(e)}), 500
