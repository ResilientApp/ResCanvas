#!/bin/bash
# Quick Test Reference - ResCanvas Project
# This file provides quick commands for running different test scenarios

# ============================================
# RECOMMENDED: Unified Test Runner
# ============================================

# Run ALL tests (backend + frontend + E2E)
./scripts/run_all_tests_unified.sh

# ============================================
# Individual Test Categories
# ============================================

# Backend Unit Tests Only
cd backend && pytest tests/unit/ -v

# Backend Integration Tests Only
cd backend && pytest tests/integration/ -v

# Backend E2E Tests Only
cd backend && pytest tests/test_*.py -v

# Backend All Tests with Coverage
cd backend && pytest tests/ --cov=routes --cov=services --cov=middleware --cov-report=html

# Frontend Unit Tests (Jest)
cd frontend && npm test -- --watchAll=false

# Frontend E2E Tests (Playwright - requires running servers)
cd frontend && npx playwright test tests/e2e/ --reporter=list

# Specific E2E Test File
cd frontend && npx playwright test tests/e2e/auth.spec.js --reporter=list

# ============================================
# Test with UI/Debugging
# ============================================

# Playwright with UI mode
cd frontend && npx playwright test --ui

# Playwright with headed browser
cd frontend && npx playwright test --headed

# Playwright debug mode
cd frontend && npx playwright test --debug

# ============================================
# Coverage Reports
# ============================================

# Generate backend coverage
cd backend && pytest tests/ --cov=routes --cov=services --cov=middleware --cov-report=html:htmlcov

# View backend coverage (Linux)
xdg-open backend/htmlcov/index.html

# View Playwright report
cd frontend && npx playwright show-report

# ============================================
# Quick Checks
# ============================================

# Check syntax of unified script
bash -n scripts/run_all_tests_unified.sh

# Check if servers are running
curl -s http://localhost:10010/health && echo "Backend running"
curl -s http://localhost:3000 && echo "Frontend running"

# Install Playwright browsers
cd frontend && npx playwright install chromium

# ============================================
# Server Management
# ============================================

# Start backend (manual)
cd backend && python3 app.py

# Start frontend (manual)
cd frontend && PORT=3000 npm start

# Kill processes on ports (if stuck)
lsof -ti:10010 | xargs kill -9  # Backend
lsof -ti:3000 | xargs kill -9   # Frontend

# ============================================
# CI/CD Command
# ============================================

# Single command for CI/CD
bash scripts/run_all_tests_unified.sh

# ============================================
# Test File Locations
# ============================================

# Backend Tests:
#   - Unit: backend/tests/unit/
#   - Integration: backend/tests/integration/
#   - E2E: backend/tests/test_*.py

# Frontend Tests:
#   - Unit: frontend/src/__tests__/, frontend/tests/unit/
#   - E2E: frontend/tests/e2e/*.spec.js
#   - Smoke: frontend/tests/playwright_smoke.spec.js

# ============================================
# Troubleshooting
# ============================================

# View backend test logs
cat /tmp/rescanvas_backend_test.log

# View frontend test logs
cat /tmp/rescanvas_frontend_test.log

# Run specific test with verbose output
cd backend && pytest tests/unit/test_auth.py -v -s

# Run Playwright test with trace
cd frontend && npx playwright test --trace on

# ============================================
# Quick Stats
# ============================================

# Count backend test files
find backend/tests -name "test_*.py" -type f | wc -l

# Count frontend E2E test files
find frontend/tests/e2e -name "*.spec.js" -type f | wc -l

# List all backend test files
find backend/tests -name "test_*.py" -type f

# List all E2E test files
find frontend/tests/e2e -name "*.spec.js" -type f

# ============================================
# Performance Testing
# ============================================

# Run backend benchmarks (if available)
cd backend && pytest benchmarks/ -v

# Run load tests (if available)
cd backend/benchmarks && python load_test.py

echo "Quick Test Reference loaded! Use commands above for testing."
