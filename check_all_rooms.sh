#!/bin/bash

# Test all rooms mentioned by the user to check stroke loading

TOKEN="eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJyZXNjYW52YXMiLCJzdWIiOiI2OGRkNjc2ZGEwMjkxNzYxNDRiNjkwZDQiLCJ1c2VybmFtZSI6InRlc3R1c2VyXzIiLCJleHAiOjE3NjA0OTM1MDF9.DCm7kDWarEnbE0Oh4qofeCZyjJxGZuJsTBjPO9RvRwE"

ROOMS=(
  "68d38894e33681b0c8e26b10"
  "68dc2014f038152361187d67"
  "68d44ffaa58992ab06801aee"
  "68e1e5045b4cd832202ae54b"
  "68e070707656d072fb84ca91"
  "68e1e5215b4cd832202ae54f"
  "68d64b069d0a7155fd0dec59"
  "68e2d1f7f41fa996142c771f"
  "68e59202589d78ec5b351840"
  "68e0bdd7f131a934c8edd8b5"
  "68d489125ea61e490e2062c3"
)

echo "======================================"
echo "Checking All testuser_2 Rooms"
echo "======================================"
echo ""

TOTAL_ROOMS=0
TOTAL_STROKES=0
ROOMS_WITH_STROKES=0

for ROOM in "${ROOMS[@]}"; do
  TOTAL_ROOMS=$((TOTAL_ROOMS + 1))
  
  RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:10010/rooms/$ROOM/strokes")
  STATUS=$(echo "$RESPONSE" | jq -r '.status')
  COUNT=$(echo "$RESPONSE" | jq '.strokes | length')
  
  if [ "$STATUS" = "ok" ]; then
    echo "✅ Room $ROOM: $COUNT strokes"
    TOTAL_STROKES=$((TOTAL_STROKES + COUNT))
    if [ "$COUNT" -gt 0 ]; then
      ROOMS_WITH_STROKES=$((ROOMS_WITH_STROKES + 1))
      # Show first stroke sample
      SAMPLE=$(echo "$RESPONSE" | jq -c '.strokes[0] | {id, user, timestamp}')
      echo "   Sample: $SAMPLE"
    fi
  else
    echo "❌ Room $ROOM: FAILED - $(echo "$RESPONSE" | jq -r '.message')"
  fi
  echo ""
done

echo "======================================"
echo "Summary"
echo "======================================"
echo "Total rooms checked: $TOTAL_ROOMS"
echo "Rooms with strokes: $ROOMS_WITH_STROKES"
echo "Total strokes retrieved: $TOTAL_STROKES"
echo "======================================"
