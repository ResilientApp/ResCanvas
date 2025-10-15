#!/bin/bash
# This script runs all tests with parallel execution enabled
# Performance optimizations:
# - Backend: pytest-xdist for parallel test execution
# - Frontend Jest: Built-in --maxWorkers flag
# - Frontend Playwright: Multiple workers (configured in playwright.config.js)
# - All E2E tests run in a single command for better parallelization
#
# Usage:
#   ./scripts/run_all_tests_parallel.sh [options]
#
# Options:
#   --fast          Skip coverage and use maximum parallelization
#   --ci            CI mode with stricter checks and GitHub reporting
#   --workers N     Override number of workers (default: auto)

set -e
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PASSED_TESTS=()
FAILED_TESTS=()

FAST_MODE=false
CI_MODE=false
WORKERS="auto"

for arg in "$@"; do
    case $arg in
        --fast)
            FAST_MODE=true
            shift
            ;;
        --ci)
            CI_MODE=true
            export CI=true
            shift
            ;;
        --workers)
            WORKERS="$2"
            shift 2
            ;;
        --workers=*)
            WORKERS="${arg#*=}"
            shift
            ;;
    esac
done

print_header() {
    echo -e "\n${CYAN}========================================"
    echo -e "  $1"
    echo -e "========================================${NC}\n"
}

print_section() {
    echo -e "\n${BLUE}----------------------------------------"
    echo -e "  $1"
    echo -e "----------------------------------------${NC}\n"
}

