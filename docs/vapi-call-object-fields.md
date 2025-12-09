# VAPI Call Object - Complete Field Reference

Quick reference guide for all fields available in the VAPI Call object after call completion.

---

## Access Methods

1. **Polling**: `const call = await vapi.calls.get(callId);`
2. **Webhook**: Received in `POST /webhooks/vapi` payload as `req.body.call`

---

## Complete Call Object Structure

```typescript
interface Call {
  //
  // CORE IDENTIFIERS
  //
  id: string; // Unique call ID
  type: CallType; // 'inboundPhoneCall' | 'outboundPhoneCall' | 'webCall'

  //
  // STATUS & OUTCOME
  //
  status: CallStatus; // 'queued' | 'ringing' | 'in-progress' | 'ended'
  endedReason?: string; // Why call ended (see enum below)

  //
  // ARTIFACT (Recordings & Transcripts)
  //
  artifact?: {
    transcript?: string; // Full conversation text ⭐ KEY FIELD
    video?: string; // Video recording URL (if enabled)
    stereoRecordings?: string[]; // Audio recording URLs (separate channels)
    performanceMetrics?: {
      turnLatencies: number[]; // Latency per conversational turn
      interruptionCount: number; // How many times user interrupted
      averageLatency: number; // Mean response latency
    };
  };

  //
  // ANALYSIS (Structured Output) ⭐ MOST IMPORTANT
  //
  analysis?: {
    summary: string; // 2-3 sentence call summary
    structuredData: any; // Your custom extracted data (schema-validated)
    successEvaluation: string | number; // Call quality score
  };

  //
  // MESSAGES (Full conversation history)
  //
  messages?: Array<
    | UserMessage // User said something
    | SystemMessage // System event
    | BotMessage // AI assistant response
    | ToolCallMessage // Function call initiated
    | ToolCallResultMessage // Function call result
  >;

  //
  // COSTS (Detailed breakdown)
  //
  costs?: Array<
    | TransportCost // Telephony provider (Twilio, etc.)
    | TranscriberCost // Speech-to-text (Deepgram, etc.)
    | ModelCost // LLM tokens (Gemini, etc.)
    | VoiceCost // Text-to-speech (PlayHT, etc.)
    | VapiCost // VAPI platform fee
    | VoicemailDetectionCost
    | AnalysisCost
    | KnowledgeBaseCost
  >;

  costBreakdown?: {
    transport: number; // Telephony cost
    stt: number; // Speech-to-text cost
    llm: number; // Language model cost
    tts: number; // Text-to-speech cost
    vapi: number; // VAPI platform cost
    chat: number; // Chat/messaging cost
    total: number; // Total cost in USD ⭐ KEY FIELD
  };

  //
  // DURATION
  //
  durationMinutes?: number; // Call length in minutes ⭐ KEY FIELD

  //
  // CONFIGURATION (What was used for this call)
  //
  destination?: {
    type: "number" | "sip";
    number?: string;
    sipUri?: string;
  };

  compliance?: {
    recordingConsent?: boolean;
  };

  artifactPlan?: {
    recordingEnabled: boolean;
    videoRecordingEnabled: boolean;
    transcriptPlan: {
      enabled: boolean;
      provider: string;
    };
  };

  //
  // MONITORING
  //
  monitor?: {
    listenUrl?: string; // URL to listen to call in real-time
    controlUrl?: string; // URL to control call
  };

  //
  // TIMESTAMPS
  //
  createdAt?: string; // ISO 8601 timestamp
  updatedAt?: string; // ISO 8601 timestamp
}
```

---

## Key Fields for AI Concierge

### For Provider Verification

```javascript
const call = await vapi.calls.get(callId);

// Most important fields:
const result = {
  // Did we get what we need?
  structuredData: call.analysis?.structuredData, // ⭐⭐⭐ MOST IMPORTANT
  // Example: { availability: 'available', estimated_rate: '$95/hour', ... }

  // What happened?
  summary: call.analysis?.summary,
  // Example: "Provider confirmed availability within 2 days at $95/hour, licensed and insured"

  // Full conversation
  transcript: call.artifact?.transcript,

  // Did it go well?
  successEvaluation: call.analysis?.successEvaluation, // 'Pass' or 'Fail'

  // Why did call end?
  endedReason: call.endedReason,
  // Examples: 'assistant-ended-call', 'customer-ended-call', 'voicemail'

  // How long / how much?
  duration: call.durationMinutes, // e.g., 2.5
  cost: call.costBreakdown?.total, // e.g., 0.15 (USD)
};
```

