# services/crypto_service.py - patched to persist master key across restarts (so wrapped room keys remain decryptable)
import base64, os, json, logging
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from config import ROOM_MASTER_KEY_B64
from services.db import redis_client

logger = logging.getLogger(__name__)

# Determine master key base64:
# Prefer explicit env var value if provided; otherwise fall back to a stored value in Redis (so restarts keep the same key).
_env_val = os.getenv("ROOM_MASTER_KEY_B64")
_stored = None
try:
    _stored = redis_client.get("room-master-key-b64")
except Exception as _e:
    # Redis may not be available at import time in some test contexts; fall back to config value.
    _stored = None

if _env_val:
    MASTER_KEY_B64 = _env_val
    # Ensure Redis contains it for future restarts
    try:
        if not _stored:
            redis_client.set("room-master-key-b64", MASTER_KEY_B64)
    except Exception:
        pass
else:
    if _stored:
        try:
            MASTER_KEY_B64 = _stored.decode() if isinstance(_stored, (bytes, bytearray)) else str(_stored)
        except Exception:
            MASTER_KEY_B64 = ROOM_MASTER_KEY_B64
    else:
        MASTER_KEY_B64 = ROOM_MASTER_KEY_B64
        try:
            redis_client.set("room-master-key-b64", MASTER_KEY_B64)
        except Exception:
            pass

_MASTER = AESGCM(base64.b64decode(MASTER_KEY_B64))

def _rand(n=12):  # 96-bit nonce for AES-GCM
    return os.urandom(n)

def wrap_room_key(raw32: bytes) -> dict:
    """Encrypt a 32B room key with master key."""
    nonce = _rand()
    ct = _MASTER.encrypt(nonce, raw32, None)
    return {"nonce": base64.b64encode(nonce).decode(),
            "ct":    base64.b64encode(ct).decode()}

def unwrap_room_key(obj) -> bytes:
    """Accept either a dict or a JSON string for the wrappedKey and return the raw room key bytes."""
    if isinstance(obj, str):
        try:
            obj = json.loads(obj)
        except Exception:
            raise ValueError("wrappedKey appears to be a string but is not JSON")

    if not isinstance(obj, dict) or 'nonce' not in obj or 'ct' not in obj:
        raise ValueError("wrappedKey must be a dict with 'nonce' and 'ct'")

    nonce = base64.b64decode(obj["nonce"])
    ct    = base64.b64decode(obj["ct"])
    return _MASTER.decrypt(nonce, ct, None)

def encrypt_for_room(room_key: bytes, plaintext: bytes) -> dict:
    aes = AESGCM(room_key)
    nonce = _rand()
    ct = aes.encrypt(nonce, plaintext, None)
    return {"nonce": base64.b64encode(nonce).decode(),
            "ct":    base64.b64encode(ct).decode()}

def decrypt_for_room(room_key: bytes, bundle: dict) -> bytes:
    aes = AESGCM(room_key)
    nonce = base64.b64decode(bundle["nonce"])
    ct    = base64.b64decode(bundle["ct"])
    return aes.decrypt(nonce, ct, None)
