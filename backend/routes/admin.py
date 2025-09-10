# backend/routes/admin.py
from flask import Blueprint, request, jsonify
from services.db import rooms_coll, settings_coll
from datetime import datetime, timezone
import base64, os, logging
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Vault
try:
    import hvac
except Exception:
    hvac = None

admin_bp = Blueprint('admin', __name__)
logger = logging.getLogger(__name__)

def _vault_client():
    if hvac is None:
        return None
    vault_addr = os.getenv("VAULT_ADDR") or os.getenv("VAULT_URL")
    if not vault_addr:
        return None
    token = os.getenv("VAULT_TOKEN")
    client = hvac.Client(url=vault_addr, token=token)
    if client.is_authenticated():
        return client
    # try AppRole
    role_id = os.getenv("VAULT_APPROLE_ROLE_ID")
    secret_id = os.getenv("VAULT_APPROLE_SECRET_ID")
    mount = os.getenv("VAULT_APPROLE_MOUNT", "approle")
    if role_id and secret_id:
        try:
            client.auth.approle.login(role_id=role_id, secret_id=secret_id, mount_point=mount)
            if client.is_authenticated():
                return client
        except Exception as e:
            logger.warning("vault approle login failed: %s", e)
    return None

def _write_master_b64_to_vault(client, val: str):
    if not client:
        return False
    mount_point = os.getenv("VAULT_KV_MOUNT", "secret")
    secret_path = os.getenv("VAULT_SECRET_PATH", "rescanvas/room_master_key")
    try:
        client.secrets.kv.v2.create_or_update_secret(path=secret_path, secret={"room_master_key_b64": val}, mount_point=mount_point)
        return True
    except Exception as e:
        logger.exception("admin.rotate: vault write failed: %s", e)
        return False

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
    old_b64 = body.get('oldMasterB64')  # optional; provide to rewrap existing rooms

    # persist new to Vault if possible; else persist to Mongo settings
    vc = _vault_client()
    persisted_to_vault = False
    if vc:
        persisted_to_vault = _write_master_b64_to_vault(vc, new_b64)
    if not persisted_to_vault:
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
                logger.warning('rotate_room_master: failed to rewrap room %s: %s', room.get('_id'), e)
                errors += 1

    return jsonify({'status': 'ok', 'newMasterB64': new_b64, 'roomsRewrapped': updated, 'errors': errors}), 200
