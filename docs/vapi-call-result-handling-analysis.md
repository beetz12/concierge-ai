# VAPI.ai Call Result Handling - Technical Analysis

**Analysis Date**: 2025-12-08
**Current Implementation**: `/Users/dave/Work/concierge-ai/kestra/scripts/call-provider.js`

---

## Executive Summary

The current implementation uses **polling** (`vapi.calls.get(call.id)` every 5 seconds) to retrieve call results. Based on VAPI.ai's 2025 API capabilities, this approach works but is **inefficient**. VAPI provides:

1. **Structured Output** via `analysisPlan` configuration
2. **Webhooks** for real-time `end-of-call-report` events
3. **Rich call object** with transcript, analysis, and cost data

**Recommendation**: Migrate to **webhook-based architecture** with structured data extraction for production use.

---

## 1. How VAPI Returns Results After a Call

### Current Polling Approach

```javascript
// Current implementation (call-provider.js:78-99)
while (["queued", "ringing", "in-progress"].includes(status) && attempts < 24) {
  await new Promise((r) => setTimeout(r, 5000));
  const updatedCall = await vapi.calls.get(call.id);
  status = updatedCall.status;

  if (status === "ended") {
    const transcript =
      updatedCall.transcript ||
      updatedCall.summary ||
      "No transcript available";
    const analysis = updatedCall.analysis || {};
    // Extract results...
  }
}
```

**Problems with Polling**:

- Higher latency (up to 5 seconds delay)
- Wastes resources on repeated API calls
- Not scalable for multiple concurrent calls
- Risk of hitting rate limits

### Recommended Webhook Approach

VAPI.ai provides an `end-of-call-report` webhook that pushes results immediately when calls complete.

**Benefits**:

- Immediate data delivery (real-time)
- No wasted API calls
- Scalable to thousands of concurrent calls
- Lower latency (instant vs. 5-second polling interval)

---

## 2. Exact Output Format from VAPI

### Call Object Structure (from `vapi.calls.get()`)

Based on VAPI API documentation and OpenAPI spec:

```typescript
interface Call {
  // Core properties
  id: string;
  type:
    | "inboundPhoneCall"
    | "outboundPhoneCall"
    | "webCall"
    | "vapi.websocketCall";
  status:
    | "scheduled"
    | "queued"
    | "ringing"
    | "in-progress"
    | "forwarding"
    | "ended"
    | "not-found"
    | "deletion-failed";
  endedReason: CallEndedReason; // Extensive enum of completion/failure reasons

  // Communication data
  messages: Array<
    | UserMessage
    | SystemMessage
    | BotMessage
    | ToolCallMessage
    | ToolCallResultMessage
  >;

  // Artifact (recordings and transcripts)
  artifact: {
    transcript?: string; // Full conversation transcript
    video?: string; // Video recording URL (if enabled)
    stereoRecordings?: string[]; // Audio recordings
    performanceMetrics?: {
      turnLatencies: number[];
      interruptionCount: number;
      averageLatency: number;
    };
  };

  // Analysis results (if analysisPlan configured)
  analysis?: {
    summary: string; // 2-3 sentence overview
    structuredData: any; // Extracted data per schema
    successEvaluation: string | number; // Call outcome score
  };

  // Cost breakdown
  costs: Array<
    TransportCost | TranscriberCost | ModelCost | VoiceCost | VapiCost
  >;
  costBreakdown: {
    transport: number;
    stt: number; // Speech-to-text
    llm: number; // Language model
    tts: number; // Text-to-speech
    vapi: number;
    total: number;
  };

  // Duration
  durationMinutes?: number;

  // Compliance
  compliance?: {
    recordingConsent?: boolean;
  };
}
```

### Critical Fields for AI Concierge Use Case

```javascript
// After call ends
const call = await vapi.calls.get(callId);

// Extract these key fields:
{
    // Call outcome
    status: call.status,                    // 'ended'
    endedReason: call.endedReason,          // Why call ended

    // Conversation content
    transcript: call.artifact?.transcript,   // Full text transcript

    // AI Analysis (requires analysisPlan configuration)
    summary: call.analysis?.summary,         // Brief overview
    structuredData: call.analysis?.structuredData, // Extracted data
    successEvaluation: call.analysis?.successEvaluation, // Call quality score

    // Metadata
    duration: call.durationMinutes,
    cost: call.costBreakdown?.total,
    callId: call.id
}
```

---

## 3. Structured Data Extraction Configuration

### The Missing Piece: `analysisPlan`

The current implementation **does not configure** `analysisPlan`, which is why `call.analysis` may be empty or undefined.

### How to Configure Structured Output

Add `analysisPlan` to the assistant configuration:

