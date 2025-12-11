# VAPI Webhook Integration Tests

## Manual Testing Guide

### Setup

```bash
# Terminal 1: Start backend
cd apps/api
pnpm dev

# Terminal 2 (optional): Expose via ngrok for VAPI webhook testing
ngrok http 8000
```

## Test Scenarios

### 1. POST Webhook - Successful Call

**Test:** Receive end-of-call webhook with complete data

```bash
curl -X POST http://localhost:8000/api/v1/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "end-of-call-report",
      "call": {
        "id": "test_call_001",
        "status": "ended",
        "endedReason": "customer-ended-call",
        "startedAt": "2025-01-15T10:00:00Z",
        "endedAt": "2025-01-15T10:05:30Z",
        "transcript": "AI: Hello, this is calling about plumbing services.\nCustomer: Yes, we are available today.\nAI: Great! What are your rates?\nCustomer: $100 per hour with a $50 service call fee.\nAI: Perfect, thank you!",
        "summary": "Customer confirmed availability and pricing",
        "cost": 0.45,
        "analysis": {
          "summary": "Customer is available today with competitive pricing",
          "structuredData": {
            "availability": "available",
            "estimated_rate": "$100/hour + $50 service call",
            "single_person_found": true,
            "all_criteria_met": true,
            "call_outcome": "positive",
            "recommended": true
          },
          "successEvaluation": "successful"
        },
        "metadata": {
          "providerName": "Joes Plumbing",
          "providerPhone": "+15551234567",
          "serviceNeeded": "plumbing",
          "userCriteria": "Same day service needed",
          "location": "Greenville, SC",
          "urgency": "immediate"
        }
      }
    }
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Webhook processed and cached successfully",
  "callId": "test_call_001"
}
```

### 2. GET Call Result - Success

**Test:** Retrieve cached result

```bash
curl http://localhost:8000/api/v1/vapi/calls/test_call_001
```

**Expected Response:**

```json
{
  "success": true,
  "data": {
    "status": "completed",
    "callId": "test_call_001",
    "callMethod": "direct_vapi",
    "duration": 5.5,
    "endedReason": "customer-ended-call",
    "transcript": "AI: Hello, this is calling about plumbing services.\n...",
    "analysis": {
      "summary": "Customer is available today with competitive pricing",
      "structuredData": {
        "availability": "available",
        "estimated_rate": "$100/hour + $50 service call",
        "single_person_found": true,
        "all_criteria_met": true,
        "call_outcome": "positive",
        "recommended": true
      },
      "successEvaluation": "successful"
    },
    "provider": {
      "name": "Joes Plumbing",
      "phone": "+15551234567",
      "service": "plumbing",
      "location": "Greenville, SC"
    },
    "request": {
      "criteria": "Same day service needed",
      "urgency": "immediate"
    },
    "cost": 0.45
  }
}
```

### 3. GET Call Result - Not Found

**Test:** Try to retrieve non-existent result

```bash
curl http://localhost:8000/api/v1/vapi/calls/nonexistent_call_999
```

**Expected Response (404):**

```json
{
  "success": false,
  "error": "Call result not found",
  "message": "No cached result found for call ID: nonexistent_call_999. It may have expired or not been received yet."
}
```

### 4. POST Webhook - Voicemail

**Test:** Call went to voicemail

```bash
curl -X POST http://localhost:8000/api/v1/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "end-of-call-report",
      "call": {
        "id": "test_call_voicemail",
        "status": "ended",
        "endedReason": "voicemail-reached",
        "startedAt": "2025-01-15T10:00:00Z",
        "endedAt": "2025-01-15T10:00:45Z",
        "transcript": "AI: Hello, this is calling about...\n[Voicemail beep detected]",
        "summary": "Reached voicemail, no human contact",
        "cost": 0.15,
        "metadata": {
          "providerName": "ABC Electric",
          "providerPhone": "+15559876543"
        }
      }
    }
  }'
```

**Then retrieve:**