---

## EndedReason Enum (Important Values)

```typescript
type CallEndedReason =
  // Success scenarios
  | "assistant-ended-call" // ✅ AI decided conversation was complete
  | "customer-ended-call" // ✅ Human hung up

  // Voicemail scenarios
  | "voicemail" // 📞 Went to voicemail
  | "voicemail-reached" // 📞 Voicemail detected

  // Failure scenarios
  | "assistant-error" // ❌ AI error
  | "customer-did-not-answer" // ❌ No answer
  | "customer-did-not-give-microphone-permission" // ❌ Web call issue
  | "exceeded-max-duration" // ❌ Hit time limit
  | "phone-call-provider-error" // ❌ Telephony provider issue
  | "unknown-error" // ❌ Unknown issue

  // Other
  | "assistant-forwarded-call" // Call transferred
  | "inactivity" // No one spoke
  | "pipeline-error-assistant-not-found"
  | "silence-timed-out";
// ... and many more (50+ possible values)
```

---

## Structured Data Example

When you configure `analysisPlan.structuredDataSchema`:

```javascript
// Configuration
analysisPlan: {
    structuredDataSchema: {
        type: "object",
        properties: {
            availability: { type: "string", enum: ["available", "unavailable", "unclear"] },
            estimated_rate: { type: "string" },
            licensed_and_insured: { type: "string", enum: ["yes", "no", "unclear"] },
            notes: { type: "string" },
            call_outcome: { type: "string", enum: ["completed", "voicemail", "no_answer", "refused"] }
        }
    }
}

// Result in call.analysis.structuredData
{
    "availability": "available",
    "estimated_rate": "$95/hour",
    "licensed_and_insured": "yes",
    "notes": "Specializes in commercial plumbing, available tomorrow 2pm",
    "call_outcome": "completed"
}
```

This is **validated** by VAPI - it will always match your schema!

---

## Messages Array Example

```javascript
call.messages = [
  {
    role: "system",
    message: "Call started",
  },
  {
    role: "bot",
    message:
      "Hello, this is an AI assistant calling on behalf of a homeowner...",
    duration: 5.2,
  },
  {
    role: "user",
    message: "Yes, hello?",
    duration: 1.8,
    endedReason: "user-finished-speaking",
  },
  {
    role: "bot",
    message: "Are you available within the next 2 days for a plumbing job?",
    duration: 3.1,
  },
  {
    role: "user",
    message: "Yes, I can do tomorrow afternoon.",
    duration: 2.5,
  },
  // ... more messages
];
```

---

## Cost Breakdown Example

```javascript
call.costBreakdown = {
  transport: 0.05, // Twilio/telephony
  stt: 0.02, // Deepgram transcription
  llm: 0.04, // Gemini tokens
  tts: 0.03, // PlayHT voice synthesis
  vapi: 0.01, // VAPI platform fee
  chat: 0.0,
  total: 0.15, // Total: $0.15 USD
};

call.durationMinutes = 2.5; // 2.5 minutes
// Cost per minute: $0.15 / 2.5 = $0.06/min
```

---

## Performance Metrics Example

```javascript
call.artifact.performanceMetrics = {
  turnLatencies: [0.8, 1.2, 0.9, 1.5, 1.1], // Seconds per response
  interruptionCount: 2, // User interrupted AI twice
  averageLatency: 1.1, // Mean: 1.1 seconds
};
```

---

## Field Availability Timeline

