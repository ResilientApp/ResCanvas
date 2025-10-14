#!/bin/bash

# ResCanvas E2E Test Suite Runner
# Runs all E2E tests: Profile, Collaboration, and RoomSettings
# Exit code 0 = all tests passed, non-zero = tests failed

set -e

echo "========================================="
echo "  ResCanvas E2E Test Suite"
echo "========================================="
echo ""
echo "Running all E2E tests..."
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Run tests and capture results
FAILED=0

echo -e "${BLUE}[1/3] Running Profile Tests...${NC}"
if npx playwright test tests/e2e/profile.spec.js --reporter=list; then
    echo -e "${GREEN}✓ Profile Tests PASSED${NC}"
else
    echo -e "${RED}✗ Profile Tests FAILED${NC}"
    FAILED=1
fi
echo ""

echo -e "${BLUE}[2/3] Running Collaboration Tests...${NC}"
if npx playwright test tests/e2e/collaboration.spec.js --reporter=list; then
    echo -e "${GREEN}✓ Collaboration Tests PASSED${NC}"
else
    echo -e "${RED}✗ Collaboration Tests FAILED${NC}"
    FAILED=1
fi
echo ""

echo -e "${BLUE}[3/3] Running RoomSettings Tests...${NC}"
if npx playwright test tests/e2e/roomSettings.spec.js --reporter=list; then
    echo -e "${GREEN}✓ RoomSettings Tests PASSED${NC}"
else
    echo -e "${RED}✗ RoomSettings Tests FAILED${NC}"
    FAILED=1
fi
echo ""

echo "========================================="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}  ALL TESTS PASSED ✓${NC}"
    echo "========================================="
    exit 0
else
    echo -e "${RED}  SOME TESTS FAILED ✗${NC}"
    echo "========================================="
    exit 1
fi
