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
JWT_ISSUER = 'rescanvas'
ACCESS_TOKEN_EXPIRES_SECS = 3600


@pytest.fixture
def app(mock_redis, mock_mongodb):
    import sys
    modules_to_delete = [
        'app',
        'config',
        'middleware.auth',
        'routes.auth',
        'routes.rooms',
        'routes.new_line',
        'routes.get_canvas_data',
        'routes.submit_room_line',
        'routes.undo_redo',
        'routes.clear_canvas',
        'routes.socketio_handlers',
    ]
    for module_name in modules_to_delete:
        if module_name in sys.modules:
            del sys.modules[module_name]

    from app import app as flask_app
    flask_app.config.update({
        "TESTING": True,
        "WTF_CSRF_ENABLED": False,
        "JWT_SECRET_KEY": JWT_SECRET,
    })
    yield flask_app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def runner(app):
    return app.test_cli_runner()


class FakeRedis:
    def __init__(self):
        self.kv = {}
        self.lists = {}
        self.sets = {}

    def set(self, key, value, ex=None, nx=False):
        if nx and key in self.kv:
            return False
        if isinstance(value, str):
            value = value.encode()
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
        for value in values:
            self.lists[key].insert(0, value)
        return len(self.lists[key])

    def rpush(self, key, *values):
        if key not in self.lists:
            self.lists[key] = []
        self.lists[key].extend(values)
        return len(self.lists[key])

    def lpop(self, key):
        if key not in self.lists or not self.lists[key]:
            return None
        return self.lists[key].pop(0)

    def rpop(self, key):
        if key not in self.lists or not self.lists[key]:
            return None
        return self.lists[key].pop()

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

    def incr(self, key, amount=1):
        current = self.kv.get(key)
        if current is None:
            new_val = amount
        else:
            new_val = int(current) + amount
        self.kv[key] = str(new_val).encode() if isinstance(current, bytes) else new_val
        return new_val

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

    def scan_iter(self, match=None):
        all_keys = list(self.kv.keys()) + list(self.lists.keys()) + list(self.sets.keys())
        if match is None or match == '*':
            return iter(all_keys)
        import fnmatch
        pattern = match.replace('*', '*')        return iter([k for k in all_keys if fnmatch.fnmatch(k, pattern)])


@pytest.fixture
def mock_redis():
    fake_redis = FakeRedis()
    with patch('services.db.redis_client', fake_redis):
        yield fake_redis


class FakeMongoDB:
    def __init__(self):
        self.collections = {}

    def __getitem__(self, name):
        if name not in self.collections:
            self.collections[name] = FakeCollection(name)
        return self.collections[name]

    def list_collection_names(self):
        return list(self.collections.keys())


