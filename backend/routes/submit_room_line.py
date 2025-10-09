from flask import Blueprint, request, jsonify
import json, time, traceback, logging, jwt
from datetime import datetime
import os
from bson import ObjectId
from services.graphql_service import commit_transaction_via_graphql
from services.db import redis_client, strokes_coll, rooms_coll, shares_coll
from services.socketio_service import push_to_room
from services.canvas_counter import get_canvas_draw_count, increment_canvas_draw_count
from services.crypto_service import unwrap_room_key, encrypt_for_room, wrap_room_key
import nacl.signing, nacl.encoding
from config import SIGNER_PUBLIC_KEY, SIGNER_PRIVATE_KEY, RECIPIENT_PUBLIC_KEY, JWT_SECRET
from cryptography.exceptions import InvalidTag

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

        auth_hdr = request.headers.get("Authorization", "")
        token_claims = None
        actor_id = None
        actor_username = None
        if auth_hdr and auth_hdr.startswith("Bearer "):
            token = auth_hdr.split(" ",1)[1]
            try:
                token_claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
                actor_id = token_claims.get("sub")
                actor_username = token_claims.get("username")
            except Exception:
                token_claims = None

        member = None
        if actor_id:
            member = shares_coll.find_one({"roomId": str(room["_id"]), "userId": actor_id})
        if room_type in ("private", "secure"):
            if not member:
                return jsonify({"status": "error", "message": "Forbidden: not a member"}), 403
            if member.get("role") == "viewer":
                return jsonify({"status": "error", "message": "Forbidden: read-only"}), 403
        else:
            if member and member.get("role") == "viewer":
                return jsonify({"status": "error", "message": "Forbidden: read-only"}), 403

        if actor_username:
            user = actor_username
            
        drawing = payload_value
        if isinstance(drawing, (bytes, bytearray)):
            try:
                drawing = drawing.decode('utf-8')
            except Exception:
                drawing = ''
        if isinstance(drawing, str):
            try:
                drawing = json.loads(drawing)
            except Exception:
                drawing = {"raw": drawing}
        if isinstance(drawing, dict) and 'value' in drawing and isinstance(drawing['value'], (str, bytes)):
            inner = drawing['value']
            try:
                if isinstance(inner, (bytes, bytearray)):
                    inner = inner.decode('utf-8')
                possible_stroke = json.loads(inner)
                if isinstance(possible_stroke, dict) and ('pathData' in possible_stroke or 'drawingId' in possible_stroke):
                    drawing = possible_stroke
            except Exception:
                pass

        if not isinstance(drawing, dict):
            drawing = {}

        drawing['roomId'] = roomId
        if not drawing.get('user'):
            drawing['user'] = user
        ts = drawing.get('timestamp') or drawing.get('ts') or int(time.time() * 1000)
        drawing['timestamp'] = int(ts)

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
        drawing.pop('undone', None)

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
            parsed = data.get('value')
            if isinstance(parsed, str):
                parsed = json.loads(parsed)
            if isinstance(parsed, dict) and parsed.get('type') == 'cutRecord':
                origs = parsed.get('originalStrokeIds') or []
                if origs:
                    cut_set_key = f"cut-stroke-ids:{roomId}" if roomId else "cut-stroke-ids"
                    redis_client.sadd(cut_set_key, *[str(o) for o in origs])
        except Exception as _e:
            logger.warning(f"submit_room_line: failed to update cut-stroke-ids: {_e}")


        if room_type in ("private", "secure"):
            if not room.get('wrappedKey'):
                raw32 = os.urandom(32)
                wrapped = wrap_room_key(raw32)
                rooms_coll.update_one({'_id': room['_id']}, {'$set': {'wrappedKey': wrapped}})
                rk = raw32
            else:
                rk = unwrap_room_key(room['wrappedKey'])
            enc = encrypt_for_room(rk, json.dumps(drawing).encode())

            strokes_coll.insert_one({
                'roomId': roomId,
                'ts': drawing['timestamp'],
                'blob': enc,
                'type': room_type
            })

            # Update room's updatedAt so the Dashboard's "Last edited" reflects drawing activity
            try:
                rooms_coll.update_one({'_id': room['_id']}, {'$set': {'updatedAt': datetime.utcnow()}})
            except Exception:
                logger.exception('Failed to update room updatedAt after inserting encrypted stroke')

            asset_data = {
                'roomId': roomId,
                'type': room_type,
                'id': drawing.get('id'),
                'ts': drawing.get('timestamp'),
                'user': drawing.get('user'),
                'encrypted': enc
            }

        else:
            strokes_coll.insert_one({
                'roomId': roomId,
                'ts': drawing['timestamp'],
                'stroke': drawing,
                'type': 'public'
            })

            try:
                rooms_coll.update_one({'_id': room['_id']}, {'$set': {'updatedAt': datetime.utcnow()}})
            except Exception:
                logger.exception('Failed to update room updatedAt after inserting public stroke')
            asset_data = {
                'roomId': roomId,
                'type': 'public',
                'id': drawing.get('id'),
                'ts': drawing.get('timestamp'),
                'user': drawing.get('user'),
                'value': json.dumps(drawing)
            }

        prep = {
            'operation': 'CREATE',
            'amount': 1,
            'signerPublicKey': SIGNER_PUBLIC_KEY,
            'signerPrivateKey': SIGNER_PRIVATE_KEY,
            'recipientPublicKey': RECIPIENT_PUBLIC_KEY,
            'asset': {'data': asset_data}
        }
        commit_transaction_via_graphql(prep)

        key_base = f"{roomId}:{user}"
        redis_client.lpush(f"{key_base}:undo", json.dumps(drawing))
        redis_client.delete(f"{key_base}:redo")

        push_to_room(roomId, "new_stroke", {
            "roomId": roomId,
            "stroke": drawing,
            "user": user,
            "timestamp": drawing["timestamp"]
        })

        return jsonify({'status': 'success', 'id': stroke_id}), 201

    except InvalidTag as e:
        logger.exception('submitNewLineRoom failed: room key unwrap failed (master key mismatch)')
        return jsonify({
            'status': 'error',
            'message': ("Room key decryption failed. This usually means the server's ROOM_MASTER_KEY_B64 "
                        "changed. Set it back to the original value or POST to /admin/rotate-room-master "
                        "with the previous key to rewrap existing rooms.")
        }), 500
    except Exception as e:
        logger.exception('submitNewLineRoom failed')
        return jsonify({'status': 'error', 'message': str(e)}), 500
