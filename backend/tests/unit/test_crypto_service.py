import pytest
import os
from unittest.mock import patch

from services.crypto_service import (
    wrap_room_key,
    unwrap_room_key,
    encrypt_for_room,
    decrypt_for_room,
)


@pytest.mark.unit
class TestCryptoService:
    
    def test_wrap_room_key(self):
        room_key = os.urandom(32)
        
        wrapped = wrap_room_key(room_key)
        
        assert 'nonce' in wrapped
        assert 'ct' in wrapped
        assert isinstance(wrapped['nonce'], str)
        assert isinstance(wrapped['ct'], str)
    
    def test_wrap_room_key_invalid_length(self):
        room_key = os.urandom(16)
        
        with pytest.raises(ValueError, match="room_key must be 32 bytes"):
            wrap_room_key(room_key)
    
    def test_wrap_unwrap_room_key_roundtrip(self):
        original_key = os.urandom(32)
        
        wrapped = wrap_room_key(original_key)
        unwrapped = unwrap_room_key(wrapped)
        
        assert unwrapped == original_key
    
    def test_encrypt_for_room(self):
        room_key = os.urandom(32)
        plaintext = b'secret message'
        
        encrypted = encrypt_for_room(room_key, plaintext)
        
        assert 'nonce' in encrypted
        assert 'ct' in encrypted
        assert isinstance(encrypted['nonce'], str)
        assert isinstance(encrypted['ct'], str)
    
    def test_encrypt_decrypt_for_room_roundtrip(self):
        room_key = os.urandom(32)
        original_text = b'secret drawing data'
        
        encrypted = encrypt_for_room(room_key, original_text)
        decrypted = decrypt_for_room(room_key, encrypted)
        
        assert decrypted == original_text
    
    def test_decrypt_with_wrong_key_fails(self):
        room_key1 = os.urandom(32)
        room_key2 = os.urandom(32)
        plaintext = b'secret message'
        
        encrypted = encrypt_for_room(room_key1, plaintext)
        
        with pytest.raises(Exception):
            decrypt_for_room(room_key2, encrypted)
    
    def test_encrypt_empty_data(self):
        room_key = os.urandom(32)
        plaintext = b''
        
        encrypted = encrypt_for_room(room_key, plaintext)
        decrypted = decrypt_for_room(room_key, encrypted)
        
        assert decrypted == plaintext
    
    def test_encrypt_large_data(self):
        room_key = os.urandom(32)
        plaintext = b'x' * 10000
        
        encrypted = encrypt_for_room(room_key, plaintext)
        decrypted = decrypt_for_room(room_key, encrypted)
        
        assert decrypted == plaintext
    
    def test_encrypt_for_room_invalid_key_length(self):
        room_key = os.urandom(16)
        plaintext = b'test'
        
        with pytest.raises(ValueError, match="room_key must be 32 bytes"):
            encrypt_for_room(room_key, plaintext)
