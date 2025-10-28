
import pytest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


class TestAPIv1Auth:

    def test_register_success(self, client, mongo_setup):
        import uuid
        unique_username = f"testregister_{uuid.uuid4().hex[:8]}"
        response = client.post('/api/v1/auth/register', json={
            "username": unique_username,
            "password": "password123"
        })

        assert response.status_code == 201
        assert "token" in response.json
        assert response.json["user"]["username"] == unique_username

    def test_register_validation_errors(self, client, mongo_setup):
        response = client.post('/api/v1/auth/register', json={
            "password": "password123"
        })
        assert response.status_code in [400, 422]

        response = client.post('/api/v1/auth/register', json={
            "username": "newuser"
        })
        assert response.status_code in [400, 422]

    def test_register_duplicate_username(self, client, mongo_setup, auth_token_v1):
        response = client.post('/api/v1/auth/register', json={
            "username": "testuser",
            "password": "password123"
        })

        assert response.status_code in [400, 409]

    def test_login_success(self, client, mongo_setup, auth_token_v1):
        response = client.post('/api/v1/auth/login', json={
            "username": "testuser",
            "password": "testpass123"
        })

        assert response.status_code == 200
        assert "token" in response.json
        assert response.json["user"]["username"] == "testuser"

    def test_login_invalid_credentials(self, client, mongo_setup, auth_token_v1):
        response = client.post('/api/v1/auth/login', json={
            "username": "testuser",
            "password": "wrongpassword"
        })

        assert response.status_code == 401

    def test_logout(self, client, mongo_setup, auth_token_v1):
        response = client.post('/api/v1/auth/logout', 
                              headers={"Authorization": f"Bearer {auth_token_v1}"})

        assert response.status_code == 200

    def test_get_me_authenticated(self, client, mongo_setup, auth_token_v1):
        response = client.get('/api/v1/auth/me', 
                            headers={"Authorization": f"Bearer {auth_token_v1}"})

        assert response.status_code == 200
        assert response.json["user"]["username"] == "testuser"

    def test_get_me_unauthenticated(self, client, mongo_setup):
        response = client.get('/api/v1/auth/me')

        assert response.status_code == 401