```bash
curl http://localhost:8000/api/v1/vapi/calls/test_call_voicemail
```

**Expected:** Status should be `voicemail`

### 5. POST Webhook - Call Failed

**Test:** Call failed with error

```bash
curl -X POST http://localhost:8000/api/v1/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "end-of-call-report",
      "call": {
        "id": "test_call_error",
        "status": "ended",
        "endedReason": "error-invalid-number",
        "startedAt": "2025-01-15T10:00:00Z",
        "endedAt": "2025-01-15T10:00:05Z",
        "transcript": "",
        "summary": "Call failed - invalid phone number",
        "cost": 0.05,
        "metadata": {
          "providerName": "XYZ Services",
          "providerPhone": "+15551111111"
        }
      }
    }
  }'
```

**Expected:** Status should be `error`

### 6. GET Cache Stats

**Test:** View all cached entries

```bash
curl http://localhost:8000/api/v1/vapi/cache/stats
```

**Expected Response:**

```json
{
  "success": true,
  "stats": {
    "size": 3,
    "entries": [
      {
        "callId": "test_call_001",
        "timestamp": 1737022800000,
        "expiresAt": 1737024600000
      },
      {
        "callId": "test_call_voicemail",
        "timestamp": 1737022850000,
        "expiresAt": 1737024650000
      },
      {
        "callId": "test_call_error",
        "timestamp": 1737022900000,
        "expiresAt": 1737024700000
      }
    ]
  }
}
```

### 7. DELETE Call Result

**Test:** Remove a specific result from cache

```bash
curl -X DELETE http://localhost:8000/api/v1/vapi/calls/test_call_001
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Call result test_call_001 deleted from cache"
}
```

**Then verify deleted:**

```bash
curl http://localhost:8000/api/v1/vapi/calls/test_call_001
```

**Expected:** 404 Not Found

### 8. POST Webhook - Invalid Payload (Validation Error)

**Test:** Send malformed webhook data

```bash
curl -X POST http://localhost:8000/api/v1/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "invalid-type",
      "call": null
    }
  }'
```

**Expected Response (400):**

```json
{
  "success": false,
  "error": "Invalid webhook payload",
  "details": [
    {
      "code": "invalid_enum_value",
      "expected": ["call-end", "end-of-call-report", ...],
      "received": "invalid-type",
      "path": ["message", "type"],
      "message": "Invalid enum value..."
    }
  ]
}
```

### 9. POST Webhook - Non-Call-End Event

**Test:** Send webhook event that's not end-of-call

```bash
curl -X POST http://localhost:8000/api/v1/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "status-update",
      "call": {
        "id": "test_call_in_progress",
        "status": "in-progress"
      }
    }
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "message": "Webhook received but not processed (not an end-of-call event)",
  "callId": "test_call_in_progress"
}
```

### 10. End-to-End Polling Simulation

**Test:** Simulate Kestra script polling behavior

```bash
# 1. Send webhook
curl -X POST http://localhost:8000/api/v1/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "end-of-call-report",
      "call": {
        "id": "test_poll_001",
        "status": "ended",
        "endedReason": "customer-ended-call",
        "transcript": "Test transcript",
        "metadata": {
          "providerName": "Test Provider"
        }
      }
    }
  }'

# 2. Poll immediately (should succeed)
curl http://localhost:8000/api/v1/vapi/calls/test_poll_001

# 3. Poll for non-existent call (simulate waiting)
for i in {1..5}; do
  echo "Poll attempt $i"
  curl -s http://localhost:8000/api/v1/vapi/calls/test_poll_002 | jq .
  sleep 5
done
```

## Automated Test Script

