# VAPI Fallback System Implementation Plan

**Date**: 2025-12-08
**Author**: AI Agent (Claude Opus 4.5)
**Status**: Approved
**Version**: 1.0
**Confidence Level**: 90%

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [File Structure](#file-structure)
4. [Implementation Details](#implementation-details)
5. [API Routes](#api-routes)
6. [Database Migration](#database-migration)
7. [Implementation Steps](#implementation-steps)
8. [Testing Strategy](#testing-strategy)
9. [Production Deployment](#production-deployment)
10. [Key Decisions](#key-decisions)

---

## Executive Summary

**Goal**: When Kestra is unavailable in production, automatically fall back to direct VAPI.ai API calls from the Fastify backend, maintaining identical functionality and user experience.

**Problem**: Kestra orchestration is not available in Railway production environment. The current `contact_agent.yaml` flow works locally but needs an alternative path for production.

**Solution**: Create a service layer abstraction that:

1. Detects Kestra availability via environment variable + health check
2. Routes to Kestra when available
3. Falls back to direct VAPI SDK calls when Kestra is unavailable
4. Produces identical outputs regardless of method used

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Request                          │
│                    POST /api/v1/providers/call                   │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                   ProviderCallingService                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  1. Check KESTRA_ENABLED env var                         │   │
│  │  2. If enabled → Health check Kestra                     │   │
│  │  3. Route to appropriate client                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└──────────────┬────────────────────────────────┬─────────────────┘
               │                                │
     ┌─────────▼─────────┐            ┌─────────▼─────────┐
     │   KestraClient    │            │  DirectVapiClient │
     │   (if available)  │            │    (fallback)     │
     └─────────┬─────────┘            └─────────┬─────────┘
               │                                │
               │ POST to Kestra API             │ vapi.calls.create()
               │ Poll execution status          │ Poll call status
               │                                │
               ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Unified CallResult                            │
│  { callId, status, transcript, analysis, structuredData, ... }  │
└─────────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                   CallResultService                              │
│  - Update providers table                                        │
│  - Create interaction_logs                                       │
│  - Update service_request status                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
apps/api/src/
├── services/
│   ├── gemini.ts                    # Existing
│   ├── vapi/
│   │   ├── index.ts                 # Main service exports
│   │   ├── provider-calling.service.ts   # Orchestrator
│   │   ├── kestra.client.ts         # Kestra integration
│   │   ├── direct-vapi.client.ts    # Direct VAPI SDK
│   │   ├── call-result.service.ts   # DB updates
│   │   ├── assistant-config.ts      # VAPI assistant configuration
│   │   └── types.ts                 # Shared types
│   └── index.ts                     # Re-exports
├── routes/
│   ├── workflows.ts                 # Existing (keep for backward compat)
│   ├── providers.ts                 # NEW: Provider calling routes
│   └── webhooks.ts                  # NEW: VAPI webhook handler (optional)
└── index.ts                         # Register new routes
```

---

## Implementation Details

### Environment Variables

Add to `apps/api/.env` and `apps/api/.env.example`:

```bash
# Kestra Configuration
KESTRA_ENABLED=false                 # Set to true when Kestra is available
KESTRA_URL=http://localhost:8082     # Kestra API URL
KESTRA_NAMESPACE=ai_concierge        # Kestra namespace
KESTRA_HEALTH_CHECK_TIMEOUT=3000     # Health check timeout in ms

# VAPI Configuration (already exist)
VAPI_API_KEY=your-vapi-api-key
VAPI_PHONE_NUMBER_ID=your-phone-number-id

# Optional: Webhook URL for async callback (production)
VAPI_WEBHOOK_URL=https://your-api.com/api/v1/webhooks/vapi
```

### Type Definitions (types.ts)

```typescript
// Shared types for both Kestra and Direct VAPI paths

export interface CallRequest {
  providerName: string;
  providerPhone: string; // E.164 format: +1XXXXXXXXXX
  serviceNeeded: string;
  userCriteria: string;
  location: string;
  urgency: "immediate" | "within_24_hours" | "within_2_days" | "flexible";
  serviceRequestId?: string; // For DB linking
  providerId?: string; // For DB linking
}

export interface CallResult {
  status: "completed" | "timeout" | "error" | "no_answer" | "voicemail";
  callId: string;
  callMethod: "kestra" | "direct_vapi";
  duration: number; // minutes
  endedReason: string;
  transcript: string;
  analysis: {
    summary: string;
    structuredData: StructuredCallData;
    successEvaluation: string;
  };
  provider: {
    name: string;
    phone: string;
    service: string;
    location: string;
  };
  request: {
    criteria: string;
    urgency: string;
  };
  cost?: number;
  error?: string;
}

export interface StructuredCallData {
  availability: "available" | "unavailable" | "callback_requested" | "unclear";
  estimated_rate: string;
  single_person_found: boolean;
  technician_name?: string;
  all_criteria_met: boolean;
  criteria_details?: Record<string, boolean>;
  call_outcome: "positive" | "negative" | "neutral" | "no_answer" | "voicemail";
  recommended: boolean;
  notes?: string;
}

export interface KestraExecutionStatus {
  id: string;
  state: "CREATED" | "RUNNING" | "SUCCESS" | "FAILED" | "KILLED";
  outputs?: Record<string, any>;
}
```

### Provider Calling Service (provider-calling.service.ts)

```typescript
import { KestraClient } from "./kestra.client";
import { DirectVapiClient } from "./direct-vapi.client";
import { CallResultService } from "./call-result.service";
import { CallRequest, CallResult } from "./types";

export class ProviderCallingService {
  private kestraClient: KestraClient;
  private directVapiClient: DirectVapiClient;
  private callResultService: CallResultService;

  constructor(private logger: any) {
    this.kestraClient = new KestraClient(logger);
    this.directVapiClient = new DirectVapiClient(logger);
    this.callResultService = new CallResultService(logger);
  }

  async callProvider(request: CallRequest): Promise<CallResult> {
    const useKestra = await this.shouldUseKestra();

    this.logger.info(
      {
        method: useKestra ? "kestra" : "direct_vapi",
        provider: request.providerName,
        phone: request.providerPhone,
      },
      "Initiating provider call",
    );

    let result: CallResult;

    if (useKestra) {
      result = await this.kestraClient.triggerContactFlow(request);
    } else {
      result = await this.directVapiClient.initiateCall(request);
    }

    // Save results to database
    await this.callResultService.saveCallResult(result, request);

    return result;
  }

  private async shouldUseKestra(): Promise<boolean> {
    const kestraEnabled = process.env.KESTRA_ENABLED === "true";

    if (!kestraEnabled) {
      this.logger.info("Kestra disabled via env var, using direct VAPI");
      return false;
    }

    // Health check
    const isHealthy = await this.kestraClient.healthCheck();

    if (!isHealthy) {
      this.logger.warn(
        "Kestra health check failed, falling back to direct VAPI",
      );
      return false;
    }

    return true;
  }
}
```

### Kestra Client (kestra.client.ts)

```typescript
import axios from "axios";
import { CallRequest, CallResult, KestraExecutionStatus } from "./types";

export class KestraClient {
  private baseUrl: string;
  private namespace: string;
  private flowId = "contact_providers";

  constructor(private logger: any) {
    this.baseUrl = process.env.KESTRA_URL || "http://localhost:8082";
    this.namespace = process.env.KESTRA_NAMESPACE || "ai_concierge";
  }

  async healthCheck(): Promise<boolean> {
    try {
      const timeout = parseInt(
        process.env.KESTRA_HEALTH_CHECK_TIMEOUT || "3000",
      );
      const response = await axios.get(`${this.baseUrl}/api/v1/health`, {
        timeout,
      });
      return response.status === 200;
    } catch (error) {
      this.logger.error({ error }, "Kestra health check failed");
      return false;
    }
  }

  async triggerContactFlow(request: CallRequest): Promise<CallResult> {
    // Trigger execution
    const execution = await this.triggerExecution(request);

    // Poll for completion
    const finalState = await this.pollExecution(execution.id);

    // Parse results
    return this.parseExecutionResult(finalState, request);
  }

  private async triggerExecution(
    request: CallRequest,
  ): Promise<{ id: string }> {
    const inputs = {
      provider_name: request.providerName,
      provider_phone: request.providerPhone,
      service_needed: request.serviceNeeded,
      user_criteria: request.userCriteria,
      location: request.location,
      urgency: request.urgency,
    };

    const response = await axios.post(
      `${this.baseUrl}/api/v1/executions/${this.namespace}/${this.flowId}`,
      inputs,
      { headers: { "Content-Type": "application/json" } },
    );

    this.logger.info(
      { executionId: response.data.id },
      "Kestra execution triggered",
    );
    return { id: response.data.id };
  }

  private async pollExecution(
    executionId: string,
  ): Promise<KestraExecutionStatus> {
    const maxAttempts = 72; // 6 minutes (72 * 5 seconds)
    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await this.getExecutionStatus(executionId);

      if (["SUCCESS", "FAILED", "KILLED"].includes(status.state)) {
        return status;
      }

      await new Promise((r) => setTimeout(r, 5000));
      attempts++;
    }

    throw new Error(`Kestra execution ${executionId} timed out`);
  }

  private async getExecutionStatus(
    executionId: string,
  ): Promise<KestraExecutionStatus> {
    const response = await axios.get(
      `${this.baseUrl}/api/v1/executions/${executionId}`,
    );
    return response.data;
  }

  private parseExecutionResult(
    state: KestraExecutionStatus,
    request: CallRequest,
  ): CallResult {
    const rawOutput = state.outputs?.call_result;

    if (!rawOutput) {
      return {
        status: "error",
        callId: state.id,
        callMethod: "kestra",
        duration: 0,
        endedReason: "no_output",
        transcript: "",
        analysis: {
          summary: "",
          structuredData: {} as any,
          successEvaluation: "",
        },
        provider: {
          name: request.providerName,
          phone: request.providerPhone,
          service: request.serviceNeeded,
          location: request.location,
        },
        request: { criteria: request.userCriteria, urgency: request.urgency },
        error: "No output from Kestra execution",
      };
    }

    const parsed =
      typeof rawOutput === "string" ? JSON.parse(rawOutput) : rawOutput;

    return {
      ...parsed,
      callMethod: "kestra",
    };
  }
}
```

### Direct VAPI Client (direct-vapi.client.ts)

```typescript
import { VapiClient } from "@vapi-ai/server-sdk";
import { CallRequest, CallResult, StructuredCallData } from "./types";
import { createAssistantConfig } from "./assistant-config";

export class DirectVapiClient {
  private client: VapiClient;
  private phoneNumberId: string;

  constructor(private logger: any) {
    const apiKey = process.env.VAPI_API_KEY;
    this.phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID!;

    if (!apiKey || !this.phoneNumberId) {
      throw new Error("VAPI_API_KEY and VAPI_PHONE_NUMBER_ID required");
    }

    this.client = new VapiClient({ token: apiKey });
  }

  async initiateCall(request: CallRequest): Promise<CallResult> {
    const assistantConfig = createAssistantConfig(request);

    this.logger.info(
      {
        provider: request.providerName,
        phone: request.providerPhone,
      },
      "Initiating direct VAPI call",
    );

    // Create the call
    const call = await this.client.calls.create({
      phoneNumberId: this.phoneNumberId,
      customer: {
        number: request.providerPhone,
        name: request.providerName,
      },
      assistant: assistantConfig,
    });

    this.logger.info(
      { callId: call.id, status: call.status },
      "VAPI call created",
    );

    // Poll for completion
    const completedCall = await this.pollCallCompletion(call.id);

    return this.formatCallResult(completedCall, request);
  }

  private async pollCallCompletion(callId: string): Promise<any> {
    const maxAttempts = 60; // 5 minutes
    let attempts = 0;

    while (attempts < maxAttempts) {
      const call = await this.client.calls.get(callId);

      this.logger.debug(
        {
          callId,
          status: call.status,
          attempt: attempts + 1,
        },
        "Polling call status",
      );

      if (!["queued", "ringing", "in-progress"].includes(call.status)) {
        return call;
      }

      await new Promise((r) => setTimeout(r, 5000));
      attempts++;
    }

    throw new Error(
      `Call ${callId} timed out after ${maxAttempts * 5} seconds`,
    );
  }

  private formatCallResult(call: any, request: CallRequest): CallResult {
    const status =
      call.status === "ended"
        ? "completed"
        : call.endedReason?.includes("no_answer")
          ? "no_answer"
          : call.endedReason?.includes("voicemail")
            ? "voicemail"
            : "error";

    return {
      status,
      callId: call.id,
      callMethod: "direct_vapi",
      duration: call.durationMinutes || 0,
      endedReason: call.endedReason || "unknown",
      transcript: call.artifact?.transcript || call.transcript || "",
      analysis: {
        summary: call.analysis?.summary || "",
        structuredData:
          call.analysis?.structuredData || ({} as StructuredCallData),
        successEvaluation: call.analysis?.successEvaluation || "",
      },
      provider: {
        name: request.providerName,
        phone: request.providerPhone,
        service: request.serviceNeeded,
        location: request.location,
      },
      request: {
        criteria: request.userCriteria,
        urgency: request.urgency,
      },
      cost: call.costBreakdown?.total,
    };
  }
}
```

### Assistant Configuration (assistant-config.ts)

```typescript
import { CallRequest } from "./types";

/**
 * Creates VAPI assistant configuration - mirrors kestra/scripts/call-provider.js
 */
export function createAssistantConfig(request: CallRequest) {
  const urgencyText = request.urgency.replace(/_/g, " ");

  const systemPrompt = `You are a warm, friendly AI Concierge making a real phone call to ${request.providerName}.
You are calling on behalf of a client in ${request.location} who needs ${request.serviceNeeded} services.

CRITICAL: SINGLE PERSON REQUIREMENT
Your client needs to find ONE SINGLE PERSON who has ALL of these qualities:
${request.userCriteria}

You are NOT looking for different people with different qualities.
You need ONE person who possesses ALL requirements together.

QUESTIONS TO ASK (ONLY THESE - DO NOT INVENT OTHERS)
Standard questions:
1. Availability: "Are you available ${urgencyText}?"
2. Rates: "What would your rate be for this type of work?"

Client-specific requirements (ask about each ONE AT A TIME):
${request.userCriteria}

When asking about these requirements, ALWAYS refer to THE SAME PERSON:
- First question: "Do you have a technician who [first requirement]?"
- Follow-up questions: "And is this same person also [next requirement]?"
- Keep referring back: "The technician you mentioned - are they also [requirement]?"

DO NOT ask questions that are not in the criteria above.

SPEECH RULES
- NEVER start sentences with: "Okay", "So", "Well", "Alright", "Um"
- NEVER invent names or call them by a name they didn't give
- NEVER say incomplete sentences
- NEVER bundle multiple questions together
- Keep responses short and complete
- Wait for their answer before asking the next question

CONVERSATION FLOW
1. GREETING: Ask if they have a moment to chat
2. AVAILABILITY: "My client needs help ${urgencyText}. Are you available?"
   - If NO: Thank them warmly and END THE CALL
   - If YES: Continue
3. RATES: "What would your typical rate be?"
4. CLIENT REQUIREMENTS: Ask about each requirement ONE AT A TIME
5. CLOSING: "Thank you so much for your time! I'll share this with my client."
   Then immediately END THE CALL using your endCall function.

ENDING THE CALL
You have an endCall function available. You MUST use it to hang up.
After your closing statement, immediately invoke endCall.

TONE
Be warm, genuine, and conversational - like a helpful friend.`;

  return {
    name: `Concierge-${Date.now().toString().slice(-8)}`,

    // ElevenLabs voice (Rachel - handles punctuation correctly)
    voice: {
      provider: "11labs",
      voiceId: "21m00Tcm4TlvDq8ikWAM",
      stability: 0.5,
      similarityBoost: 0.75,
    },

    model: {
      provider: "google",
      model: "gemini-2.5-flash",
      messages: [{ role: "system", content: systemPrompt }],
    },

    transcriber: {
      provider: "deepgram",
      language: "en",
    },

    firstMessage: `Hi there! This is the AI Concierge calling on behalf of a client in ${request.location} who needs ${request.serviceNeeded} help. Do you have just a quick moment?`,

    endCallFunctionEnabled: true,

    tools: [
      {
        type: "endCall",
        async: false,
        messages: [
          {
            type: "request-start",
            content: "Thank you for your time. Have a great day!",
          },
        ],
      },
    ],

    analysisPlan: {
      summaryPlan: {
        enabled: true,
        messages: [
          {
            role: "system",
            content:
              "Summarize: Was ONE person found with ALL required qualities? What are their rates and availability?",
          },
        ],
      },
      structuredDataPlan: {
        enabled: true,
        schema: {
          type: "object",
          properties: {
            availability: {
              type: "string",
              enum: [
                "available",
                "unavailable",
                "callback_requested",
                "unclear",
              ],
            },
            estimated_rate: { type: "string" },
            single_person_found: { type: "boolean" },
            technician_name: { type: "string" },
            all_criteria_met: { type: "boolean" },
            criteria_details: { type: "object" },
            call_outcome: {
              type: "string",
              enum: [
                "positive",
                "negative",
                "neutral",
                "no_answer",
                "voicemail",
              ],
            },
            recommended: { type: "boolean" },
            notes: { type: "string" },
          },
          required: [
            "availability",
            "single_person_found",
            "all_criteria_met",
            "call_outcome",
          ],
        },
        messages: [
          {
            role: "system",
            content: `Analyze this call. The client needed ONE SINGLE PERSON with ALL these qualities:
${request.userCriteria}

Key question: Did we find ONE person who has ALL requirements? Not different people for different requirements.`,
          },
        ],
      },
      successEvaluationPlan: {
        enabled: true,
        rubric: "Checklist",
        messages: [
          {
            role: "system",
            content: `Evaluate:
1. Did we confirm availability?
2. Did we get rates?
3. Did we ask ONLY about the explicit criteria (not invented questions)?
4. Did we track ONE person for ALL requirements (not different people)?
5. Did we properly end the call?`,
          },
        ],
      },
    },
  };
}
```

### Call Result Service (call-result.service.ts)

```typescript
import { createClient } from "@supabase/supabase-js";
import { CallRequest, CallResult } from "./types";

export class CallResultService {
  private supabase;

  constructor(private logger: any) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      this.logger.warn("Supabase not configured, DB updates will be skipped");
      this.supabase = null;
    } else {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
  }

  async saveCallResult(
    result: CallResult,
    request: CallRequest,
  ): Promise<void> {
    if (!this.supabase) {
      this.logger.info("Skipping DB update - Supabase not configured");
      return;
    }

    try {
      // Update provider if providerId is provided
      if (request.providerId) {
        await this.updateProvider(request.providerId, result);
      }

      // Create interaction log if serviceRequestId is provided
      if (request.serviceRequestId) {
        await this.createInteractionLog(request.serviceRequestId, result);
      }

      this.logger.info(
        { callId: result.callId },
        "Call result saved to database",
      );
    } catch (error) {
      this.logger.error(
        { error, callId: result.callId },
        "Failed to save call result",
      );
      // Don't throw - we don't want DB failures to break the call flow
    }
  }

  private async updateProvider(
    providerId: string,
    result: CallResult,
  ): Promise<void> {
    const { error } = await this.supabase
      .from("providers")
      .update({
        call_status: result.status,
        call_result: result.analysis.structuredData,
        call_transcript: result.transcript,
        call_summary: result.analysis.summary,
        call_duration_minutes: result.duration,
        call_cost: result.cost,
        call_method: result.callMethod,
        call_id: result.callId,
        called_at: new Date().toISOString(),
      })
      .eq("id", providerId);

    if (error) throw error;
  }

  private async createInteractionLog(
    serviceRequestId: string,
    result: CallResult,
  ): Promise<void> {
    const { error } = await this.supabase.from("interaction_logs").insert({
      service_request_id: serviceRequestId,
      step_name: "provider_call",
      status: result.status === "completed" ? "success" : "warning",
      detail:
        result.analysis.summary ||
        `Call to ${result.provider.name}: ${result.status}`,
      transcript: result.transcript
        ? result.transcript.split("\n").map((line) => {
            const [role, ...text] = line.split(": ");
            return { speaker: role, text: text.join(": ") };
          })
        : null,
    });

    if (error) throw error;
  }
}
```

---

## API Routes

### Provider Routes (providers.ts)

```typescript
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ProviderCallingService } from "../services/vapi/provider-calling.service";

const callProviderSchema = z.object({
  providerName: z.string().min(1),
  providerPhone: z
    .string()
    .regex(/^\+1\d{10}$/, "Phone must be E.164 format (+1XXXXXXXXXX)"),
  serviceNeeded: z.string().min(1),
  userCriteria: z.string().min(1),
  location: z.string().min(1),
  urgency: z.enum([
    "immediate",
    "within_24_hours",
    "within_2_days",
    "flexible",
  ]),
  serviceRequestId: z.string().uuid().optional(),
  providerId: z.string().uuid().optional(),
});

export default async function providerRoutes(fastify: FastifyInstance) {
  const callingService = new ProviderCallingService(fastify.log);

  // POST /api/v1/providers/call - Initiate a provider call
  fastify.post(
    "/call",
    {
      schema: {
        tags: ["providers"],
        description: "Initiate a phone call to a service provider",
        body: {
          type: "object",
          required: [
            "providerName",
            "providerPhone",
            "serviceNeeded",
            "userCriteria",
            "location",
            "urgency",
          ],
          properties: {
            providerName: { type: "string" },
            providerPhone: { type: "string" },
            serviceNeeded: { type: "string" },
            userCriteria: { type: "string" },
            location: { type: "string" },
            urgency: {
              type: "string",
              enum: [
                "immediate",
                "within_24_hours",
                "within_2_days",
                "flexible",
              ],
            },
            serviceRequestId: { type: "string" },
            providerId: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const validated = callProviderSchema.parse(request.body);
        const result = await callingService.callProvider(validated);

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: any) {
        request.log.error({ error }, "Provider call failed");

        if (error.name === "ZodError") {
          return reply.status(400).send({
            success: false,
            error: "Validation error",
            details: error.errors,
          });
        }

        return reply.status(500).send({
          success: false,
          error: error.message,
        });
      }
    },
  );

  // GET /api/v1/providers/call/status - Check system status
  fastify.get(
    "/call/status",
    {
      schema: {
        tags: ["providers"],
        description: "Check provider calling system status",
      },
    },
    async (request, reply) => {
      const kestraEnabled = process.env.KESTRA_ENABLED === "true";
      const kestraUrl = process.env.KESTRA_URL || "not configured";
      const vapiConfigured = !!(
        process.env.VAPI_API_KEY && process.env.VAPI_PHONE_NUMBER_ID
      );

      return reply.send({
        kestraEnabled,
        kestraUrl: kestraEnabled ? kestraUrl : null,
        vapiConfigured,
        fallbackAvailable: vapiConfigured,
        activeMethod: kestraEnabled ? "kestra (with fallback)" : "direct_vapi",
      });
    },
  );
}
```

---

## Database Migration

Optional enhancement - add call tracking columns to providers table:

```sql
-- Migration: Add call tracking columns to providers table
-- File: supabase/migrations/YYYYMMDDHHMMSS_add_provider_call_tracking.sql

ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_status TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_result JSONB;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_transcript TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_summary TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_duration_minutes DECIMAL(5,2);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_cost DECIMAL(10,4);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_method TEXT; -- 'kestra' or 'direct_vapi'
ALTER TABLE providers ADD COLUMN IF NOT EXISTS call_id TEXT;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS called_at TIMESTAMPTZ;

-- Add index for call status queries
CREATE INDEX IF NOT EXISTS idx_providers_call_status ON providers(call_status);
```

---

## Implementation Steps

| #   | Task                                      | Files                                                    | Est. Lines |
| --- | ----------------------------------------- | -------------------------------------------------------- | ---------- |
| 1   | Add env vars to `.env.example` and `.env` | `apps/api/.env.example`                                  | 10         |
| 2   | Install `@vapi-ai/server-sdk` in API      | `apps/api/package.json`                                  | 1          |
| 3   | Create types file                         | `apps/api/src/services/vapi/types.ts`                    | ~60        |
| 4   | Create assistant config                   | `apps/api/src/services/vapi/assistant-config.ts`         | ~150       |
| 5   | Create Direct VAPI client                 | `apps/api/src/services/vapi/direct-vapi.client.ts`       | ~120       |
| 6   | Create Kestra client                      | `apps/api/src/services/vapi/kestra.client.ts`            | ~130       |
| 7   | Create Call Result service                | `apps/api/src/services/vapi/call-result.service.ts`      | ~80        |
| 8   | Create Provider Calling service           | `apps/api/src/services/vapi/provider-calling.service.ts` | ~60        |
| 9   | Create service exports                    | `apps/api/src/services/vapi/index.ts`                    | 10         |
| 10  | Create provider routes                    | `apps/api/src/routes/providers.ts`                       | ~100       |
| 11  | Register routes in index                  | `apps/api/src/index.ts`                                  | 3          |
| 12  | Add DB migration (optional)               | `supabase/migrations/`                                   | 15         |
| 13  | Test with Kestra disabled                 | -                                                        | -          |
| 14  | Test with Kestra enabled                  | -                                                        | -          |

---

## Testing Strategy

### Test 1: Direct VAPI (Kestra Disabled)

```bash
# Set in .env
KESTRA_ENABLED=false

# Call endpoint
curl -X POST http://localhost:8000/api/v1/providers/call \
  -H "Content-Type: application/json" \
  -d '{
    "providerName": "Test Plumber",
    "providerPhone": "+18641234567",
    "serviceNeeded": "plumbing",
    "userCriteria": "Licensed and insured, available within 2 days",
    "location": "Greenville, SC",
    "urgency": "within_2_days"
  }'
```

### Test 2: Kestra Path (Kestra Enabled)

```bash
# Set in .env
KESTRA_ENABLED=true
KESTRA_URL=http://localhost:8082

# Start Kestra
docker-compose up -d kestra

# Same curl call - should route through Kestra
```

### Test 3: Automatic Fallback

```bash
# Set in .env
KESTRA_ENABLED=true
KESTRA_URL=http://localhost:8082

# Stop Kestra
docker-compose stop kestra

# Call endpoint - should automatically fallback to direct VAPI
```

---

## Production Deployment

### Railway (Production - No Kestra)

```bash
# Railway environment variables
KESTRA_ENABLED=false
VAPI_API_KEY=your-prod-key
VAPI_PHONE_NUMBER_ID=your-prod-phone-id
```

### Local/Staging (With Kestra)

```bash
# docker-compose + .env
KESTRA_ENABLED=true
KESTRA_URL=http://localhost:8082
```

---

## Key Decisions

| Decision                        | Rationale                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------- |
| **Polling over Webhooks**       | Matches existing Kestra script behavior; simpler for MVP; webhooks can be added later |
| **Environment-based detection** | `KESTRA_ENABLED=false` in Railway means no Kestra health checks needed                |
| **Health check with timeout**   | 3-second timeout ensures fast fallback if Kestra is slow/unresponsive                 |
| **Identical assistant config**  | Direct VAPI uses exact same prompts/settings as Kestra script                         |
| **Unified CallResult type**     | Both paths produce identical output format for consistent downstream handling         |
| **Service layer abstraction**   | Frontend doesn't need to know which method was used                                   |

---

## Document Metadata

**Last Updated**: 2025-12-08
**Review Status**: Approved
**Implementation Status**: Not Started
**Related Documents**:

- `/kestra/flows/contact_agent.yaml` - Kestra flow definition
- `/kestra/scripts/call-provider.js` - VAPI call script
- `/apps/api/src/routes/workflows.ts` - Existing workflow routes

**Change Log**:

- 2025-12-08 - Initial creation
