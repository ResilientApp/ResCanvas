# ResilientDB Crow Endpoint Test Scripts

These scripts test the ResilientDB Crow API endpoints (`https://crow.resilientdb.com`) used by ResCanvas for transaction commits.

## Quick Start

### Simple Test (Recommended for quick checks)

```bash
cd backend/scripts
python test_crow_simple.py
```

This runs a simple test suite with:
- Basic transaction commit
- Transaction query
- Canvas stroke simulation
- Multiple sequential commits

### Comprehensive Test Suite

```bash
cd backend/tests
python test_crow_endpoints.py
```

This runs a full test suite including:
- Endpoint availability check
- Basic commit
- Complex value commit
- Query transaction
- Invalid payload handling
- Large payload test
- Concurrent commits

### Using Pytest

```bash
cd backend
pytest tests/test_crow_endpoints.py -v
```

Run specific tests:
```bash
pytest tests/test_crow_endpoints.py::test_crow_basic_commit -v
pytest tests/test_crow_endpoints.py::test_crow_complex_value -v
pytest tests/test_crow_endpoints.py::test_crow_query -v
```

## Example: Testing Based on Curl Command

The scripts are based on this example curl command:

```bash
curl --location 'https://crow.resilientdb.com/v1/transactions/commit' \
  --header 'Content-Type: application/json' \
  --data '{
    "id": "key_test",
    "value": "value_test"
  }'
```

## API Endpoints Tested

1. **Commit Endpoint**: `POST https://crow.resilientdb.com/v1/transactions/commit`
   - Commits a new transaction to ResilientDB
   - Payload: `{"id": "unique_key", "value": "data"}`

2. **Query Endpoint**: `GET https://crow.resilientdb.com/v1/transactions/{id}`
   - Retrieves a previously committed transaction
   - Returns the transaction data

## Test Scenarios

### 1. Basic Commit
Tests simple key-value pair commit with unique timestamp-based keys.

### 2. Complex Value Commit
Tests commit with nested JSON objects (simulates canvas stroke data).

### 3. Query Transaction
Commits a transaction then queries it back to verify persistence.

### 4. Invalid Payload
Tests error handling with malformed payloads.

### 5. Large Payload
Tests commit with large JSON data (simulates complex canvas with multiple strokes).

### 6. Concurrent Commits
Tests multiple rapid sequential commits to verify system stability.

### 7. Canvas Stroke Simulation
Tests ResCanvas-specific payload structure:
```json
{
  "id": "stroke_1234567890",
  "value": "{\"roomId\": \"room123\", \"userId\": \"user456\", \"points\": [[0,0],[10,10]], \"color\": \"#FF0000\", \"width\": 2}"
}
```

## Expected Results

### Success Response (HTTP 200/201)
```json
{
  "status": "success",
  "transaction_id": "key_test_1234567890"
}
```

### Error Response (HTTP 4xx/5xx)
```json
{
  "error": "error_message",
  "details": "detailed_error_description"
}
```

## Output

### Simple Test Output
```
============================================================
ResilientDB Crow Endpoint Test Suite
============================================================
Base URL: https://crow.resilientdb.com
...
============================================================
SUMMARY
============================================================
✓ PASS: Basic Commit
✓ PASS: Query Transaction
✓ PASS: Canvas Stroke
✓ PASS: Multiple Commits

Total: 4/4 tests passed (100%)
============================================================
```

### Comprehensive Test Output
Saves results to `crow_test_results_<timestamp>.json`:
```json
{
  "total": 7,
  "passed": 7,
  "failed": 0,
  "success_rate": 1.0,
  "results": [
    {
      "test": "Endpoint Availability",
      "success": true,
      "details": "Endpoint is reachable",
      "timestamp": "2025-11-17T12:34:56.789Z"
    },
    ...
  ]
}
```

## Configuration

The scripts use environment variables from `backend/.env`:
- `RESILIENTDB_BASE_URI`: Base URL for Crow API (default: `https://crow.resilientdb.com`)
- `SIGNER_PUBLIC_KEY`: Public key for signing transactions (if needed)
- `SIGNER_PRIVATE_KEY`: Private key for signing transactions (if needed)

## Troubleshooting

### Connection Timeout
If tests timeout, check:
1. Network connectivity to `crow.resilientdb.com`
2. Firewall rules allowing HTTPS (port 443)
3. VPN/proxy configuration

### HTTP 400 Bad Request
Usually indicates invalid payload format:
- Ensure `id` and `value` fields are present
- Check JSON formatting

### HTTP 500 Server Error
ResilientDB internal error:
- Check endpoint status
- Try again after a few seconds
- Report to ResilientDB team if persistent

## Integration with ResCanvas

These endpoints are used by:
- `backend/services/graphql_service.py`: Commits strokes via GraphQL wrapper
- `backend/routes/submit_room_line.py`: Submits new canvas strokes
- `backend/incubator-resilientdb-resilient-python-cache/example.py`: Syncs transactions to MongoDB

## Related Files

- `backend/config.py`: Configuration for Crow endpoints
- `backend/services/graphql_service.py`: GraphQL service wrapper
- `backend/.env`: Environment variables

## Support

For issues with:
- **Test scripts**: Check ResCanvas project documentation
- **Crow API**: Contact ResilientDB team
- **Integration**: Review `backend/services/graphql_service.py`
