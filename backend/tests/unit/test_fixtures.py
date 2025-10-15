import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock
from bson import ObjectId
import jwt
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from tests.conftest_simple import (
    JWT_SECRET,
    JWT_ISSUER,
    create_jwt_token,
    create_test_user,
)


@pytest.mark.unit
@pytest.mark.auth
class TestJWTTokenCreation:
    
    def test_create_valid_token(self):
        user_id = str(ObjectId())
        token = create_jwt_token(user_id, 'testuser', 3600)
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token.split('.')) == 3
    
    def test_decode_token_contains_correct_claims(self):
        user_id = str(ObjectId())
        username = 'testuser'
        token = create_jwt_token(user_id, username, 3600)
        
        decoded = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
        
        assert decoded['sub'] == user_id
        assert decoded['username'] == username
        assert decoded['iss'] == JWT_ISSUER
        assert 'exp' in decoded
    
    def test_expired_token_cannot_be_decoded(self):
        user_id = str(ObjectId())
        token = create_jwt_token(user_id, 'testuser', -10)
        
        with pytest.raises(jwt.ExpiredSignatureError):
            jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
    
    def test_token_with_wrong_secret_fails(self):
        user_id = str(ObjectId())
        token = create_jwt_token(user_id, 'testuser', 3600)
        
        with pytest.raises(jwt.InvalidTokenError):
            jwt.decode(token, 'wrong-secret', algorithms=['HS256'])


@pytest.mark.unit
class TestUserCreation:
    
    def test_create_test_user(self):
        user = create_test_user('newuser', 'Pass123!')
        
        assert user['username'] == 'newuser'
        assert 'password' in user
        assert user['password'] != 'Pass123!'
        assert '_id' in user
        assert 'createdAt' in user
    
    def test_create_user_with_specific_id(self):
        user_id = str(ObjectId())
        user = create_test_user('testuser', 'Pass123!', user_id)
        
        assert str(user['_id']) == user_id


@pytest.mark.unit
class TestFakeRedis:
    
    def test_redis_set_and_get(self, mock_redis):
        mock_redis.set('key1', 'value1')
        
        assert mock_redis.get('key1') == b'value1'
    
    def test_redis_delete(self, mock_redis):
        mock_redis.set('key1', 'value1')
        mock_redis.set('key2', 'value2')
        
        count = mock_redis.delete('key1', 'key2')
        
        assert count == 2
        assert mock_redis.get('key1') is None
        assert mock_redis.get('key2') is None
    
    def test_redis_lpush_and_lrange(self, mock_redis):
        mock_redis.lpush('list1', 'a', 'b', 'c')
        
        result = mock_redis.lrange('list1', 0, -1)
        
        assert result == ['c', 'b', 'a']
    
    def test_redis_incr(self, mock_redis):
        val1 = mock_redis.incr('counter')
        val2 = mock_redis.incr('counter')
        val3 = mock_redis.incr('counter')
        
        assert val1 == 1
        assert val2 == 2
        assert val3 == 3


@pytest.mark.unit
class TestFakeMongoDB:
    
    def test_mongodb_insert_and_find(self, mock_mongodb):
        doc = {'name': 'test', 'value': 123}
        mock_mongodb['test_coll'].insert_one(doc)
        
        found = mock_mongodb['test_coll'].find_one({'name': 'test'})
        
        assert found is not None
        assert found['name'] == 'test'
        assert found['value'] == 123
    
    def test_mongodb_update(self, mock_mongodb):
        doc = {'name': 'test', 'value': 123}
        mock_mongodb['test_coll'].insert_one(doc)
        
        mock_mongodb['test_coll'].update_one(
            {'name': 'test'},
            {'$set': {'value': 456}}
        )
        
        updated = mock_mongodb['test_coll'].find_one({'name': 'test'})
        assert updated['value'] == 456
    
    def test_mongodb_delete(self, mock_mongodb):
        doc1 = {'name': 'test1', 'value': 1}
        doc2 = {'name': 'test2', 'value': 2}
        mock_mongodb['test_coll'].insert_one(doc1)
        mock_mongodb['test_coll'].insert_one(doc2)
        
        result = mock_mongodb['test_coll'].delete_one({'name': 'test1'})
        
        assert result.deleted_count == 1
        assert mock_mongodb['test_coll'].find_one({'name': 'test1'}) is None
        assert mock_mongodb['test_coll'].find_one({'name': 'test2'}) is not None
