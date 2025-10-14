import pytest
import os
import json
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
from bson import ObjectId
import jwt
from passlib.hash import bcrypt

os.environ['TESTING'] = '1'
os.environ['JWT_SECRET'] = 'test-secret-key-do-not-use-in-production'

JWT_SECRET = 'test-secret-key-do-not-use-in-production'
JWT_ISSUER = 'rescanvas-test'
ACCESS_TOKEN_EXPIRES_SECS = 3600


class FakeRedis:
    def __init__(self):
        self.kv = {}
        self.lists = {}
        self.sets = {}
    
    def set(self, key, value, ex=None, nx=False):
        if nx and key in self.kv:
            return False
        self.kv[key] = value
        return True
    
    def get(self, key):
        return self.kv.get(key)
    
    def delete(self, *keys):
        count = 0
        for key in keys:
            if key in self.kv:
                del self.kv[key]
                count += 1
            if key in self.lists:
                del self.lists[key]
                count += 1
            if key in self.sets:
                del self.sets[key]
                count += 1
        return count
    
    def exists(self, key):
        return 1 if key in self.kv or key in self.lists or key in self.sets else 0
    
    def lpush(self, key, *values):
        if key not in self.lists:
            self.lists[key] = []
        for value in reversed(values):
            self.lists[key].insert(0, value)
        return len(self.lists[key])
    
    def rpush(self, key, *values):
        if key not in self.lists:
            self.lists[key] = []
        self.lists[key].extend(values)
        return len(self.lists[key])
    
    def lrange(self, key, start, stop):
        if key not in self.lists:
            return []
        lst = self.lists[key]
        if stop == -1:
            return lst[start:]
        return lst[start:stop+1]
    
    def llen(self, key):
        return len(self.lists.get(key, []))
    
    def sadd(self, key, *members):
        if key not in self.sets:
            self.sets[key] = set()
        before = len(self.sets[key])
        self.sets[key].update(members)
        return len(self.sets[key]) - before
    
    def smembers(self, key):
        return self.sets.get(key, set())
    
    def srem(self, key, *members):
        if key not in self.sets:
            return 0
        before = len(self.sets[key])
        self.sets[key].difference_update(members)
        return before - len(self.sets[key])
    
    def expire(self, key, seconds):
        return True
    
    def flushdb(self):
        self.kv.clear()
        self.lists.clear()
        self.sets.clear()
        return True
    
    def keys(self, pattern='*'):
        import fnmatch
        all_keys = list(self.kv.keys()) + list(self.lists.keys()) + list(self.sets.keys())
        if pattern == '*':
            return all_keys
        return [k for k in all_keys if fnmatch.fnmatch(k, pattern)]
    
    def incr(self, key):
        val = self.kv.get(key, '0')
        if isinstance(val, bytes):
            val = val.decode('utf-8')
        self.kv[key] = str(int(val) + 1)
        return int(self.kv[key])


@pytest.fixture
def mock_redis():
    fake_redis = FakeRedis()
    yield fake_redis


