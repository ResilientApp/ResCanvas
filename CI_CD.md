# ResCanvas CI/CD Pipeline Documentation

## Overview

ResCanvas uses GitHub Actions for continuous integration and continuous deployment. The pipeline automatically runs on every commit and pull request to ensure code quality and prevent regressions.

## Pipeline Architecture

The CI/CD pipeline consists of 5 parallel jobs that execute different test suites:

```
┌─────────────────────────────────────────────┐
│           GitHub Actions Workflow            │
│                                              │
│  ┌────────────────┐  ┌──────────────────┐  │
│  │ Backend Unit   │  │ Backend Integr.  │  │
│  │ Tests          │  │ Tests            │  │
│  └────────────────┘  └──────────────────┘  │
│                                              │
│  ┌────────────────┐  ┌──────────────────┐  │
│  │ Frontend Unit  │  │ E2E Tests        │  │
│  │ Tests          │  │ (Playwright)     │  │
│  └────────────────┘  └──────────────────┘  │
│                                              │
│  ┌────────────────┐                         │
│  │ Code Quality   │                         │
│  │ (Linting)      │                         │
│  └────────────────┘                         │
│                                              │
│  ┌────────────────────────────────────────┐ │
│  │   Coverage Report (combines all jobs)  │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## Workflow File

Location: `.github/workflows/test.yml`

### Triggers

The pipeline runs on:
- **Push** to `main` or `develop` branches
- **Pull requests** targeting `main` or `develop` branches

### Environment Variables

```yaml
env:
  PYTHON_VERSION: '3.10'
  NODE_VERSION: '18'
```

## Job Breakdown

### 1. Backend Unit Tests

**Purpose**: Fast, isolated tests for backend services and utilities

**Runtime**: ~2-3 minutes

**Steps**:
1. Checkout code
2. Set up Python 3.10
3. Cache pip dependencies
4. Install backend dependencies
5. Run unit tests with pytest
6. Upload coverage to Codecov
7. Upload coverage artifacts

**Command**:
```bash
pytest tests/unit/ -v --cov=. --cov-report=xml --cov-report=html -n auto -m unit
```

**Flags**:
- `-v`: Verbose output
- `--cov=.`: Measure code coverage
- `--cov-report=xml`: Generate XML coverage report for Codecov
- `--cov-report=html`: Generate HTML coverage report
- `-n auto`: Run tests in parallel
- `-m unit`: Only run tests marked as unit tests

### 2. Backend Integration Tests

**Purpose**: Test API endpoints and component interactions

**Runtime**: ~3-5 minutes

**Services**:
- **Redis**: Used for caching strokes and undo/redo stacks

**Steps**:
1. Checkout code
2. Start Redis service container
3. Set up Python 3.10
4. Cache pip dependencies
5. Install backend dependencies
6. Run integration tests with pytest
7. Upload coverage to Codecov
8. Upload coverage artifacts

**Command**:
```bash
pytest tests/integration/ -v --cov=. --cov-report=xml --cov-report=html -n auto -m integration
```

**Environment**:
```yaml
env:
  REDIS_HOST: localhost
  REDIS_PORT: 6379
  TESTING: '1'
```

### 3. Frontend Unit Tests

**Purpose**: Test React components, utilities, and API clients

**Runtime**: ~2-3 minutes

**Steps**:
1. Checkout code
2. Set up Node.js 18
3. Cache node_modules
4. Install frontend dependencies
5. Run Jest tests with coverage
6. Upload coverage to Codecov
7. Upload coverage artifacts

**Command**:
```bash
npm test -- --coverage --watchAll=false --testPathPattern="tests/unit"
```

**Flags**:
- `--coverage`: Generate coverage report
- `--watchAll=false`: Run once and exit (no watch mode)
- `--testPathPattern="tests/unit"`: Only run unit tests

### 4. End-to-End Tests

**Purpose**: Full-stack integration tests with real browser automation

**Runtime**: ~5-10 minutes

**Services**:
- **Redis**: For backend caching

**Steps**:
1. Checkout code
2. Start Redis service container
3. Set up Python 3.10 and Node.js 18
4. Cache dependencies
5. Install backend dependencies
6. Install frontend dependencies
7. Install Playwright browsers (Chromium)
8. Start backend server in background
9. Start frontend server in background
10. Run Playwright E2E tests
11. Stop servers
12. Upload Playwright HTML report

**Commands**:
```bash
# Start backend
cd backend && python app.py &

