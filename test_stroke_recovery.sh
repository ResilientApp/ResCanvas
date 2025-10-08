#!/bin/bash

# ResCanvas Stroke Recovery Verification Script
# This script tests that all strokes are properly loaded with valid authentication

echo "======================================"
echo "ResCanvas Stroke Recovery Test"
echo "======================================"
echo ""

# Step 1: Login
echo "Step 1: Logging in as testuser_2..."
LOGIN_RESPONSE=$(curl -s -X POST http://127.0.0.1:10010/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser_2", "password": "testpass"}')

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token')

if [ "$TOKEN" = "null" ] || [ -z "$TOKEN" ]; then
    echo "❌ Login failed!"
    echo "$LOGIN_RESPONSE" | jq '.'
    exit 1
fi

echo "✅ Login successful"
echo "Token: ${TOKEN:0:50}..."
echo ""

# Step 2: Test Security (query param should NOT work)
echo "Step 2: Testing security (query param auth should be blocked)..."
SEC_TEST=$(curl -s "http://127.0.0.1:10010/rooms/68d489125ea61e490e2062c3/strokes?user=testuser_2" | jq -r '.status')

if [ "$SEC_TEST" = "error" ]; then
    echo "✅ Security loophole closed - query param auth rejected"
else
    echo "❌ SECURITY ISSUE: Query param auth still working!"
fi
echo ""

# Step 3: Test stroke retrieval for all rooms
echo "Step 3: Testing stroke retrieval for test rooms..."
echo ""

ROOMS=(
    "68d489125ea61e490e2062c3"
    "68e591fb589d78ec5b35183f"
    "68e59202589d78ec5b351840"
    "68d44fd5a58992ab06801aea"
)

TOTAL_STROKES=0

for ROOM in "${ROOMS[@]}"; do
    echo "Room: $ROOM"
    
    RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" \
        "http://127.0.0.1:10010/rooms/$ROOM/strokes")
    
    STATUS=$(echo "$RESPONSE" | jq -r '.status')
    COUNT=$(echo "$RESPONSE" | jq '.strokes | length')
    
    if [ "$STATUS" = "ok" ]; then
        echo "  Status: ✅ OK"
        echo "  Strokes: $COUNT"
        
        if [ "$COUNT" -gt 0 ]; then
            TOTAL_STROKES=$((TOTAL_STROKES + COUNT))
            echo "  Sample stroke:"
            echo "$RESPONSE" | jq '.strokes[0] | {id, user, timestamp}'
        fi
    else
        echo "  Status: ❌ FAILED"
        echo "  Message: $(echo "$RESPONSE" | jq -r '.message')"
    fi
    
    echo ""
done

# Step 4: Summary
echo "======================================"
echo "Test Summary"
echo "======================================"
echo "Total strokes retrieved: $TOTAL_STROKES"
echo ""

if [ "$TOTAL_STROKES" -gt 0 ]; then
    echo "✅ SUCCESS: Strokes are loading correctly!"
    echo ""
    echo "Next steps:"
    echo "1. Clear your browser cache and localStorage"
    echo "2. Log out of the frontend application"
    echo "3. Log back in with testuser_2 / testpass"
    echo "4. Visit the rooms - strokes should now be visible"
else
    echo "⚠️  No strokes found in test rooms"
    echo "This may be expected if these rooms are empty"
fi

echo ""
echo "======================================"
