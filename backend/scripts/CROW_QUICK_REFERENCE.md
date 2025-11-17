# Crow API Testing - Quick Reference

## 🚀 Quick Start

### Option 1: Simple Test (Recommended)
```bash
cd backend/scripts
./run_crow_tests.sh simple
```

### Option 2: Mock Test (No Network Required)
```bash
cd backend/scripts
./run_crow_tests.sh mock
```

### Option 3: Full Diagnostic
```bash
cd backend/scripts
./run_crow_tests.sh all
```

---

## 📁 Test Scripts Overview

| Script | Purpose | Location | Runtime |
|--------|---------|----------|---------|
| **test_crow_simple.py** | Quick 4-test suite | `backend/scripts/` | ~2-5 min |
| **test_crow_endpoints.py** | Comprehensive 7 tests | `backend/tests/` | ~5-10 min |
| **test_crow_connectivity.py** | Network diagnostics | `backend/scripts/` | ~1-2 min |
| **test_crow_mock.py** | Local validation | `backend/scripts/` | ~1 sec |
| **run_crow_tests.sh** | Unified test runner | `backend/scripts/` | Variable |

---

## 📋 Test Scenarios

### ✓ Basic Tests
- [x] Simple key-value commit
- [x] Transaction query/retrieval
- [x] Canvas stroke simulation
- [x] Multiple sequential commits

### ✓ Advanced Tests
- [x] Complex nested JSON values
- [x] Invalid payload rejection
- [x] Large payload handling (~10KB+)
- [x] Concurrent transaction commits
- [x] Duplicate transaction detection

### ✓ Network Tests
- [x] DNS resolution
- [x] HTTPS connectivity
- [x] Timeout handling
- [x] Retry with backoff

---

## 🎯 Example Payloads

### Basic Commit
```bash
curl --location 'https://crow.resilientdb.com/v1/transactions/commit' \
  --header 'Content-Type: application/json' \
  --data '{
    "id": "key_test_1234567890",
    "value": "value_test"
  }'
```

### Canvas Stroke
```bash
curl --location 'https://crow.resilientdb.com/v1/transactions/commit' \
  --header 'Content-Type: application/json' \
  --data '{
    "id": "stroke_1234567890",
    "value": "{\"roomId\": \"room123\", \"points\": [[0,0],[10,10]], \"color\": \"#FF0000\"}"
  }'
```

### Query Transaction
```bash
curl --location 'https://crow.resilientdb.com/v1/transactions/key_test_1234567890'
```

---

## 🔧 Shell Script Usage

```bash
# Show help
./run_crow_tests.sh help

# Run specific test
./run_crow_tests.sh simple
./run_crow_tests.sh comprehensive
./run_crow_tests.sh connectivity
./run_crow_tests.sh mock

# Run all tests
./run_crow_tests.sh all
```

---

## 📊 Expected Output

### ✓ Success (200/201)
```
✓ SUCCESS: Transaction committed successfully!
Total: 4/4 tests passed (100%)
```

### ✗ Timeout
```
✗ ERROR: HTTPSConnectionPool(...): Read timed out
```
**Solution:** Use mock tests or check connectivity

### ✗ Invalid Payload (400)
```
✗ FAILED: HTTP 400: Missing required fields
```
**Solution:** Ensure both `id` and `value` are present

---

## 🔍 Troubleshooting

### Test fails with timeout
```bash
# Check connectivity first
./run_crow_tests.sh connectivity

# If Crow is down, use mock
./run_crow_tests.sh mock
```

### "python: command not found"
```bash
# Use python3 explicitly
python3 test_crow_simple.py

# Or create alias
alias python=python3
```

### Permission denied
```bash
# Make scripts executable
chmod +x backend/scripts/*.sh backend/scripts/*.py
```

---

## 🔗 Related Files

- **Config:** `backend/config.py`
- **GraphQL Service:** `backend/services/graphql_service.py`
- **Environment:** `backend/.env`
- **Full Documentation:** `backend/scripts/CROW_TESTING_README.md`
- **Summary:** `backend/scripts/CROW_TEST_SUMMARY.md`

---

## 📝 Pytest Integration

```bash
# Run all tests
cd backend
pytest tests/test_crow_endpoints.py -v

# Run specific test
pytest tests/test_crow_endpoints.py::test_crow_basic_commit -v

# Run with coverage
pytest tests/test_crow_endpoints.py --cov=services --cov-report=html
```

---

## 🌐 Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/transactions/commit` | POST | Commit new transaction |
| `/v1/transactions/{id}` | GET | Query transaction |

**Base URL:** `https://crow.resilientdb.com`

---

## ⚙️ Configuration

From `backend/.env`:
```properties
RESILIENTDB_BASE_URI=https://crow.resilientdb.com
RESILIENTDB_GRAPHQL_URI=https://cloud.resilientdb.com/graphql
SIGNER_PUBLIC_KEY=your_public_key
SIGNER_PRIVATE_KEY=your_private_key
```

---

## 📈 Current Status (2025-11-17)

| Component | Status | Notes |
|-----------|--------|-------|
| DNS Resolution | ✓ Working | Resolves to 172.67.196.246 |
| TLS Handshake | ✓ Working | Connection establishes |
| Commit Endpoint | ✗ Timeout | Requests timeout after 30s |
| Mock Tests | ✓ Working | All 5 tests pass |

**Recommendation:** Use mock tests for development until Crow API is responsive.

---

## 🎓 Learn More

1. Read `CROW_TESTING_README.md` for detailed documentation
2. Review `CROW_TEST_SUMMARY.md` for current status
3. Check `backend/services/graphql_service.py` for integration examples
4. See ResCanvas Copilot instructions for workflow guidelines

---

*Quick Reference v1.0 | Last Updated: 2025-11-17*
