# routes/submit_room_line.py
from flask import Blueprint, request, jsonify
import json, time, traceback, logging
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
        payload_value = data.get('value') or '{}'
        signature = data.get('signature')
        signerPubKey = data.get('signerPubKey')

        if not roomId:
            return jsonify({'status':'error','message':'roomId required'}), 400

        # Fetch room metadata
        room = rooms_coll.find_one({'_id': __import__('bson').ObjectId(roomId)})
        if not room:
            return jsonify({'status':'error','message':'room not found'}), 404
        room_type = room.get('type', 'public')

        # Parse payload, force roomId presence in payload JSON
        parsed = json.loads(payload_value)
        parsed['roomId'] = roomId
        parsed['user'] = parsed.get('user') or user
        # ensure timestamp
        parsed['timestamp'] = int(parsed.get('timestamp') or parsed.get('ts') or time.time()*1000)

        # Secure room: verify signature over a canonical message
        if room_type == 'secure':
            if not (signature and signerPubKey):
                return jsonify({'status':'error','message':'signature required for secure room'}), 400
            try:
                vk = nacl.signing.VerifyKey(signerPubKey, encoder=nacl.encoding.HexEncoder)
                msg = json.dumps({
                    'roomId': roomId,
                    'user': parsed['user'],
                    'color': parsed.get('color'),
                    'lineWidth': parsed.get('lineWidth'),
                    'pathData': parsed.get('pathData'),
                    'timestamp': parsed['timestamp']
                }, separators=(',', ':'), sort_keys=True).encode()
                vk.verify(msg, bytes.fromhex(signature))
            except Exception:
                logger.exception('signature verification failed')
                return jsonify({'status':'error','message':'bad signature'}), 400

        # === Assign canonical canvas id and create Redis cache entry (authoritative) ===
        # This mirrors routes/new_line.py so get_canvas_data can see room strokes immediately.
        draw_count = get_canvas_draw_count()
        stroke_id = f"res-canvas-draw-{draw_count}"
        parsed['id'] = stroke_id  # keep inside payload too for downstream tools
        # remove any stray undone marker coming from client
        parsed.pop('undone', None)

        # Prepare cache entry (standard shape + roomId metadata)
        cache_entry = {
            "id": stroke_id,
            "user": user,
            "ts": parsed['timestamp'],
            "deletion_date_flag": "",
            "value": json.dumps(parsed),
            "roomId": roomId,
        }
        redis_client.set(stroke_id, json.dumps(cache_entry))
        increment_canvas_draw_count()

        # === Persist for history/backfill ===
        # For private/secure, store encrypted blob in Mongo; for public store plaintext
        if room_type in ('private', 'secure'):
            rk = unwrap_room_key(room['wrappedKey'])
            enc = encrypt_for_room(rk, json.dumps(parsed).encode())
            asset_data = {'roomId': roomId, 'type': room_type, 'encrypted': enc}
            strokes_coll.insert_one({'roomId': roomId, 'ts': parsed['timestamp'], 'blob': enc, 'type': room_type})
        else:
            asset_data = {'roomId': roomId, 'type': 'public', 'stroke': parsed}
            strokes_coll.insert_one({'roomId': roomId, 'ts': parsed['timestamp'], 'stroke': parsed, 'type': 'public'})

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

        # === Room-scoped undo/redo stacks (list payloads as in /submitNewLine) ===
        key_base = f"{roomId}:{user}"
        redis_client.lpush(f"{key_base}:undo", json.dumps(parsed))
        redis_client.delete(f"{key_base}:redo")

        return jsonify({'status':'success','id': stroke_id}), 201
    except Exception as e:
        traceback.print_exc()
        return jsonify({'status':'error','message': str(e)}), 500
