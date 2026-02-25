# Direct Twilio + OpenAI Realtime Integration (Bypass VAPI)

**Date**: 2024-12-21
**Author**: Claude AI
**Status**: Complete
**Type**: Research & Architecture Plan

## Table of Contents
- [Executive Summary](#executive-summary)
- [Architecture Overview](#architecture-overview)
- [Why Bypass VAPI](#why-bypass-vapi)
- [Technical Implementation](#technical-implementation)
- [Audio Format Handling](#audio-format-handling)
- [Function Calling](#function-calling)
- [Voice Activity Detection](#voice-activity-detection)
- [Production Code Example](#production-code-example)
- [Latency Optimization](#latency-optimization)
- [Error Handling](#error-handling)
- [Production Deployment](#production-deployment)
- [Cost Analysis](#cost-analysis)
- [Implementation Timeline](#implementation-timeline)

---

## Executive Summary

This document outlines a direct integration between Twilio Media Streams and OpenAI's Realtime API, completely bypassing VAPI. This approach provides:

- **Full control** over conversation flow and audio processing
- **No third-party dependency** on VAPI infrastructure
- **Lower per-minute costs** (~$0.30-0.35/min vs VAPI's fees)
- **Native speech-to-speech** processing with emotional intelligence
- **~300-500ms latency** for natural conversations

**Key Discovery**: OpenAI Realtime natively supports `g711_ulaw` format - the same codec Twilio uses - eliminating audio conversion overhead.

**Implementation Effort**: 3-4 weeks for production-ready deployment.

---

## Architecture Overview

### System Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DIRECT TWILIO + OPENAI REALTIME                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────┐    ┌─────────────────┐    ┌──────────────────────┐          │
│   │  PSTN    │───►│  Twilio Voice   │───►│  Twilio Media Streams│          │
│   │ Caller   │◄───│  (Your Number)  │◄───│  (WebSocket Bridge)  │          │
│   └──────────┘    └─────────────────┘    └──────────┬───────────┘          │
│                                                     │                       │
│                                          ┌──────────▼───────────┐          │
│                                          │  Your Backend Server │          │
│                                          │  (Fastify + WS)      │          │
│                                          │  - Audio relay       │          │
│                                          │  - Session mgmt      │          │
│                                          │  - Function handling │          │
│                                          └──────────┬───────────┘          │
│                                                     │                       │
│                                          ┌──────────▼───────────┐          │
│                                          │  OpenAI Realtime API │          │
│                                          │  - Native audio I/O  │          │
│                                          │  - G.711 ulaw support│          │
│                                          │  - Server-side VAD   │          │
│                                          │  - Function calling  │          │
│                                          └──────────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Inbound Call**: PSTN → Twilio → WebSocket → Your Server → OpenAI Realtime
2. **AI Response**: OpenAI Realtime → Your Server → WebSocket → Twilio → PSTN
3. **Function Calls**: OpenAI → Your Server (handle) → OpenAI (result)

---

## Why Bypass VAPI

### Advantages

| Factor | VAPI | Direct Integration |
|--------|------|-------------------|
| **Control** | Limited to VAPI features | Full control |
| **Dependency** | VAPI service availability | Self-managed |
| **Cost** | VAPI fee + provider fees | Only provider fees |
| **Customization** | Config-based | Code-based |
| **Debugging** | Limited visibility | Full observability |
| **Scaling** | VAPI limits | Your infrastructure |

### When to Choose Direct Integration

- You need full control over conversation logic
- You want to eliminate third-party dependencies
- You're building a core product feature (not MVP)
- You need custom analytics/logging
- Cost optimization is important at scale

### When to Stick with VAPI

- Rapid prototyping needed
- Limited engineering resources
- Standard use cases
- Don't want to manage telephony infrastructure

---

## Technical Implementation

### Prerequisites

```bash
# Required packages
npm install fastify @fastify/websocket ws twilio

# Environment variables
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Twilio Configuration

#### TwiML for Media Streams

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://your-domain.com/media-stream" />
  </Connect>
</Response>
```

#### Twilio WebSocket Events

| Event | Description | Payload |
|-------|-------------|---------|
| `connected` | WebSocket established | `{}` |
| `start` | Stream started | `{ streamSid, callSid }` |
| `media` | Audio chunk | `{ payload: base64_audio }` |
| `stop` | Stream ended | `{}` |

### OpenAI Realtime Configuration

#### Connection

```typescript
const openaiWs = new WebSocket(
  'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
  {
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1"
    }
  }
);
```

#### Session Configuration

```typescript
const sessionConfig = {
  type: "session.update",
  session: {
    turn_detection: {
      type: "server_vad",
      threshold: 0.5,
      silence_duration_ms: 500
    },
    input_audio_format: "g711_ulaw",  // Matches Twilio
    output_audio_format: "g711_ulaw", // Matches Twilio
    voice: "alloy",  // Options: alloy, echo, shimmer, fable, onyx, nova
    instructions: SYSTEM_PROMPT,
    modalities: ["text", "audio"],
    temperature: 0.8,
    tools: [...],  // Function definitions
    tool_choice: "auto"
  }
};
```

---

## Audio Format Handling

### Key Insight: No Conversion Needed

OpenAI Realtime supports `g711_ulaw` natively - the same format Twilio uses:

| Property | Twilio | OpenAI Realtime |
|----------|--------|-----------------|
| Codec | G.711 u-law | G.711 u-law (supported) |
| Sample Rate | 8kHz | 8kHz (when using g711) |
| Encoding | Base64 | Base64 |

### Direct Passthrough

```typescript
// Twilio → OpenAI (no conversion)
twilioWs.on('message', (msg) => {
  const data = JSON.parse(msg);
  if (data.event === 'media') {
    openaiWs.send(JSON.stringify({
      type: "input_audio_buffer.append",
      audio: data.media.payload  // Direct passthrough
    }));
  }
});

// OpenAI → Twilio (no conversion)
openaiWs.on('message', (msg) => {
  const data = JSON.parse(msg);
  if (data.type === 'response.audio.delta') {
    twilioWs.send(JSON.stringify({
      event: "media",
      streamSid: streamSid,
      media: { payload: data.delta }  // Direct passthrough
    }));
  }
});
```

---

## Function Calling

### Defining Tools

```typescript
const tools = [
  {
    type: "function",
    name: "end_call",
    description: "End the phone call when conversation is complete",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Reason for ending the call"
        },
        outcome: {
          type: "string",
          enum: ["success", "failed", "voicemail", "no_answer"]
        }
      },
      required: ["reason", "outcome"]
    }
  },
  {
    type: "function",
    name: "record_provider_info",
    description: "Record information gathered from the provider",
    parameters: {
      type: "object",
      properties: {
        available: { type: "boolean" },
        earliest_availability: { type: "string" },
        hourly_rate: { type: "number" },
        meets_criteria: { type: "boolean" },
        notes: { type: "string" }
      },
      required: ["available"]
    }
  }
];
```

### Handling Function Calls

```typescript
openaiWs.on('message', async (data) => {
  const response = JSON.parse(data.toString());

  if (response.type === 'response.function_call_arguments.done') {
    const { name, arguments: args, call_id } = response;
    const parsedArgs = JSON.parse(args);

    let result;

    switch (name) {
      case 'end_call':
        await twilioClient.calls(callSid).update({ status: 'completed' });
        result = { success: true };
        break;

      case 'record_provider_info':
        await saveProviderInfo(providerId, parsedArgs);
        result = { success: true, saved: true };
        break;
    }

    // Send result back to OpenAI
    openaiWs.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: call_id,
        output: JSON.stringify(result)
      }
    }));

    // Trigger next response
    openaiWs.send(JSON.stringify({ type: "response.create" }));
  }
});
```

---

## Voice Activity Detection

### Server-Side VAD (Recommended)

```typescript
turn_detection: {
  type: "server_vad",
  threshold: 0.5,           // Speech detection sensitivity (0-1)
  prefix_padding_ms: 300,   // Audio to keep before speech detected
  silence_duration_ms: 500  // Silence duration to end turn
}
```

### How It Works

1. OpenAI continuously analyzes incoming audio
2. Detects speech start/end automatically
3. Triggers AI response when user stops speaking
4. Handles interruptions (user can interrupt AI mid-response)

### Manual Mode (Alternative)

```typescript
// Disable automatic VAD
turn_detection: null

// Manually control turns
openaiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
openaiWs.send(JSON.stringify({ type: "response.create" }));
```

---

## Production Code Example

### Complete Implementation

```typescript
// apps/api/src/services/twilio-realtime/bridge.ts

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import WebSocket from 'ws';
import Twilio from 'twilio';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const twilioClient = Twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

const SYSTEM_PROMPT = `You are a friendly AI assistant calling on behalf of a customer.
Your goal is to gather information about service availability and pricing.

CONVERSATION FLOW:
1. Confirm you've reached the right business
2. Introduce yourself: "I'm calling on behalf of my client who needs [service]"
3. Ask about availability
4. Ask about rates
5. Thank them and end the call

RULES:
- Keep responses to 2-3 sentences
- Be professional and warm
- Use the end_call function when done
- Use record_provider_info to save gathered data`;

const fastify = Fastify({ logger: true });
await fastify.register(websocket);

interface CallContext {
  streamSid: string;
  callSid: string;
  providerName: string;
  serviceType: string;
}

fastify.get('/media-stream', { websocket: true }, (twilioWs, req) => {
  let context: CallContext | null = null;
  let openaiWs: WebSocket | null = null;

  // Connect to OpenAI
  openaiWs = new WebSocket(
    'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
    {
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1"
      }
    }
  );

  openaiWs.on('open', () => {
    console.log('[OpenAI] Connected');

    openaiWs!.send(JSON.stringify({
      type: "session.update",
      session: {
        turn_detection: { type: "server_vad", silence_duration_ms: 500 },
        input_audio_format: "g711_ulaw",
        output_audio_format: "g711_ulaw",
        voice: "alloy",
        instructions: SYSTEM_PROMPT,
        modalities: ["text", "audio"],
        temperature: 0.8,
        tools: [
          {
            type: "function",
            name: "end_call",
            description: "End the call",
            parameters: { type: "object", properties: {} }
          },
          {
            type: "function",
            name: "record_provider_info",
            description: "Record provider information",
            parameters: {
              type: "object",
              properties: {
                available: { type: "boolean" },
                rate: { type: "string" },
                earliest_date: { type: "string" }
              }
            }
          }
        ],
        tool_choice: "auto"
      }
    }));
  });

  // OpenAI → Twilio
  openaiWs.on('message', async (data) => {
    const response = JSON.parse(data.toString());

    switch (response.type) {
      case 'response.audio.delta':
        if (response.delta && context?.streamSid) {
          twilioWs.send(JSON.stringify({
            event: "media",
            streamSid: context.streamSid,
            media: { payload: response.delta }
          }));
        }
        break;

      case 'response.function_call_arguments.done':
        if (response.name === 'end_call' && context?.callSid) {
          await twilioClient.calls(context.callSid).update({ status: 'completed' });
        }
        break;

      case 'error':
        console.error('[OpenAI] Error:', response.error);
        break;
    }
  });

  // Twilio → OpenAI
  twilioWs.on('message', (message) => {
    const data = JSON.parse(message.toString());

    switch (data.event) {
      case 'start':
        context = {
          streamSid: data.start.streamSid,
          callSid: data.start.callSid,
          providerName: data.start.customParameters?.providerName || 'Unknown',
          serviceType: data.start.customParameters?.serviceType || 'service'
        };
        console.log(`[Twilio] Call started: ${context.callSid}`);
        break;

      case 'media':
        if (openaiWs?.readyState === WebSocket.OPEN) {
          openaiWs.send(JSON.stringify({
            type: "input_audio_buffer.append",
            audio: data.media.payload
          }));
        }
        break;

      case 'stop':
        console.log('[Twilio] Call ended');
        openaiWs?.close();
        break;
    }
  });

  twilioWs.on('close', () => openaiWs?.close());
  openaiWs.on('close', () => console.log('[OpenAI] Disconnected'));
});

// Outbound call endpoint
fastify.post('/call', async (request, reply) => {
  const { to, providerName, serviceType } = request.body as any;
  const host = request.headers.host;

  const call = await twilioClient.calls.create({
    to,
    from: process.env.TWILIO_PHONE_NUMBER!,
    twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${host}/media-stream">
      <Parameter name="providerName" value="${providerName}" />
      <Parameter name="serviceType" value="${serviceType}" />
    </Stream>
  </Connect>
</Response>`
  });

  reply.send({ callSid: call.sid });
});

await fastify.listen({ port: 8000 });
```

---

## Latency Optimization

### Optimization Techniques

| Technique | Impact | Implementation |
|-----------|--------|----------------|
| G.711 ulaw | -50ms | Native format, no conversion |
| Server VAD | -100ms | Automatic turn detection |
| Regional deploy | -50ms | Deploy close to users |
| Connection reuse | -200ms | Pool OpenAI connections |
| Streaming audio | Perceived -300ms | Send audio chunks immediately |

### Target Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to First Audio | <500ms | From end of user speech |
| End-to-end latency | <1000ms | Full round trip |
| Interruption response | <200ms | User barge-in |

---

## Error Handling

### Reconnection Strategy

```typescript
class ResilientConnection {
  private reconnectAttempts = 0;
  private maxAttempts = 5;

  async handleDisconnect() {
    if (this.reconnectAttempts >= this.maxAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);

    await new Promise(r => setTimeout(r, delay));
    await this.connect();
  }
}
```

### Error Types

| Code | Meaning | Action |
|------|---------|--------|
| 1006 | Abnormal closure | Reconnect with backoff |
| 1001 | Going away | Reconnect immediately |
| 4001 | Auth error | Check API key, don't retry |
| 4003 | Rate limited | Back off, retry later |

---

## Production Deployment

### Checklist

- [ ] SSL certificate configured
- [ ] Environment variables secured
- [ ] Health check endpoints
- [ ] Structured logging
- [ ] Metrics/monitoring
- [ ] Rate limiting
- [ ] Graceful shutdown
- [ ] Load balancer with sticky sessions

### Infrastructure

```
         Load Balancer (sticky sessions required)
                    |
     +--------------+--------------+
     |              |              |
  Server 1      Server 2      Server 3
     |              |              |
  [Active WebSocket connections]
```

---

## Cost Analysis

| Component | Cost |
|-----------|------|
| Twilio Voice (outbound) | ~$0.014/min |
| Twilio Media Streams | Included |
| OpenAI Realtime (audio) | ~$0.06/min input, ~$0.24/min output |
| **Total** | **~$0.30-0.35/min** |

### Comparison to VAPI

| Setup | Cost/min |
|-------|----------|
| VAPI + OpenAI Realtime | ~$0.15-0.25 + $0.05 VAPI = ~$0.20-0.30 |
| Direct Twilio + OpenAI | ~$0.30-0.35 |

Note: Direct integration costs slightly more per minute but eliminates VAPI dependency and provides full control.

---

## Implementation Timeline

| Phase | Duration | Activities |
|-------|----------|------------|
| **Week 1** | Setup | Twilio account, phone number, ngrok tunnel |
| **Week 2** | Core | WebSocket bridge, audio streaming, basic prompts |
| **Week 3** | Features | Function calling, error handling, reconnection |
| **Week 4** | Production | Testing, deployment, monitoring |

**Total: 3-4 weeks** for production-ready deployment.

---

## Document Metadata

**Last Updated**: 2024-12-21
**Implementation Status**: Not Started
**Related Documents**:
- [RESEARCH_VAPI_OPENAI_REALTIME.md](./RESEARCH_VAPI_OPENAI_REALTIME.md)

**Change Log**:
- 2024-12-21 - Initial creation based on multi-agent research
