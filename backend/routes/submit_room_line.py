# routes/submit_room_line.py
from flask import Blueprint, request, jsonify
import json, time, traceback, logging
from bson import ObjectId
from services.graphql_service import commit_transaction_via_graphql
from services.db import redis_client, strokes_coll, rooms_coll, shares_coll
from services.canvas_counter import get_canvas_draw_count, increment_canvas_draw_count
from services.crypto_service import unwrap_room_key, encrypt_for_room, wrap_room_key
import nacl.signing, nacl.encoding
from config import SIGNER_PUBLIC_KEY, SIGNER_PRIVATE_KEY, RECIPIENT_PUBLIC_KEY

logger = logging.getLogger(__name__)
submit_room_line_bp = Blueprint('submit_room_line', __name__)

def _user_can_write(room, user_id: str, username: str) -> bool:
    if room['type'] == 'public':
        return True
    if room['ownerId'] == user_id:
        return True
    share = shares_coll.find_one({'roomId': str(room['_id']), 'userId': user_id})
    return bool(share and share.get('role') in ('editor','owner'))

@submit_room_line_bp.route('/submitNewLineRoom', methods=['POST'])
def submit_room_line():
    try:
        payload = request.get_json(force=True)
        if not payload:
            return jsonify({'status':'error','message':'Missing JSON body'}), 400

        roomId = payload.get('roomId') or request.args.get('roomId')
        if not roomId:
            return jsonify({'status':'error','message':'roomId required'}), 400

        room = rooms_coll.find_one({'_id': ObjectId(roomId)})
        if not room:
            return jsonify({'status':'error','message':'Room not found'}), 404

        user = payload.get('user') or payload.get('username') or 'anon'
        user_id = payload.get('userId') or payload.get('uid') or 'anon'
        ts = int(payload.get('ts') or payload.get('timestamp') or int(time.time()*1000))

        # Optional wallet verification
        sig = payload.get('walletSignature')
        spk = payload.get('walletPubKey')
        if room['type'] == 'secure':
            if not _user_can_write(room, user_id, user):
                return jsonify({'status':'error','message':'Forbidden'}), 403
            if sig and spk:
                try:
                    vk = nacl.signing.VerifyKey(spk, encoder=nacl.encoding.HexEncoder)
                    msg = json.dumps({
                        'roomId': roomId, 'user': user, 'ts': ts,
                        'color': payload.get('color'), 'lineWidth': payload.get('lineWidth'),
                        'pathData': payload.get('pathData')
                    }, separators=(',', ':'), sort_keys=True).encode()
                    vk.verify(msg, bytes.fromhex(sig))
                except Exception:
                    return jsonify({'status':'error','message':'Bad signature'}), 400

        # Prepare stroke record
        stroke_id = payload.get('id') or f"{roomId}:{ts}:{user}"
        drawing = {
            'id': stroke_id,
            'roomId': roomId,
            'user': user,
            'ts': ts,
            'color': payload.get('color'),
            'lineWidth': payload.get('lineWidth'),
            'pathData': payload.get('pathData'),
            'undone': bool(payload.get('undone', False))
        }

        # Ensure room has a wrappedKey (migrate legacy rooms on write)
        if room['type'] in ('private','secure'):
            if not room.get('wrappedKey'):
                import os
                raw = os.urandom(32)
                wrapped = wrap_room_key(raw)
                rooms_coll.update_one({'_id': room['_id']}, {'$set': {'wrappedKey': wrapped}})
                room = rooms_coll.find_one({'_id': room['_id']})
            rk = unwrap_room_key(room['wrappedKey'])
            enc = encrypt_for_room(rk, json.dumps(drawing, separators=(',',':')).encode())
            mongo_doc = {'roomId': roomId, 'ts': ts, 'user': user, 'blob': enc}
            asset_data = {'roomId': roomId, 'type': room['type'], 'encrypted': enc, 'ts': ts, 'id': stroke_id, 'user': user}
        else:
            mongo_doc = {'roomId': roomId, 'ts': ts, 'user': user, 'stroke': drawing}
            asset_data = {'roomId': roomId, 'type': room['type'], 'stroke': drawing, 'ts': ts, 'id': stroke_id, 'user': user}

        # Persist to Mongo (fast path for reloads)
        strokes_coll.insert_one(mongo_doc)

        # Increment global draw count (kept for compatibility)
        count = increment_canvas_draw_count()
        key_str = f"res-canvas-draw-{count}"
        redis_client.set(key_str, json.dumps({**asset_data}))

        # GraphQL commit (metadata only; full blob is also in Mongo)
        prep = {
            'amount': 1,
            'signerPublicKey': SIGNER_PUBLIC_KEY,
            'signerPrivateKey': SIGNER_PRIVATE_KEY,
            'recipientPublicKey': RECIPIENT_PUBLIC_KEY,
            'asset': {'data': {**asset_data}}
        }
        commit_transaction_via_graphql(prep)

        # Maintain per-user undo/redo stacks within the room
        key_base = f"{roomId}:{user}"
        redis_client.lpush(f"{key_base}:undo", json.dumps(drawing))
        redis_client.delete(f"{key_base}:redo")

        # Optional: update cut stroke ids if provided
        cut_ids = payload.get('cutStrokeIds') or []
        if cut_ids:
            redis_client.set(f"cut-stroke-ids:{roomId}:{user}", json.dumps(cut_ids))

        return jsonify({'status': 'success', 'id': stroke_id}), 201

    except Exception as e:
        logger.exception('submitNewLineRoom failed')
        return jsonify({'status': 'error', 'message': str(e)}), 500
