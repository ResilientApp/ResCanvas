"""
Comprehensive test suite for API v1 endpoints

Tests all versioned API endpoints:
- /api/v1/auth/* (authentication and user management)
- /api/v1/rooms/* (room management, strokes, undo/redo)
- /api/v1/invites/* (room invitations)
- /api/v1/notifications/* (user notifications)
- /api/v1/users/* (user search and suggestions)
"""

import pytest
import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))


class TestAPIv1Auth:
    """Test suite for /api/v1/auth/* endpoints"""
    
    def test_register_success(self, client, mongo_setup):
        """Test user registration with valid data"""
        response = client.post('/api/v1/auth/register', json={
            "username": "testregister",
            "password": "password123"
        })
        
        assert response.status_code == 201
        assert "token" in response.json
        assert response.json["user"]["username"] == "testregister"
    
    def test_register_validation_errors(self, client, mongo_setup):
        """Test registration validation errors"""
        # Missing username
        response = client.post('/api/v1/auth/register', json={
            "password": "password123"
        })
        assert response.status_code in [400, 422]
        
        # Missing password
        response = client.post('/api/v1/auth/register', json={
            "username": "newuser"
        })
        assert response.status_code in [400, 422]
    
    def test_register_duplicate_username(self, client, mongo_setup, auth_token_v1):
        """Test registration with duplicate username"""
        response = client.post('/api/v1/auth/register', json={
            "username": "testuser",
            "password": "password123"
        })
        
        assert response.status_code in [400, 409]
    
    def test_login_success(self, client, mongo_setup, auth_token_v1):
        """Test login with valid credentials"""
        response = client.post('/api/v1/auth/login', json={
            "username": "testuser",
            "password": "testpass123"
        })
        
        assert response.status_code == 200
        assert "token" in response.json
        assert response.json["user"]["username"] == "testuser"
    
    def test_login_invalid_credentials(self, client, mongo_setup, auth_token_v1):
        """Test login with invalid credentials"""
        response = client.post('/api/v1/auth/login', json={
            "username": "testuser",
            "password": "wrongpassword"
        })
        
        assert response.status_code == 401
    
    def test_logout(self, client, mongo_setup, auth_token_v1):
        """Test logout endpoint"""
        response = client.post('/api/v1/auth/logout', 
                              headers={"Authorization": f"Bearer {auth_token_v1}"})
        
        assert response.status_code == 200
    
    def test_get_me_authenticated(self, client, mongo_setup, auth_token_v1):
        """Test getting current user info when authenticated"""
        response = client.get('/api/v1/auth/me', 
                            headers={"Authorization": f"Bearer {auth_token_v1}"})
        
        assert response.status_code == 200
        assert response.json["username"] == "testuser"
    
    def test_get_me_unauthenticated(self, client, mongo_setup):
        """Test getting current user info without authentication"""
        response = client.get('/api/v1/auth/me')
        
        assert response.status_code == 401


