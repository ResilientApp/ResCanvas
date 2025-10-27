"""
Comprehensive test suite for API v1 endpoints

Tests all versioned API endpoints:
- /api/v1/auth/* (authentication and user management)
- /api/v1/canvases/* (canvas management, strokes, history operations)
- /api/v1/collaborations/* (invitations and collaboration)
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
        import uuid
        # Use unique username to avoid conflicts in full test suite
        unique_username = f"testregister_{uuid.uuid4().hex[:8]}"
        response = client.post('/api/v1/auth/register', json={
            "username": unique_username,
            "password": "password123"
        })
        
        assert response.status_code == 201
        assert "token" in response.json
        assert response.json["user"]["username"] == unique_username
    
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


class TestAPIv1Canvases:
    """Test suite for /api/v1/canvases/* endpoints"""
    
    def test_create_canvas_success(self, client, mongo_setup, auth_token_v1):
        """Test creating a new canvas"""
        response = client.post(
            '/api/v1/canvases',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={
                "name": "New Canvas",
                "type": "public",
                "description": "Test canvas"
            }
        )
        
        assert response.status_code == 201
        assert response.json["room"]["name"] == "New Canvas"
        assert "id" in response.json["room"]
    
    def test_create_canvas_unauthorized(self, client, mongo_setup):
        """Test creating canvas without authentication"""
        response = client.post('/api/v1/canvases', json={"name": "New Canvas"})
        assert response.status_code == 401
    
    def test_list_canvases(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test listing canvases"""
        # Ensure canvas was created
        assert test_room_v1 is not None, "test_room_v1 fixture failed to create canvas"
        
        response = client.get(
            '/api/v1/canvases',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
        assert "rooms" in response.json
        # Canvas should be in the list since we just created it
        canvas_ids = [r.get("id") for r in response.json["rooms"]]
        assert test_room_v1 in canvas_ids, f"Created canvas {test_room_v1} not in list: {canvas_ids}"
    
    def test_get_canvas_details(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test getting canvas details"""
        response = client.get(
            f'/api/v1/canvases/{test_room_v1}',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
        assert response.json["room"]["id"] == test_room_v1
    
    def test_update_canvas(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test updating canvas details"""
        response = client.patch(
            f'/api/v1/canvases/{test_room_v1}',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"name": "Updated Canvas Name"}
        )
        
        assert response.status_code == 200
        assert response.json["room"]["name"] == "Updated Canvas Name"
    
    def test_delete_canvas(self, client, mongo_setup, auth_token_v1):
        """Test deleting a canvas"""
        # Create canvas first
        create_response = client.post(
            '/api/v1/canvases',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"name": "Canvas to Delete", "type": "public"}
        )
        canvas_id = create_response.json["room"]["id"]
        
        # Delete canvas
        response = client.delete(
            f'/api/v1/canvases/{canvas_id}',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
    
    def test_post_stroke(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test posting a stroke to a canvas"""
        stroke_data = {
            "stroke": {
                "pathData": [[10, 20], [30, 40]],
                "color": "#000000",
                "lineWidth": 2
            }
        }
        
        response = client.post(
            f'/api/v1/canvases/{test_room_v1}/strokes',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json=stroke_data
        )
        
        assert response.status_code in [200, 201]
    
    def test_get_strokes(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test getting strokes from a canvas"""
        # Post a stroke first
        stroke_data = {
            "stroke": {
                "pathData": [[10, 20], [30, 40]],
                "color": "#000000",
                "lineWidth": 2
            }
        }
        client.post(
            f'/api/v1/canvases/{test_room_v1}/strokes',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json=stroke_data
        )
        
        # Get strokes
        response = client.get(
            f'/api/v1/canvases/{test_room_v1}/strokes',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
        assert "strokes" in response.json
    
    def test_clear_canvas_delete_method(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test clearing canvas using DELETE /strokes (RESTful)"""
        response = client.delete(
            f'/api/v1/canvases/{test_room_v1}/strokes',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
    
    def test_history_undo(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test undo operation via consolidated /history/undo"""
        # Post a stroke first
        stroke_data = {
            "points": [[10, 20], [30, 40]],
            "color": "#000000",
            "width": 2
        }
        client.post(
            f'/api/v1/canvases/{test_room_v1}/strokes',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json=stroke_data
        )
        
        # Undo via consolidated endpoint
        response = client.post(
            f'/api/v1/canvases/{test_room_v1}/history/undo',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
    
    def test_history_redo(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test redo operation via consolidated /history/redo"""
        response = client.post(
            f'/api/v1/canvases/{test_room_v1}/history/redo',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        # May return 400 if nothing to redo
        assert response.status_code in [200, 400]
    
    def test_history_status(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test getting undo/redo status via consolidated /history/status"""
        response = client.get(
            f'/api/v1/canvases/{test_room_v1}/history/status',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
        assert "undo_available" in response.json or "redo_available" in response.json
    
    def test_history_reset(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test resetting undo/redo stacks via consolidated /history/reset"""
        response = client.post(
            f'/api/v1/canvases/{test_room_v1}/history/reset',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
    
    def test_share_canvas(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1):
        """Test sharing canvas with another user"""
        response = client.post(
            f'/api/v1/canvases/{test_room_v1}/share',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={
                "users": [{"username": "testuser2", "role": "editor"}]
            }
        )
        
        assert response.status_code in [200, 201]
    
    def test_get_canvas_members(self, client, mongo_setup, auth_token_v1, test_room_v1_shared):
        """Test getting canvas members"""
        response = client.get(
            f'/api/v1/canvases/{test_room_v1_shared}/members',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
        assert "members" in response.json
    
    def test_invite_to_canvas(self, client, mongo_setup, auth_token_v1, test_room_v1):
        """Test inviting users to canvas"""
        response = client.post(
            f'/api/v1/canvases/{test_room_v1}/invite',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"username": "testuser2", "role": "editor"}
        )
        
        assert response.status_code in [200, 201]
    
    def test_leave_canvas(self, client, mongo_setup, auth_token_v1_user2, test_room_v1_shared):
        """Test leaving a shared canvas"""
        response = client.post(
            f'/api/v1/canvases/{test_room_v1_shared}/leave',
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )
        
        assert response.status_code == 200
    
    def test_unauthorized_canvas_access(self, client, mongo_setup, auth_token_v1_user2, private_room_v1):
        """Test accessing private canvas without permission"""
        response = client.get(
            f'/api/v1/canvases/{private_room_v1}',
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )
        
        assert response.status_code in [403, 404]
    
    def test_transfer_canvas_ownership(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1_shared):
        """Test transferring canvas ownership"""
        response = client.post(
            f'/api/v1/canvases/{test_room_v1_shared}/transfer',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"username": "testuser2"}
        )
        
        assert response.status_code in [200, 201]
    
    def test_suggest_canvases(self, client, mongo_setup, auth_token_v1):
        """Test canvas suggestions/autocomplete"""
        response = client.get(
            '/api/v1/canvases/suggest',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200


class TestAPIv1Collaborations:
    """Test suite for /api/v1/collaborations/* endpoints"""
    
    def test_list_invitations(self, client, mongo_setup, auth_token_v1):
        """Test listing invitations"""
        response = client.get(
            '/api/v1/collaborations/invitations',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
        )
        
        assert response.status_code == 200
        assert "invites" in response.json or "invitations" in response.json
    
    def test_accept_invitation(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1):
        """Test accepting an invitation"""
        # Share canvas to create invite
        client.post(
            f'/api/v1/canvases/{test_room_v1}/share',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"users": [{"username": "testuser2", "role": "editor"}]}
        )
        
        # Get invites for user2
        invites_response = client.get(
            '/api/v1/collaborations/invitations',
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )
        
        invites_key = "invites" if "invites" in invites_response.json else "invitations"
        if invites_response.json.get(invites_key):
            invite_id = invites_response.json[invites_key][0]["id"]
            
            # Accept invite
            response = client.post(
                f'/api/v1/collaborations/invitations/{invite_id}/accept',
                headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
            )
            
            assert response.status_code in [200, 204]
    
    def test_decline_invitation(self, client, mongo_setup, auth_token_v1, auth_token_v1_user2, test_room_v1):
        """Test declining an invitation"""
        # Share canvas to create invite
        client.post(
            f'/api/v1/canvases/{test_room_v1}/share',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"users": [{"username": "testuser2", "role": "editor"}]}
        )
        
        # Get invites for user2
        invites_response = client.get(
            '/api/v1/collaborations/invitations',
            headers={"Authorization": f"Bearer {auth_token_v1_user2}"}
        )
        
        invites_key = "invites" if "invites" in invites_response.json else "invitations"
        if invites_response.json.get(invites_key):
            invite_id = invites_response.json[invites_key][0]["id"]
            
            # Decline invite
            response = client.post(
                f'/api/v1/collaborations/invitations/{invite_id}/decline',
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
        response = client.post(
            f'/api/v1/notifications/{test_notification_v1}/mark-read',
            headers={"Authorization": f"Bearer {auth_token_v1}"}
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
        assert "preferences" in response.json
    
    def test_update_notification_preferences(self, client, mongo_setup, auth_token_v1):
        """Test updating notification preferences"""
        response = client.patch(
            '/api/v1/notifications/preferences',
            headers={"Authorization": f"Bearer {auth_token_v1}"},
            json={"emailNotifications": False}
        )
        
        assert response.status_code in [200, 204]
        if response.status_code == 200:
            assert "preferences" in response.json


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
        assert "suggestions" in response.json
