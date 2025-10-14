#!/bin/bash

# Automated Playwright E2E Test Runner for ResCanvas
# This script starts the required servers, runs Playwright tests, and cleans up

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  ResCanvas Playwright E2E Tests${NC}"
echo -e "${BLUE}========================================${NC}\n"

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up servers...${NC}"
    if [ ! -z "$BACKEND_PID" ]; then
        echo -e "Stopping backend (PID: $BACKEND_PID)"
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        echo -e "Stopping frontend (PID: $FRONTEND_PID)"
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    # Kill any remaining processes on the ports
    lsof -ti:10010 | xargs kill -9 2>/dev/null || true
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Check if servers are already running
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

# Start backend if not running
if [ "$BACKEND_RUNNING" = false ]; then
    echo -e "${YELLOW}Starting backend server...${NC}"
    cd "$PROJECT_ROOT/backend"
    python3 app.py > /tmp/rescanvas_backend.log 2>&1 &
    BACKEND_PID=$!
    echo -e "Backend started with PID: $BACKEND_PID"
    
    # Wait for backend to be ready
    echo -e "Waiting for backend to be ready..."
    for i in {1..30}; do
        if curl -s http://localhost:10010/health > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Backend is ready${NC}"
            break
        fi
        if [ $i -eq 30 ]; then
            echo -e "${RED}✗ Backend failed to start after 30 seconds${NC}"
            echo -e "${YELLOW}Check logs at: /tmp/rescanvas_backend.log${NC}"
            exit 1
        fi
        sleep 1
    done
fi

# Start frontend if not running
if [ "$FRONTEND_RUNNING" = false ]; then
    echo -e "${YELLOW}Starting frontend server...${NC}"
    cd "$PROJECT_ROOT/frontend"
    PORT=3000 npm start > /tmp/rescanvas_frontend.log 2>&1 &
    FRONTEND_PID=$!
    echo -e "Frontend started with PID: $FRONTEND_PID"
    
    # Wait for frontend to be ready
    echo -e "Waiting for frontend to be ready..."
    for i in {1..60}; do
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Frontend is ready${NC}"
            break
        fi
        if [ $i -eq 60 ]; then
            echo -e "${RED}✗ Frontend failed to start after 60 seconds${NC}"
            echo -e "${YELLOW}Check logs at: /tmp/rescanvas_frontend.log${NC}"
            exit 1
        fi
        sleep 1
    done
fi

# Install Playwright browsers if needed
echo -e "\n${YELLOW}Checking Playwright browsers...${NC}"
cd "$PROJECT_ROOT/frontend"
if ! npx playwright --version > /dev/null 2>&1; then
    echo -e "${YELLOW}Installing Playwright...${NC}"
    npm install --save-dev @playwright/test
fi

# Install browsers if not already installed
if ! npx playwright list-files | grep -q chromium; then
    echo -e "${YELLOW}Installing Playwright browsers (this may take a few minutes)...${NC}"
    npx playwright install chromium
fi

# Run Playwright tests
echo -e "\n${BLUE}Running Playwright E2E tests...${NC}\n"
cd "$PROJECT_ROOT/frontend"

# Set environment variables for tests
export API_BASE=http://localhost:10010
export APP_BASE=http://localhost:3000

# Run tests with proper configuration
if npx playwright test tests/e2e/ tests/playwright_smoke.spec.js \
    --reporter=list \
    --max-failures=5 \
    2>&1; then
    echo -e "\n${GREEN}✅ All E2E tests passed!${NC}"
    EXIT_CODE=0
else
    echo -e "\n${RED}❌ Some E2E tests failed!${NC}"
    echo -e "${YELLOW}Test report available at: frontend/playwright-report/index.html${NC}"
    EXIT_CODE=1
fi

# Generate HTML report
echo -e "\n${YELLOW}Generating test report...${NC}"
npx playwright show-report playwright-report > /dev/null 2>&1 &
REPORT_PID=$!

echo -e "${BLUE}Test report will be available at:${NC}"
echo -e "  file://$PROJECT_ROOT/frontend/playwright-report/index.html"
echo -e "\n${YELLOW}To view the report, run: npx playwright show-report${NC}"

# If we started the servers, keep them running briefly to view report
if [ "$BACKEND_RUNNING" = false ] || [ "$FRONTEND_RUNNING" = false ]; then
    echo -e "\n${YELLOW}Servers will shut down in 5 seconds...${NC}"
    sleep 5
fi

exit $EXIT_CODE
