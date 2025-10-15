import pytest
from unittest.mock import patch, MagicMock
import json

from services.graphql_service import commit_transaction_via_graphql


@pytest.mark.unit
class TestGraphQLService:
    
    @patch('services.graphql_service.requests')
    def test_commit_transaction_success(self, mock_requests):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'data': {
                'postTransaction': {
                    'id': 'txn-123'
                }
            }
        }
        mock_requests.post.return_value = mock_response
        
        payload = {
            'operation': 'CREATE',
            'signerPublicKey': 'test-key',
            'signerPrivateKey': 'test-key',
            'recipientPublicKey': 'test-key',
            'asset': {'data': {'test': 'data'}}
        }
        
        result = commit_transaction_via_graphql(payload)
        
        assert result == 'txn-123'
        mock_requests.post.assert_called_once()
    
    @patch('services.graphql_service.requests')
    def test_commit_transaction_network_error(self, mock_requests):
        mock_requests.post.side_effect = Exception('Network error')
        
        payload = {'operation': 'CREATE', 'asset': {}}
        
        with pytest.raises(Exception):
            commit_transaction_via_graphql(payload)
    
    @patch('services.graphql_service.requests')
    def test_commit_transaction_invalid_response(self, mock_requests):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'errors': [{'message': 'Invalid transaction'}]
        }
        mock_requests.post.return_value = mock_response
        
        payload = {'operation': 'CREATE', 'asset': {}}
        
        with pytest.raises(RuntimeError, match='GraphQL errors'):
            commit_transaction_via_graphql(payload)
    
    @patch('services.graphql_service.requests')
    def test_commit_transaction_with_signature(self, mock_requests):
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'data': {
                'postTransaction': {
                    'id': 'signed-txn-67890'
                }
            }
        }
        mock_requests.post.return_value = mock_response
        
        payload = {
            'operation': 'CREATE',
            'signerPublicKey': 'key1',
            'signerPrivateKey': 'key2',
            'recipientPublicKey': 'key3',
            'asset': {'data': {'test': 'data'}}
        }
        
        result = commit_transaction_via_graphql(payload)
        
        assert result == 'signed-txn-67890'
