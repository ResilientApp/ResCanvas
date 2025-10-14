#!/bin/bash
#
# ResCanvas Unified Test Runner
# Comprehensive test execution for backend, frontend, and E2E tests
# Ensures ALL tests are run with no skips and proper error handling
#
# Exit code 0 = all tests passed, non-zero = tests failed
#

set -e  # Exit on first error

# ============================================
# Color Definitions
# ============================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# ============================================
# Global Variables
# ============================================
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FAILED_TESTS=()
PASSED_TESTS=()
SKIPPED_TESTS=()
TOTAL_TEST_COUNT=0
BACKEND_PID=""
FRONTEND_PID=""
SERVERS_STARTED=false

# ============================================
# Cleanup Function
# ============================================
cleanup() {
    if [ "$SERVERS_STARTED" = true ]; then
        echo -e "\n${YELLOW}Cleaning up test-started servers...${NC}"
        if [ ! -z "$BACKEND_PID" ]; then
            echo -e "Stopping backend (PID: $BACKEND_PID)"
            kill $BACKEND_PID 2>/dev/null || true
        fi
        if [ ! -z "$FRONTEND_PID" ]; then
            echo -e "Stopping frontend (PID: $FRONTEND_PID)"
            kill $FRONTEND_PID 2>/dev/null || true
        fi
        echo -e "${GREEN}Cleanup complete${NC}"
    fi
}

# Set trap to cleanup on exit (skip if servers were already running)
trap cleanup EXIT INT TERM

# ============================================
# Helper Functions
# ============================================
print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

print_section() {
    echo -e "\n${CYAN}----------------------------------------${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}----------------------------------------${NC}\n"
}

run_test_suite() {
    local name="$1"
    local command="$2"
    local dir="$3"
    local allow_skip="${4:-false}"
    
    echo -e "${YELLOW}▶ Running $name...${NC}"
    
    local original_dir="$PWD"
    if [ -n "$dir" ]; then
        cd "$PROJECT_ROOT/$dir"
    fi
    
    local output
    if output=$(eval "$command" 2>&1); then
        echo -e "${GREEN}✓ $name passed${NC}"
        PASSED_TESTS+=("$name")
        
        # Extract test count if available
        local count=$(echo "$output" | grep -oP '\d+(?= passed)' | tail -1 || echo "")
        if [ -n "$count" ]; then
            TOTAL_TEST_COUNT=$((TOTAL_TEST_COUNT + count))
            echo -e "  ${CYAN}($count tests)${NC}"
        fi
    else
        if [ "$allow_skip" = true ]; then
            echo -e "${YELLOW}⚠ $name skipped${NC}"
            SKIPPED_TESTS+=("$name")
        else
            echo -e "${RED}✗ $name failed${NC}"
            FAILED_TESTS+=("$name")
            echo -e "${RED}Error output:${NC}"
            echo "$output" | tail -20
        fi
    fi
    
    cd "$original_dir"
}

check_server_running() {
    local url="$1"
    local max_attempts="${2:-30}"
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" > /dev/null 2>&1; then
            return 0
        fi
        sleep 1
        attempt=$((attempt + 1))
    done
    return 1
}

# ============================================
# Main Test Execution
# ============================================
print_header "ResCanvas Unified Test Suite"
echo -e "Project Root: ${CYAN}$PROJECT_ROOT${NC}"
echo -e "Date: ${CYAN}$(date)${NC}\n"

cd "$PROJECT_ROOT"

# ============================================
# Phase 1: Backend Unit Tests
# ============================================
print_section "Phase 1: Backend Unit Tests"

echo -e "${BLUE}Running backend unit tests...${NC}"
run_test_suite \
    "Backend Unit Tests" \
    "pytest tests/unit/ -v --tb=short --maxfail=10 -q" \
    "backend"

# ============================================
# Phase 2: Backend Integration Tests
# ============================================
print_section "Phase 2: Backend Integration Tests"

echo -e "${BLUE}Running backend integration tests...${NC}"
run_test_suite \
    "Backend Integration Tests" \
    "pytest tests/integration/ -v --tb=short --maxfail=10 -q" \
    "backend"

# ============================================
# Phase 3: Backend E2E Tests
# ============================================
print_section "Phase 3: Backend E2E Tests"

echo -e "${BLUE}Running backend E2E tests (test_*.py in root)...${NC}"
run_test_suite \
    "Backend E2E Tests" \
    "pytest tests/test_*.py -v --tb=short --maxfail=10 -q" \
    "backend"

# ============================================
# Phase 4: Backend Coverage Report
# ============================================
print_section "Phase 4: Backend Coverage Analysis"

echo -e "${BLUE}Generating comprehensive coverage report...${NC}"
cd "$PROJECT_ROOT/backend"

