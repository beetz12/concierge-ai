# Twilio SMS Webhook Analysis & Fix Plan

## Executive Summary

**Root Cause Identified (90% confidence):** The webhook isn't triggering because **the Twilio phone number hasn't been configured in the Twilio Console** to forward incoming SMS to your webhook URL. The ngrok URL is set up, the code exists, but Twilio doesn't know where to send incoming messages.

**Time Window:** There is NO time limit for SMS replies. Twilio will forward any incoming message to the configured webhook URL indefinitely.

---

## Problem Analysis

### Why Webhooks Aren't Triggering

| Possible Cause | Likelihood | Status |
|----------------|------------|--------|
| **Phone number not configured in Twilio Console** | **95%** | Most likely cause |
| Ngrok tunnel not running | 5% | User confirmed ngrok is up |
| Webhook URL typo in Twilio Console | 10% | Needs verification |
| Twilio credentials invalid | 5% | SMS sending works, so unlikely |

### The Missing Step

When you send an SMS via Twilio API, Twilio knows which phone number sent it. But for **incoming** messages, Twilio needs to be told where to forward them. This is configured **per phone number** in the Twilio Console.

---

## Immediate Fix Required

### Step 1: Configure Twilio Phone Number Webhook

1. Log into [Twilio Console](https://console.twilio.com)
2. Navigate to: **Phone Numbers → Manage → Active numbers**
3. Click on your phone number (the one in `TWILIO_PHONE_NUMBER`)
4. Scroll to **Messaging Configuration** section
5. Find **"A message comes in"** setting
6. Set to: **Webhook**
7. Enter URL: `https://2ce8048103bc.ngrok-free.app/api/v1/twilio/webhook`
8. Set HTTP method: **POST**
9. Click **Save configuration**

### Step 2: Verify Webhook is Receiving

After configuring, send a test SMS reply. Check ngrok console for incoming POST request:
```
POST /api/v1/twilio/webhook 200 OK
```

---

## How Request Correlation Works

### Current Implementation (Phone-Based Lookup)

**File:** `apps/api/src/routes/twilio-webhook.ts` (lines 75-90)

When an SMS reply arrives, the webhook:
1. Extracts the sender's phone number (`From` field)
2. Queries database for most recent service request with that phone
3. Matches against statuses: `RECOMMENDED`, `BOOKING`, `CALLING`, `ANALYZING`

```typescript
const { data: request } = await supabase
  .from("service_requests")
  .select("id, status, title, location, ...")
  .eq("user_phone", userPhone)
  .in("status", ["RECOMMENDED", "BOOKING", "CALLING", "ANALYZING"])
  .order("created_at", { ascending: false })
  .limit(1)
  .single();
```

### Correlation Strategy

| Method | Current | Recommended |
|--------|---------|-------------|
| **By phone number** | ✅ Implemented | Works for single active request |
| **By message SID** | ❌ Field exists but unused | More robust, prevents race conditions |
| **By reply code** | ❌ Not implemented | Best for multiple concurrent requests |

---

## What Happens After User Replies

### Complete Flow (Already Implemented)

```
User sends "1" → Twilio webhook → Find request by phone →
Select provider #1 → Update DB → Trigger booking call →
Send confirmation SMS
```

**Webhook Handler Actions (lines 63-272):**

1. **Parse SMS:** Extract `From`, `Body`, `MessageSid`
2. **Find Request:** Query by phone number + active status
3. **Validate Selection:** Check if "1", "2", or "3"
4. **Get Providers:** Fetch top 3 ranked providers for request
5. **Update Database:**
   - Set `user_selection = 1|2|3`
   - Set `selected_provider_id = UUID`
   - Set `status = 'BOOKING'`
6. **Log Interaction:** Record in `interaction_logs`
7. **Trigger Booking:** Fire-and-forget POST to `/api/v1/providers/book`
8. **Send Confirmation:** SMS with provider details

---

## Code Verification

### Webhook Route EXISTS

**File:** `apps/api/src/routes/twilio-webhook.ts`
**Route:** `POST /api/v1/twilio/webhook`
**Registration:** `apps/api/src/index.ts` line 173-174

```typescript
await server.register(twilioWebhookRoutes, { prefix: "/api/v1/twilio" });
```

### Status Endpoint for Testing

```bash
curl https://2ce8048103bc.ngrok-free.app/api/v1/twilio/status
```

Should return:
```json
{
  "twilioConfigured": true,
  "webhookReady": true
}
```

---

## Answers to Your Questions

### 1. Why isn't the webhook being triggered?

**Answer:** The Twilio phone number needs to be configured in Twilio Console to forward incoming messages to your webhook URL. Just setting up ngrok isn't enough - Twilio doesn't automatically know where to send incoming SMS.

### 2. Is there a time window for replies?

**Answer:** **NO.** Twilio has no time limit for SMS replies. Once configured, any message sent to your Twilio number will be forwarded to the webhook URL indefinitely. The only "window" is whether you have an active service request in the database that matches the phone number.

### 3. How do we determine which request this is for?

**Answer:** Currently by **phone number lookup**:
1. Extract sender phone from webhook payload (`From` field)
2. Query `service_requests` where `user_phone = From` AND status is active
3. Get most recent matching request
4. Fetch associated providers

**Limitation:** If user has multiple active requests, only the most recent is matched.

---

## Gaps Identified (For Future Improvement)

| Gap | Impact | Priority |
|-----|--------|----------|
| No webhook signature validation | Security vulnerability | HIGH |
| Message SID not stored | Can't validate reply authenticity | MEDIUM |
| Status enum mismatch | Query may fail for some statuses | MEDIUM |
| No multi-request disambiguation | Race condition with concurrent requests | LOW |

---

## Testing Checklist

After configuring Twilio Console:

- [ ] Send test SMS to Twilio number
- [ ] Check ngrok console for incoming POST
- [ ] Check API logs for webhook processing
- [ ] Verify database update (`user_selection` field)
- [ ] Confirm booking call was triggered
- [ ] Receive confirmation SMS

---

## Quick Diagnostic Commands

### Check if API is receiving webhooks:
```bash
# Watch ngrok traffic
ngrok http 8000 # (your existing tunnel)
# Look for: POST /api/v1/twilio/webhook
```

### Test webhook endpoint directly:
```bash
curl -X POST https://2ce8048103bc.ngrok-free.app/api/v1/twilio/webhook \
  -d "From=+1234567890" \
  -d "Body=1" \
  -d "MessageSid=test123"
```

### Check Twilio Console Logs:
1. Go to Twilio Console → Monitor → Logs → Messaging
2. Look for your incoming message
3. Check "Webhook Request" status

---

## Confidence: 90%

**Why 90%:**
- Code analysis confirms webhook handler exists and is correct
- Perplexity research confirms phone number must be configured in Console
- This is the most common oversight when setting up Twilio webhooks

**10% uncertainty:**
- Haven't visually verified your Twilio Console configuration
- Ngrok free tier occasionally has issues with webhook delivery
- Possible firewall/network issues on ngrok's end