# Start frontend
cd frontend && npm start &

# Run E2E tests
cd frontend && npx playwright test tests/e2e/ --reporter=html
```

**Environment**:
```yaml
env:
  API_BASE: http://localhost:10010
  APP_BASE: http://localhost:3000
```

**Important**: The job always stops servers even if tests fail (`if: always()`)

### 5. Code Quality Checks

**Purpose**: Enforce code style and catch syntax errors

**Runtime**: ~1-2 minutes

**Steps**:
1. Checkout code
2. Set up Python and Node.js
3. Install linters (flake8, black, eslint)
4. Run Python linters
5. Run JavaScript linters

**Python checks**:
```bash
# Critical syntax errors only
flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics

# Check black formatting
black --check . --exclude='incubator-*'
```

**JavaScript checks**:
```bash
npm run lint || true
```

Note: ESLint failures are non-blocking (`|| true`)

### 6. Coverage Report

**Purpose**: Aggregate coverage from all test jobs

**Runtime**: ~1 minute

**Dependencies**: Runs after backend-unit, backend-integration, and frontend-unit jobs complete

**Steps**:
1. Checkout code
2. Download all coverage artifacts
3. Display coverage summary in GitHub Actions UI

## Coverage Reporting

### Codecov Integration

All test jobs upload coverage reports to Codecov with different flags:

- `backend-unit`: Backend unit test coverage
- `backend-integration`: Backend integration test coverage
- `frontend-unit`: Frontend unit test coverage

### Coverage Badges

Add badges to README.md:

```markdown
[![codecov](https://codecov.io/gh/YOUR_ORG/ResCanvas/branch/main/graph/badge.svg)](https://codecov.io/gh/YOUR_ORG/ResCanvas)
```

### Coverage Thresholds

**Backend**:
- Minimum: 75% (enforced in `pytest.ini`)
- Fails build if coverage drops below threshold

**Frontend**:
- Target: 70%
- Not enforced in CI (can be added to `package.json`)

## Artifacts

The pipeline generates and uploads the following artifacts:

1. **backend-unit-coverage**: HTML coverage report for backend unit tests
2. **backend-integration-coverage**: HTML coverage report for backend integration tests
3. **frontend-unit-coverage**: HTML coverage report for frontend unit tests
4. **playwright-report**: HTML report for E2E test results

**Accessing artifacts**:
1. Go to GitHub Actions tab
2. Click on a workflow run
3. Scroll to "Artifacts" section at the bottom
4. Download and extract the artifact ZIP file

## Caching Strategy

The pipeline uses GitHub Actions cache to speed up builds:

### Python Dependencies
```yaml
- uses: actions/cache@v3
  with:
    path: ~/.cache/pip
    key: ${{ runner.os }}-pip-${{ hashFiles('**/requirements.txt') }}
```

### Node.js Dependencies
```yaml
- uses: actions/cache@v3
  with:
    path: frontend/node_modules
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
```

**Cache invalidation**: Cache is automatically invalidated when dependency files change

## Failure Handling

### What happens when tests fail?

1. **Failed job**: The specific job shows a red X
2. **PR status**: GitHub marks the PR as failing required checks
3. **Notifications**: Configured users receive email notifications
4. **Merge blocking**: PRs cannot be merged until all required checks pass

### Debugging failed tests in CI

1. **View logs**:
   - Click on the failed job
   - Expand the failed step
   - View full error output

2. **Download artifacts**:
   - Coverage reports show which code is untested
   - Playwright reports show screenshots and traces

3. **Reproduce locally**:
   ```bash
   # Backend tests
   cd backend && pytest tests/unit/ -v
   
   # Frontend tests
   cd frontend && npm test
   
   # E2E tests
   cd frontend && npx playwright test
   ```

4. **Common fixes**:
   - Update mocks to match new API responses
   - Fix race conditions in E2E tests (add waits)
   - Update test assertions for changed behavior
   - Fix linting errors

## Local Testing Before Push

**Run full test suite locally**:

```bash
# From project root
./scripts/run_all_tests.sh
```

**Or run individually**:

```bash
# Backend
cd backend
pytest tests/unit/ -v
pytest tests/integration/ -v

# Frontend
cd frontend
npm test -- --watchAll=false
npx playwright test tests/e2e/

# Linting
cd backend && flake8 . --select=E9,F63,F7,F82
cd frontend && npm run lint
```

## Branch Protection Rules

Recommended settings for `main` branch:

1. ☑️ Require status checks to pass before merging
   - ☑️ backend-unit-tests
   - ☑️ backend-integration-tests
   - ☑️ frontend-unit-tests
   - ☑️ e2e-tests
   - ☑️ code-quality

2. ☑️ Require branches to be up to date before merging

3. ☑️ Require pull request reviews (at least 1)

4. ☑️ Dismiss stale pull request approvals when new commits are pushed

## Performance Optimization

### Current timings (approximate)

| Job | Duration |
|-----|----------|
| Backend Unit Tests | 2-3 min |
| Backend Integration Tests | 3-5 min |
| Frontend Unit Tests | 2-3 min |
| E2E Tests | 5-10 min |
| Code Quality | 1-2 min |

**Total pipeline time**: ~10-15 minutes (jobs run in parallel)

### Optimization strategies

1. **Caching**: Reuse dependencies across runs
2. **Parallel execution**: pytest `-n auto`, Jest parallel workers
3. **Selective test running**: Only run affected tests (future enhancement)
4. **Matrix builds**: Run E2E tests across multiple browsers in parallel

## Future Enhancements

### Planned improvements

1. **Deploy on success**: Auto-deploy to staging on main branch push
2. **Visual regression testing**: Screenshot comparison for UI changes
3. **Performance regression detection**: Track and alert on performance degradation
4. **Slack/Discord notifications**: Real-time test failure alerts
5. **Test selection**: Only run tests affected by changed files
6. **Nightly full tests**: Extended test suite with larger datasets
7. **Load testing**: Automated stress tests on staging environment

### Adding new test jobs

To add a new job to the pipeline:

1. Edit `.github/workflows/test.yml`
2. Add new job under `jobs:` section
3. Use existing jobs as template
4. Add job to branch protection rules

Example:
```yaml
new-test-job:
  name: New Test Suite
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - name: Run new tests
      run: ./scripts/run_new_tests.sh
```

## Monitoring and Metrics

### Key metrics to track

1. **Test execution time**: Monitor for slowdowns
2. **Flaky test rate**: Tests that fail intermittently
3. **Code coverage trends**: Should increase over time
4. **Build success rate**: Target > 95%
5. **Time to green**: Average time from push to all tests passing

### Viewing metrics

- **GitHub Actions**: Insights tab shows workflow runs
- **Codecov**: Coverage trends over time
- **Custom dashboard**: Can be built with GitHub API

## Secrets Management

Required secrets (configure in GitHub Settings → Secrets):

- `CODECOV_TOKEN`: For uploading coverage reports
- `MONGO_ATLAS_URI`: MongoDB connection string (if needed for integration tests)
- `VAULT_ADDR`, `VAULT_TOKEN`: HashiCorp Vault credentials (if used)

**Adding secrets**:
1. Go to repo Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add name and value
4. Reference in workflow: `${{ secrets.SECRET_NAME }}`

## Troubleshooting

### Issue: Caching not working

**Solution**: Clear cache via GitHub Actions UI or change cache key

### Issue: E2E tests timeout in CI but pass locally

**Possible causes**:
- GitHub runners are slower than local machine
- Network latency to external services
- Resource constraints

**Solutions**:
- Increase timeouts in tests
- Mock external API calls
- Use faster GitHub runner (paid plans)

### Issue: Flaky tests

**Symptoms**: Tests pass sometimes, fail other times

**Solutions**:
- Add explicit waits instead of fixed timeouts
- Ensure tests clean up after themselves
- Use deterministic test data (avoid Date.now())
- Isolate tests (don't share state)

### Issue: "Resource not accessible by integration" error

**Cause**: Insufficient GitHub token permissions

**Solution**: Update workflow permissions in `.github/workflows/test.yml`:
```yaml
permissions:
  contents: read
  pull-requests: write
  checks: write
```

## Support

For CI/CD issues:
1. Check [GitHub Actions documentation](https://docs.github.com/en/actions)
2. Review job logs for specific error messages
3. Search existing GitHub issues
4. Create new issue with job logs and error details

---

**Last updated**: October 2025  
**Maintained by**: ResCanvas Core Team