class FakeCollection:
    def __init__(self, name):
        self.name = name
        self.docs = []

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

    def aggregate(self, pipeline):
        results = [doc.copy() for doc in self.docs]

        for stage in pipeline:
            if '$match' in stage:
                query = stage['$match']
                results = [doc for doc in results if self._matches(doc, query)]

            elif '$addFields' in stage:
                for doc in results:
                    for field, value in stage['$addFields'].items():
                        if isinstance(value, dict) and '$toString' in value:
                            source_field = value['$toString']
                            if source_field.startswith('$'):
                                source_field = source_field[1:]
                            if source_field in doc:
                                doc[field] = str(doc[source_field])
                        elif isinstance(value, dict) and '$size' in value:
                            size_expr = value['$size']
                            if isinstance(size_expr, dict) and '$ifNull' in size_expr:
                                array_field = size_expr['$ifNull'][0]
                                default_value = size_expr['$ifNull'][1]
                                if array_field.startswith('$'):
                                    array_field = array_field[1:]
                                array_value = doc.get(array_field, default_value)
                                doc[field] = len(array_value) if array_value is not None else 0
                            elif isinstance(size_expr, str) and size_expr.startswith('$'):
                                array_field = size_expr[1:]
                                array_value = doc.get(array_field, [])
                                doc[field] = len(array_value) if array_value is not None else 0
                        else:
                            doc[field] = value

            elif '$lookup' in stage:
                lookup = stage['$lookup']
                from_coll_name = lookup['from']
                local_field = lookup['localField']
                foreign_field = lookup['foreignField']
                as_field = lookup['as']

                foreign_coll = self._get_collection_by_name(from_coll_name)

                for doc in results:
                    local_value = doc.get(local_field)
                    matches = []
                    if foreign_coll and local_value is not None:
                        for foreign_doc in foreign_coll.docs:
                            if foreign_doc.get(foreign_field) == local_value:
                                matches.append(foreign_doc.copy())
                    doc[as_field] = matches

            elif '$sort' in stage:
                sort_spec = stage['$sort']
                for field, direction in reversed(list(sort_spec.items())):
                    results.sort(key=lambda x: x.get(field, ''), reverse=(direction < 0))

            elif '$skip' in stage:
                results = results[stage['$skip']:]

            elif '$limit' in stage:
                results = results[:stage['$limit']]

            elif '$project' in stage:
                projection = stage['$project']
                new_results = []
                for doc in results:
                    new_doc = {}
                    for field, value in projection.items():
                        if value == 1:
                            if field in doc:
                                new_doc[field] = doc[field]
                        elif isinstance(value, dict) and '$toString' in value:
                            source_field = value['$toString']
                            if source_field.startswith('$'):
                                source_field = source_field[1:]
                            if source_field in doc:
                                new_doc[field] = str(doc[source_field])
                        elif isinstance(value, dict) and '$size' in value:
                            size_expr = value['$size']
                            if isinstance(size_expr, dict) and '$ifNull' in size_expr:
                                array_field = size_expr['$ifNull'][0]
                                default_value = size_expr['$ifNull'][1]
                                if array_field.startswith('$'):
                                    array_field = array_field[1:]
                                array_value = doc.get(array_field, default_value)
                                new_doc[field] = len(array_value) if array_value is not None else 0
                        else:
                            new_doc[field] = value
                    new_results.append(new_doc)
                results = new_results

            elif '$facet' in stage:
                facet_results = {}
                for facet_name, facet_pipeline in stage['$facet'].items():
                    facet_docs = [doc.copy() for doc in results]
                    for facet_stage in facet_pipeline:
                        if '$match' in facet_stage:
                            query = facet_stage['$match']
                            facet_docs = [doc for doc in facet_docs if self._matches(doc, query)]
                        elif '$sort' in facet_stage:
                            sort_spec = facet_stage['$sort']
                            for field, direction in reversed(list(sort_spec.items())):
                                facet_docs.sort(key=lambda x: x.get(field, ''), reverse=(direction < 0))
                        elif '$skip' in facet_stage:
                            facet_docs = facet_docs[facet_stage['$skip']:]
                        elif '$limit' in facet_stage:
                            facet_docs = facet_docs[:facet_stage['$limit']]
                        elif '$project' in facet_stage:
                            projection = facet_stage['$project']
                            new_docs = []
                            for doc in facet_docs:
                                new_doc = {}
                                for field, value in projection.items():
                                    if value == 1:
                                        if field in doc:
                                            new_doc[field] = doc[field]
                                    elif isinstance(value, dict) and '$toString' in value:
                                        source_field = value['$toString']
                                        if source_field.startswith('$'):
                                            source_field = source_field[1:]
                                        if source_field in doc:
                                            new_doc[field] = str(doc[source_field])
                                    else:
                                        new_doc[field] = value
                                new_docs.append(new_doc)
                            facet_docs = new_docs
                        elif '$count' in facet_stage:
                            facet_docs = [{"count": len(facet_docs)}]

                    facet_results[facet_name] = facet_docs

                results = [facet_results]

            elif '$count' in stage:
                results = [{"count": len(results)}]

        return iter(results)

    def _get_collection_by_name(self, name):
        if hasattr(self, '_parent_db'):
            return self._parent_db[name]
        return None