class TestAPIv1Rooms:

    def test_create_room_success(self, client, mongo_setup, auth_token_v1):
        response = client.post(
            '/api/v1/rooms',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={
                "name": "New Room",
                "type": "public",
                "description": "Test room"
            }
        )

        assert response.status_code == 201
        assert response.json["room"]["name"] == "New Room"
        assert "id" in response.json["room"]

    def test_create_room_unauthorized(self, client, mongo_setup):
        response = client.post('/api/v1/rooms', json={"name": "New Room"})
        assert response.status_code == 401

    def test_list_rooms(self, client, mongo_setup, auth_token_v1, test_room_v1):
        assert test_room_v1 is not None, "test_room_v1 fixture failed to create room"

        response = client.get(
            '/api/v1/rooms',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code == 200
        assert "rooms" in response.json
        room_ids = [r.get("id") for r in response.json["rooms"]]
        assert test_room_v1 in room_ids, f"Created room {test_room_v1} not in list: {room_ids}"

    def test_get_room_details(self, client, mongo_setup, auth_token_v1, test_room_v1):
        response = client.get(
            f'/api/v1/rooms/{test_room_v1}',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code == 200
        assert response.json["room"]["id"] == test_room_v1

    def test_update_room(self, client, mongo_setup, auth_token_v1, test_room_v1):
        response = client.patch(
            f'/api/v1/rooms/{test_room_v1}',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"name": "Updated Room Name"}
        )

        assert response.status_code == 200
        assert response.json["room"]["name"] == "Updated Room Name"

    def test_delete_room(self, client, mongo_setup, auth_token_v1):
        create_response = client.post(
            '/api/v1/rooms',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"name": "Room to Delete", "type": "public"}
        )
        room_id = create_response.json["room"]["id"]

        response = client.delete(
            f'/api/v1/rooms/{room_id}',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code == 200

    def test_post_stroke(self, client, mongo_setup, auth_token_v1, test_room_v1):
        stroke_data = {
            "stroke": {
                "pathData": [[10, 20], [30, 40]],
                "color": "#000000",
                "lineWidth": 2
            }
        }

        response = client.post(
            f'/api/v1/rooms/{test_room_v1}/strokes',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json=stroke_data
        )

        assert response.status_code in [200, 201]

    def test_get_strokes(self, client, mongo_setup, auth_token_v1, test_room_v1):
        stroke_data = {
            "stroke": {
                "pathData": [[10, 20], [30, 40]],
                "color": "#000000",
                "lineWidth": 2
            }
        }
        client.post(
            f'/api/v1/rooms/{test_room_v1}/strokes',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json=stroke_data
        )

        response = client.get(
            f'/api/v1/rooms/{test_room_v1}/strokes',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code == 200
        assert "strokes" in response.json

    def test_undo(self, client, mongo_setup, auth_token_v1, test_room_v1):
        stroke_data = {
            "points": [[10, 20], [30, 40]],
            "color": "#000000",
            "width": 2
        }
        client.post(
            f'/api/v1/rooms/{test_room_v1}/strokes',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json=stroke_data
        )

        response = client.post(
            f'/api/v1/rooms/{test_room_v1}/undo',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code == 200

    def test_redo(self, client, mongo_setup, auth_token_v1, test_room_v1):
        response = client.post(
            f'/api/v1/rooms/{test_room_v1}/redo',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code in [200, 400]

    def test_clear_canvas(self, client, mongo_setup, auth_token_v1, test_room_v1):
        response = client.post(
            f'/api/v1/rooms/{test_room_v1}/clear',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code == 200

    def test_share_room(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1):
        response = client.post(
            f'/api/v1/rooms/{test_room_v1}/share',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={
                "users": [{"username": "testuser2", "role": "editor"}]
            }
        )

        assert response.status_code in [200, 201]

    def test_get_room_members(self, client, mongo_setup, auth_token_v1, test_room_v1_shared):
        response = client.get(
            f'/api/v1/rooms/{test_room_v1_shared}/members',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code == 200
        assert "members" in response.json

    def test_update_permissions(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1_shared):
        import jwt
        from config import JWT_SECRET
        user2_claims = jwt.decode(auth_token_v1_user2, JWT_SECRET, algorithms=["HS256"])

        response = client.patch(
            f'/api/v1/rooms/{test_room_v1_shared}/permissions',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"userId": user2_claims["sub"], "role": "viewer"}
        )

        assert response.status_code in [200, 204]

    def test_remove_member(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1_shared):
        import jwt
        from config import JWT_SECRET
        user2_claims = jwt.decode(auth_token_v1_user2, JWT_SECRET, algorithms=["HS256"])

        response = client.patch(
            f'/api/v1/rooms/{test_room_v1_shared}/permissions',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"userId": user2_claims["sub"], "role": None}
        )

        assert response.status_code in [200, 204]

    def test_leave_room(self, client, mongo_setup, auth_token_v1_user2, test_room_v1_shared):
        response = client.post(
            f'/api/v1/rooms/{test_room_v1_shared}/leave',
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )

        assert response.status_code == 200

    def test_unauthorized_room_access(self, client, mongo_setup, auth_token_v1_user2, private_room_v1):
        response = client.get(
            f'/api/v1/rooms/{private_room_v1}',
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )

        assert response.status_code in [403, 404]


class TestAPIv1Invites:

    def test_list_invites(self, client, mongo_setup, auth_token_v1):
        response = client.get(
            '/api/v1/invites',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code == 200
        assert "invites" in response.json

    def test_accept_invite(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1):
        client.post(
            f'/api/v1/rooms/{test_room_v1}/share',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"users": [{"username": "testuser2", "role": "editor"}]}
        )

        invites_response = client.get(
            '/api/v1/invites',
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )

        if invites_response.json.get("invites"):
            invite_id = invites_response.json["invites"][0]["id"]

            response = client.post(
                f'/api/v1/invites/{invite_id}/accept',
                headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
            )

            assert response.status_code in [200, 204]

    def test_decline_invite(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1):
        client.post(
            f'/api/v1/rooms/{test_room_v1}/share',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"users": [{"username": "testuser2", "role": "editor"}]}
        )

        invites_response = client.get(
            '/api/v1/invites',
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )

        if invites_response.json.get("invites"):
            invite_id = invites_response.json["invites"][0]["id"]

            response = client.post(
                f'/api/v1/invites/{invite_id}/decline',
                headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
            )

            assert response.status_code in [200, 204]


class TestAPIv1Notifications:

    def test_list_notifications(self, client, mongo_setup, auth_token_v1):
        response = client.get(
            '/api/v1/notifications',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code == 200
        assert "notifications" in response.json

    def test_mark_notification_read(self, client, mongo_setup, auth_token_v1, test_notification_v1):
        response = client.post(
            f'/api/v1/notifications/{test_notification_v1}/mark-read',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code in [200, 204]

    def test_delete_notification(self, client, mongo_setup, auth_token_v1, test_notification_v1):
        response = client.delete(
            f'/api/v1/notifications/{test_notification_v1}',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code in [200, 204]

    def test_clear_all_notifications(self, client, mongo_setup, auth_token_v1):
        response = client.delete(
            '/api/v1/notifications',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code in [200, 204]

    def test_get_notification_preferences(self, client, mongo_setup, auth_token_v1):
        pytest.skip("Notification preferences endpoint not implemented")
        response = client.get(
            '/api/v1/notifications/preferences',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code == 200

    def test_update_notification_preferences(self, client, mongo_setup, auth_token_v1):
        pytest.skip("Notification preferences endpoint not implemented")
        response = client.put(
            '/api/v1/notifications/preferences',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"emailNotifications": False}
        )

        assert response.status_code in [200, 204]


class TestAPIv1Users:

    def test_search_users(self, client, mongo_setup, auth_token_v1):
        response = client.get(
            '/api/v1/users/search?q=test',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code == 200
        assert "users" in response.json

    def test_suggest_users(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2):
        response = client.get(
            '/api/v1/users/suggest',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        assert response.status_code == 200
        assert "suggestions" in response.json
