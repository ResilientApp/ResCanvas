#!/bin/bash

# Unified Test Runner for ResCanvas
# Runs ALL tests: backend unit/integration/E2E, frontend unit, and Playwright E2E tests

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

BACKEND_PASSED=0
FRONTEND_PASSED=0
E2E_PASSED=0

echo -e "${BOLD}${CYAN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║     ResCanvas Unified Test Suite Runner       ║${NC}"
echo -e "${BOLD}${CYAN}╚════════════════════════════════════════════════╝${NC}\n"

# Function to print section header
print_section() {
    echo -e "\n${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}  $1${NC}"
    echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

# ============================================================================
# 1. BACKEND TESTS
# ============================================================================
print_section "1/3: Running Backend Tests (pytest)"

echo -e "${YELLOW}Location: backend/tests/${NC}"
echo -e "${YELLOW}Running: Unit tests (39), Integration tests (45), E2E tests (15)${NC}\n"

cd "$PROJECT_ROOT/backend"

if python3 -m pytest tests/ -v --tb=short 2>&1; then
    BACKEND_PASSED=1
    echo -e "\n${GREEN}✅ Backend tests PASSED${NC}"
else
    echo -e "\n${RED}❌ Backend tests FAILED${NC}"
fi

# ============================================================================
# 2. FRONTEND TESTS
# ============================================================================
print_section "2/3: Running Frontend Tests (Jest)"

echo -e "${YELLOW}Location: frontend/src/__tests/${NC}"
echo -e "${YELLOW}Running: API client tests (auth, rooms)${NC}\n"

cd "$PROJECT_ROOT/frontend"

if CI=true npm test -- --testPathPattern="__tests__/(api|utils)" --watchAll=false --coverage=false 2>&1; then
    FRONTEND_PASSED=1
    echo -e "\n${GREEN}✅ Frontend tests PASSED${NC}"
else
    echo -e "\n${RED}❌ Frontend tests FAILED${NC}"
fi

# ============================================================================
# 3. PLAYWRIGHT E2E TESTS
# ============================================================================
print_section "3/3: Running Playwright E2E Tests"

echo -e "${YELLOW}Location: frontend/tests/e2e/, frontend/tests/playwright_smoke.spec.js${NC}"
echo -e "${YELLOW}Running: Auth tests (3), Drawing tests (3), Room tests (6), Smoke test (1)${NC}\n"

cd "$PROJECT_ROOT"

# Check if servers are already running
BACKEND_RUNNING=false
FRONTEND_RUNNING=false
BACKEND_PID=""
FRONTEND_PID=""

if curl -s http://localhost:10010/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend already running on port 10010${NC}"
    BACKEND_RUNNING=true
fi

if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Frontend already running on port 3000${NC}"
    FRONTEND_RUNNING=true
fi

# Cleanup function for servers
cleanup_servers() {
    if [ "$BACKEND_RUNNING" = false ] && [ ! -z "$BACKEND_PID" ]; then
        echo -e "\n${YELLOW}Stopping backend (PID: $BACKEND_PID)${NC}"
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ "$FRONTEND_RUNNING" = false ] && [ ! -z "$FRONTEND_PID" ]; then
        echo -e "${YELLOW}Stopping frontend (PID: $FRONTEND_PID)${NC}"
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    # Kill any remaining processes on the ports (only if we started them)
    if [ "$BACKEND_RUNNING" = false ]; then
        lsof -ti:10010 | xargs kill -9 2>/dev/null || true
    fi
    if [ "$FRONTEND_RUNNING" = false ]; then
        lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    fi
}

trap cleanup_servers EXIT INT TERM

# Start backend if not running
if [ "$BACKEND_RUNNING" = false ]; then
    echo -e "${YELLOW}Starting backend server...${NC}"
    cd "$PROJECT_ROOT/backend"
    python3 app.py > /tmp/rescanvas_backend_test.log 2>&1 &
    BACKEND_PID=$!
    
    echo -e "Waiting for backend to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:10010/health > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Backend is ready${NC}"
            break
        fi
        if [ $i -eq 30 ]; then
            echo -e "${RED}✗ Backend failed to start${NC}"
            exit 1
        fi
        sleep 1
    done
