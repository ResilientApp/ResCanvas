# ResilientDB Crow API Test Scripts - Summary

## Overview

Created comprehensive test scripts for the ResilientDB Crow API endpoints used by ResCanvas. Based on the example:

```bash
curl --location 'https://crow.resilientdb.com/v1/transactions/commit' \
  --header 'Content-Type: application/json' \
  --data '{"id": "key_test", "value": "value_test"}'
```

## Files Created

### 1. **test_crow_simple.py** (Recommended Quick Test)
**Location:** `backend/scripts/test_crow_simple.py`

Simple, standalone test script with 4 core tests:
- ✓ Basic transaction commit
- ✓ Transaction query
- ✓ Canvas stroke simulation (ResCanvas-specific)
- ✓ Multiple sequential commits

**Usage:**
```bash
cd backend/scripts
python3 test_crow_simple.py
```

**Output:** Console summary with pass/fail status for each test.

---

### 2. **test_crow_endpoints.py** (Comprehensive Suite)
**Location:** `backend/tests/test_crow_endpoints.py`

Full-featured test suite with 7 test scenarios:
- ✓ Endpoint availability check
- ✓ Basic commit
- ✓ Complex value commit (nested JSON)
- ✓ Query transaction
- ✓ Invalid payload handling
- ✓ Large payload test (simulates complex canvas data)
- ✓ Concurrent commits (tests system stability)

**Usage:**
```bash
# As standalone script
cd backend/tests
python3 test_crow_endpoints.py

# With pytest
cd backend
pytest tests/test_crow_endpoints.py -v

# Run specific test
pytest tests/test_crow_endpoints.py::test_crow_basic_commit -v
```

**Output:** 
- Console output with detailed logging
- JSON results file: `crow_test_results_<timestamp>.json`

---

### 3. **test_crow_connectivity.py** (Diagnostic Tool)
**Location:** `backend/scripts/test_crow_connectivity.py`

Diagnostic script to troubleshoot connectivity issues:
- DNS resolution test
- Basic HTTP connectivity
- Commit endpoint with short timeout
- Retry logic with exponential backoff

**Usage:**
```bash
cd backend/scripts
python3 test_crow_connectivity.py
```

**Output:** Diagnostic information and troubleshooting recommendations.

---

### 4. **test_crow_mock.py** (Local Development)
**Location:** `backend/scripts/test_crow_mock.py`

Mock implementation for local testing when Crow API is unavailable:
- Tests all logic without network calls
- Validates test structure and error handling
- Useful for development and CI/CD pipelines

**Usage:**
```bash
cd backend/scripts
python3 test_crow_mock.py
```

**Output:** Validates test logic with mock responses (always succeeds).

---

### 5. **CROW_TESTING_README.md** (Documentation)
**Location:** `backend/scripts/CROW_TESTING_README.md`

Complete documentation covering:
- Quick start guide
- API endpoint details
- Test scenario descriptions
- Expected responses
- Troubleshooting guide
- Integration with ResCanvas

---

## Quick Start

### Option 1: Quick Test (Recommended)
```bash
cd /home/ubuntu/resilient-apps/ResCanvas/backend/scripts
python3 test_crow_simple.py
```

### Option 2: If Crow API is unavailable
```bash
# Test with mock (validates logic)
python3 test_crow_mock.py

# Check connectivity
python3 test_crow_connectivity.py
```

### Option 3: Full Test Suite
```bash
cd /home/ubuntu/resilient-apps/ResCanvas/backend/tests
python3 test_crow_endpoints.py
```

---

## Current Status

### Connectivity Test Results (2025-11-17)

**DNS Resolution:** ✓ WORKING
- `crow.resilientdb.com` resolves to `172.67.196.246`

**HTTP Connectivity:** ✗ TIMING OUT
- TLS handshake succeeds
- Requests timeout after 30 seconds
- Tested with both Python requests and curl

**Diagnosis:**
The Crow API endpoint appears to be experiencing issues or high load. The server accepts connections but doesn't respond to commit requests within reasonable timeouts.

**Recommendations:**
1. **For Development:** Use `test_crow_mock.py` to validate integration logic
2. **For Production:** Implement retry logic with exponential backoff (see `test_crow_connectivity.py`)
3. **For Monitoring:** Check with ResilientDB team about API status
4. **Alternative:** Consider using the GraphQL endpoint (`https://cloud.resilientdb.com/graphql`) which is already integrated in `backend/services/graphql_service.py`

