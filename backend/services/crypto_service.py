import base64
import os
import logging
from datetime import datetime, timezone
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag
from services.db import redis_client, settings_coll

logger = logging.getLogger(__name__)

_SETTINGS_ID = "room_master_key_b64"   # document _id in settings collection
_NONCE_BYTES = 12

def _b64e(b: bytes) -> str:
    return base64.b64encode(b).decode('utf-8')

def _b64d(s: str) -> bytes:
    return base64.b64decode(s.encode('utf-8'))

def _rand(n=_NONCE_BYTES) -> bytes:
    return os.urandom(n)

def _get_master_b64_from_settings():
    try:
        doc = settings_coll.find_one({"_id": _SETTINGS_ID})
        if doc and isinstance(doc.get("value"), str):
            return doc["value"]
    except Exception as e:
        logger.warning(f"crypto_service: failed to read settings: {e}")
    return None

def _save_master_b64_to_settings(val: str):
    try:
        settings_coll.update_one(
            {"_id": _SETTINGS_ID},
            {"$set": {"value": val, "updatedAt": datetime.now(timezone.utc)},
             "$setOnInsert": {"createdAt": datetime.now(timezone.utc)}},
            upsert=True
        )
    except Exception as e:
        logger.error(f"crypto_service: failed to persist master key to settings: {e}")

def _get_or_create_master_b64() -> str:
    # 1) Explicit env var wins (kept stable by deploy)
    env_val = os.getenv("ROOM_MASTER_KEY_B64")
    if env_val:
        prev = _get_master_b64_from_settings()
        if prev and prev != env_val:
            logger.warning("ROOM_MASTER_KEY_B64 in env differs from stored settings; using env value.")
        _save_master_b64_to_settings(env_val)
        # Back-compat for older builds that read from Redis
        try:
            redis_client.set("room-master-key-b64", env_val)
        except Exception:
            pass
        return env_val

    # 2) Stored in Mongo settings (stable across restarts)
    set_val = _get_master_b64_from_settings()
    if set_val:
        try:
            redis_client.set("room-master-key-b64", set_val)
        except Exception:
            pass
        return set_val

    # 3) Legacy Redis (upgrade path)
    try:
        legacy = redis_client.get("room-master-key-b64")
        if isinstance(legacy, bytes):
            legacy = legacy.decode('utf-8')
        if isinstance(legacy, str) and legacy:
            _save_master_b64_to_settings(legacy)
            return legacy
    except Exception:
        pass

    # 4) Generate once and persist (dev-friendly)
    fresh = _b64e(os.urandom(32))
    _save_master_b64_to_settings(fresh)
    try:
        redis_client.set("room-master-key-b64", fresh)
    except Exception:
        pass
    logger.info("Generated a new ROOM_MASTER_KEY_B64 and persisted it to Mongo settings.")
    return fresh

# Cache the AES primitive
_MASTER_B64 = _get_or_create_master_b64()
try:
    _MASTER = AESGCM(_b64d(_MASTER_B64))
except Exception as e:
    logger.error("ROOM_MASTER_KEY_B64 appears invalid; must be base64 for 32 random bytes.")
    raise

def wrap_room_key(room_key: bytes) -> dict:
    """Wrap (encrypt) a 32-byte per-room key with the master key for storage in Mongo."""
    if not isinstance(room_key, (bytes, bytearray)) or len(room_key) != 32:
        raise ValueError("room_key must be 32 bytes")
    nonce = _rand()
    ct = _MASTER.encrypt(nonce, room_key, None)
    return {"nonce": _b64e(nonce), "ct": _b64e(ct)}

def unwrap_room_key(wrapped: dict) -> bytes:
    """Unwrap (decrypt) a per-room key previously created by wrap_room_key."""
    if not isinstance(wrapped, dict) or "nonce" not in wrapped or "ct" not in wrapped:
        raise ValueError("wrapped must be a dict with 'nonce' and 'ct'")
    nonce = _b64d(wrapped["nonce"])
    ct = _b64d(wrapped["ct"])
    # This may raise InvalidTag if the master key changed; callers can handle it.
    return _MASTER.decrypt(nonce, ct, None)

def encrypt_for_room(room_key: bytes, plaintext: bytes) -> dict:
    if not isinstance(room_key, (bytes, bytearray)) or len(room_key) != 32:
        raise ValueError("room_key must be 32 bytes")
    if not isinstance(plaintext, (bytes, bytearray)):
        raise ValueError("plaintext must be bytes")
    aes = AESGCM(room_key)
    nonce = _rand()
    ct = aes.encrypt(nonce, plaintext, None)
    return {"nonce": _b64e(nonce), "ct": _b64e(ct)}

def decrypt_for_room(room_key: bytes, bundle: dict) -> bytes:
    if not isinstance(room_key, (bytes, bytearray)) or len(room_key) != 32:
        raise ValueError("room_key must be 32 bytes")
    if not isinstance(bundle, dict) or "nonce" not in bundle or "ct" not in bundle:
        raise ValueError("bundle must be a dict with 'nonce' and 'ct'")
    aes = AESGCM(room_key)
    nonce = _b64d(bundle["nonce"])
    ct = _b64d(bundle["ct"])
    return aes.decrypt(nonce, ct, None)