```javascript
const assistantConfig = {
  name: `Concierge Agent - ${CUSTOMER_SERVICE_NEEDED}`,
  voice: {
    provider: "playht",
    voiceId: "jennifer",
  },
  model: {
    provider: "google",
    model: "gemini-2.5-flash",
    messages: [
      {
        role: "system",
        content: `You are an AI Concierge calling a service provider...`,
      },
    ],
  },
  transcriber: {
    provider: "deepgram",
    language: "en",
  },
  endCallFunctionEnabled: true,

  // ADD THIS: Analysis Plan for Structured Output
  analysisPlan: {
    // Summary (2-3 sentences)
    summaryPrompt:
      "Summarize the key points of this call with the service provider, including their responses to availability, pricing, and licensing.",

    // Structured data extraction
    structuredDataPrompt:
      "Extract the following information from the call: availability (yes/no/unclear), estimated_rate (dollar amount or 'not provided'), licensed_and_insured (yes/no/unclear), and any additional notes.",

    // Define the schema for extracted data
    structuredDataSchema: {
      type: "object",
      properties: {
        availability: {
          type: "string",
          enum: ["available", "unavailable", "unclear"],
          description: "Whether provider is available within 2 days",
        },
        estimated_rate: {
          type: "string",
          description:
            "Hourly or project rate mentioned (e.g., '$85/hour', '$200-500')",
        },
        licensed_and_insured: {
          type: "string",
          enum: ["yes", "no", "unclear"],
          description:
            "Whether provider confirmed they are licensed and insured",
        },
        notes: {
          type: "string",
          description: "Additional relevant information from the call",
        },
        call_outcome: {
          type: "string",
          enum: ["completed", "voicemail", "no_answer", "refused"],
          description: "How the call ended",
        },
      },
      required: ["availability", "licensed_and_insured", "call_outcome"],
    },

    // Success evaluation
    successEvaluationPrompt:
      "Did we successfully gather availability, rate, and licensing information?",
    successEvaluationRubric: "PassFail", // or "NumericScale", "Checklist", etc.
  },
};
```

### Expected Structured Output

With the above configuration, `call.analysis.structuredData` will contain:

```json
{
  "availability": "available",
  "estimated_rate": "$95/hour",
  "licensed_and_insured": "yes",
  "notes": "Mentioned they specialize in commercial plumbing, available tomorrow afternoon",
  "call_outcome": "completed"
}
```

**This is validated against the JSON schema**, ensuring type safety and consistency.

---

## 4. Webhook vs Polling: Production Implementation

### Webhook Architecture (Recommended)

```javascript
// 1. Configure webhook URL in VAPI Dashboard
// Webhook URL: https://your-api.com/webhooks/vapi/end-of-call

// 2. Server endpoint to receive webhook
app.post("/webhooks/vapi/end-of-call", async (req, res) => {
  const event = req.body;

  // VAPI sends call object in webhook payload
  const {
    call,
    type, // 'end-of-call-report'
  } = event;

  if (type === "end-of-call-report") {
    // Extract structured data immediately
    const result = {
      callId: call.id,
      status: call.status,
      transcript: call.artifact?.transcript,
      analysis: call.analysis?.structuredData,
      summary: call.analysis?.summary,
      cost: call.costBreakdown?.total,
      duration: call.durationMinutes,
    };

    // Process result (store in database, trigger next workflow step, etc.)
    await processCallResult(result);

    // Acknowledge webhook
    res.status(200).json({ received: true });
  }
});

// 3. Initiate call (no polling needed)
const call = await vapi.calls.create({
  phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
  customer: { number: PHONE_NUMBER },
  assistant: assistantConfig,
});

// Return call ID immediately, webhook will handle completion
return { callId: call.id, status: "initiated" };
```

### Hybrid Approach for Kestra Script

Since Kestra scripts need synchronous results, use **polling with timeout** but optimize it:

```javascript
async function waitForCallCompletion(callId, maxWaitMinutes = 3) {
  const maxAttempts = (maxWaitMinutes * 60) / 5; // Poll every 5 seconds
  let attempts = 0;

  while (attempts < maxAttempts) {
    const call = await vapi.calls.get(callId);
    const status = call.status;

    console.error(
      `[Poll ${attempts + 1}/${maxAttempts}] Call status: ${status}`,
    );

    if (status === "ended") {
      // Extract all available data
      return {
        success: true,
        callId: call.id,
        endedReason: call.endedReason,
        transcript: call.artifact?.transcript || "",
        summary: call.analysis?.summary || "",
        structuredData: call.analysis?.structuredData || {},
        successEvaluation: call.analysis?.successEvaluation,
        cost: call.costBreakdown?.total || 0,
        duration: call.durationMinutes || 0,
        messages: call.messages || [],
      };
    }

    if (!["queued", "ringing", "in-progress"].includes(status)) {
      // Call failed or in unexpected state
      return {
        success: false,
        callId: call.id,
        status,
        endedReason: call.endedReason,
        error: `Call ended with status: ${status}`,
      };
    }

    await new Promise((r) => setTimeout(r, 5000));
    attempts++;
  }

  // Timeout
  return {
    success: false,
    callId,
    error: "Timeout waiting for call completion",
    timeout: true,
  };
}
```