---

## Test Scenarios Covered

### 1. Basic Commit
```json
{
  "id": "key_test_1234567890",
  "value": "value_test"
}
```

### 2. Canvas Stroke (ResCanvas-specific)
```json
{
  "id": "stroke_1234567890",
  "value": "{\"roomId\": \"room123\", \"userId\": \"user456\", \"points\": [[0,0],[10,10]], \"color\": \"#FF0000\", \"width\": 2}"
}
```

### 3. Complex Value
```json
{
  "id": "complex_test_1234567890",
  "value": "{\"type\": \"canvas_stroke\", \"roomId\": \"test_room\", \"strokeData\": {...}}"
}
```

### 4. Error Cases
- Missing required fields (id/value)
- Invalid JSON format
- Duplicate transaction IDs
- Large payloads

---

## Integration with ResCanvas

These test scripts validate the same endpoints used by:

1. **GraphQL Service** (`backend/services/graphql_service.py`)
   - Wraps Crow API with GraphQL mutations
   - Used for committing canvas strokes

2. **Submit Room Line** (`backend/routes/submit_room_line.py`)
   - Submits new strokes to ResilientDB
   - Caches in Redis and broadcasts via Socket.IO

3. **Sync Service** (`backend/incubator-resilientdb-resilient-python-cache/example.py`)
   - Watches ResilientDB for new transactions
   - Syncs to MongoDB for querying

---

## Environment Variables

From `backend/.env`:
```properties
RESILIENTDB_BASE_URI=https://crow.resilientdb.com
RESILIENTDB_GRAPHQL_URI=https://cloud.resilientdb.com/graphql
SIGNER_PUBLIC_KEY=<your_public_key>
SIGNER_PRIVATE_KEY=<your_private_key>
```

---

## Troubleshooting

### Timeout Errors
```
✗ ERROR: HTTPSConnectionPool(host='crow.resilientdb.com', port=443): Read timed out
```

**Solutions:**
1. Increase timeout: `timeout=60`
2. Use retry logic: See `test_crow_connectivity.py`
3. Check endpoint status with ResilientDB team
4. Use GraphQL endpoint as fallback

### Connection Errors
```
✗ ERROR: Connection error - [Errno 111] Connection refused
```

**Solutions:**
1. Check firewall rules: `sudo iptables -L`
2. Verify DNS: `nslookup crow.resilientdb.com`
3. Test with curl: `curl -v https://crow.resilientdb.com`

### Invalid Payload
```
✗ FAILED: HTTP 400: Missing required fields
```

**Solutions:**
1. Ensure both `id` and `value` fields are present
2. Use unique IDs (timestamp-based recommended)
3. Properly escape JSON in `value` field

---

## Next Steps

1. **Monitor Crow API Status**
   - Contact ResilientDB team about timeout issues
   - Get status page or monitoring dashboard

2. **Implement Resilient Error Handling**
   - Add retry logic to `backend/services/graphql_service.py`
   - Implement circuit breaker pattern
   - Add fallback to local cache when Crow is unavailable

3. **Add to CI/CD Pipeline**
   ```bash
   # In CI pipeline
   pytest backend/tests/test_crow_endpoints.py -v --tb=short
   ```

4. **Performance Testing**
   - Test with high load (100+ concurrent requests)
   - Measure response times and timeout rates
   - Identify optimal timeout values

---

## Related Documentation

- **API Reference:** `/home/ubuntu/resilient-apps/ResCanvas/API_REFERENCE.md`
- **Architecture:** `/home/ubuntu/resilient-apps/ResCanvas/ARCHITECTURE_DIAGRAM_REVISED.txt`
- **GraphQL Service:** `backend/services/graphql_service.py`
- **Configuration:** `backend/config.py`

---

## Support

For questions or issues:
1. **Test Scripts:** Check this document and `CROW_TESTING_README.md`
2. **Crow API:** Contact ResilientDB team
3. **ResCanvas Integration:** Review `backend/services/graphql_service.py`

---

*Last Updated: 2025-11-17*
*Test Scripts Version: 1.0*
*Status: Crow API experiencing timeout issues; scripts validated with mock*