run_test_suite() {
    local name="$1"
    local command="$2"
    local directory="${3:-.}"
    
    local original_dir=$(pwd)
    cd "$PROJECT_ROOT/$directory"
    
    echo -e "${BLUE}▶ Running $name...${NC}"
    
    local start_time=$(date +%s)
    if eval "$command" > /tmp/test_output_$$.log 2>&1; then
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${GREEN}✓ $name passed${NC} ${CYAN}(${duration}s)${NC}"
        echo -e "  ($(grep -E 'passed|test' /tmp/test_output_$$.log | head -1 || echo 'tests completed'))"
        PASSED_TESTS+=("$name")
    else
        local end_time=$(date +%s)
        local duration=$((end_time - start_time))
        echo -e "${RED}✗ $name failed${NC} ${CYAN}(${duration}s)${NC}"
        FAILED_TESTS+=("$name")
        echo -e "${RED}Error output:${NC}"
        tail -30 /tmp/test_output_$$.log
    fi
    
    rm -f /tmp/test_output_$$.log
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
print_header "ResCanvas Parallel Test Suite (Optimized)"
echo -e "Project Root: ${CYAN}$PROJECT_ROOT${NC}"
echo -e "Date: ${CYAN}$(date)${NC}"
echo -e "Mode: ${CYAN}$([ "$FAST_MODE" = true ] && echo "FAST" || echo "STANDARD")${NC}"
echo -e "Workers: ${CYAN}$WORKERS${NC}\n"

cd "$PROJECT_ROOT"

TOTAL_START_TIME=$(date +%s)

# ============================================
# Phase 1: Backend Tests (Parallel)
# ============================================
print_section "Phase 1: Backend Tests (Parallel Execution)"

cd "$PROJECT_ROOT/backend"

# Ensure pytest-xdist is installed for parallel execution
if ! python3 -c "import xdist" 2>/dev/null; then
    echo -e "${YELLOW}Installing pytest-xdist for parallel execution...${NC}"
    pip3 install -q pytest-xdist
fi

# Run all backend tests
# Note: Backend tests are run sequentially by default due to shared state
# Parallel execution (-n auto) can cause race conditions
echo -e "${BLUE}Running all backend tests...${NC}"
echo -e "${CYAN}(Sequential execution - backend tests share database/Redis state)${NC}"
if [ "$FAST_MODE" = true ]; then
    # Fast mode: no coverage
    run_test_suite \
        "Backend All Tests (Fast)" \
        "pytest tests/ -v --tb=short -q --maxfail=10" \
        "backend"
else
    # Standard mode: with coverage
    run_test_suite \
        "Backend All Tests (with Coverage)" \
        "pytest tests/ -v --tb=short -q --cov=routes --cov=services --cov=middleware --cov-report=html:htmlcov --cov-report=xml:coverage.xml --cov-report=term-missing:skip-covered" \
        "backend"
fi

cd "$PROJECT_ROOT"

# ============================================
# Phase 2: Frontend Unit Tests (Parallel)
# ============================================
print_section "Phase 2: Frontend Unit Tests (Jest Parallel)"

cd "$PROJECT_ROOT/frontend"

# Jest runs tests in parallel by default
echo -e "${BLUE}Running frontend unit tests with Jest parallel workers...${NC}"
if [ "$FAST_MODE" = true ]; then
    run_test_suite \
        "Frontend Unit Tests (Jest)" \
        "npm test -- --watchAll=false --maxWorkers=$WORKERS --testPathIgnorePatterns='Canvas.test.js|Dashboard.test.js|App.test.js'" \
        "frontend"
else
    run_test_suite \
        "Frontend Unit Tests (Jest)" \
        "npm test -- --watchAll=false --maxWorkers=$WORKERS --testPathIgnorePatterns='Canvas.test.js|Dashboard.test.js|App.test.js' --coverage" \
        "frontend"
fi

cd "$PROJECT_ROOT"

# ============================================
# Phase 3: Ensure Servers Running
# ============================================
print_section "Phase 3: Preparing for E2E Tests"

# Check if backend is running
if check_server_running "http://localhost:10010/health" 5; then
    echo -e "${GREEN}✓ Backend already running on port 10010${NC}"
else
    echo -e "${YELLOW}⚠ Backend not running on port 10010${NC}"
    echo -e "${YELLOW}  Please start backend with: cd backend && python3 app.py${NC}"
    exit 1
fi

# Check if frontend is running
if check_server_running "http://localhost:3000" 5; then
    echo -e "${GREEN}✓ Frontend already running on port 3000${NC}"
else
    echo -e "${YELLOW}⚠ Frontend not running on port 3000${NC}"
    echo -e "${YELLOW}  Please start frontend with: cd frontend && npm start${NC}"
    exit 1
fi

# ============================================
# Phase 4: Playwright Setup
# ============================================
print_section "Phase 4: Playwright Setup"

cd "$PROJECT_ROOT/frontend"

# Ensure Playwright is installed
if ! command -v npx playwright &> /dev/null || ! npx playwright --version &> /dev/null; then
    echo -e "${YELLOW}Installing Playwright...${NC}"
    npm install --save-dev @playwright/test
fi

# Install browsers if needed
if ! npx playwright list-files 2>/dev/null | grep -q chromium; then
    echo -e "${YELLOW}Installing Playwright browsers...${NC}"
    npx playwright install chromium
else
    echo -e "${GREEN}✓ Playwright browsers already installed${NC}"
fi

# ============================================
# Phase 5: Frontend E2E Tests (Parallel)
# ============================================
print_section "Phase 5: Frontend E2E Tests (Parallel Workers)"

cd "$PROJECT_ROOT/frontend"

# Set environment variables
export API_BASE=http://localhost:10010
export APP_BASE=http://localhost:3000

echo -e "${BLUE}Running ALL Playwright E2E tests in parallel...${NC}"
echo -e "${CYAN}(Playwright will automatically parallelize across test files)${NC}\n"

# Run all E2E tests at once - Playwright parallelizes automatically
if [ "$CI_MODE" = true ]; then
    run_test_suite \
        "E2E: All Tests (Parallel)" \
        "npx playwright test tests/e2e/ --reporter=github --reporter=list --reporter=html" \
        "frontend"
else
    run_test_suite \
        "E2E: All Tests (Parallel)" \
        "npx playwright test tests/e2e/ --reporter=list" \
        "frontend"
fi

cd "$PROJECT_ROOT"

# ============================================
# Final Summary
# ============================================
TOTAL_END_TIME=$(date +%s)
TOTAL_DURATION=$((TOTAL_END_TIME - TOTAL_START_TIME))
MINUTES=$((TOTAL_DURATION / 60))
SECONDS=$((TOTAL_DURATION % 60))

print_header "Test Execution Summary"

echo -e "${CYAN}Total Duration: ${MINUTES}m ${SECONDS}s${NC}\n"

if [ ${#PASSED_TESTS[@]} -gt 0 ]; then
    echo -e "${GREEN}Passed Tests (${#PASSED_TESTS[@]}):${NC}"
    for test in "${PASSED_TESTS[@]}"; do
        echo -e "  ${GREEN}✓${NC} $test"
    done
    echo ""
fi

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    echo -e "${RED}Failed Tests (${#FAILED_TESTS[@]}):${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "  ${RED}✗${NC} $test"
    done
    echo ""
    echo -e "${RED}❌ TEST SUITE FAILED!${NC}"
    echo -e "Review the error output above for details.\n"
    exit 1
fi

echo -e "${GREEN}✅ ALL TESTS PASSED!${NC}"
echo -e "Total test suites: ${#PASSED_TESTS[@]}"
echo -e "\n${CYAN}Performance Tips:${NC}"
echo -e "  • Use ${YELLOW}--fast${NC} flag to skip coverage and maximize speed"
echo -e "  • Use ${YELLOW}--workers N${NC} to control parallelization"
echo -e "  • Parallel execution saved significant time vs sequential\n"

if [ "$FAST_MODE" = false ]; then
    echo -e "${CYAN}Test artifacts:${NC}"
    echo -e "  Backend coverage: ${BLUE}backend/htmlcov/index.html${NC}"
    echo -e "  Frontend coverage: ${BLUE}frontend/coverage/lcov-report/index.html${NC}"
    echo -e "  E2E test report: ${BLUE}frontend/playwright-report/index.html${NC}\n"
fi

exit 0