class TestAPIv1Rooms:
    """Test suite for /api/v1/rooms/* endpoints"""
    
    def test_create_room_success(self, client, mongo_setup, auth_token_v1):
        """Test creating a new room"""
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
        """Test creating room without authentication"""
        response = client.post('/api/v1/rooms', json={"name": "New Room"})
        assert response.status_code == 401
    
    def test_list_rooms(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test listing rooms"""
        response = client.get(
            '/api/v1/rooms',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
        assert "rooms" in response.json
        assert len(response.json["rooms"]) >= 1
    
    def test_get_room_details(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test getting room details"""
        response = client.get(
            f'/api/v1/rooms/{test_room_v1}',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
        assert response.json["room"]["id"] == test_room_v1
    
    def test_update_room(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test updating room details"""
        response = client.put(
            f'/api/v1/rooms/{test_room_v1}',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"name": "Updated Room Name"}
        )
        
        assert response.status_code == 200
        assert response.json["room"]["name"] == "Updated Room Name"
    
    def test_delete_room(self, client, mongo_setup, auth_token_v1):
        """Test deleting a room"""
        # Create room first
        create_response = client.post(
            '/api/v1/rooms',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"name": "Room to Delete", "type": "public"}
        )
        room_id = create_response.json["room"]["id"]
        
        # Delete room
        response = client.delete(
            f'/api/v1/rooms/{room_id}',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
    
    def test_post_stroke(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test posting a stroke to a room"""
        stroke_data = {
            "points": [[10, 20], [30, 40]],
            "color": "#000000",
            "width": 2
        }
        
        response = client.post(
            f'/api/v1/rooms/{test_room_v1}/strokes',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json=stroke_data
        )
        
        assert response.status_code in [200, 201]
    
    def test_get_strokes(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test getting strokes from a room"""
        # Post a stroke first
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
        
        # Get strokes
        response = client.get(
            f'/api/v1/rooms/{test_room_v1}/strokes',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
        assert "strokes" in response.json
    
    def test_undo(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test undo operation"""
        # Post a stroke first
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
        
        # Undo
        response = client.post(
            f'/api/v1/rooms/{test_room_v1}/undo',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
    
    def test_redo(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test redo operation"""
        response = client.post(
            f'/api/v1/rooms/{test_room_v1}/redo',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        # May return 400 if nothing to redo
        assert response.status_code in [200, 400]
    
    def test_clear_canvas(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test clearing canvas"""
        response = client.post(
            f'/api/v1/rooms/{test_room_v1}/clear',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
    
    def test_share_room(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1):
        """Test sharing room with another user"""
        response = client.post(
            f'/api/v1/rooms/{test_room_v1}/share',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={
                "users": [{"username": "testuser2", "role": "editor"}]
            }
        )
        
        assert response.status_code in [200, 201]
    
    def test_get_room_members(self, client, mongo_setup, auth_token_v1, test_room_v1_shared):
        """Test getting room members"""
        response = client.get(
            f'/api/v1/rooms/{test_room_v1_shared}/members',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
        assert "members" in response.json
    
    def test_update_permissions(self, client, mongo_setup, auth_token_v1, test_room_v1_shared):
        """Test updating user permissions"""
        response = client.put(
            f'/api/v1/rooms/{test_room_v1_shared}/members/testuser2',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"role": "viewer"}
        )
        
        assert response.status_code in [200, 204]
    
    def test_remove_member(self, client, mongo_setup, auth_token_v1, test_room_v1_shared):
        """Test removing a member from room"""
        response = client.delete(
            f'/api/v1/rooms/{test_room_v1_shared}/members/testuser2',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code in [200, 204]
    
    def test_leave_room(self, client, mongo_setup, auth_token_v1_user2, test_room_v1_shared):
        """Test leaving a shared room"""
        response = client.post(
            f'/api/v1/rooms/{test_room_v1_shared}/leave',
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )
        
        assert response.status_code == 200
    
    def test_unauthorized_room_access(self, client, mongo_setup, auth_token_v1_user2, private_room_v1):
        """Test accessing private room without permission"""
        response = client.get(
            f'/api/v1/rooms/{private_room_v1}',
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )
        
        assert response.status_code in [403, 404]


class TestAPIv1Invites:
    """Test suite for /api/v1/invites/* endpoints"""
    
    def test_list_invites(self, client, mongo_setup, auth_token_v1):
        """Test listing invitations"""
        response = client.get(
            '/api/v1/invites',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
        assert "invites" in response.json
    
    def test_accept_invite(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1):
        """Test accepting an invitation"""
        # Share room to create invite
        client.post(
            f'/api/v1/rooms/{test_room_v1}/share',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"users": [{"username": "testuser2", "role": "editor"}]}
        )
        
        # Get invites for user2
        invites_response = client.get(
            '/api/v1/invites',
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )
        
        if invites_response.json.get("invites"):
            invite_id = invites_response.json["invites"][0]["id"]
            
            # Accept invite
            response = client.post(
                f'/api/v1/invites/{invite_id}/accept',
                headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
            )
            
            assert response.status_code in [200, 204]
    
    def test_decline_invite(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1):
        """Test declining an invitation"""
        # Share room to create invite
        client.post(
            f'/api/v1/rooms/{test_room_v1}/share',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"users": [{"username": "testuser2", "role": "editor"}]}
        )
        
        # Get invites for user2
        invites_response = client.get(
            '/api/v1/invites',
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )
        
        if invites_response.json.get("invites"):
            invite_id = invites_response.json["invites"][0]["id"]
            
            # Decline invite
            response = client.post(
                f'/api/v1/invites/{invite_id}/decline',
                headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
            )
            
            assert response.status_code in [200, 204]


class TestAPIv1Notifications:
    """Test suite for /api/v1/notifications/* endpoints"""
    
    def test_list_notifications(self, client, mongo_setup, auth_token_v1):
        """Test listing notifications"""
        response = client.get(
            '/api/v1/notifications',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
        assert "notifications" in response.json
    
    def test_mark_notification_read(self, client, mongo_setup, auth_token_v1, test_notification_v1):
        """Test marking notification as read"""
        response = client.put(
            f'/api/v1/notifications/{test_notification_v1}',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"read": True}
        )
        
        assert response.status_code in [200, 204]
    
    def test_delete_notification(self, client, mongo_setup, auth_token_v1, test_notification_v1):
        """Test deleting a notification"""
        response = client.delete(
            f'/api/v1/notifications/{test_notification_v1}',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code in [200, 204]
    
    def test_clear_all_notifications(self, client, mongo_setup, auth_token_v1):
        """Test clearing all notifications"""
        response = client.delete(
            '/api/v1/notifications',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code in [200, 204]
    
    def test_get_notification_preferences(self, client, mongo_setup, auth_token_v1):
        """Test getting notification preferences"""
        response = client.get(
            '/api/v1/notifications/preferences',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
    
    def test_update_notification_preferences(self, client, mongo_setup, auth_token_v1):
        """Test updating notification preferences"""
        response = client.put(
            '/api/v1/notifications/preferences',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"emailNotifications": False}
        )
        
        assert response.status_code in [200, 204]


class TestAPIv1Users:
    """Test suite for /api/v1/users/* endpoints"""
    
    def test_search_users(self, client, mongo_setup, auth_token_v1):
        """Test searching for users"""
        response = client.get(
            '/api/v1/users/search?q=test',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
        assert "users" in response.json
    
    def test_suggest_users(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2):
        """Test getting user suggestions"""
        response = client.get(
            '/api/v1/users/suggest',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
        assert "users" in response.json

import pytest
import json
import time
from datetime import datetime, timedelta
from bson import ObjectId

# Test configuration
API_V1_BASE = "/api/v1"


class TestAuthV1:
    """Tests for /api/v1/auth/* endpoints"""

    def test_register_success(self, client, mongo_setup):
        """Test successful user registration"""
        response = client.post(
            f"{API_V1_BASE}/auth/register",
            json={
                "username": "testuser_v1",
                "password": "testpass123",
                "walletPubKey": "test_wallet_key"
            }
        )
        assert response.status_code == 201
        data = response.json
        assert data["status"] == "ok"
        assert "token" in data
        assert data["user"]["username"] == "testuser_v1"
        assert data["user"]["walletPubKey"] == "test_wallet_key"

    def test_register_duplicate_username(self, client, mongo_setup):
        """Test registration with duplicate username fails"""
        # Register first user
        client.post(
            f"{API_V1_BASE}/auth/register",
            json={"username": "duplicate_v1", "password": "pass123"}
        )
        
        # Try to register same username again
        response = client.post(
            f"{API_V1_BASE}/auth/register",
            json={"username": "duplicate_v1", "password": "pass456"}
        )
        assert response.status_code == 409
        assert "taken" in response.json["message"].lower()

    def test_register_validation_errors(self, client, mongo_setup):
        """Test registration validation"""
        # Too short username
        response = client.post(
            f"{API_V1_BASE}/auth/register",
            json={"username": "ab", "password": "pass123"}
        )
        assert response.status_code == 400

        # Too short password
        response = client.post(
            f"{API_V1_BASE}/auth/register",
            json={"username": "validuser", "password": "12345"}
        )
        assert response.status_code == 400

    def test_login_success(self, client, mongo_setup):
        """Test successful login"""
        # Register user first
        client.post(
            f"{API_V1_BASE}/auth/register",
            json={"username": "loginuser_v1", "password": "loginpass123"}
        )
        
        # Login
        response = client.post(
            f"{API_V1_BASE}/auth/login",
            json={"username": "loginuser_v1", "password": "loginpass123"}
        )
        assert response.status_code == 200
        data = response.json
        assert data["status"] == "ok"
        assert "token" in data
        assert data["user"]["username"] == "loginuser_v1"

    def test_login_invalid_credentials(self, client, mongo_setup):
        """Test login with invalid credentials"""
        response = client.post(
            f"{API_V1_BASE}/auth/login",
            json={"username": "nonexistent", "password": "wrongpass"}
        )
        assert response.status_code == 401
        assert "invalid" in response.json["message"].lower()

    def test_get_me(self, client, mongo_setup, auth_token_v1):
        """Test getting current user information"""
        response = client.get(
            f"{API_V1_BASE}/auth/me",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200
        data = response.json
        assert data["status"] == "ok"
        assert "user" in data
        assert data["user"]["username"] == "testuser"

    def test_get_me_unauthorized(self, client, mongo_setup):
        """Test getting user info without authentication"""
        response = client.get(f"{API_V1_BASE}/auth/me")
        assert response.status_code == 401

    def test_change_password(self, client, mongo_setup, auth_token_v1):
        """Test changing password"""
        response = client.post(
            f"{API_V1_BASE}/auth/change-password",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"password": "newpassword123"}
        )
        assert response.status_code == 200
        assert response.json["status"] == "ok"

        # Verify old password no longer works
        login_response = client.post(
            f"{API_V1_BASE}/auth/login",
            json={"username": "testuser", "password": "testpass123"}
        )
        assert login_response.status_code == 401

        # Verify new password works
        login_response = client.post(
            f"{API_V1_BASE}/auth/login",
            json={"username": "testuser", "password": "newpassword123"}
        )
        assert login_response.status_code == 200

    def test_logout(self, client, mongo_setup, auth_token_v1):
        """Test logout"""
        response = client.post(
            f"{API_V1_BASE}/auth/logout",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200
        assert response.json["status"] == "ok"


class TestRoomsV1:
    """Tests for /api/v1/rooms/* endpoints"""

    def test_create_room_success(self, client, mongo_setup, auth_token_v1):
        """Test creating a room"""
        response = client.post(
            f"{API_V1_BASE}/rooms",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={
                "name": "Test Room V1",
                "type": "public",
                "description": "Test description"
            }
        )
        assert response.status_code == 201
        data = response.json
        assert data["status"] == "ok"
        assert "room" in data
        assert data["room"]["name"] == "Test Room V1"
        assert data["room"]["type"] == "public"

    def test_create_room_validation(self, client, mongo_setup, auth_token_v1):
        """Test room creation validation"""
        # Missing name
        response = client.post(
            f"{API_V1_BASE}/rooms",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"type": "public"}
        )
        assert response.status_code == 400

        # Invalid type
        response = client.post(
            f"{API_V1_BASE}/rooms",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"name": "Test", "type": "invalid"}
        )
        assert response.status_code == 400

    def test_list_rooms(self, client, mongo_setup, auth_token_v1):
        """Test listing rooms"""
        # Create some rooms first
        for i in range(3):
            client.post(
                f"{API_V1_BASE}/rooms",
                headers={"Authorization": f"Bearer {auth_token_v1}"},
                json={"name": f"Room {i}", "type": "public"}
            )

        response = client.get(
            f"{API_V1_BASE}/rooms",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200
        data = response.json
        assert "rooms" in data
        assert len(data["rooms"]) >= 3

    def test_get_room_details(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test getting room details"""
        response = client.get(
            f"{API_V1_BASE}/rooms/{test_room_v1}",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200
        data = response.json
        assert "room" in data

    def test_update_room(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test updating room"""
        response = client.patch(
            f"{API_V1_BASE}/rooms/{test_room_v1}",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"name": "Updated Room Name"}
        )
        assert response.status_code == 200
        data = response.json
        assert data["room"]["name"] == "Updated Room Name"

    def test_delete_room(self, client, mongo_setup, auth_token_v1):
        """Test deleting room"""
        # Create a room
        create_response = client.post(
            f"{API_V1_BASE}/rooms",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"name": "To Delete", "type": "public"}
        )
        room_id = create_response.json["room"]["id"]

        # Delete it
        response = client.delete(
            f"{API_V1_BASE}/rooms/{room_id}",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200

        # Verify it's deleted
        get_response = client.get(
            f"{API_V1_BASE}/rooms/{room_id}",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert get_response.status_code == 404

    def test_share_room(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1):
        """Test sharing room with users"""
        response = client.post(
            f"{API_V1_BASE}/rooms/{test_room_v1}/share",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={
                "users": [
                    {"username": "testuser2", "role": "editor"}
                ]
            }
        )
        assert response.status_code == 200
        data = response.json
        assert data["status"] == "ok"

    def test_get_room_members(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test getting room members"""
        response = client.get(
            f"{API_V1_BASE}/rooms/{test_room_v1}/members",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200
        data = response.json
        assert "members" in data

    def test_submit_stroke(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test submitting a drawing stroke"""
        response = client.post(
            f"{API_V1_BASE}/rooms/{test_room_v1}/strokes",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={
                "pathData": [{"x": 0, "y": 0}, {"x": 100, "y": 100}],
                "color": "#000000",
                "lineWidth": 2,
                "user": "testuser"
            }
        )
        assert response.status_code == 200
        data = response.json
        assert data["status"] == "ok"

    def test_get_strokes(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test getting room strokes"""
        # Submit a stroke first
        client.post(
            f"{API_V1_BASE}/rooms/{test_room_v1}/strokes",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={
                "pathData": [{"x": 0, "y": 0}, {"x": 50, "y": 50}],
                "color": "#FF0000",
                "lineWidth": 3
            }
        )

        # Get strokes
        response = client.get(
            f"{API_V1_BASE}/rooms/{test_room_v1}/strokes",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200
        data = response.json
        assert "strokes" in data

    def test_undo_stroke(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test undoing a stroke"""
        # Submit a stroke first
        client.post(
            f"{API_V1_BASE}/rooms/{test_room_v1}/strokes",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={
                "pathData": [{"x": 0, "y": 0}, {"x": 100, "y": 100}],
                "color": "#000000",
                "lineWidth": 2
            }
        )

        # Undo it
        response = client.post(
            f"{API_V1_BASE}/rooms/{test_room_v1}/undo",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200

    def test_redo_stroke(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test redoing a stroke"""
        # Submit and undo a stroke
        client.post(
            f"{API_V1_BASE}/rooms/{test_room_v1}/strokes",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={
                "pathData": [{"x": 0, "y": 0}, {"x": 100, "y": 100}],
                "color": "#000000",
                "lineWidth": 2
            }
        )
        client.post(
            f"{API_V1_BASE}/rooms/{test_room_v1}/undo",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )

        # Redo it
        response = client.post(
            f"{API_V1_BASE}/rooms/{test_room_v1}/redo",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200

    def test_clear_room(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test clearing room canvas"""
        # Submit some strokes first
        for i in range(3):
            client.post(
                f"{API_V1_BASE}/rooms/{test_room_v1}/strokes",
                headers={"Authorization": f"Bearer {auth_token_v1}"},
                json={
                    "pathData": [{"x": i*10, "y": i*10}, {"x": i*20, "y": i*20}],
                    "color": "#000000",
                    "lineWidth": 2
                }
            )

        # Clear canvas
        response = client.post(
            f"{API_V1_BASE}/rooms/{test_room_v1}/clear",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200
        assert "clearedAt" in response.json

    def test_invite_user(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test inviting user to room"""
        # Create second user first
        client.post(
            f"{API_V1_BASE}/auth/register",
            json={"username": "invitee", "password": "pass123"}
        )

        response = client.post(
            f"{API_V1_BASE}/rooms/{test_room_v1}/invite",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"username": "invitee", "role": "editor"}
        )
        assert response.status_code == 201
        assert "inviteId" in response.json

    def test_leave_room(self, client, mongo_setup, auth_token_v1_user2, test_room_v1_shared):
        """Test leaving a room"""
        response = client.post(
            f"{API_V1_BASE}/rooms/{test_room_v1_shared}/leave",
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )
        assert response.status_code == 200


class TestInvitesV1:
    """Tests for /api/v1/invites/* endpoints"""

    def test_list_invites(self, client, mongo_setup, auth_token_v1_user2):
        """Test listing user invitations"""
        response = client.get(
            f"{API_V1_BASE}/invites",
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )
        assert response.status_code == 200
        assert "invites" in response.json

    def test_accept_invite(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1):
        """Test accepting an invitation"""
        # Create invitation
        invite_response = client.post(
            f"{API_V1_BASE}/rooms/{test_room_v1}/invite",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"username": "testuser2", "role": "editor"}
        )
        invite_id = invite_response.json["inviteId"]

        # Accept invitation
        response = client.post(
            f"{API_V1_BASE}/invites/{invite_id}/accept",
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )
        assert response.status_code == 200

    def test_decline_invite(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1):
        """Test declining an invitation"""
        # Create invitation
        invite_response = client.post(
            f"{API_V1_BASE}/rooms/{test_room_v1}/invite",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"username": "testuser2", "role": "editor"}
        )
        invite_id = invite_response.json["inviteId"]

        # Decline invitation
        response = client.post(
            f"{API_V1_BASE}/invites/{invite_id}/decline",
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )
        assert response.status_code == 200


class TestNotificationsV1:
    """Tests for /api/v1/notifications/* endpoints"""

    def test_list_notifications(self, client, mongo_setup, auth_token_v1):
        """Test listing notifications"""
        response = client.get(
            f"{API_V1_BASE}/notifications",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200
        assert "notifications" in response.json

    def test_mark_notification_read(self, client, mongo_setup, auth_token_v1, test_notification_v1):
        """Test marking notification as read"""
        response = client.post(
            f"{API_V1_BASE}/notifications/{test_notification_v1}/mark-read",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200

    def test_delete_notification(self, client, mongo_setup, auth_token_v1, test_notification_v1):
        """Test deleting a notification"""
        response = client.delete(
            f"{API_V1_BASE}/notifications/{test_notification_v1}",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200

    def test_clear_notifications(self, client, mongo_setup, auth_token_v1):
        """Test clearing all notifications"""
        response = client.delete(
            f"{API_V1_BASE}/notifications",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200

    def test_get_preferences(self, client, mongo_setup, auth_token_v1):
        """Test getting notification preferences"""
        response = client.get(
            f"{API_V1_BASE}/notifications/preferences",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200

    def test_update_preferences(self, client, mongo_setup, auth_token_v1):
        """Test updating notification preferences"""
        response = client.patch(
            f"{API_V1_BASE}/notifications/preferences",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={
                "roomInvites": True,
                "mentions": False
            }
        )
        assert response.status_code == 200


class TestUsersV1:
    """Tests for /api/v1/users/* endpoints"""

    def test_search_users(self, client, mongo_setup, auth_token_v1):
        """Test searching for users"""
        # Create some test users
        for i in range(3):
            client.post(
                f"{API_V1_BASE}/auth/register",
                json={"username": f"searchuser{i}", "password": "pass123"}
            )

        response = client.get(
            f"{API_V1_BASE}/users/search?q=search",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200
        data = response.json
        assert "users" in data

    def test_suggest_users(self, client, mongo_setup, auth_token_v1):
        """Test user suggestions (autocomplete)"""
        response = client.get(
            f"{API_V1_BASE}/users/suggest?q=test",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 200
        assert "suggestions" in response.json


class TestAuthorizationV1:
    """Tests for authorization and access control"""

    def test_unauthorized_access(self, client, mongo_setup):
        """Test that endpoints require authentication"""
        endpoints = [
            ("GET", f"{API_V1_BASE}/auth/me"),
            ("GET", f"{API_V1_BASE}/rooms"),
            ("POST", f"{API_V1_BASE}/rooms"),
        ]

        for method, endpoint in endpoints:
            if method == "GET":
                response = client.get(endpoint)
            elif method == "POST":
                response = client.post(endpoint, json={})
            
            assert response.status_code == 401

    def test_room_access_control(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2):
        """Test that users can only access rooms they're members of"""
        # Create private room as user1
        create_response = client.post(
            f"{API_V1_BASE}/rooms",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"name": "Private Room", "type": "private"}
        )
        room_id = create_response.json["room"]["id"]

        # Try to access as user2 (should fail)
        response = client.get(
            f"{API_V1_BASE}/rooms/{room_id}",
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )
        assert response.status_code == 403

    def test_owner_only_operations(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1_shared):
        """Test that only room owners can perform certain operations"""
        # Try to delete room as non-owner (should fail)
        response = client.delete(
            f"{API_V1_BASE}/rooms/{test_room_v1_shared}",
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )
        assert response.status_code == 403


class TestErrorHandlingV1:
    """Tests for error handling and edge cases"""

    def test_invalid_room_id(self, client, mongo_setup, auth_token_v1):
        """Test accessing non-existent room"""
        response = client.get(
            f"{API_V1_BASE}/rooms/000000000000000000000000",
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        assert response.status_code == 404

    def test_malformed_json(self, client, mongo_setup, auth_token_v1):
        """Test sending malformed JSON"""
        response = client.post(
            f"{API_V1_BASE}/rooms",
            headers={
                "Authorization": f"Bearer {auth_token_v1}",
                "Content-Type": "application/json"
            },
            data="{ invalid json"
        )
        assert response.status_code == 400

    def test_missing_required_fields(self, client, mongo_setup, auth_token_v1):
        """Test missing required fields in requests"""
        response = client.post(
            f"{API_V1_BASE}/rooms",
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"name": "Test"}  # Missing 'type' field
        )
        assert response.status_code == 400

    def test_expired_token(self, client, mongo_setup):
        """Test using expired JWT token"""
        # This would require creating a token with past expiration
        # For now, test with invalid token
        response = client.get(
            f"{API_V1_BASE}/auth/me",
            headers={"Authorization": "Bearer invalid_token_here"}
        )
        assert response.status_code == 401
