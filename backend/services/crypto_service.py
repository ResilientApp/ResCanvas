# services/crypto_service.py
import base64, os, logging
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from config import ROOM_MASTER_KEY_B64
try:
    # Prefer persisted master key in Redis if env var is not explicitly set.
    # This prevents InvalidTag errors across restarts in dev when config generates an ephemeral key.
    from services.db import redis_client
except Exception:
    redis_client = None

logger = logging.getLogger(__name__)

def _load_master_key_b64() -> str:
    env_set = os.getenv("ROOM_MASTER_KEY_B64")
    if env_set:
        return env_set  # honor explicit env
    # If env not set, config may have generated a random key at import time.
    # Persist and reuse a stable key via Redis so wrapped keys remain decryptable across restarts.
    if redis_client is not None:
        try:
            cached = redis_client.get("room-master-key-b64")
            if cached:
                return cached.decode()
            # Persist the currently-loaded config value as the canonical dev key.
            if ROOM_MASTER_KEY_B64:
                redis_client.set("room-master-key-b64", ROOM_MASTER_KEY_B64)
                return ROOM_MASTER_KEY_B64
        except Exception as e:
            logger.warning("crypto_service: unable to use Redis for master key persistence: %s", e)
    # Fallback: use whatever config provided (may be ephemeral for this process)
    return ROOM_MASTER_KEY_B64

_MASTER_B64 = _load_master_key_b64()
_MASTER = AESGCM(base64.b64decode(_MASTER_B64))

def _rand(n=12):  # 96-bit nonce for AES-GCM
    return os.urandom(n)

def wrap_room_key(raw32: bytes) -> dict:
    """Encrypt a 32B room key with the master key."""
    nonce = _rand()
    ct = _MASTER.encrypt(nonce, raw32, None)
    return {"nonce": base64.b64encode(nonce).decode(),
            "ct":    base64.b64encode(ct).decode()}

def unwrap_room_key(bundle: dict) -> bytes:
    """Decrypt a wrapped room key bundle {nonce, ct} to raw 32B."""
    if not isinstance(bundle, dict):
        # Allow JSON string storage
        try:
            import json
            bundle = json.loads(bundle)
        except Exception:
            raise
    nonce = base64.b64decode(bundle["nonce"])
    ct    = base64.b64decode(bundle["ct"])
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