| Field                     | Available When       | Notes                                          |
| ------------------------- | -------------------- | ---------------------------------------------- |
| `id`, `status`, `type`    | Immediately          | Available as soon as call created              |
| `durationMinutes`         | Call ends            | Only after call completes                      |
| `artifact.transcript`     | Call ends            | Full transcript available ~5 seconds after end |
| `analysis.summary`        | Call ends + analysis | Usually ~10-30 seconds after call ends         |
| `analysis.structuredData` | Call ends + analysis | Same as summary (~10-30 seconds)               |
| `costBreakdown`           | Call ends            | Available immediately after call ends          |
| `messages`                | During call          | Updated in real-time (if polling)              |

**Important**: Analysis (summary, structuredData) is **post-processed** by VAPI using Claude/GPT-4, so there's a delay of 10-30 seconds after the call ends before it's available.

---

## Checking for Field Availability

```javascript
const call = await vapi.calls.get(callId);

// Safe field access
const transcript = call.artifact?.transcript || "Not yet available";
const structuredData = call.analysis?.structuredData || {};
const summary = call.analysis?.summary || "Analysis pending";

// Check if analysis is complete
const isAnalysisComplete = call.analysis && call.analysis.structuredData;

if (!isAnalysisComplete && call.status === "ended") {
  console.log("Call ended, waiting for analysis to complete...");
  // Wait a bit and poll again
}
```

---

## Webhook Payload Structure

When VAPI sends webhook, the payload looks like:

```json
{
  "type": "end-of-call-report",
  "call": {
    // Full Call object (all fields above)
  },
  "timestamp": "2025-12-08T12:34:56Z"
}
```

Access in webhook handler:

```javascript
app.post("/webhooks/vapi", (req, res) => {
  const { type, call, timestamp } = req.body;

  if (type === "end-of-call-report") {
    const result = {
      callId: call.id,
      structuredData: call.analysis?.structuredData,
      transcript: call.artifact?.transcript,
      // ... etc
    };

    processCallResult(result);
  }
});
```

---

## Quick Reference: Top 10 Most Useful Fields

1. **`call.analysis.structuredData`** - Your extracted data (availability, rate, etc.)
2. **`call.analysis.summary`** - 2-3 sentence overview
3. **`call.artifact.transcript`** - Full conversation text
4. **`call.endedReason`** - Why call ended (voicemail, completed, etc.)
5. **`call.analysis.successEvaluation`** - Did we get what we needed? (Pass/Fail)
6. **`call.costBreakdown.total`** - Total cost in USD
7. **`call.durationMinutes`** - Call length
8. **`call.status`** - Current status (ended, in-progress, etc.)
9. **`call.id`** - Unique identifier
10. **`call.messages`** - Full conversation history (detailed)

---

## Example: Complete Extraction

```javascript
async function extractCallResults(callId) {
  const call = await vapi.calls.get(callId);

  return {
    // Identity
    callId: call.id,
    status: call.status,

    // Outcome
    endedReason: call.endedReason,
    success: call.analysis?.successEvaluation === "Pass",

    // Content
    transcript: call.artifact?.transcript || "",
    summary: call.analysis?.summary || "",

    // Structured extraction (THE GOLD)
    availability: call.analysis?.structuredData?.availability,
    estimatedRate: call.analysis?.structuredData?.estimated_rate,
    licensed: call.analysis?.structuredData?.licensed_and_insured === "yes",
    notes: call.analysis?.structuredData?.notes || "",
    callOutcome: call.analysis?.structuredData?.call_outcome,

    // Metadata
    duration: call.durationMinutes || 0,
    cost: call.costBreakdown?.total || 0,

    // Quality
    averageLatency: call.artifact?.performanceMetrics?.averageLatency,
    interruptionCount: call.artifact?.performanceMetrics?.interruptionCount,

    // Raw data (for debugging)
    rawMessages: call.messages,
    rawStructuredData: call.analysis?.structuredData,
  };
}
```

---

## Summary

**Best Practice:**

1. Configure `analysisPlan.structuredDataSchema` in assistant config
2. Access `call.analysis.structuredData` after call ends
3. Use webhook for production (instant notification)
4. Use polling for scripts/testing (with 10-30 second wait for analysis)

**The Magic Triangle:**

- `call.artifact.transcript` → Raw conversation
- `call.analysis.summary` → Human-readable overview
- `call.analysis.structuredData` → Machine-readable extraction ⭐

All three together give you complete call intelligence!