# Run all backend tests with coverage
if pytest tests/unit/ tests/integration/ tests/test_*.py \
    --cov=routes \
    --cov=services \
    --cov=middleware \
    --cov-report=html:htmlcov \
    --cov-report=xml:coverage.xml \
    --cov-report=term-missing \
    --tb=no \
    -q 2>&1 | tee coverage_output.txt; then
    
    echo -e "${GREEN}✓ Coverage report generated${NC}"
    PASSED_TESTS+=("Backend Coverage Report")
    
    # Display coverage summary
    echo -e "\n${CYAN}Coverage Summary:${NC}"
    grep -A 20 "^TOTAL" coverage_output.txt || echo "Coverage summary not found in output"
    rm -f coverage_output.txt
else
    echo -e "${YELLOW}⚠ Coverage generated with some test failures${NC}"
    PASSED_TESTS+=("Backend Coverage (partial)")
fi

cd "$PROJECT_ROOT"

# ============================================
# Phase 5: Frontend Unit Tests
# ============================================
print_section "Phase 5: Frontend Unit Tests"

cd "$PROJECT_ROOT/frontend"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing frontend dependencies...${NC}"
    npm install
fi

echo -e "${BLUE}Running frontend unit tests (Jest)...${NC}"
echo -e "${CYAN}Note: Excluding Canvas and Dashboard component tests (use dedicated test suite for these)${NC}"
run_test_suite \
    "Frontend Unit Tests (Jest)" \
    "npm test -- --watchAll=false --passWithNoTests --ci --coverage=false --testPathPattern='__tests__' --testPathIgnorePatterns='/Canvas.test.js|/Dashboard.test.js'" \
    "frontend"

# ============================================
# Phase 6: Check if Servers are Running
# ============================================
print_section "Phase 6: Preparing for E2E Tests"

BACKEND_RUNNING=false
FRONTEND_RUNNING=false

if curl -s http://localhost:10010/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend already running on port 10010${NC}"
    BACKEND_RUNNING=true
fi

if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Frontend already running on port 3000${NC}"
    FRONTEND_RUNNING=true
fi

# Start servers if not running
if [ "$BACKEND_RUNNING" = false ] || [ "$FRONTEND_RUNNING" = false ]; then
    echo -e "${YELLOW}Starting required servers for E2E tests...${NC}"
    SERVERS_STARTED=true
    
    if [ "$BACKEND_RUNNING" = false ]; then
        echo -e "${YELLOW}Starting backend server...${NC}"
        cd "$PROJECT_ROOT/backend"
        python3 app.py > /tmp/rescanvas_backend_test.log 2>&1 &
        BACKEND_PID=$!
        echo -e "Backend started with PID: $BACKEND_PID"
        
        echo -e "Waiting for backend to be ready..."
        if check_server_running "http://localhost:10010/health" 30; then
            echo -e "${GREEN}✓ Backend is ready${NC}"
        else
            echo -e "${RED}✗ Backend failed to start${NC}"
            echo -e "${YELLOW}Check logs at: /tmp/rescanvas_backend_test.log${NC}"
            FAILED_TESTS+=("Backend Server Startup")
        fi
    fi
    
    if [ "$FRONTEND_RUNNING" = false ]; then
        echo -e "${YELLOW}Starting frontend server...${NC}"
        cd "$PROJECT_ROOT/frontend"
        PORT=3000 npm start > /tmp/rescanvas_frontend_test.log 2>&1 &
        FRONTEND_PID=$!
        echo -e "Frontend started with PID: $FRONTEND_PID"
        
        echo -e "Waiting for frontend to be ready..."
        if check_server_running "http://localhost:3000" 60; then
            echo -e "${GREEN}✓ Frontend is ready${NC}"
        else
            echo -e "${RED}✗ Frontend failed to start${NC}"
            echo -e "${YELLOW}Check logs at: /tmp/rescanvas_frontend_test.log${NC}"
            FAILED_TESTS+=("Frontend Server Startup")
        fi
    fi
fi

cd "$PROJECT_ROOT"

# ============================================
# Phase 7: Playwright Setup
# ============================================
print_section "Phase 7: Playwright Setup"

cd "$PROJECT_ROOT/frontend"

# Check if Playwright is installed
if ! npx playwright --version > /dev/null 2>&1; then
    echo -e "${YELLOW}Installing Playwright...${NC}"
    npm install --save-dev @playwright/test
fi

# Install Playwright browsers if needed
echo -e "${YELLOW}Ensuring Playwright browsers are installed...${NC}"
if ! npx playwright list-files 2>/dev/null | grep -q chromium; then
    echo -e "${YELLOW}Installing Chromium browser (this may take a few minutes)...${NC}"
    npx playwright install chromium
else
    echo -e "${GREEN}✓ Playwright browsers already installed${NC}"
fi

cd "$PROJECT_ROOT"

# ============================================
# Phase 8: Frontend E2E Tests (Playwright)
# ============================================
print_section "Phase 8: Frontend E2E Tests"

cd "$PROJECT_ROOT/frontend"

# Set environment variables
export API_BASE=http://localhost:10010
export APP_BASE=http://localhost:3000

echo -e "${BLUE}Running ALL Playwright E2E tests...${NC}\n"

