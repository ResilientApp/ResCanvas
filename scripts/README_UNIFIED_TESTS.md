# ResCanvas Unified Test Runner

## Overview

The **unified test runner** (`run_all_tests_unified.sh`) combines all testing functionality from the previous four separate test scripts into a single, comprehensive test execution system.

## What It Does

This script runs **ALL** tests in the ResCanvas project with **NO SKIPS**, ensuring complete test coverage:

### 1. **Backend Tests**
   - Unit tests (`backend/tests/unit/`)
   - Integration tests (`backend/tests/integration/`)
   - E2E tests (`backend/tests/test_*.py`)
   - Coverage analysis with HTML report generation

### 2. **Frontend Tests**
   - Jest unit tests (`frontend/src/__tests__/`, `frontend/tests/unit/`)

### 3. **Playwright E2E Tests** (All test files)
   - Authentication tests (`auth.spec.js`)
   - Profile tests (`profile.spec.js`)
   - Room management tests (`rooms.spec.js`)
   - Collaboration tests (`collaboration.spec.js`)
   - Room settings tests (`roomSettings.spec.js`)
   - Drawing tests (`drawing.spec.js`)
   - Navigation tests (`navigation.spec.js`)
   - Error handling tests (`errors.spec.js`)
   - Smoke tests (`playwright_smoke.spec.js`)

## Features

✅ **Comprehensive Coverage**: Runs ALL tests from all four original scripts
✅ **No Skipped Tests**: Ensures every test suite executes
✅ **Smart Server Management**: Auto-starts backend/frontend if not running
✅ **Detailed Reporting**: Color-coded output with pass/fail/skip tracking
✅ **Automatic Cleanup**: Stops servers if started by the script
✅ **Error Handling**: Stops on first failure with detailed error output
✅ **Coverage Reports**: Generates HTML coverage reports for backend
✅ **Test Count Tracking**: Displays number of tests in each suite

## Usage

### Basic Usage
```bash
# Run all tests
./scripts/run_all_tests_unified.sh

# Or from project root
bash scripts/run_all_tests_unified.sh
```

### Prerequisites
1. **Backend dependencies installed**: `pip install -r backend/requirements.txt`
2. **Frontend dependencies installed**: `cd frontend && npm install`
3. **Playwright browsers installed**: `cd frontend && npx playwright install chromium`
4. **Backend/Frontend running** (optional - script will start them if needed)

### Exit Codes
- `0`: All tests passed, no skips
- `1`: Some tests failed OR tests were skipped

## Comparison with Original Scripts

### Original Scripts
1. **`frontend/run-all-tests.sh`**: Only ran 3 Playwright tests (profile, collaboration, roomSettings)
2. **`scripts/run_all_tests_complete.sh`**: Attempted comprehensive testing but had parsing issues
3. **`scripts/run_all_tests.sh`**: Backend + Frontend + limited E2E
4. **`scripts/run_playwright_tests.sh`**: Only Playwright tests with server management

### Unified Script Advantages
- ✅ Runs **ALL 9 Playwright test files** (vs 3 in original)
- ✅ Better error handling and reporting
- ✅ More robust server startup/shutdown
- ✅ Tracks skipped tests and prevents them
- ✅ Consolidated output with clear summaries
- ✅ More reliable test count extraction
- ✅ Single point of maintenance

## Output Example

```
========================================
  ResCanvas Unified Test Suite
========================================

Project Root: /home/ubuntu/resilient-apps/ResCanvas
Date: Tue Oct 14 12:00:00 UTC 2025

----------------------------------------
  Phase 1: Backend Unit Tests
----------------------------------------

▶ Running Backend Unit Tests...
✓ Backend Unit Tests passed
  (12 tests)

----------------------------------------
  Phase 2: Backend Integration Tests
----------------------------------------

▶ Running Backend Integration Tests...
✓ Backend Integration Tests passed
  (18 tests)

... [additional phases] ...

========================================
  Test Execution Summary
========================================

Passed Tests (15):
  ✓ Backend Unit Tests
  ✓ Backend Integration Tests
  ✓ Backend E2E Tests
  ✓ Backend Coverage Report
  ✓ Frontend Unit Tests (Jest)
  ✓ E2E: Authentication Tests
  ✓ E2E: Profile Tests
  ✓ E2E: Rooms Tests
  ✓ E2E: Collaboration Tests
  ✓ E2E: Room Settings Tests
  ✓ E2E: Drawing Tests
  ✓ E2E: Navigation Tests
  ✓ E2E: Error Handling Tests
  ✓ E2E: Smoke Tests

✅ ALL TESTS PASSED! NO SKIPS!
Total test suites: 15
Total test cases: ~147
```

## Test Reports

After running, view detailed reports:

### Backend Coverage
```bash
# Open in browser
xdg-open backend/htmlcov/index.html
```

### Playwright E2E Report
```bash
cd frontend
npx playwright show-report
```

## Troubleshooting

### Servers Won't Start
- Check ports 10010 and 3000 are not in use
- View logs: `/tmp/rescanvas_backend_test.log` and `/tmp/rescanvas_frontend_test.log`

### Playwright Browser Issues
```bash
cd frontend
npx playwright install chromium --force
```

### Backend Test Failures
```bash
# Run backend tests separately for more details
cd backend
pytest tests/ -v --tb=long
```

### Frontend Test Failures
```bash
# Run frontend tests separately
cd frontend
npm test -- --verbose
```

## Integration with CI/CD

Add to your CI/CD pipeline:

```yaml
# Example GitHub Actions
- name: Run All Tests
  run: |
    chmod +x scripts/run_all_tests_unified.sh
    ./scripts/run_all_tests_unified.sh
```

## Maintenance

When adding new tests:
1. Backend tests: Add to appropriate directory (`unit/`, `integration/`, or root `test_*.py`)
2. Frontend Jest tests: Add to `frontend/src/__tests__/` or `frontend/tests/unit/`
3. Playwright tests: Add to `frontend/tests/e2e/`
4. Update this README if adding new test categories

## Migration from Old Scripts

### Deprecated Scripts (can be removed):
- `frontend/run-all-tests.sh` → Now covered by unified script
- `scripts/run_all_tests_complete.sh` → Replaced by unified script
- `scripts/run_all_tests.sh` → Replaced by unified script
- `scripts/run_playwright_tests.sh` → Integrated into unified script

### Migration Command
```bash
# Backup old scripts (optional)
mkdir -p scripts/legacy
mv frontend/run-all-tests.sh scripts/legacy/
mv scripts/run_all_tests_complete.sh scripts/legacy/
mv scripts/run_all_tests.sh scripts/legacy/
mv scripts/run_playwright_tests.sh scripts/legacy/

# Use new unified script
./scripts/run_all_tests_unified.sh
```

## Support

For issues or questions:
1. Check this README
2. Review test output and error messages
3. Check individual test files for specific failures
4. Consult project documentation in `/docs`

---

**Last Updated**: October 14, 2025
**Script Version**: 1.0.0
**Maintainer**: ResCanvas Team
