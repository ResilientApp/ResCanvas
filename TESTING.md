# ResCanvas Testing Guide

## Table of Contents
- [Overview](#overview)
- [Test Structure](#test-structure)
- [Quick Start](#quick-start)
- [Backend Tests](#backend-tests)
- [Frontend Tests](#frontend-tests)
- [End-to-End Tests](#end-to-end-tests)
- [Performance Tests](#performance-tests)
- [Writing Tests](#writing-tests)
- [Troubleshooting](#troubleshooting)

## Overview

ResCanvas uses a comprehensive testing pyramid approach with three layers:

- **Unit Tests (35% target)**: Isolated tests for individual functions/classes
- **Integration Tests (40% target)**: Tests for API endpoints and component interactions
- **End-to-End Tests (25% target)**: Full user journey tests with real browsers

### Test Framework Stack

**Backend:**
- `pytest` - Test runner and framework
- `pytest-cov` - Code coverage reporting
- `fakeredis` - Redis mock for isolated testing
- `mongomock` - MongoDB mock for isolated testing

**Frontend:**
- `Jest` - Test runner and framework
- `React Testing Library` - Component testing utilities
- `MSW` (Mock Service Worker) - API request mocking
- `Playwright` - E2E browser automation

## Test Structure

```
backend/tests/
├── conftest.py              # Shared fixtures and test configuration
├── pytest.ini               # Pytest configuration
├── unit/                    # Unit tests (isolated, fast)
│   ├── test_auth.py
│   ├── test_crypto_service.py
│   ├── test_graphql_service.py
│   └── test_canvas_counter_unit.py
├── integration/             # Integration tests (API endpoints)
│   ├── test_auth_api.py
│   ├── test_rooms_api.py
│   ├── test_strokes_api.py
│   └── test_undo_redo_api.py
└── e2e/                     # End-to-end tests (full workflows)

frontend/tests/
├── setupTests.js            # Jest and MSW setup
├── testUtils.js             # Shared test utilities
├── mocks/
│   └── server.js            # MSW API mock handlers
├── unit/
│   ├── api/                 # API client tests
│   └── utils/               # Utility function tests
│       ├── authUtils.test.js
│       └── getAuthUser.test.js
├── integration/             # Component integration tests
└── e2e/                     # Playwright E2E tests
    ├── auth.spec.js
    ├── drawing.spec.js
    └── rooms.spec.js
```

## Quick Start

### Run All Tests

```bash
# From project root
./scripts/run_all_tests.sh
```

### Run Backend Tests

```bash
cd backend

# All backend tests
pytest

# Unit tests only
pytest tests/unit/ -v -m unit

# Integration tests only
pytest tests/integration/ -v -m integration

# With coverage report
pytest --cov=. --cov-report=html --cov-report=term-missing

# Run specific test file
pytest tests/unit/test_auth.py -v

# Run specific test function
pytest tests/unit/test_auth.py::TestExtractToken::test_extract_token_valid_bearer -v
```

### Run Frontend Tests

```bash
cd frontend

# All Jest tests (unit + integration)
npm test

# Unit tests only
npm test -- --testPathPattern="tests/unit"

# With coverage
npm test -- --coverage --watchAll=false

# E2E tests with Playwright
npx playwright test tests/e2e/

# E2E with UI mode
npx playwright test --ui

# E2E specific test
npx playwright test tests/e2e/auth.spec.js
```

## Backend Tests

### Unit Tests

Unit tests focus on individual functions and classes in isolation with all external dependencies mocked.

**Example: Testing authentication middleware**

```python
def test_decode_valid_token():
    user_id = str(ObjectId())
    token = create_jwt_token(user_id, 'testuser', 3600)
    
    claims = decode_and_verify_token(token)
    
    assert claims['sub'] == user_id
    assert claims['username'] == 'testuser'
```

**Run unit tests:**
```bash
cd backend
pytest tests/unit/ -v -m unit
```

### Integration Tests

Integration tests validate API endpoints and interactions between components.

**Example: Testing room creation API**

```python
def test_create_room_success(client, mock_mongodb, mock_redis, auth_headers, mock_graphql_service):
    response = client.post('/rooms', 
        json={'name': 'New Room', 'type': 'public'},
        headers=auth_headers)
    
    assert response.status_code == 201
    data = response.get_json()
    assert data['room']['name'] == 'New Room'
```

**Run integration tests:**
```bash
cd backend
pytest tests/integration/ -v -m integration
```

### Test Fixtures

Backend tests use fixtures defined in `conftest.py`:

- `app` - Flask application instance
- `client` - Flask test client
- `mock_redis` - Fake Redis instance
- `mock_mongodb` - Fake MongoDB instance
- `test_user` - Pre-created test user
- `jwt_token` - Valid JWT token for test user
- `auth_headers` - Authorization headers with JWT
- `test_room` - Pre-created test room
- `private_room` - Pre-created private room with encryption
- `secure_room` - Pre-created secure room requiring wallet

## Frontend Tests

### Unit Tests

Frontend unit tests validate individual functions and utilities.

**Example: Testing auth utilities**

```javascript
import { isTokenValid, getAuthToken } from '../../../src/utils/authUtils';

describe('authUtils', () => {
  it('should return true for valid token', () => {
    const futureTime = Math.floor(Date.now() / 1000) + 3600;
    const payload = JSON.stringify({ exp: futureTime });
    const token = `header.${btoa(payload)}.signature`;

    expect(isTokenValid(token)).toBe(true);
  });
});
```

**Run frontend unit tests:**
```bash
cd frontend
npm test -- --testPathPattern="tests/unit"
```

### Mock Service Worker (MSW)

Frontend tests use MSW to mock API calls. Mock handlers are defined in `frontend/tests/mocks/server.js`.

**Example mock handler:**

```javascript
rest.post(`${API_BASE}/auth/login`, (req, res, ctx) => {
  const { username, password } = req.body;
  
  if (username === 'testuser' && password === 'Test123!') {
    return res(
      ctx.status(200),
      ctx.json({
        token: 'mock-jwt-token',
        user: { _id: '123', username: 'testuser' }
      })
    );
  }
  
  return res(ctx.status(401), ctx.json({ error: 'Invalid credentials' }));
});
```

## End-to-End Tests

E2E tests use Playwright to simulate real user interactions in actual browsers.

**Example: Testing login flow**

```javascript
test('user can login and access dashboard', async ({ page, request }) => {
  const username = `e2euser_${Date.now()}`;
  const password = 'Test123!';

  // Register user via API
  await request.post(`${API_BASE}/auth/register`, {
    data: { username, password }
  });

  // Navigate to login page
  await page.goto(`${APP_BASE}/login`);
  
  // Fill login form
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Verify redirect to dashboard
  await page.waitForURL('**/dashboard');
  expect(page.url()).toContain('/dashboard');
});
```

**Run E2E tests:**

```bash
cd frontend

# All E2E tests
npx playwright test tests/e2e/

# Specific browser
npx playwright test tests/e2e/ --project=chromium

# With headed browser (see the tests run)
npx playwright test tests/e2e/ --headed

# Debug mode (step through tests)
npx playwright test tests/e2e/ --debug

# Generate test report
npx playwright show-report
```

### E2E Test Best Practices

1. **Use API setup when possible**: Register users and create rooms via API, not UI
2. **Wait for selectors**: Always use `waitForSelector` or `waitForURL` to avoid flakiness
3. **Use data attributes**: Prefer `data-testid` over class/text selectors
4. **Clean up resources**: Delete test rooms and users after tests complete
5. **Isolate tests**: Each test should be independent and not rely on other tests

## Performance Tests

### Load Testing with Locust

Locust simulates concurrent users to measure system performance under load.

**Run load tests:**

```bash
cd backend/benchmarks

# Install locust
pip install locust

# Start load test with web UI
locust -f load_test.py --host=http://localhost:10010

# Open browser to http://localhost:8089
# Configure number of users and spawn rate

# Run headless load test
locust -f load_test.py --host=http://localhost:10010 \
  --users 100 --spawn-rate 10 --run-time 2m --headless
```

**Performance benchmarks:**

The load test measures:
- Stroke write latency (P50, P95, P99)
- Stroke read latency (P50, P95, P99)
- Undo/redo operation latency
- Room list query performance
- Concurrent user handling

**Target metrics:**
- Stroke write P95 < 100ms
- Stroke read P95 < 50ms
- Support 100+ concurrent users per room
- Redis cache hit rate > 95%

## Writing Tests

### Backend Unit Test Template

```python
import pytest
from services.my_service import my_function

@pytest.mark.unit
class TestMyFunction:
    
    def test_basic_functionality(self):
        result = my_function('input')
        assert result == 'expected'
    
    def test_edge_case(self):
        result = my_function(None)
        assert result is None
    
    def test_error_handling(self):
        with pytest.raises(ValueError):
            my_function('invalid')
```

### Backend Integration Test Template

```python
import pytest

@pytest.mark.integration
class TestMyAPI:
    
    def test_endpoint_success(self, client, auth_headers, mock_redis):
        response = client.post('/api/endpoint',
            json={'data': 'value'},
            headers=auth_headers)
        
        assert response.status_code == 200
        data = response.get_json()
        assert 'result' in data
    
    def test_endpoint_requires_auth(self, client):
        response = client.post('/api/endpoint', json={'data': 'value'})
        assert response.status_code == 401
```

### Frontend E2E Test Template

```javascript
test('user can perform action', async ({ page, request }) => {
  // 1. Setup (create user, auth, etc via API)
  const { token, user } = await setupAuthenticatedUser(request);
  
  await page.goto(APP_BASE);
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('auth', JSON.stringify({ token, user }));
  }, { token, user });
  
  // 2. Navigate to feature
  await page.goto(`${APP_BASE}/feature`);
  await page.waitForSelector('.feature-element');
  
  // 3. Perform action
  await page.click('button.action');
  
  // 4. Verify result
  const result = await page.locator('.result').textContent();
  expect(result).toContain('expected');
});
```

## Troubleshooting

### Common Issues

**Issue: `ModuleNotFoundError` in backend tests**

Solution:
```bash
cd backend
pip install -r requirements.txt
pip install pytest pytest-cov fakeredis mongomock
```

**Issue: Frontend tests fail with "Cannot find module"**

Solution:
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

**Issue: E2E tests timeout**

Solution:
- Ensure backend is running on port 10010
- Ensure frontend is running on port 3000
- Increase timeout in test: `await page.waitForSelector('.element', { timeout: 10000 })`
- Check browser console for errors: `npx playwright test --headed`

**Issue: Tests pass locally but fail in CI**

Possible causes:
- Different environment variables
- Missing dependencies in CI config
- Race conditions (add more waits)
- Network timing issues (mock external services)

### Debug Tips

**Backend debugging:**
```bash
# Run single test with verbose output
pytest tests/unit/test_auth.py::test_name -v -s

# Drop into debugger on failure
pytest tests/unit/test_auth.py --pdb

# Show print statements
pytest -v -s
```

**Frontend debugging:**
```bash
# Run tests with console output
npm test -- --verbose

# Debug specific test
node --inspect-brk node_modules/.bin/jest tests/unit/authUtils.test.js

# E2E debugging
npx playwright test --debug
npx playwright test --headed --slowMo=1000
```

## Test Coverage

### View Coverage Reports

**Backend:**
```bash
cd backend
pytest --cov=. --cov-report=html
open htmlcov/index.html  # or xdg-open on Linux
```

**Frontend:**
```bash
cd frontend
npm test -- --coverage --watchAll=false
open coverage/lcov-report/index.html
```

### Coverage Targets

- **Backend**: 75% minimum (enforced in pytest.ini)
- **Frontend**: 70% minimum
- **Critical paths**: 90%+ (auth, stroke submission, encryption)

## Continuous Integration

Tests run automatically on every commit and pull request via GitHub Actions.

See [CI_CD.md](./CI_CD.md) for details on the CI/CD pipeline.

## Additional Resources

- [Pytest Documentation](https://docs.pytest.org/)
- [Jest Documentation](https://jestjs.io/)
- [Playwright Documentation](https://playwright.dev/)
- [React Testing Library](https://testing-library.com/react)
- [MSW Documentation](https://mswjs.io/)
- [Locust Documentation](https://docs.locust.io/)

## Contributing

When adding new features:
1. Write tests FIRST (TDD approach)
2. Ensure tests pass locally before pushing
3. Maintain or improve coverage percentage
4. Update this documentation if adding new test patterns
5. Add test for bug fixes to prevent regressions

## Questions?

If you encounter issues not covered here, please:
1. Check existing GitHub issues
2. Review test logs in CI for more details
3. Ask in the project Discord/Slack channel
4. Create a new issue with test output and environment details