---

## 5. Critical Questions - Answered

### Q: Can we configure the VAPI assistant to output structured JSON at the end of the call?

**YES** - via the `analysisPlan.structuredDataSchema` configuration. VAPI uses Claude Sonnet (with GPT-4o fallback) to extract data conforming to your JSON schema after the call ends.

### Q: How do we get the AI's "conclusions" (availability, price, licensed status)?

**Two methods**:

1. **Structured Data Extraction** (recommended): Define schema in `analysisPlan.structuredDataSchema`
2. **Transcript Parsing**: Access `call.artifact.transcript` and parse with your own AI/regex

**Structured data is superior** because:

- Schema-validated (type safety)
- Consistent format across all calls
- No parsing errors
- Built-in by VAPI

### Q: Is there a way to have VAPI call a webhook when done instead of polling?

**YES** - VAPI provides `end-of-call-report` webhook. Configure in VAPI Dashboard:

1. Go to Account Settings → Webhooks
2. Add webhook URL: `https://your-domain.com/webhooks/vapi/end-of-call`
3. Select event: `end-of-call-report`
4. VAPI will POST complete call object when call ends

---

## 6. Recommended Code Improvements

### Updated `call-provider.js` with Structured Output

```javascript
const { VapiClient } = require("@vapi-ai/server-sdk");

const PHONE_NUMBER = process.argv[2];
const CUSTOMER_SERVICE_NEEDED = process.argv[3] || "plumbing";
const VAPI_PRIVATE_KEY = process.env.VAPI_API_KEY;

if (!PHONE_NUMBER || !VAPI_PRIVATE_KEY) {
  console.error("Usage: node call-provider.js <phone> <service>");
  console.error("Env vars needed: VAPI_API_KEY");
  process.exit(1);
}

const vapi = new VapiClient({ token: VAPI_PRIVATE_KEY });

async function main() {
  console.error(
    `Initializing call to ${PHONE_NUMBER} for ${CUSTOMER_SERVICE_NEEDED}...`,
  );

  const assistantConfig = {
    name: `Concierge Agent - ${CUSTOMER_SERVICE_NEEDED}`,
    voice: {
      provider: "playht",
      voiceId: "jennifer",
    },
    model: {
      provider: "google",
      model: "gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are an AI Concierge calling a service provider.
Your goal is to find a ${CUSTOMER_SERVICE_NEEDED} for a client in Greenville, SC.

Ask these questions:
1. Are you available within the next 2 days?
2. What is your estimated rate for a standard job?
3. Are you licensed and insured?

Be professional and concise. If they ask, say you are a digital assistant for a local homeowner.
End the call politely once you have answers or if they refuse to engage.`,
        },
      ],
    },
    transcriber: {
      provider: "deepgram",
      language: "en",
    },
    endCallFunctionEnabled: true,

    // CRITICAL: Add analysis plan for structured output
    analysisPlan: {
      summaryPrompt:
        "Summarize the key points of this call with the service provider, including their responses to availability, pricing, and licensing.",

      structuredDataPrompt:
        "Extract the following information from the call: availability (yes/no/unclear), estimated_rate (dollar amount or 'not provided'), licensed_and_insured (yes/no/unclear), and any additional notes.",

      structuredDataSchema: {
        type: "object",
        properties: {
          availability: {
            type: "string",
            enum: ["available", "unavailable", "unclear"],
            description: "Whether provider is available within 2 days",
          },
          estimated_rate: {
            type: "string",
            description:
              "Hourly or project rate mentioned (e.g., '$85/hour', '$200-500', 'not provided')",
          },
          licensed_and_insured: {
            type: "string",
            enum: ["yes", "no", "unclear"],
            description:
              "Whether provider confirmed they are licensed and insured",
          },
          notes: {
            type: "string",
            description: "Additional relevant information from the call",
          },
          call_outcome: {
            type: "string",
            enum: ["completed", "voicemail", "no_answer", "refused", "other"],
            description: "How the call ended",
          },
        },
        required: ["availability", "licensed_and_insured", "call_outcome"],
      },

      successEvaluationPrompt:
        "Did we successfully gather availability, rate, and licensing information? Pass if we got at least 2 out of 3.",
      successEvaluationRubric: "PassFail",
    },
  };

  try {
    // Initiate call
    console.error("Sending call request to VAPI...");
    const call = await vapi.calls.create({
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: {
        number: PHONE_NUMBER,
      },
      assistant: assistantConfig,
    });

    console.error(`Call initiated. ID: ${call.id}`);

    // Poll for completion with better extraction
    let status = call.status;
    let attempts = 0;
    const maxAttempts = 36; // 3 minutes max (36 * 5 seconds)

    while (
      ["queued", "ringing", "in-progress"].includes(status) &&
      attempts < maxAttempts
    ) {
      await new Promise((r) => setTimeout(r, 5000));
      const updatedCall = await vapi.calls.get(call.id);
      status = updatedCall.status;
      console.error(
        `[Poll ${attempts + 1}/${maxAttempts}] Call status: ${status}`,
      );
      attempts++;

      if (status === "ended") {
        // Extract comprehensive result
        const result = {
          success: true,
          callId: updatedCall.id,
          endedReason: updatedCall.endedReason,

          // Transcript
          transcript: updatedCall.artifact?.transcript || "",

          // Analysis (structured data)
          summary: updatedCall.analysis?.summary || "",
          structuredData: updatedCall.analysis?.structuredData || {},
          successEvaluation:
            updatedCall.analysis?.successEvaluation || "unknown",

          // Metadata
          cost: updatedCall.costBreakdown?.total || 0,
          duration: updatedCall.durationMinutes || 0,
        };

        // Output as JSON for Kestra to parse
        console.log(JSON.stringify(result, null, 2));
        return;
      }
    }

    if (status !== "ended") {
      console.log(
        JSON.stringify({
          success: false,
          callId: call.id,
          error: "timeout",
          lastStatus: status,
        }),
      );
    }
  } catch (error) {
    console.error("VAPI Call Error:", error);
    console.log(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
    );
    process.exit(1);
  }
}

