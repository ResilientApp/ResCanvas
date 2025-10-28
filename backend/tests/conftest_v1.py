
import pytest
import sys
import os
from datetime import datetime
from bson import ObjectId

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import app as flask_app
from services.db import users_coll, rooms_coll, shares_coll, notifications_coll, invites_coll, redis_client


@pytest.fixture
def app():
    flask_app.config['TESTING'] = True
    flask_app.config['WTF_CSRF_ENABLED'] = False
    return flask_app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def mongo_setup():
    yield
    try:
        users_coll.delete_many({"username": {"$regex": "^test"}})
        rooms_coll.delete_many({"name": {"$regex": "^Test"}})
        rooms_coll.delete_many({"name": {"$regex": "^Room"}})
        shares_coll.delete_many({})
        notifications_coll.delete_many({})
        invites_coll.delete_many({})
        redis_client.flushdb()
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
    return response.json["token"]


@pytest.fixture
def auth_token_v1_user2(client, mongo_setup):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "username": "testuser2",
            "password": "testpass123"
        }
    )
    return response.json["token"]


@pytest.fixture
def test_room_v1(client, mongo_setup, auth_token_v1):
    response = client.post(
        "/api/v1/rooms",
        headers={"Authorization": f"Bearer {auth_token_v1}"},
        json={
            "name": "Test Room",
            "type": "public",
            "description": "Test room for testing"
        }
    )
    return response.json["room"]["id"]


@pytest.fixture
def test_room_v1_shared(client, mongo_setup, auth_token_v1, auth_token_v1_user2):
    response = client.post(
        "/api/v1/rooms",
        headers={"Authorization": f"Bearer {auth_token_v1}"},
        json={
            "name": "Shared Room",
            "type": "public"
        }
    )
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
def test_notification_v1(client, mongo_setup, auth_token_v1):
    user = users_coll.find_one({"username": "testuser"})

    notification = {
        "userId": user["_id"],
        "type": "test",
        "message": "Test notification",
        "read": False,
        "createdAt": datetime.utcnow()
    }
    result = notifications_coll.insert_one(notification)
    return str(result.inserted_id)


@pytest.fixture
def private_room_v1(client, mongo_setup, auth_token_v1):
    response = client.post(
        "/api/v1/rooms",
        headers={"Authorization": f"Bearer {auth_token_v1}"},
        json={
            "name": "Private Room",
            "type": "private"
        }
    )
    return response.json["room"]["id"]
