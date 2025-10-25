#!/bin/bash

# ResVault Wallet Integration Testing Guide
# This script provides instructions and automated setup for testing wallet integration

set -e

echo "==========================================================="
echo "ResVault Wallet Integration - Testing Guide"
echo "==========================================================="
echo ""

# Check if services are running
echo "📋 Step 1: Checking if services are running..."
echo ""

if ! lsof -i :10010 &>/dev/null; then
    echo "❌ Backend (port 10010) is not running"
    echo "   Please run: cd backend && python app.py"
    exit 1
else
    echo "✅ Backend is running on port 10010"
fi

if ! lsof -i :3000 &>/dev/null; then
    echo "❌ Frontend (port 3000) is not running"
    echo "   Please run: cd frontend && npm start"
    exit 1
else
    echo "✅ Frontend is running on port 3000"
fi

echo ""
echo "==========================================================="
echo "📦 Step 2: ResVault Extension Setup"
echo "==========================================================="
echo ""
echo "IMPORTANT: You MUST manually load the ResVault extension into Chrome:"
echo ""
echo "1. Open Chrome and navigate to: chrome://extensions/"
echo "2. Enable 'Developer mode' (toggle in top right)"
echo "3. Click 'Load unpacked'"
echo "4. Select the directory:"
echo "   /home/ubuntu/resilient-apps/ResCanvas/resvault-fixed-20251018-140436/build"
echo ""
echo "5. The ResVault extension should now appear in your extensions list"
echo "6. Click the extension icon to open ResVault"
echo "7. Create a new wallet account (signup) or login to existing wallet"
echo ""

read -p "Press ENTER when ResVault extension is loaded and you've logged in..."

echo ""
echo "==========================================================="
echo "🧪 Step 3: Manual Testing Steps"
echo "==========================================================="
echo ""
echo "Now follow these steps in the browser:"
echo ""
echo "A. Register/Login to ResCanvas:"
echo "   1. Navigate to: http://localhost:3000"
echo "   2. Click 'Register' and create a new account"
echo "   3. Login with your credentials"
echo ""
echo "B. Create a Secure Room:"
echo "   1. Click 'Create Room' on the dashboard"
echo "   2. Enter a room name"
echo "   3. Select 'Secure Room' option"
echo "   4. Click 'Create'"
echo ""
echo "C. Connect Wallet:"
echo "   1. You should see 'Secure Room - Wallet Required' message"
echo "   2. Click 'Connect Wallet' button"
echo "   3. The ResVault extension should prompt you"
echo "   4. Click 'Authenticate' in the ResVault modal"
echo "   5. You should see 'Connected' status with your public key"
echo ""
echo "D. Test Drawing with Signatures:"
echo "   1. Once connected, try drawing on the canvas"
echo "   2. Open browser DevTools (F12) -> Console tab"
echo "   3. Look for messages about signing:"
echo "      - '[resvault] received keys for signing'"
echo "      - '[resvault] signature generated: ...'"
echo "   4. Check Network tab for POST requests to /rooms/[ID]/strokes"
echo "   5. Verify the request includes 'signature' and 'signerPubKey' fields"
echo ""
echo "E. Verify Backend Signature Verification:"
echo "   1. Draw a stroke (it should succeed if signature is valid)"
echo "   2. Check browser console for any errors"
echo "   3. Check backend logs for signature verification messages"
echo ""

read -p "Press ENTER when you've completed the manual testing..."

echo ""
echo "==========================================================="
echo "🔍 Step 4: Automated Verification Tests"
echo "==========================================================="
echo ""

# Run signing unit test
echo "Running signing unit test..."
cd /home/ubuntu/resilient-apps/ResCanvas/frontend
node tests/signing_unit_test.js

if [ $? -eq 0 ]; then
    echo "✅ Signing unit test passed!"
else
    echo "❌ Signing unit test failed!"
    exit 1
fi

echo ""
echo "==========================================================="
echo "📊 Testing Summary"
echo "==========================================================="
echo ""
echo "Completed checks:"
echo "  ✅ Backend service running"
echo "  ✅ Frontend service running"
echo "  ✅ Signing library unit test passed"
echo ""
echo "Manual verification required:"
echo "  ⚠️  ResVault extension loaded"
echo "  ⚠️  Wallet connection successful"
echo "  ⚠️  Stroke signing working"
echo "  ⚠️  Backend signature verification"
echo ""
echo "If all manual steps worked, the integration is COMPLETE!"
echo ""
echo "==========================================================="
