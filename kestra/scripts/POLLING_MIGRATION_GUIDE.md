# Polling Migration Guide: VAPI → Backend API

## Overview

This guide shows how to update the `call-provider.js` script to poll the backend API instead of polling VAPI directly.

## IMPORTANT: DRY Architecture Update

As of the latest version, the `call-provider.js` script now imports the assistant configuration from the compiled TypeScript source to maintain DRY principles:

**Single Source of Truth**: `apps/api/src/services/vapi/assistant-config.ts`

- Contains the canonical VAPI assistant configuration
- Defines prompts, conversation flow, analysis schema
- Used by both Kestra scripts and direct API calls

**Build Requirement**: Before running Kestra scripts:

```bash
pnpm build
# or
pnpm --filter api build
```

The script imports from: `apps/api/dist/services/vapi/assistant-config.js`

This ensures:

- No configuration duplication
- Consistent behavior across all execution paths
- Single place to update prompts and logic

## Changes Required

### Before: Polling VAPI Directly

```javascript
// OLD: Poll VAPI API for call completion
async function pollForCallCompletion(callId, maxAttempts = 60) {
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const call = await vapi.calls.get(callId);

      if (call.status === "ended") {
        return {
          status: "completed",
          callId: call.id,
          duration: calculateDuration(call.startedAt, call.endedAt),
          transcript: call.transcript,
          // ... extract other fields
        };
      }

      console.log(
        `Call ${callId} still in progress (attempt ${attempt + 1})...`,
      );
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error(`Poll attempt ${attempt + 1} failed:`, error);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error("Timeout: Call did not complete within expected time");
}
```

### After: Polling Backend API

```javascript
// NEW: Poll backend API for webhook results
async function pollForCallCompletion(callId, maxAttempts = 60) {
  const pollInterval = 5000; // 5 seconds
  const backendUrl =
    process.env.BACKEND_URL || "https://api-production-8fe4.up.railway.app";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(`${backendUrl}/api/v1/vapi/calls/${callId}`);

      // Success: Webhook result available
      if (response.ok) {
        const { success, data } = await response.json();

        if (success && data) {
          console.log(`Call ${callId} completed successfully`);
          return data; // Returns CallResult object
        }
      }

      // 404: Result not ready yet, continue polling
      if (response.status === 404) {
        console.log(
          `Call ${callId} result not ready yet (attempt ${attempt + 1})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        continue;
      }

      // Other errors: Log and retry
      console.error(`Unexpected response status ${response.status}`);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error(`Poll attempt ${attempt + 1} failed:`, error.message);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  // Timeout: Call result never received
  throw new Error(
    `Timeout: Call result for ${callId} not received within ${(maxAttempts * pollInterval) / 1000} seconds`,
  );
}
```

## Current Architecture

The current `call-provider.js` script uses the shared configuration approach:

```javascript
// Import shared configuration from compiled TypeScript
const configModule = await import(
  "../../apps/api/dist/services/vapi/assistant-config.js"
);
const createAssistantConfig = configModule.createAssistantConfig;

// Use the shared configuration
const assistantConfig = createAssistantConfig({
  phoneNumber: PHONE_NUMBER,
  serviceNeeded: SERVICE_TYPE,
  userCriteria: USER_CRITERIA,
  location: LOCATION,
  providerName: PROVIDER_NAME,
  urgency: URGENCY,
});
```

This approach ensures:

- VAPI assistant config defined in ONE place only
- Kestra scripts and API use identical configuration
- Updates to prompts/logic happen in one file

## Complete Updated Script (Legacy Reference)

Here's the full updated `call-provider.js` (NOTE: The actual script now uses the shared config import above):

```javascript
/**
 * Kestra Task: Call Service Provider via VAPI
 * Updated to poll backend webhook API instead of VAPI directly
 */

const Vapi = require("@vapi-ai/server-sdk").default;

// Environment variables from Kestra
const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
const BACKEND_URL =
  process.env.BACKEND_URL || "https://api-production-8fe4.up.railway.app";

