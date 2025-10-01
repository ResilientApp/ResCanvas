#!/bin/bash

# Comprehensive Cut Functionality Verification Script
# This script runs all tests and provides a clear go/no-go decision

echo "=========================================================================="
echo "                CUT FUNCTIONALITY - COMPREHENSIVE VERIFICATION"
echo "=========================================================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall success
ALL_TESTS_PASSED=true

# Function to run a test and report results
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "TEST: $test_name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if eval "$test_command"; then
        echo -e "${GREEN}✅ PASSED${NC}: $test_name"
        return 0
    else
        echo -e "${RED}❌ FAILED${NC}: $test_name"
        ALL_TESTS_PASSED=false
        return 1
    fi
}

# Check if backend is running
echo "Checking prerequisites..."
if ! curl -s http://localhost:10010/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Backend is not running on port 10010${NC}"
    echo "   Start backend: cd backend && python3 app.py"
    exit 1
fi
echo -e "${GREEN}✓${NC} Backend is running"

# Check if frontend is running  
if ! curl -s http://localhost:10008 > /dev/null 2>&1; then
    echo -e "${RED}❌ Frontend is not running on port 10008${NC}"
    echo "   Start frontend: cd frontend && npm start"
    exit 1
fi
echo -e "${GREEN}✓${NC} Frontend is running"

echo ""
echo "=========================================================================="
echo "                         RUNNING TEST SUITE"
echo "=========================================================================="

# Test 1: Browser-Accurate Cut Flow
run_test "Browser-Accurate Cut Flow" "python3 test_browser_cut_flow.py"

# Test 2: Final Cut Validation  
run_test "Final Cut Validation (with persistence)" "python3 test_final_cut_validation.py"

# Final Summary
echo ""
echo "=========================================================================="
echo "                         VERIFICATION SUMMARY"
echo "=========================================================================="
echo ""

if [ "$ALL_TESTS_PASSED" = true ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                                                                        ║${NC}"
    echo -e "${GREEN}║   ✅✅✅  ALL TESTS PASSED - CUT FUNCTIONALITY IS WORKING  ✅✅✅   ║${NC}"
    echo -e "${GREEN}║                                                                        ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "The cut functionality is fully operational:"
    echo "  ✅ Cut operations take effect immediately"
    echo "  ✅ Cut areas remain blank after page refresh"
    echo "  ✅ Replacement segments are preserved"
    echo "  ✅ Backend properly filters cut strokes"
    echo "  ✅ JWT authentication works correctly"
    echo ""
    echo "The system matches the reference legacy implementation."
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "NEXT STEPS:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "1. Test in browser: http://localhost:10008"
    echo "   - Login/register a user"
    echo "   - Create or join a room"
    echo "   - Draw some strokes"
    echo "   - Use the cut tool (scissors icon)"
    echo "   - Refresh the page - cut should persist"
    echo ""
    echo "2. See BROWSER_TESTING_GUIDE.md for detailed manual testing steps"
    echo ""
    echo "3. Review CUT_FUNCTIONALITY_RESOLUTION.md for complete documentation"
    echo ""
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                                                                        ║${NC}"
    echo -e "${RED}║   ❌❌❌  SOME TESTS FAILED - FURTHER DEBUGGING NEEDED  ❌❌❌       ║${NC}"
    echo -e "${RED}║                                                                        ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "Please review the test output above for details."
    echo ""
    echo "Debugging steps:"
    echo "  1. Check backend logs: tail -f backend/backend.log"
    echo "  2. Check frontend console (F12 in browser)"
    echo "  3. Verify Redis: redis-cli SMEMBERS cut-stroke-ids:{roomId}"
    echo "  4. Review CUT_FUNCTIONALITY_FIX_SUMMARY.md"
    echo ""
    exit 1
fi
