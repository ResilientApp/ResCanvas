# backend/services/crypto_service.py
"""
Vault-aware crypto_service for ResCanvas.

Priority for master key (base64 32-bytes):
  1) ROOM_MASTER_KEY_B64 env var (explicit pin)
  2) HashiCorp Vault KV v2 secret (if VAULT_ADDR + token/approle available)
  3) Mongo settings collection (settings_coll, _id = 'room_master_key_b64')
  4) Legacy Redis key 'room-master-key-b64'
  5) Generate a new random 32-byte key -> persist to Vault if possible else to Mongo.

This file exposes:
 - wrap_room_key(room_key: bytes) -> {'nonce': b64, 'ct': b64}
 - unwrap_room_key(wrapped: dict) -> bytes
 - encrypt_for_room(room_key: bytes, plaintext: bytes) -> {'nonce','ct'}
 - decrypt_for_room(room_key: bytes, bundle: dict) -> bytes
"""
import os
import base64
import logging
from datetime import datetime, timezone
import hvac
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

from services.db import redis_client, settings_coll

logger = logging.getLogger(__name__)

_NONCE_BYTES = 12
_SETTINGS_ID = "room_master_key_b64"

def _b64e(b: bytes) -> str:
    return base64.b64encode(b).decode("utf-8")

def _b64d(s: str) -> bytes:
    return base64.b64decode(s.encode("utf-8"))

def _rand(n=_NONCE_BYTES) -> bytes:
    return os.urandom(n)

def _vault_client() -> "hvac.Client | None":
    """
    Return an authenticated hvac.Client or None if unavailable/unconfigured.
    Supports token auth (VAULT_TOKEN) or AppRole (VAULT_APPROLE_ROLE_ID + VAULT_APPROLE_SECRET_ID).
    """
    if hvac is None:
        return None
    vault_addr = os.getenv("VAULT_ADDR") or os.getenv("VAULT_URL")
    if not vault_addr:
        return None
    token = os.getenv("VAULT_TOKEN")
    client = hvac.Client(url=vault_addr, token=token)
    if client.is_authenticated():
        return client

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

def _get_master_b64_from_vault(client) -> "str | None":
    """
    Read KV v2 secret at path configured by VAULT_SECRET_PATH under mount VAULT_KV_MOUNT.
    We expect a key named 'room_master_key_b64' in the secret data.
    """
    if not client:
        return None
    mount_point = os.getenv("VAULT_KV_MOUNT", "secret")
    secret_path = os.getenv("VAULT_SECRET_PATH", "rescanvas/room_master_key")
    try:
        resp = client.secrets.kv.v2.read_secret_version(path=secret_path, mount_point=mount_point)
        # hvac returns {'data': {'data': {...}, 'metadata': {...}}}
        return resp["data"]["data"].get("room_master_key_b64")
    except Exception as e:
        logger.debug("vault read_secret_version failed for %s: %s", secret_path, e)
        return None

def _write_master_b64_to_vault(client, val: str) -> bool:
    if not client:
        return False
    mount_point = os.getenv("VAULT_KV_MOUNT", "secret")
    secret_path = os.getenv("VAULT_SECRET_PATH", "rescanvas/room_master_key")
    try:
        client.secrets.kv.v2.create_or_update_secret(path=secret_path, secret={"room_master_key_b64": val}, mount_point=mount_point)
        return True
    except Exception as e:
        logger.error("vault write failed for %s: %s", secret_path, e)
        return False

def _get_master_b64_from_settings():
    try:
        doc = settings_coll.find_one({"_id": _SETTINGS_ID})
        if doc and isinstance(doc.get("value"), str):
            return doc["value"]
    except Exception as e:
        logger.warning("crypto_service: failed to read settings: %s", e)
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
        logger.error("crypto_service: failed to persist master key to settings: %s", e)

def _get_master_b64_from_redis():
    try:
        v = redis_client.get("room-master-key-b64")
        if isinstance(v, bytes):
            v = v.decode("utf-8")
        return v
    except Exception:
        return None

def _save_master_b64_to_redis(val: str):
    try:
        redis_client.set("room-master-key-b64", val)
    except Exception:
        pass

def _get_or_create_master_b64():
    env_val = os.getenv("ROOM_MASTER_KEY_B64")
    if env_val:
        vc = _vault_client()
        if vc:
            try:
                _write_master_b64_to_vault(vc, env_val)
            except Exception:
                pass
        _save_master_b64_to_settings(env_val)
        _save_master_b64_to_redis(env_val)
        return env_val

    vc = _vault_client()
    if vc:
        v = _get_master_b64_from_vault(vc)
        if v:
            _save_master_b64_to_redis(v)
            _save_master_b64_to_settings(v)
            return v

    s = _get_master_b64_from_settings()
    if s:
        try:
            _save_master_b64_to_redis(s)
        except Exception:
            pass
        if vc:
            try:
                _write_master_b64_to_vault(vc, s)
            except Exception:
                pass
        return s

    r = _get_master_b64_from_redis()
    if r:
        _save_master_b64_to_settings(r)
        if vc:
            try:
                _write_master_b64_to_vault(vc, r)
            except Exception:
                pass
        return r

    fresh = _b64e(os.urandom(32))
    vc = _vault_client()
    if vc:
        ok = _write_master_b64_to_vault(vc, fresh)
        if ok:
            try:
                _save_master_b64_to_redis(fresh)
            except Exception:
                pass
            _save_master_b64_to_settings(fresh)
            logger.info("Generated new ROOM_MASTER_KEY_B64 and persisted to Vault.")
            return fresh
    _save_master_b64_to_settings(fresh)
    try:
        _save_master_b64_to_redis(fresh)
    except Exception:
        pass
    logger.info("Generated new ROOM_MASTER_KEY_B64 and persisted to Mongo settings (Vault unavailable).")
    return fresh

_MASTER_B64 = _get_or_create_master_b64()
try:
    _MASTER = AESGCM(_b64d(_MASTER_B64))
except Exception as e:
    logger.error("ROOM_MASTER_KEY_B64 invalid: must be base64 of 32 bytes: %s", e)
    raise

def wrap_room_key(room_key: bytes) -> dict:
    if not isinstance(room_key, (bytes, bytearray)) or len(room_key) != 32:
        raise ValueError("room_key must be 32 bytes")
    nonce = _rand()
    ct = _MASTER.encrypt(nonce, room_key, None)
    return {"nonce": _b64e(nonce), "ct": _b64e(ct)}

def unwrap_room_key(wrapped: dict) -> bytes:
    if not isinstance(wrapped, dict) or "nonce" not in wrapped or "ct" not in wrapped:
        raise ValueError("wrapped must be a dict with 'nonce' and 'ct'")
    nonce = _b64d(wrapped["nonce"])
    ct = _b64d(wrapped["ct"])
    return _MASTER.decrypt(nonce, ct, None)  # may raise InvalidTag

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
