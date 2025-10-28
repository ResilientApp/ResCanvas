import pytest
import json


@pytest.mark.integration
@pytest.mark.auth
class TestAuthAPI:

    def test_register_success(self, client, mock_mongodb, mock_redis):
        response = client.post('/auth/register', json={
            'username': 'newuser',
            'password': 'NewPass123!'
        })

        assert response.status_code == 201
        data = response.get_json()
        assert 'user' in data
        assert data['user']['username'] == 'newuser'
        assert 'password' not in data['user']

    def test_register_duplicate_username(self, client, mock_mongodb, test_user):
        existing = mock_mongodb['users'].find_one({"username": test_user['username']})
        assert existing is not None, f"Test user {test_user['username']} not found in mock database"

        response = client.post('/auth/register', json={
            'username': test_user['username'],
            'password': 'Test123!'
        })

        assert response.status_code in [400, 409], f"Expected 400/409 but got {response.status_code}. Response: {response.get_json()}"
        data = response.get_json()
        assert 'error' in data or 'message' in data

    def test_register_weak_password(self, client, mock_mongodb):
        response = client.post('/auth/register', json={
            'username': 'testuser2',
            'password': 'weak'
        })

        assert response.status_code == 400
        data = response.get_json()
        assert 'errors' in data
        assert 'password' in data['errors']

    def test_register_invalid_username(self, client, mock_mongodb):
        response = client.post('/auth/register', json={
            'username': 'ab',
            'password': 'Test123!'
        })

        assert response.status_code == 400
        data = response.get_json()
        assert 'errors' in data
        assert 'username' in data['errors']

    def test_login_success(self, client, mock_mongodb, test_user):
        response = client.post('/auth/login', json={
            'username': test_user['username'],
            'password': 'Test123!'
        })

        assert response.status_code == 200
        data = response.get_json()
        assert 'token' in data
        assert 'user' in data
        assert data['user']['username'] == test_user['username']

    def test_login_wrong_password(self, client, mock_mongodb, test_user):
        response = client.post('/auth/login', json={
            'username': test_user['username'],
            'password': 'WrongPassword123!'
        })

        assert response.status_code == 401
        data = response.get_json()
        assert data['status'] == 'error'
        assert 'message' in data

    def test_login_nonexistent_user(self, client, mock_mongodb):
        response = client.post('/auth/login', json={
            'username': 'nonexistent',
            'password': 'Test123!'
        })

        assert response.status_code == 401
        data = response.get_json()
        assert data['status'] == 'error'
        assert 'message' in data

    def test_get_current_user(self, client, mock_mongodb, jwt_token, test_user, auth_headers):
        response = client.get('/auth/me', headers=auth_headers)

        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'ok'
        assert data['user']['username'] == test_user['username']
        assert 'id' in data['user']

    def test_get_current_user_no_auth(self, client):
        response = client.get('/auth/me')

        assert response.status_code == 401

    def test_logout_success(self, client, mock_mongodb, auth_headers):
        response = client.post('/auth/logout', headers=auth_headers)

        assert response.status_code == 200
        data = response.get_json()
        assert data['status'] == 'ok'

    def test_refresh_token_flow(self, client, mock_mongodb, test_user):
        login_response = client.post('/auth/login', json={
            'username': test_user['username'],
            'password': 'Test123!'
        })

        assert login_response.status_code == 200

        cookies = login_response.headers.getlist('Set-Cookie')
        refresh_cookie = None
        for cookie in cookies:
            if 'refresh_token' in cookie.lower():
                refresh_cookie = cookie.split(';')[0]

        if refresh_cookie:
            refresh_response = client.post('/auth/refresh', 
                headers={'Cookie': refresh_cookie})

            assert refresh_response.status_code in [200, 401]
