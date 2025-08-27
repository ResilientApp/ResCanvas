# services/crypto_service.py
import base64, os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from config import ROOM_MASTER_KEY_B64

_MASTER = AESGCM(base64.b64decode(ROOM_MASTER_KEY_B64))

def _rand(n=12):  # 96-bit nonce for AES-GCM
    return os.urandom(n)

def wrap_room_key(raw32: bytes) -> dict:
    """Encrypt a 32B room key with master key."""
    nonce = _rand()
    ct = _MASTER.encrypt(nonce, raw32, None)
    return {"nonce": base64.b64encode(nonce).decode(),
            "ct":    base64.b64encode(ct).decode()}

def unwrap_room_key(obj: dict) -> bytes:
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