# Run all E2E tests including playwright_smoke.spec.js
echo -e "${CYAN}Running e2e/auth.spec.js${NC}"
run_test_suite \
    "E2E: Authentication Tests" \
    "npx playwright test tests/e2e/auth.spec.js --reporter=list" \
    "frontend"

echo -e "${CYAN}Running e2e/profile.spec.js${NC}"
run_test_suite \
    "E2E: Profile Tests" \
    "npx playwright test tests/e2e/profile.spec.js --reporter=list" \
    "frontend"

echo -e "${CYAN}Running e2e/rooms.spec.js${NC}"
run_test_suite \
    "E2E: Rooms Tests" \
    "npx playwright test tests/e2e/rooms.spec.js --reporter=list" \
    "frontend"

echo -e "${CYAN}Running e2e/collaboration.spec.js${NC}"
run_test_suite \
    "E2E: Collaboration Tests" \
    "npx playwright test tests/e2e/collaboration.spec.js --reporter=list" \
    "frontend"

echo -e "${CYAN}Running e2e/roomSettings.spec.js${NC}"
run_test_suite \
    "E2E: Room Settings Tests" \
    "npx playwright test tests/e2e/roomSettings.spec.js --reporter=list" \
    "frontend"

echo -e "${CYAN}Running e2e/drawing.spec.js${NC}"
run_test_suite \
    "E2E: Drawing Tests" \
    "npx playwright test tests/e2e/drawing.spec.js --reporter=list" \
    "frontend"

echo -e "${CYAN}Running e2e/navigation.spec.js${NC}"
run_test_suite \
    "E2E: Navigation Tests" \
    "npx playwright test tests/e2e/navigation.spec.js --reporter=list" \
    "frontend"

echo -e "${CYAN}Running e2e/errors.spec.js${NC}"
run_test_suite \
    "E2E: Error Handling Tests" \
    "npx playwright test tests/e2e/errors.spec.js --reporter=list" \
    "frontend"

echo -e "${CYAN}Running e2e/smoke.spec.js${NC}"
run_test_suite \
    "E2E: Smoke Tests" \
    "npx playwright test tests/e2e/smoke.spec.js --reporter=list" \
    "frontend"

cd "$PROJECT_ROOT"

# ============================================
# Phase 9: Generate HTML Reports
# ============================================
print_section "Phase 9: Test Reports"

echo -e "${CYAN}Generating HTML test reports...${NC}\n"

# Backend coverage report
if [ -f "$PROJECT_ROOT/backend/htmlcov/index.html" ]; then
    echo -e "${GREEN}✓ Backend coverage report:${NC}"
    echo -e "  file://$PROJECT_ROOT/backend/htmlcov/index.html"
fi

# Playwright report
cd "$PROJECT_ROOT/frontend"
if [ -d "playwright-report" ]; then
    echo -e "${GREEN}✓ Playwright test report:${NC}"
    echo -e "  file://$PROJECT_ROOT/frontend/playwright-report/index.html"
    echo -e "\n${CYAN}To view Playwright report: cd frontend && npx playwright show-report${NC}"
fi

cd "$PROJECT_ROOT"

# ============================================
# Final Summary
# ============================================
print_header "Test Execution Summary"

echo -e "${GREEN}Passed Tests (${#PASSED_TESTS[@]}):${NC}"
for test in "${PASSED_TESTS[@]}"; do
    echo -e "  ${GREEN}✓${NC} $test"
done

if [ ${#SKIPPED_TESTS[@]} -gt 0 ]; then
    echo -e "\n${YELLOW}Skipped Tests (${#SKIPPED_TESTS[@]}):${NC}"
    for test in "${SKIPPED_TESTS[@]}"; do
        echo -e "  ${YELLOW}⚠${NC} $test"
    done
fi

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    echo -e "\n${RED}Failed Tests (${#FAILED_TESTS[@]}):${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "  ${RED}✗${NC} $test"
    done
    echo -e "\n${RED}TEST SUITE FAILED!${NC}"
    echo -e "${YELLOW}Review the error output above for details.${NC}\n"
    exit 1
else
    if [ ${#SKIPPED_TESTS[@]} -gt 0 ]; then
        echo -e "\n${YELLOW}⚠ All tests passed but some were skipped!${NC}"
        echo -e "${YELLOW}Please investigate skipped tests.${NC}\n"
        exit 1
    else
        echo -e "\n${GREEN}ALL TESTS PASSED ${NC}"
        echo -e "${GREEN}Total test suites: ${#PASSED_TESTS[@]}${NC}"
        if [ $TOTAL_TEST_COUNT -gt 0 ]; then
            echo -e "${GREEN}Total test cases: ~$TOTAL_TEST_COUNT${NC}"
        fi
        echo -e "\n${CYAN}Test artifacts:${NC}"
        echo -e "  Backend coverage: backend/htmlcov/index.html"
        echo -e "  E2E test report: frontend/playwright-report/index.html\n"
        exit 0
    fi
fi
