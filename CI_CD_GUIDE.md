# CI/CD Setup Guide for ResCanvas

This guide explains how to set up and use the CI/CD pipelines for ResCanvas.

## 🚀 Quick Start

### GitHub Actions Setup

1. **No configuration needed!** Workflows are pre-configured in `.github/workflows/`
2. Push code or create a PR to trigger automatic testing
3. View results in the "Actions" tab on GitHub

### Local Testing

```bash
# Run all tests (optimized for speed)
./scripts/run_all_tests_parallel.sh

# Fast mode (skip coverage)
./scripts/run_all_tests_parallel.sh --fast

# Original sequential script (more stable)
./scripts/run_all_tests_unified.sh
```

## 📋 Available Workflows

### 1. Full Test Suite (`ci-tests.yml`)

**Triggers:**
- Push to `main`, `develop`, or `integration_tests` branches
- Pull requests to `main` or `develop`
- Manual dispatch

**What it does:**
- Runs backend tests on Python 3.10 & 3.11
- Runs frontend unit tests on Node 20.x & 22.x
- Runs full E2E test suite with Playwright
- Generates coverage reports
- Uploads test artifacts
- Posts summary to PRs

**Duration:** ~10-15 minutes

**Use when:**
- Merging to main branch
- Need full test coverage
- Release validation

### 2. Quick Check (`ci-quick.yml`)

**Triggers:**
- Push to any branch (except `main`)
- Pull request opened/updated

**What it does:**
- Runs unit tests only (no E2E)
- Lint and format checks
- Build validation
- Fast feedback

**Duration:** ~5-8 minutes

**Use when:**
- Developing features
- Need fast feedback
- Pre-commit validation

## 🔧 Configuration

### Environment Variables

The workflows use these environment variables (automatically configured):

```yaml
NODE_VERSION: '20.x'       # Node.js version
PYTHON_VERSION: '3.10'     # Python version
API_BASE: http://localhost:10010
APP_BASE: http://localhost:3000
```

### Required Services

Both workflows automatically start:
- **Redis** (port 6379)
- **MongoDB** (port 27017)

### Secrets Configuration

Required GitHub secrets (set in repository settings):

```bash
# Currently no secrets required for testing
# Future: Add these for deployment
DEPLOY_KEY=...
CODECOV_TOKEN=...
```

## 📊 Viewing Test Results

### 1. GitHub Actions UI

1. Go to repository → Actions tab
2. Click on workflow run
3. View detailed logs and test results

### 2. PR Comments

Automated comments show:
- Test pass/fail status
- 📊 Coverage changes
- 🔗 Links to detailed reports

### 3. Downloadable Artifacts

Available for 30 days:
- Backend coverage reports
- Frontend coverage reports
- Playwright HTML reports
- Test failure screenshots/videos

**Download:**
1. Go to workflow run
2. Scroll to "Artifacts" section
3. Click to download

## 🔍 Test Matrix

### Backend Tests

| Python Version | OS | Tests Run |
|---------------|-------|-----------|
| 3.10 | Ubuntu Latest | Unit + Integration + E2E |
| 3.11 | Ubuntu Latest | Unit + Integration + E2E |

### Frontend Unit Tests

| Node Version | OS | Tests Run |
|-------------|-------|-----------|
| 20.x | Ubuntu Latest | Jest unit tests |
| 22.x | Ubuntu Latest | Jest unit tests |

### E2E Tests

| Browser | OS | Tests Run |
|---------|-------|-----------|
| Chromium | Ubuntu Latest | All Playwright tests |

## ⚡ Performance Optimization

### Parallel Execution

**Frontend E2E (Playwright):**
```javascript
workers: process.env.CI ? 2 : 4
```
- CI uses 2 workers (stable)
- Local uses up to 4 workers (faster)

**Frontend Unit (Jest):**
```bash
npm test -- --maxWorkers=4
```
- Parallel by default
- Scales with CPU cores

**Backend (Pytest):**
```bash
pytest -n auto  # Optional parallel mode
```
- Sequential by default (shared state)
- Can enable parallel with `-n auto`

### Caching

Workflows cache:
- Python pip packages
- Node modules
- Playwright browsers

**Benefits:**
- 50% faster subsequent runs
- Reduced bandwidth usage

## 🐛 Debugging Failed Tests

### Step 1: Check Workflow Logs

```bash
# View logs in GitHub UI
Actions → Failed workflow → Click on failed job → View logs
```

### Step 2: Download Artifacts

```bash
# For E2E failures
1. Download "playwright-failures" artifact
2. Extract and view screenshots/videos
3. Open trace files with: npx playwright show-trace trace.zip
```

### Step 3: Reproduce Locally

