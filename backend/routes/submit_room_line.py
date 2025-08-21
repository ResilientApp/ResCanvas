# routes/submit_room_line.py
from flask import Blueprint, request, jsonify
import json, time, traceback, logging
from services.graphql_service import commit_transaction_via_graphql
from services.db import redis_client, strokes_coll, rooms_coll, shares_coll
from services.crypto_service import unwrap_room_key, encrypt_for_room
import nacl.signing, nacl.encoding

logger = logging.getLogger(__name__)
submit_room_line_bp = Blueprint('submit_room_line', __name__)

@submit_room_line_bp.route('/submitNewLineRoom', methods=['POST'])
def submit_room_line():
    try:
        data = request.get_json(force=True)
        user = data.get('user') or request.headers.get('X-User') or 'anon'
        roomId = data.get('roomId')
        payload_value = data.get('value') or '{}'
        signature = data.get('signature')
        signerPubKey = data.get('signerPubKey')
        # fetch room metadata
        room = rooms_coll.find_one({'_id': __import__('bson').ObjectId(roomId)}) if roomId else None
        room_type = room.get('type') if room else 'public'
        # if secure room, verify signature
        parsed = json.loads(payload_value)
        if room_type == 'secure':
            if not (signature and signerPubKey):
                return jsonify({'status':'error','message':'signature required for secure room'}), 400
            try:
                vk = nacl.signing.VerifyKey(signerPubKey, encoder=nacl.encoding.HexEncoder)
                # canonical message used for signing should match client
                msg = json.dumps({
                    'roomId': roomId, 'user': user, 'color': parsed.get('color'), 'lineWidth': parsed.get('lineWidth'),
                    'pathData': parsed.get('pathData'), 'timestamp': parsed.get('timestamp', parsed.get('ts'))
                }, separators=(',', ':'), sort_keys=True).encode()
                vk.verify(msg, bytes.fromhex(signature))
            except Exception as e:
                logger.exception('signature verification failed')
                return jsonify({'status':'error','message':'bad signature'}), 400
        # if private or secure, encrypt the payload for storage
        asset_data = None
        if room and room_type in ('private','secure'):
            rk = unwrap_room_key(room['wrappedKey'])
            enc = encrypt_for_room(rk, payload_value.encode())
            asset_data = {'roomId': roomId, 'type': room_type, 'encrypted': enc}
            # store quick cache in strokes_coll for server-side retrieval
            strokes_coll.insert_one({'roomId': roomId, 'ts': int(time.time()*1000), 'blob': enc})
        else:
            asset_data = {'roomId': roomId, 'type': 'public', 'stroke': json.loads(payload_value)}
            strokes_coll.insert_one({'roomId': roomId, 'ts': int(time.time()*1000), 'stroke': json.loads(payload_value)})
        # commit to resilientdb graph via existing service (server signer keys used in config)
        prep = {
            'operation': 'CREATE',
            'amount': 1,
            'signerPublicKey': __import__('config').SIGNER_PUBLIC_KEY,
            'signerPrivateKey': __import__('config').SIGNER_PRIVATE_KEY,
            'recipientPublicKey': __import__('config').RECIPIENT_PUBLIC_KEY,
            'asset': {'data': asset_data}
        }
        commit_transaction_via_graphql(prep)
        # update undo/redo stacks namespaced by room
        key_base = f"{roomId}:{user}"
        redis_client.lpush(f"{key_base}:undo", payload_value)
        redis_client.delete(f"{key_base}:redo")
        return jsonify({'status':'ok'})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'status':'error','message':'internal','details': str(e)}), 500
