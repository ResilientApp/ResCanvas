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
        assert response.json["user"]["username"] == "testuser"
    
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