class FakeCollection:
    def __init__(self, name):
        self.name = name
        self.docs = []
    
    def create_index(self, *args, **kwargs):
        pass
    
    def insert_one(self, doc):
        if '_id' not in doc:
            doc['_id'] = ObjectId()
        self.docs.append(doc.copy())
        result = MagicMock()
        result.inserted_id = doc['_id']
        return result
    
    def insert_many(self, docs):
        ids = []
        for doc in docs:
            if '_id' not in doc:
                doc['_id'] = ObjectId()
            self.docs.append(doc.copy())
            ids.append(doc['_id'])
        result = MagicMock()
        result.inserted_ids = ids
        return result
    
    def find_one(self, query=None, *args, **kwargs):
        query = query or {}
        for doc in self.docs:
            if self._matches(doc, query):
                return doc.copy()
        return None
    
    def find(self, query=None, *args, **kwargs):
        query = query or {}
        results = [doc.copy() for doc in self.docs if self._matches(doc, query)]
        mock_cursor = MagicMock()
        mock_cursor.__iter__ = lambda self: iter(results)
        mock_cursor.limit = lambda n: mock_cursor
        mock_cursor.sort = lambda *a, **k: mock_cursor
        return mock_cursor
    
    def update_one(self, query, update, upsert=False):
        for doc in self.docs:
            if self._matches(doc, query):
                self._apply_update(doc, update)
                result = MagicMock()
                result.modified_count = 1
                result.matched_count = 1
                return result
        if upsert:
            new_doc = {}
            if '$set' in update:
                new_doc.update(update['$set'])
            self.insert_one(new_doc)
            result = MagicMock()
            result.upserted_id = new_doc['_id']
            return result
        result = MagicMock()
        result.modified_count = 0
        result.matched_count = 0
        return result
    
    def update_many(self, query, update):
        count = 0
        for doc in self.docs:
            if self._matches(doc, query):
                self._apply_update(doc, update)
                count += 1
        result = MagicMock()
        result.modified_count = count
        result.matched_count = count
        return result
    
    def delete_one(self, query):
        for i, doc in enumerate(self.docs):
            if self._matches(doc, query):
                self.docs.pop(i)
                result = MagicMock()
                result.deleted_count = 1
                return result
        result = MagicMock()
        result.deleted_count = 0
        return result
    
    def delete_many(self, query):
        original_len = len(self.docs)
        self.docs = [doc for doc in self.docs if not self._matches(doc, query)]
        result = MagicMock()
        result.deleted_count = original_len - len(self.docs)
        return result
    
    def count_documents(self, query):
        return sum(1 for doc in self.docs if self._matches(doc, query))
    
    def _matches(self, doc, query):
        for key, value in query.items():
            if key == '$or':
                if not any(self._matches(doc, sub_q) for sub_q in value):
                    return False
            elif key == '$and':
                if not all(self._matches(doc, sub_q) for sub_q in value):
                    return False
            elif key.startswith('$'):
                continue
            elif isinstance(value, dict):
                for op, op_value in value.items():
                    if op == '$gt' and not (key in doc and doc[key] > op_value):
                        return False
                    elif op == '$gte' and not (key in doc and doc[key] >= op_value):
                        return False
                    elif op == '$lt' and not (key in doc and doc[key] < op_value):
                        return False
                    elif op == '$lte' and not (key in doc and doc[key] <= op_value):
                        return False
                    elif op == '$ne' and not (key not in doc or doc[key] != op_value):
                        return False
                    elif op == '$in' and not (key in doc and doc[key] in op_value):
                        return False
                    elif op == '$nin' and not (key not in doc or doc[key] not in op_value):
                        return False
            elif key not in doc or doc[key] != value:
                return False
        return True
    
    def _apply_update(self, doc, update):
        if '$set' in update:
            doc.update(update['$set'])
        if '$unset' in update:
            for key in update['$unset']:
                doc.pop(key, None)
        if '$inc' in update:
            for key, value in update['$inc'].items():
                doc[key] = doc.get(key, 0) + value


class FakeMongoDB:
    def __init__(self):
        self.collections = {}
    
    def __getitem__(self, name):
        if name not in self.collections:
            self.collections[name] = FakeCollection(name)
        return self.collections[name]
    
    def list_collection_names(self):
        return list(self.collections.keys())


@pytest.fixture
def mock_mongodb():
    fake_db = FakeMongoDB()
    yield fake_db


def create_test_user(username='testuser', password='Test123!', user_id=None):
    user = {
        '_id': ObjectId(user_id) if user_id else ObjectId(),
        'username': username,
        'password': bcrypt.hash(password),
        'createdAt': datetime.utcnow(),
    }
    return user


def create_jwt_token(user_id, username='testuser', expires_in=ACCESS_TOKEN_EXPIRES_SECS):
    payload = {
        'iss': JWT_ISSUER,
        'sub': str(user_id),
        'username': username,
        'exp': datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm='HS256')
    if isinstance(token, bytes):
        token = token.decode('utf-8')
    return token


@pytest.fixture
def test_user(mock_mongodb):
    user = create_test_user()
    mock_mongodb['users'].insert_one(user)
    return user


@pytest.fixture
def jwt_token(test_user):
    return create_jwt_token(test_user['_id'], test_user['username'])


@pytest.fixture
def auth_headers(jwt_token):
    return {'Authorization': f'Bearer {jwt_token}'}
