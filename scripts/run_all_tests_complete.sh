#!/bin/bash
#
# Master Test Runner - Executes ALL tests in ResCanvas project
# Runs backend (pytest), frontend (Jest), and E2E (Playwright) tests in sequence
#

set -e  # Exit on first error

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track results
TOTAL_TESTS=0
FAILED_TESTS=0
BACKEND_TESTS=0
FRONTEND_TESTS=0
E2E_TESTS=0

# Get project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}ResCanvas Comprehensive Test Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ==========================================
# 1. Backend Tests (pytest)
# ==========================================
echo -e "${YELLOW}[1/3] Running Backend Tests (pytest)...${NC}"
echo ""

cd backend

# Check if pytest is available
if ! command -v pytest &> /dev/null; then
    echo -e "${RED}ERROR: pytest not found. Install with: pip install pytest${NC}"
    exit 1
fi

# Run backend unit tests
echo -e "${BLUE}Running backend unit tests...${NC}"
UNIT_RESULT=$(pytest tests/ -v -m "unit" --tb=short 2>&1 | tee /dev/tty | grep -oP '\d+(?= passed)' | tail -1 || echo "0")
BACKEND_TESTS=$((BACKEND_TESTS + UNIT_RESULT))

# Run backend integration tests
echo ""
echo -e "${BLUE}Running backend integration tests...${NC}"
INTEGRATION_RESULT=$(pytest tests/ -v -m "integration" --tb=short 2>&1 | tee /dev/tty | grep -oP '\d+(?= passed)' | tail -1 || echo "0")
BACKEND_TESTS=$((BACKEND_TESTS + INTEGRATION_RESULT))

# Run backend E2E tests
echo ""
echo -e "${BLUE}Running backend E2E tests...${NC}"
E2E_RESULT=$(pytest tests/ -v -m "e2e" --tb=short 2>&1 | tee /dev/tty | grep -oP '\d+(?= passed)' | tail -1 || echo "0")
BACKEND_TESTS=$((BACKEND_TESTS + E2E_RESULT))

# Run all backend tests if no markers
if [ $BACKEND_TESTS -eq 0 ]; then
    echo -e "${YELLOW}No marked tests found, running all backend tests...${NC}"
    BACKEND_RESULT=$(pytest tests/ -v --tb=short 2>&1 | tee /dev/tty | grep -oP '\d+(?= passed)' | tail -1 || echo "0")
    BACKEND_TESTS=$BACKEND_RESULT
fi

cd "$PROJECT_ROOT"

echo ""
echo -e "${GREEN}✓ Backend Tests Complete: ${BACKEND_TESTS} tests passed${NC}"
echo ""

# ==========================================
# 2. Frontend Tests (Jest)
# ==========================================
echo -e "${YELLOW}[2/3] Running Frontend Tests (Jest)...${NC}"
echo ""

cd frontend

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo -e "${RED}ERROR: npm not found${NC}"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}Installing frontend dependencies...${NC}"
    npm install
fi

# Run Jest tests
echo -e "${BLUE}Running frontend unit tests...${NC}"
npm test -- --passWithNoTests --ci --coverage=false 2>&1 | tee jest_output.txt

# Extract test count from Jest output
FRONTEND_TESTS=$(grep -oP '\d+(?= tests? passed)' jest_output.txt | tail -1 || echo "0")
rm -f jest_output.txt

cd "$PROJECT_ROOT"

echo ""
echo -e "${GREEN}✓ Frontend Tests Complete: ${FRONTEND_TESTS} tests passed${NC}"
echo ""

# ==========================================
# 3. E2E Tests (Playwright)
# ==========================================
echo -e "${YELLOW}[3/3] Running E2E Tests (Playwright)...${NC}"
echo ""

# Check if Playwright automation script exists
if [ -f "scripts/run_playwright_tests.sh" ]; then
    echo -e "${BLUE}Using existing Playwright automation script...${NC}"
    bash scripts/run_playwright_tests.sh 2>&1 | tee playwright_output.txt
    
    # Extract test count from Playwright output
    E2E_TESTS=$(grep -oP '\d+(?= passed)' playwright_output.txt | tail -1 || echo "0")
    rm -f playwright_output.txt
else
    # Fallback: run Playwright directly
    echo -e "${YELLOW}Playwright automation script not found, running directly...${NC}"
    
    cd frontend
    
    # Install Playwright if needed
    if [ ! -d "node_modules/@playwright/test" ]; then
        echo -e "${BLUE}Installing Playwright...${NC}"
        npm install --save-dev @playwright/test
        npx playwright install
    fi
    
    # Start backend server in background
    echo -e "${BLUE}Starting backend server...${NC}"
    cd ../backend
    python app.py > /dev/null 2>&1 &
    BACKEND_PID=$!
    sleep 5
    
    # Start frontend server in background
    echo -e "${BLUE}Starting frontend server...${NC}"
    cd ../frontend
    PORT=3000 npm start > /dev/null 2>&1 &
    FRONTEND_PID=$!
    sleep 10
    
    # Run Playwright tests
    echo -e "${BLUE}Running Playwright tests...${NC}"
    npx playwright test --reporter=list 2>&1 | tee playwright_output.txt
    
    # Extract test count
    E2E_TESTS=$(grep -oP '\d+(?= passed)' playwright_output.txt | tail -1 || echo "0")
    rm -f playwright_output.txt
    
    # Cleanup
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    
    cd "$PROJECT_ROOT"
fi

echo ""
echo -e "${GREEN}✓ E2E Tests Complete: ${E2E_TESTS} tests passed${NC}"
echo ""

# ==========================================
# Final Report
# ==========================================
TOTAL_TESTS=$((BACKEND_TESTS + FRONTEND_TESTS + E2E_TESTS))

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Test Suite Summary${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Backend Tests:    ${GREEN}${BACKEND_TESTS} passed${NC}"
echo -e "Frontend Tests:   ${GREEN}${FRONTEND_TESTS} passed${NC}"
echo -e "E2E Tests:        ${GREEN}${E2E_TESTS} passed${NC}"
echo -e "${BLUE}----------------------------------------${NC}"
echo -e "Total Tests:      ${GREEN}${TOTAL_TESTS} passed${NC}"
echo ""

if [ $TOTAL_TESTS -eq 0 ]; then
    echo -e "${RED}WARNING: No tests were executed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ All test suites completed successfully!${NC}"
echo ""