// Task inputs from Kestra flow
const providerName = process.env.PROVIDER_NAME;
const providerPhone = process.env.PROVIDER_PHONE;
const serviceNeeded = process.env.SERVICE_NEEDED;
const userCriteria = process.env.USER_CRITERIA;
const location = process.env.LOCATION;
const urgency = process.env.URGENCY || "flexible";

// Validate inputs
if (!VAPI_API_KEY || !VAPI_PHONE_NUMBER_ID) {
  throw new Error("Missing VAPI credentials");
}

if (!providerName || !providerPhone || !serviceNeeded) {
  throw new Error("Missing required provider information");
}

// Initialize VAPI client
const vapi = new Vapi(VAPI_API_KEY);

/**
 * Main execution
 */
async function main() {
  try {
    console.log("=== Starting Provider Call ===");
    console.log(`Provider: ${providerName}`);
    console.log(`Phone: ${providerPhone}`);
    console.log(`Service: ${serviceNeeded}`);
    console.log(`Location: ${location}`);
    console.log(`Urgency: ${urgency}`);
    console.log("");

    // Step 1: Initiate the call via VAPI
    const call = await initiateCall();
    console.log(`Call initiated: ${call.id}`);
    console.log("");

    // Step 2: Poll backend API for webhook result (instead of VAPI)
    console.log("Polling backend API for call completion...");
    const result = await pollBackendForResult(call.id);
    console.log("");

    // Step 3: Output results for Kestra
    console.log("=== Call Completed ===");
    console.log(JSON.stringify(result, null, 2));

    // Write outputs for Kestra to capture
    process.stdout.write(`::set-output name=callId::${result.callId}\n`);
    process.stdout.write(`::set-output name=status::${result.status}\n`);
    process.stdout.write(`::set-output name=duration::${result.duration}\n`);
    process.stdout.write(
      `::set-output name=transcript::${result.transcript}\n`,
    );
    process.stdout.write(
      `::set-output name=analysis::${JSON.stringify(result.analysis)}\n`,
    );
    process.stdout.write(`::set-output name=cost::${result.cost}\n`);

    process.exit(0);
  } catch (error) {
    console.error("Error executing call:", error);
    process.exit(1);
  }
}

/**
 * Initiate the call via VAPI
 */
async function initiateCall() {
  const assistantConfig = {
    name: `${serviceNeeded} Provider Call`,
    model: {
      provider: "openai",
      model: "gpt-4",
      temperature: 0.7,
    },
    voice: {
      provider: "playht",
      voiceId: "jennifer",
    },
    firstMessage: `Hello, I'm calling on behalf of a customer looking for ${serviceNeeded} services in ${location}. Do you have availability?`,
    recordingEnabled: true,
    endCallFunctionEnabled: true,
    serverUrl: `${BACKEND_URL}/api/v1/vapi/webhook`, // Webhook URL
    metadata: {
      providerName,
      providerPhone,
      serviceNeeded,
      userCriteria,
      location,
      urgency,
    },
  };

  const call = await vapi.calls.create({
    phoneNumberId: VAPI_PHONE_NUMBER_ID,
    customer: {
      number: providerPhone,
    },
    assistant: assistantConfig,
  });

  return call;
}

/**
 * Poll backend API for webhook results
 * Replaces direct VAPI polling
 */
async function pollBackendForResult(callId) {
  const maxAttempts = 60; // 5 minutes
  const pollInterval = 5000; // 5 seconds

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(
        `${BACKEND_URL}/api/v1/vapi/calls/${callId}`,
      );

      // Success: Webhook result available
      if (response.ok) {
        const { success, data } = await response.json();

        if (success && data) {
          console.log(
            `✓ Call result received from backend (attempt ${attempt + 1})`,
          );
          return data;
        }
      }

      // 404: Result not ready yet
      if (response.status === 404) {
        const timeElapsed = (attempt * pollInterval) / 1000;
        console.log(`  Waiting for webhook... (${timeElapsed}s elapsed)`);
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        continue;
      }

      // Other errors
      console.error(
        `  Unexpected status ${response.status} (attempt ${attempt + 1})`,
      );
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error(`  Poll failed (attempt ${attempt + 1}):`, error.message);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  throw new Error(
    `Timeout: Call result for ${callId} not received after ${(maxAttempts * pollInterval) / 1000} seconds`,
  );
}