@pytest.fixture(scope='function')
def mock_mongodb():
    import services.db

    fake_db = FakeMongoDB()

    for coll_name in ['users', 'rooms', 'shares', 'notifications', 'invites', 'refresh_tokens', 'strokes', 'settings']:
        fake_db[coll_name]._parent_db = fake_db

    patches = [
        patch('services.db.users_coll', fake_db['users']),
        patch('services.db.rooms_coll', fake_db['rooms']),
        patch('services.db.shares_coll', fake_db['shares']),
        patch('services.db.refresh_tokens_coll', fake_db['refresh_tokens']),
        patch('services.db.strokes_coll', fake_db['strokes']),
        patch('services.db.settings_coll', fake_db['settings']),
        patch('services.db.invites_coll', fake_db['invites']),
        patch('services.db.notifications_coll', fake_db['notifications']),
    ]

    for p in patches:
        p.start()

    yield fake_db

    for p in patches:
        p.stop()


@pytest.fixture
def mock_graphql_service():
    with patch('services.graphql_service.commit_transaction_via_graphql') as mock_commit:
        mock_commit.return_value = {"success": True, "txnId": "mock-txn-123"}
        yield mock_commit


def create_test_user(username='testuser', password='Test123!', user_id=None):
    user = {
        '_id': ObjectId(user_id) if user_id else ObjectId(),
        'username': username,
        'pwd': bcrypt.hash(password),
        'createdAt': datetime.utcnow(),
        'role': 'user'
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


@pytest.fixture
def test_room(mock_mongodb, test_user):
    room = {
        '_id': ObjectId(),
        'id': f'room_{int(time.time() * 1000)}',
        'name': 'Test Room',
        'type': 'public',
        'ownerId': str(test_user['_id']),        'ownerName': test_user['username'],
        'createdBy': test_user['_id'],
        'createdAt': datetime.utcnow(),
        'members': [str(test_user['_id'])],        'settings': {
            'allowDrawing': True,
            'allowViewing': True,
            'isPublic': True,
        }
    }
    mock_mongodb['rooms'].insert_one(room)
    return room


@pytest.fixture
def private_room(mock_mongodb, test_user):
    room_key = os.urandom(32)

    room = {
        '_id': ObjectId(),
        'id': f'room_{int(time.time() * 1000)}_private',
        'name': 'Private Test Room',
        'type': 'private',
        'createdBy': test_user['_id'],
        'ownerId': str(test_user['_id']),
        'ownerName': test_user['username'],
        'createdAt': datetime.utcnow(),
        'members': [str(test_user['_id'])],
        'roomKey': room_key,
        'settings': {
            'allowDrawing': True,
            'allowViewing': True,
            'isPublic': False,
        }
    }
    mock_mongodb['rooms'].insert_one(room)
    return room


@pytest.fixture
def secure_room(mock_mongodb, test_user):
    from services.crypto_service import generate_room_key
    room_key = generate_room_key()

    room = {
        '_id': ObjectId(),
        'id': f'room_{int(time.time() * 1000)}_secure',
        'name': 'Secure Test Room',
        'type': 'secure',
        'createdBy': test_user['_id'],
        'createdAt': datetime.utcnow(),
        'members': [test_user['_id']],
        'roomKey': room_key,
        'settings': {
            'allowDrawing': True,
            'allowViewing': True,
            'isPublic': False,
            'requireWallet': True,
        }
    }
    mock_mongodb['rooms'].insert_one(room)
    return room


@pytest.fixture
def test_stroke_data():
    ts = int(time.time() * 1000)
    return {
        'id': f'stroke_{ts}',
        'drawingId': f'drawing_{ts}',
        'user': f'testuser|{ts}',
        'color': '#FF0000',
        'lineWidth': 5,
        'pathData': [[10, 20], [30, 40], [50, 60]],
        'timestamp': ts,
        'brushStyle': 'round',
        'order': ts,
    }


@pytest.fixture(autouse=True)
def reset_mocks(mock_redis, mock_mongodb):
    yield
    mock_redis.flushdb()
    for coll_name in list(mock_mongodb.collections.keys()):
        mock_mongodb.collections[coll_name].docs.clear()



@pytest.fixture
def mongo_setup(mock_mongodb):
    yield
    try:
        users_coll = mock_mongodb['users']
        rooms_coll = mock_mongodb['rooms']
        shares_coll = mock_mongodb['shares']
        notifications_coll = mock_mongodb['notifications']
        invites_coll = mock_mongodb['invites']

        users_coll.delete_many({"username": {"$regex": "^test"}})
        rooms_coll.delete_many({"name": {"$regex": "^Test"}})
        rooms_coll.delete_many({"name": {"$regex": "^Room"}})
        shares_coll.delete_many({})
        notifications_coll.delete_many({})
        invites_coll.delete_many({})
    except Exception as e:
        print(f"Cleanup error: {e}")


@pytest.fixture
def auth_token_v1(client, mongo_setup):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser",
            "password": "testpass123"
        }
    )
    if response.status_code == 201 and "token" in response.json:
        return response.json["token"]
    response = client.post(
        "/api/v1/auth/login",
        json={
            "username": "testuser",
            "password": "testpass123"
        }
    )
    if response.status_code == 200 and "token" in response.json:
        return response.json["token"]
    return None