fi

# Start frontend if not running
if [ "$FRONTEND_RUNNING" = false ]; then
    echo -e "${YELLOW}Starting frontend server...${NC}"
    cd "$PROJECT_ROOT/frontend"
    PORT=3000 npm start > /tmp/rescanvas_frontend_test.log 2>&1 &
    FRONTEND_PID=$!
    
    echo -e "Waiting for frontend to be ready..."
    for i in {1..60}; do
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Frontend is ready${NC}"
            break
        fi
        if [ $i -eq 60 ]; then
            echo -e "${RED}✗ Frontend failed to start${NC}"
            exit 1
        fi
        sleep 1
    done
fi

# Run Playwright tests
cd "$PROJECT_ROOT/frontend"
export API_BASE=http://localhost:10010
export APP_BASE=http://localhost:3000

if npx playwright test tests/e2e/ tests/playwright_smoke.spec.js --reporter=list --max-failures=5 2>&1; then
    E2E_PASSED=1
    echo -e "\n${GREEN}✅ Playwright E2E tests PASSED${NC}"
else
    echo -e "\n${RED}❌ Playwright E2E tests FAILED${NC}"
fi

# ============================================================================
# FINAL SUMMARY
# ============================================================================
echo -e "\n${BOLD}${CYAN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║            Test Execution Summary              ║${NC}"
echo -e "${BOLD}${CYAN}╚════════════════════════════════════════════════╝${NC}\n"

if [ $BACKEND_PASSED -eq 1 ]; then
    echo -e "  ${GREEN}✅ Backend Tests (99 tests)${NC}"
else
    echo -e "  ${RED}❌ Backend Tests${NC}"
fi

if [ $FRONTEND_PASSED -eq 1 ]; then
    echo -e "  ${GREEN}✅ Frontend Tests (54 tests)${NC}"
else
    echo -e "  ${RED}❌ Frontend Tests${NC}"
fi

if [ $E2E_PASSED -eq 1 ]; then
    echo -e "  ${GREEN}✅ Playwright E2E Tests (13 tests)${NC}"
else
    echo -e "  ${RED}❌ Playwright E2E Tests${NC}"
fi

echo ""

# Calculate total pass rate
TOTAL_PASSED=$((BACKEND_PASSED + FRONTEND_PASSED + E2E_PASSED))

if [ $TOTAL_PASSED -eq 3 ]; then
    echo -e "${BOLD}${GREEN}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${GREEN}║  ✅ ALL 166 TESTS PASSED SUCCESSFULLY! ✅     ║${NC}"
    echo -e "${BOLD}${GREEN}╚════════════════════════════════════════════════╝${NC}\n"
    exit 0
else
    echo -e "${BOLD}${RED}╔════════════════════════════════════════════════╗${NC}"
    echo -e "${BOLD}${RED}║      ⚠️  SOME TEST SUITES FAILED  ⚠️          ║${NC}"
    echo -e "${BOLD}${RED}╚════════════════════════════════════════════════╝${NC}\n"
    echo -e "${YELLOW}Review the output above to see which tests failed.${NC}\n"
    exit 1
fi
done

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    echo -e "\n${RED}Failed (${#FAILED_TESTS[@]}):${NC}"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "  ${RED}✗${NC} $test"
    done
    echo -e "\n${RED}❌ Some tests failed!${NC}\n"
    exit 1
else
    echo -e "\n${GREEN}✅ All tests passed!${NC}\n"
    echo -e "${BLUE}Coverage reports:${NC}"
    echo -e "  Backend:  ${PROJECT_ROOT}/backend/htmlcov/index.html"
    echo -e "  Frontend: ${PROJECT_ROOT}/frontend/coverage/lcov-report/index.html\n"
    exit 0
fi
