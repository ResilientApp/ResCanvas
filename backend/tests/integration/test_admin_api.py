import pytest
import json
from unittest.mock import patch, MagicMock


class TestAdminAPI:
    """Test admin routes for master key management"""

    def test_get_master_key_from_mongodb_success(self, client, auth_headers, mock_mongodb):
        """Test retrieving master key from MongoDB"""
        # Insert master key into mock MongoDB
        mock_mongodb['settings'].insert_one({
            '_id': 'room_master_key_b64',
            'value': 'dGVzdC1tYXN0ZXIta2V5LWJhc2U2NA=='
        })

        response = client.get(
            '/admin/master-key',
            headers=auth_headers
        )

        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'hasValue' in data
        assert data['hasValue'] is True

    def test_get_master_key_no_key_found(self, client, auth_headers, mock_mongodb):
        """Test master key retrieval when no key exists"""
        # Don't insert anything - the collection should be empty

        response = client.get(
            '/admin/master-key',
            headers=auth_headers
        )

        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['hasValue'] is False

    @patch('routes.admin._vault_client')
    def test_rotate_room_master_key_success(self, mock_vault_client, client, auth_headers, mock_mongodb):
        """Test successful room master key rotation"""
        # Mock vault client
        mock_client = MagicMock()
        mock_vault_client.return_value = mock_client

        response = client.post(
            '/admin/rotate-room-master',
            headers=auth_headers,
            json={}
        )

        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'ok'
        assert 'newMasterB64' in data

    @patch('routes.admin._vault_client')
    def test_rotate_room_master_key_vault_write_failure(self, mock_vault_client, client, auth_headers, mock_mongodb):
        """Test rotation when vault write fails"""
        # Mock vault client that fails to write
        mock_client = MagicMock()
        mock_client.secrets.kv.v2.create_or_update_secret.side_effect = Exception("Vault write failed")
        mock_vault_client.return_value = mock_client

        response = client.post(
            '/admin/rotate-room-master',
            headers=auth_headers,
            json={}
        )

        # Should still succeed as MongoDB is primary storage
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['status'] == 'ok'
