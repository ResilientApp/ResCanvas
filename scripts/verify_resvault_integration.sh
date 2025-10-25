#!/bin/bash

# ResVault Integration - Final Verification Script
# This script runs all tests and provides a comprehensive report

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       ResVault Integration - Final Verification           ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if services are running
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 1: Checking Services${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check backend
if curl -s http://localhost:10010/api/v1/auth/me >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend is running on port 10010${NC}"
else
    echo -e "${RED}✗ Backend is not running${NC}"
    echo -e "${YELLOW}  Please start backend: screen -r rescanvas_backend${NC}"
    exit 1
fi

# Check frontend
if curl -s http://localhost:3000 >/dev/null 2>&1; then
    echo -e "${GREEN}✓ Frontend is running on port 3000${NC}"
else
    echo -e "${RED}✗ Frontend is not running${NC}"
    echo -e "${YELLOW}  Please start frontend: screen -r rescanvas_frontend${NC}"
    exit 1
fi

# Run autonomous tests
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 2: Running Autonomous Test Suite${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

cd /home/ubuntu/resilient-apps/ResCanvas

if node scripts/autonomous_wallet_test.js; then
    echo ""
    echo -e "${GREEN}✓ All automated tests passed!${NC}"
    TESTS_PASSED=true
else
    echo ""
    echo -e "${RED}✗ Some tests failed${NC}"
    TESTS_PASSED=false
fi

# Check file modifications
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 3: Verifying Code Changes${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if key files exist and have correct content
FILES_OK=true

# Check frontend/src/wallet/resvault.js
if grep -q "WALLET_NOT_CONNECTED" frontend/src/wallet/resvault.js; then
    echo -e "${GREEN}✓ frontend/src/wallet/resvault.js - Updated${NC}"
else
    echo -e "${RED}✗ frontend/src/wallet/resvault.js - Not updated${NC}"
    FILES_OK=false
fi

# Check frontend/src/components/WalletConnector.jsx
if grep -q "WALLET_NOT_CONNECTED" frontend/src/components/WalletConnector.jsx; then
    echo -e "${GREEN}✓ frontend/src/components/WalletConnector.jsx - Updated${NC}"
else
    echo -e "${RED}✗ frontend/src/components/WalletConnector.jsx - Not updated${NC}"
    FILES_OK=false
fi

# Check extension content.js
if grep -q "handleGetPublicKeyOperation" resvault-fixed-20251018-140436/build/content.js; then
    echo -e "${GREEN}✓ resvault extension content.js - Updated${NC}"
else
    echo -e "${RED}✗ resvault extension content.js - Not updated${NC}"
    FILES_OK=false
fi

# Check extension background.js
if grep -q "getSigningKeys" resvault-fixed-20251018-140436/build/background.js; then
    echo -e "${GREEN}✓ resvault extension background.js - Updated${NC}"
else
    echo -e "${RED}✗ resvault extension background.js - Not updated${NC}"
    FILES_OK=false
fi

# Check dependencies
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Step 4: Checking Dependencies${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

DEPS_OK=true

# Check frontend dependencies
cd frontend
if npm list bs58 >/dev/null 2>&1; then
    echo -e "${GREEN}✓ bs58 installed in frontend${NC}"
else
    echo -e "${RED}✗ bs58 not installed in frontend${NC}"
    DEPS_OK=false
fi

if npm list tweetnacl >/dev/null 2>&1; then
    echo -e "${GREEN}✓ tweetnacl installed in frontend${NC}"
else
    echo -e "${RED}✗ tweetnacl not installed in frontend${NC}"
    DEPS_OK=false
fi

cd ..

# Check root dependencies (for test scripts)
if npm list bs58 >/dev/null 2>&1; then
    echo -e "${GREEN}✓ bs58 installed in root${NC}"
else
    echo -e "${RED}✗ bs58 not installed in root${NC}"
    DEPS_OK=false
fi

if npm list tweetnacl >/dev/null 2>&1; then
    echo -e "${GREEN}✓ tweetnacl installed in root${NC}"
else
    echo -e "${RED}✗ tweetnacl not installed in root${NC}"
    DEPS_OK=false
fi

if npm list node-fetch >/dev/null 2>&1; then
    echo -e "${GREEN}✓ node-fetch installed in root${NC}"
else
    echo -e "${RED}✗ node-fetch not installed in root${NC}"
    DEPS_OK=false
fi

# Final summary
echo ""
echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                    Final Summary                           ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

ALL_OK=true

if [ "$TESTS_PASSED" = true ]; then
    echo -e "${GREEN}✓ Automated Tests: PASSED${NC}"
else
    echo -e "${RED}✗ Automated Tests: FAILED${NC}"
    ALL_OK=false
fi

if [ "$FILES_OK" = true ]; then
    echo -e "${GREEN}✓ Code Changes: VERIFIED${NC}"
else
    echo -e "${RED}✗ Code Changes: INCOMPLETE${NC}"
    ALL_OK=false
fi

if [ "$DEPS_OK" = true ]; then
    echo -e "${GREEN}✓ Dependencies: INSTALLED${NC}"
else
    echo -e "${RED}✗ Dependencies: MISSING${NC}"
    ALL_OK=false
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ "$ALL_OK" = true ]; then
    echo ""
    echo -e "${GREEN}🎉 SUCCESS! ResVault integration is fully working!${NC}"
    echo ""
    echo -e "${CYAN}Next steps for browser testing:${NC}"
    echo -e "${YELLOW}1. Open chrome://extensions/${NC}"
    echo -e "${YELLOW}2. Enable Developer Mode${NC}"
    echo -e "${YELLOW}3. Load unpacked: resvault-fixed-20251018-140436/build${NC}"
    echo -e "${YELLOW}4. Create wallet in extension${NC}"
    echo -e "${YELLOW}5. Connect wallet to localhost via extension UI${NC}"
    echo -e "${YELLOW}6. Go to http://localhost:3000 and create a secure room${NC}"
    echo -e "${YELLOW}7. Click 'Connect Wallet' and start drawing!${NC}"
    echo ""
    echo -e "${CYAN}Documentation:${NC}"
    echo -e "${YELLOW}- See RESVAULT_INTEGRATION_COMPLETE.md for full details${NC}"
    echo -e "${YELLOW}- See RESVAULT_CORRECTED_WORKFLOW.md for workflow explanation${NC}"
    echo ""
    exit 0
else
    echo ""
    echo -e "${RED}❌ ISSUES DETECTED${NC}"
    echo ""
    echo -e "${YELLOW}Please review the errors above and fix them before proceeding.${NC}"
    echo ""
    exit 1
fi