main();
```

---

## 7. Implementation Roadmap

### Phase 1: Immediate (Hackathon - Current)

- ✅ Use polling approach (current implementation works)
- ✅ Add `analysisPlan` configuration for structured output
- ✅ Extract `call.analysis.structuredData` instead of parsing transcript manually

### Phase 2: Short-term (Post-Hackathon)

- 🔄 Set up webhook endpoint in Fastify API
- 🔄 Configure VAPI webhooks in dashboard
- 🔄 Migrate to event-driven architecture

### Phase 3: Production

- 📋 Implement webhook signature verification
- 📋 Add retry logic for failed webhooks
- 📋 Store all call results in Supabase
- 📋 Build dashboard to monitor call success rates

---

## 8. Key Takeaways

1. **Structured Output is Available**: Use `analysisPlan.structuredDataSchema` to get validated JSON data
2. **Webhooks > Polling**: For production, webhooks are more efficient and scalable
3. **Rich Call Object**: VAPI provides transcript, analysis, costs, and metadata in one object
4. **Analysis is Post-Call**: VAPI processes analysis after call ends (few seconds delay)
5. **Schema Validation**: Define your data schema, VAPI enforces it using Claude/GPT-4

---

## 9. API Field Reference

### Complete Call Object Fields

| Field                         | Type          | Description                                                      |
| ----------------------------- | ------------- | ---------------------------------------------------------------- |
| `id`                          | string        | Unique call identifier                                           |
| `status`                      | enum          | Call status (ended, in-progress, etc.)                           |
| `endedReason`                 | enum          | Why call ended (customer-ended-call, assistant-ended-call, etc.) |
| `artifact.transcript`         | string        | Full conversation transcript                                     |
| `artifact.video`              | string        | Video recording URL                                              |
| `artifact.stereoRecordings`   | string[]      | Audio recording URLs                                             |
| `artifact.performanceMetrics` | object        | Turn latencies, interruption count                               |
| `analysis.summary`            | string        | 2-3 sentence call summary                                        |
| `analysis.structuredData`     | object        | Extracted data per schema                                        |
| `analysis.successEvaluation`  | string/number | Call quality score                                               |
| `messages`                    | array         | Full message history                                             |
| `costBreakdown.total`         | number        | Total cost in USD                                                |
| `costBreakdown.transport`     | number        | Telephony cost                                                   |
| `costBreakdown.stt`           | number        | Speech-to-text cost                                              |
| `costBreakdown.llm`           | number        | Language model cost                                              |
| `costBreakdown.tts`           | number        | Text-to-speech cost                                              |
| `durationMinutes`             | number        | Call duration                                                    |

---

## References

- VAPI Call Analysis Docs: https://docs.vapi.ai/assistants/call-analysis
- VAPI Structured Outputs Blog: https://vapi.ai/blog/structured-outputs
- VAPI API Reference: https://docs.vapi.ai/api-reference/calls/get
- VAPI Server SDK: https://github.com/VapiAI/server-sdk-typescript

---

**Document Version**: 1.0
**Last Updated**: 2025-12-08
**Author**: AI Concierge Development Team