```bash
# Run same test locally
cd frontend
npx playwright test tests/e2e/errors.spec.js --debug

# Or run full suite
./scripts/run_all_tests_parallel.sh
```

### Step 4: Check Service Logs

```bash
# In workflow logs, check:
- Backend startup logs
- Frontend build logs
- Service health checks
```

## 🔒 Branch Protection Rules

### Recommended Settings

For `main` and `develop` branches:

1. **Require status checks to pass:**
   - Backend Tests (Python 3.10)
   - Frontend Unit Tests (Node 20.x)
   - Frontend E2E Tests
   - Test Summary

2. **Require branches to be up to date**

3. **Require pull request reviews:** 1 approval

4. **Dismiss stale reviews on push**

### Setup Instructions

```bash
# Via GitHub UI:
Settings → Branches → Add branch protection rule

# Or via GitHub CLI:
gh api repos/:owner/:repo/branches/main/protection -X PUT -f required_status_checks='{"strict":true,"contexts":["Backend Tests","Frontend E2E Tests"]}'
```

## 📈 Coverage Reports

### Codecov Integration

To enable Codecov:

1. Sign up at [codecov.io](https://codecov.io)
2. Add repository
3. Add `CODECOV_TOKEN` to GitHub secrets
4. Coverage automatically uploaded on test runs

### Local Coverage

```bash
# Backend
cd backend
pytest --cov=. --cov-report=html
open htmlcov/index.html

# Frontend
cd frontend
npm test -- --coverage
open coverage/lcov-report/index.html
```

## 🚦 Status Badges

Add to README.md:

```markdown
[![CI Tests](https://github.com/ResilientApp/ResCanvas/workflows/CI%20-%20Full%20Test%20Suite/badge.svg)](https://github.com/ResilientApp/ResCanvas/actions)
[![Quick Check](https://github.com/ResilientApp/ResCanvas/workflows/CI%20-%20Quick%20Check/badge.svg)](https://github.com/ResilientApp/ResCanvas/actions)
```

## 🔄 Workflow Customization

### Trigger on Specific Paths

```yaml
on:
  push:
    paths:
      - 'backend/**'
      - 'frontend/**'
      - '.github/workflows/**'
```

### Skip CI

Add to commit message:
```bash
git commit -m "docs: update README [skip ci]"
```

### Manual Workflow Dispatch

```bash
# Via GitHub UI: Actions → Select workflow → Run workflow

# Via CLI:
gh workflow run ci-tests.yml
```

## 📝 Best Practices

### 1. Write Fast Tests
- Mock external APIs
- Use fixtures for data
- Minimize database operations

### 2. Keep Tests Isolated
- No shared state between tests
- Clean up after each test
- Use unique identifiers

### 3. Test Locally First
```bash
# Before pushing
./scripts/run_all_tests_parallel.sh

# Quick pre-commit check
pytest tests/unit/ -q
npm test -- --watchAll=false
```

### 4. Use Appropriate Workflow
- **Quick Check:** For work-in-progress
- **Full Suite:** Before merging

### 5. Monitor Performance
- Track workflow duration
- Optimize slow tests
- Review flaky test patterns

## 🆘 Common Issues

### Issue: Workflow Stuck Waiting

**Solution:**
```bash
# Check if required status checks exist
gh api repos/:owner/:repo/branches/main/protection

# Update branch protection if needed
```

### Issue: Tests Pass Locally, Fail in CI

**Causes:**
1. Timing differences
2. Environment variables
3. Service versions

**Debug:**
```bash
# Match CI environment locally
export CI=true
./scripts/run_all_tests_parallel.sh --ci
```

### Issue: Slow Workflow Execution

**Optimize:**
1. Enable caching (already done)
2. Run quick check on PRs
3. Use fail-fast for faster feedback
4. Parallelize more tests

### Issue: Flaky E2E Tests

**Solutions:**
```javascript
// Increase timeouts
timeout: 60000

// Add retries
retries: 2

// Better waits
await page.waitForLoadState('networkidle')
```

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Playwright CI Guide](https://playwright.dev/docs/ci)
- [Jest CI Configuration](https://jestjs.io/docs/cli#--ci)
- [Pytest in CI](https://docs.pytest.org/en/stable/how-to/usage.html#dropping-to-pdb-python-debugger-on-failures)

## 🤝 Contributing

When adding new tests:
1. Ensure they pass locally
2. Check they work in parallel (if applicable)
3. Update documentation if needed
4. Test in CI before merging

## 📞 Support

For CI/CD issues:
1. Check workflow logs
2. Review this guide
3. Check [GitHub Actions status](https://www.githubstatus.com/)
4. Open an issue with workflow run link
