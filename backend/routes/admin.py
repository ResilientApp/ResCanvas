# admin endpoint /admin/rotate-room-master that can rewrap existing room keys 
# from an old master to a new master but must have the old master key. 
# If old master key is lost, rewrapping (and therefore decryption) is impossible.
# So if you still know the previous base64 master key, run:
# POST /admin/rotate-room-master
# {
#   "oldMasterB64": "<the previous ROOM_MASTER_KEY_B64>",
#   "newMasterB64": "<optional new; omit to auto-generate>"
# }
# This will rewrap every rooms.wrappedKey from the old master to the new one stored in settings.

from flask import Blueprint, request, jsonify
from services.db import rooms_coll, settings_coll
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag
from datetime import datetime, timezone
import base64, os, logging

admin_bp = Blueprint('admin', __name__)
logger = logging.getLogger(__name__)

@admin_bp.route('/admin/master-key', methods=['GET'])
def master_key_info():
  doc = settings_coll.find_one({'_id': 'room_master_key_b64'}) or {}
  val = doc.get('value')
  masked = None
  if isinstance(val, str) and len(val) >= 8:
      masked = f"{val[:4]}...{val[-4:]}"
  return jsonify({
      'status': 'ok',
      'hasValue': bool(val),
      'valuePreview': masked,
      'updatedAt': doc.get('updatedAt')
  }), 200

@admin_bp.route('/admin/rotate-room-master', methods=['POST'])
def rotate_room_master():
  body = request.get_json(silent=True) or {}
  new_b64 = body.get('newMasterB64') or base64.b64encode(os.urandom(32)).decode('utf-8')
  old_b64 = body.get('oldMasterB64')  # optional; provide to rewrap all rooms

  # Persist new value
  settings_coll.update_one(
      {'_id': 'room_master_key_b64'},
      {'$set': {'value': new_b64, 'updatedAt': datetime.now(timezone.utc)},
      '$setOnInsert': {'createdAt': datetime.now(timezone.utc)}},
      upsert=True
  )

  updated = 0
  errors = 0

  if old_b64:
      try:
          old_master = AESGCM(base64.b64decode(old_b64))
          new_master = AESGCM(base64.b64decode(new_b64))
      except Exception as e:
          return jsonify({'status': 'error', 'message': f'invalid b64 keys: {e}'}), 400

      for room in rooms_coll.find({'wrappedKey': {'$exists': True, '$ne': None}}):
          wrapped = room['wrappedKey']
          try:
              nonce = base64.b64decode(wrapped['nonce'])
              ct    = base64.b64decode(wrapped['ct'])
              raw32 = old_master.decrypt(nonce, ct, None)
              n2 = os.urandom(12)
              ct2 = new_master.encrypt(n2, raw32, None)
              new_wrapped = {'nonce': base64.b64encode(n2).decode(), 'ct': base64.b64encode(ct2).decode()}
              rooms_coll.update_one({'_id': room['_id']}, {'$set': {'wrappedKey': new_wrapped}})
              updated += 1
          except Exception as e:
              logger.warning(f'rotate_room_master: failed to rewrap room {room.get("_id")}: {e}')
              errors += 1

  return jsonify({'status': 'ok', 'newMasterB64': new_b64, 'roomsRewrapped': updated, 'errors': errors}), 200