@pytest.fixture
def auth_token_v1_user2(client, mongo_setup):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser2",
            "password": "testpass123"
        }
    )
    if response.status_code == 201 and "token" in response.json:
        return response.json["token"]
    response = client.post(
        "/api/v1/auth/login",
        json={
            "username": "testuser2",
            "password": "testpass123"
        }
    )
    if response.status_code == 200 and "token" in response.json:
        return response.json["token"]
    return None


@pytest.fixture
def test_room_v1(client, mongo_setup, auth_token_v1):
    if not auth_token_v1:
        return None
    response = client.post(
        "/api/v1/rooms",
        headers={"Authorization": f"Bearer {auth_token_v1}"},
        json={
            "name": "Test Room",
            "type": "public",
            "description": "Test room for testing"
        }
    )
    if response.status_code == 201 and "room" in response.json:
        return response.json["room"]["id"]
    return None


@pytest.fixture
def test_room_v1_shared(client, mongo_setup, auth_token_v1, auth_token_v1_user2):
    if not auth_token_v1 or not auth_token_v1_user2:
        return None
    response = client.post(
        "/api/v1/rooms",
        headers={"Authorization": f"Bearer {auth_token_v1}"},
        json={
            "name": "Shared Room",
            "type": "public"
        }
    )
    if response.status_code != 201 or "room" not in response.json:
        return None
    room_id = response.json["room"]["id"]

    client.post(
        f"/api/v1/rooms/{room_id}/share",
        headers={"Authorization": f"Bearer {auth_token_v1}"},
        json={
            "users": [{"username": "testuser2", "role": "editor"}]
        }
    )

    return room_id


@pytest.fixture
def test_notification_v1(client, mongo_setup, auth_token_v1, mock_mongodb):
    if not auth_token_v1:
        return None

    import jwt
    from config import JWT_SECRET
    claims = jwt.decode(auth_token_v1, JWT_SECRET, algorithms=["HS256"])
    user_id = claims["sub"]

    notifications_coll = mock_mongodb['notifications']
    notification = {
        "_id": ObjectId(),
        "userId": user_id,        "type": "test",
        "message": "Test notification",
        "read": False,
        "createdAt": datetime.utcnow()
    }
    notifications_coll.insert_one(notification)
    return str(notification["_id"])


@pytest.fixture
def private_room_v1(client, mongo_setup, auth_token_v1):
    if not auth_token_v1:
        return None
    response = client.post(
        "/api/v1/rooms",
        headers={"Authorization": f"Bearer {auth_token_v1}"},
        json={
            "name": "Private Room",
            "type": "private"
        }
    )
    if response.status_code == 201 and "room" in response.json:
        return response.json["room"]["id"]
    return None
