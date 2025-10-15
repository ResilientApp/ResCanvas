import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock
from bson import ObjectId
import jwt

from middleware.auth import (
    extract_token_from_request,
    decode_and_verify_token,
    AuthenticationError,
    AuthorizationError,
    require_auth,
    require_room_access,
)
from config import JWT_SECRET, JWT_ISSUER
from tests.conftest import create_jwt_token, create_test_user


@pytest.mark.unit
@pytest.mark.auth
class TestExtractToken:
    
    def test_extract_token_valid_bearer(self, app):
        with app.test_request_context(headers={'Authorization': 'Bearer test-token-123'}):
            from flask import request
            with patch('middleware.auth.request', request):
                token = extract_token_from_request()
                assert token == 'test-token-123'
    
    def test_extract_token_no_header(self, app):
        with app.test_request_context():
            from flask import request
            with patch('middleware.auth.request', request):
                token = extract_token_from_request()
                assert token is None
    
    def test_extract_token_malformed_no_bearer(self, app):
        with app.test_request_context(headers={'Authorization': 'test-token-123'}):
            from flask import request
            with patch('middleware.auth.request', request):
                token = extract_token_from_request()
                assert token is None
    
    def test_extract_token_case_insensitive(self, app):
        with app.test_request_context(headers={'Authorization': 'bearer test-token-123'}):
            from flask import request
            with patch('middleware.auth.request', request):
                token = extract_token_from_request()
                assert token == 'test-token-123'


@pytest.mark.unit
@pytest.mark.auth
class TestDecodeAndVerifyToken:
    
    def test_decode_valid_token(self):
        user_id = str(ObjectId())
        token = create_jwt_token(user_id, 'testuser', 3600)
        
        claims = decode_and_verify_token(token)
        
        assert claims['sub'] == user_id
        assert claims['username'] == 'testuser'
        assert claims['iss'] == JWT_ISSUER
        assert 'exp' in claims
    
    def test_decode_expired_token(self):
        user_id = str(ObjectId())
        token = create_jwt_token(user_id, 'testuser', -10)
        
        with pytest.raises(AuthenticationError, match='expired'):
            decode_and_verify_token(token)
    
    def test_decode_invalid_signature(self):
        payload = {
            'iss': JWT_ISSUER,
            'sub': str(ObjectId()),
            'username': 'testuser',
            'exp': datetime.now(timezone.utc) + timedelta(hours=1)
        }
        token = jwt.encode(payload, 'wrong-secret', algorithm='HS256')
        
        with pytest.raises(AuthenticationError, match='Invalid token'):
            decode_and_verify_token(token)
    
    def test_decode_malformed_token(self):
        with pytest.raises(AuthenticationError, match='Invalid token'):
            decode_and_verify_token('not.a.valid.jwt')
    
    def test_decode_missing_required_claims(self):
        payload = {
            'iss': JWT_ISSUER,
            'exp': datetime.now(timezone.utc) + timedelta(hours=1)
        }
        token = jwt.encode(payload, JWT_SECRET, algorithm='HS256')
        
        with pytest.raises(AuthenticationError):
            decode_and_verify_token(token)
    
    def test_decode_none_token(self):
        with pytest.raises(AuthenticationError, match='No token provided'):
            decode_and_verify_token(None)



