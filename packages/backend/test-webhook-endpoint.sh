#!/bin/bash

# Webhook Endpoint Testing Script
# This script tests the Notion webhook endpoint with various scenarios

BASE_URL="http://localhost:3000"
WEBHOOK_URL="$BASE_URL/api/webhooks/notion"

echo "🧪 Testing Notion Webhook Endpoint"
echo "=================================="

# Test 1: Health Check
echo ""
echo "1. Testing health endpoint..."
curl -s "$BASE_URL/api/webhooks/notion/health" | jq '.'

# Test 2: Verification Request (this should be handled by the webhook route)
echo ""
echo "2. Testing verification request..."
curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"verification_token": "test-verification-token-123"}' | jq '.'

# Test 3: Ping Webhook
echo ""
echo "3. Testing ping webhook..."
curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"type": "ping"}' | jq '.'

# Test 4: Page Updated Webhook
echo ""
echo "4. Testing page.updated webhook..."
curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "page.updated",
    "page": {
      "id": "test-page-id-123",
      "object": "page",
      "properties": {
        "Name": {
          "type": "title",
          "title": [{"plain_text": "Test Client"}]
        }
      },
      "last_edited_time": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
    }
  }' | jq '.'

# Test 5: Page Created Webhook
echo ""
echo "5. Testing page.created webhook..."
curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "page.created",
    "page": {
      "id": "new-page-id-456",
      "object": "page",
      "properties": {
        "Name": {
          "type": "title",
          "title": [{"plain_text": "New Test Client"}]
        }
      },
      "last_edited_time": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
    }
  }' | jq '.'

# Test 6: Invalid Webhook (should return error)
echo ""
echo "6. Testing invalid webhook..."
curl -s -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"type": "page.updated", "page": null}' | jq '.'

# Test 7: Webhook with Signature (if secret is configured)
echo ""
echo "7. Testing webhook with signature verification..."
if [ -n "$NOTION_WEBHOOK_SECRET" ]; then
  echo "Webhook secret is configured, testing signature verification..."
  # This would require proper signature generation
  curl -s -X POST "$WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -H "x-notion-signature: invalid-signature" \
    -H "x-notion-timestamp: $(date +%s)" \
    -d '{"type": "ping"}' | jq '.'
else
  echo "No webhook secret configured, skipping signature test"
fi

echo ""
echo "✅ Webhook testing completed!"
echo ""
echo "📋 Next steps:"
echo "1. Check the logs for any errors: tail -f packages/backend/logs/combined.log"
echo "2. Verify webhook is working in Notion integration settings"
echo "3. Resume webhook delivery in Notion if it was paused" 