Save as `test-webhook-flow.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:8000/api/v1/vapi"
CALL_ID="test_automated_$(date +%s)"

echo "🧪 Testing VAPI Webhook Flow"
echo "============================"
echo ""

# Test 1: POST webhook
echo "1️⃣ Sending webhook..."
WEBHOOK_RESPONSE=$(curl -s -X POST "$BASE_URL/webhook" \
  -H "Content-Type: application/json" \
  -d "{
    \"message\": {
      \"type\": \"end-of-call-report\",
      \"call\": {
        \"id\": \"$CALL_ID\",
        \"status\": \"ended\",
        \"endedReason\": \"customer-ended-call\",
        \"transcript\": \"Test transcript\",
        \"cost\": 0.25,
        \"metadata\": {
          \"providerName\": \"Test Provider\"
        }
      }
    }
  }")

echo "$WEBHOOK_RESPONSE" | jq .
echo ""

# Test 2: GET call result
echo "2️⃣ Retrieving call result..."
sleep 1
GET_RESPONSE=$(curl -s "$BASE_URL/calls/$CALL_ID")
echo "$GET_RESPONSE" | jq .
echo ""

# Test 3: Check cache stats
echo "3️⃣ Checking cache stats..."
STATS_RESPONSE=$(curl -s "$BASE_URL/cache/stats")
echo "$STATS_RESPONSE" | jq .
echo ""

# Test 4: DELETE call result
echo "4️⃣ Deleting call result..."
DELETE_RESPONSE=$(curl -s -X DELETE "$BASE_URL/calls/$CALL_ID")
echo "$DELETE_RESPONSE" | jq .
echo ""

# Test 5: Verify deletion
echo "5️⃣ Verifying deletion (should be 404)..."
VERIFY_RESPONSE=$(curl -s "$BASE_URL/calls/$CALL_ID")
echo "$VERIFY_RESPONSE" | jq .
echo ""

echo "✅ Tests completed!"
```

Run with:

```bash
chmod +x test-webhook-flow.sh
./test-webhook-flow.sh
```

## Production Testing

### 1. Configure VAPI Webhook

In VAPI dashboard:

- URL: `https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook`
- Events: `end-of-call-report`
- Test: Click "Test Webhook"

### 2. Make Real Test Call

```bash
# Using VAPI client
curl -X POST https://api.vapi.ai/call \
  -H "Authorization: Bearer YOUR_VAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumberId": "YOUR_PHONE_ID",
    "customer": {
      "number": "+15551234567"
    },
    "assistant": {
      "name": "Test Assistant",
      "firstMessage": "Hello, this is a test call",
      "serverUrl": "https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook"
    }
  }'
```

### 3. Monitor Logs

```bash
# Railway logs
railway logs --project api-production

# Check for:
# - "VAPI webhook received"
# - "Call result cached successfully"
```

### 4. Poll for Result

```bash
# Get call ID from VAPI response above
CALL_ID="returned_call_id"

# Poll backend
curl https://api-production-8fe4.up.railway.app/api/v1/vapi/calls/$CALL_ID
```

## Success Criteria

✅ Webhook endpoint receives POST requests
✅ Valid payloads are parsed and cached
✅ Invalid payloads return 400 with validation errors
✅ GET endpoint returns cached results
✅ GET endpoint returns 404 for missing/expired results
✅ Cache stats endpoint shows correct data
✅ DELETE endpoint removes entries
✅ Non-call-end events are acknowledged but not cached
✅ End-to-end polling works as expected
✅ Production webhook delivers to Railway API

## Performance Benchmarks

Expected latency:

- POST webhook: < 50ms
- GET cached result: < 10ms
- Cache lookup: < 1ms

Load test with `ab` (Apache Bench):

```bash
# Test GET endpoint
ab -n 1000 -c 10 http://localhost:8000/api/v1/vapi/calls/test_call_001
```

## Troubleshooting

### Webhook not cached

- Check request body in logs
- Verify Zod validation passed
- Check message type is `end-of-call-report`

### 404 on GET

- Verify webhook was received first
- Check cache stats for presence
- Check TTL hasn't expired (30 min default)

### Memory growth

- Monitor cache size via stats endpoint
- Verify cleanup interval running (every 5 min)
- Check for expired entries being removed