// Run main
main();
```

## Key Changes Summary

1. **Added Backend URL:**

   ```javascript
   const BACKEND_URL =
     process.env.BACKEND_URL || "https://api-production-8fe4.up.railway.app";
   ```

2. **Updated serverUrl in Assistant Config:**

   ```javascript
   serverUrl: `${BACKEND_URL}/api/v1/vapi/webhook`,
   ```

3. **Replaced VAPI Polling with Backend Polling:**

   ```javascript
   // OLD: const result = await pollVapiForResult(call.id);
   // NEW:
   const result = await pollBackendForResult(call.id);
   ```

4. **New Polling Function:**
   - Polls `GET /api/v1/vapi/calls/:callId`
   - Returns 404 until webhook received
   - Returns full `CallResult` object when ready

## Testing the Migration

### 1. Local Development

```bash
# Set environment variables
export VAPI_API_KEY="your_vapi_key"
export VAPI_PHONE_NUMBER_ID="your_phone_id"
export BACKEND_URL="http://localhost:8000"
export PROVIDER_NAME="Test Plumber"
export PROVIDER_PHONE="+15551234567"
export SERVICE_NEEDED="plumbing"
export USER_CRITERIA="Same day service"
export LOCATION="Greenville, SC"

# Run the script
node call-provider.js
```

### 2. Kestra Flow Update

Update your Kestra flow YAML to include `BACKEND_URL`:

```yaml
tasks:
  - id: call_provider
    type: io.kestra.plugin.scripts.node.Script
    script: |
      {{read('call-provider.js')}}
    env:
      VAPI_API_KEY: "{{ secret('VAPI_API_KEY') }}"
      VAPI_PHONE_NUMBER_ID: "{{ secret('VAPI_PHONE_NUMBER_ID') }}"
      BACKEND_URL: "https://api-production-8fe4.up.railway.app"
      PROVIDER_NAME: "{{ inputs.providerName }}"
      PROVIDER_PHONE: "{{ inputs.providerPhone }}"
      SERVICE_NEEDED: "{{ inputs.serviceNeeded }}"
      USER_CRITERIA: "{{ inputs.userCriteria }}"
      LOCATION: "{{ inputs.location }}"
      URGENCY: "{{ inputs.urgency }}"
```

## Benefits of Migration

### ✅ Improved Reliability

- Backend cache persists results even if polling script restarts
- No direct dependency on VAPI API availability during polling

### ✅ Better Performance

- Single webhook callback vs. continuous polling
- Reduced API calls to VAPI (lower rate limit concerns)

### ✅ Enhanced Monitoring

- Centralized logging in backend
- Cache statistics for debugging
- Webhook delivery tracking

### ✅ Cost Optimization

- Fewer VAPI API calls (webhooks are free)
- Reduced script execution time

## Rollback Plan

If issues occur, revert to direct VAPI polling:

1. Remove `serverUrl` from assistant config
2. Replace `pollBackendForResult()` with old `pollVapiForResult()`
3. Remove `BACKEND_URL` environment variable

## Monitoring

Check these after deployment:

1. **Backend logs:** Webhook callbacks arriving
2. **Cache stats:** `GET /api/v1/vapi/cache/stats`
3. **Kestra logs:** Successful polling and outputs
4. **VAPI dashboard:** Webhook delivery status

## Common Issues

### Webhook Not Received

- **Check:** VAPI webhook URL configured correctly
- **Check:** Backend logs for incoming webhooks
- **Solution:** Verify URL and test with curl

### 404 Timeout

- **Cause:** Call failed before webhook sent
- **Check:** VAPI call logs
- **Solution:** Increase timeout or check call configuration

### Wrong Data Format

- **Check:** Backend transformation logic in `transformVapiWebhookToCallResult()`
- **Solution:** Update transformation if VAPI schema changes

## Next Steps

1. Update `call-provider.js` with new polling logic
2. Test locally with ngrok
3. Deploy to Kestra
4. Configure VAPI webhook URL in dashboard
5. Run end-to-end test
6. Monitor production logs
