# VAPI.ai Provider Calling - Fallback Architecture

## Overview

This architecture provides a robust fallback system for provider calling:

- **Primary**: Kestra orchestration (when available)
- **Fallback**: Direct VAPI.ai API calls from Fastify backend
- **Outcome**: Both paths produce identical results and database updates

## DRY Architecture (Single Source of Truth)

The system now follows a strict DRY (Don't Repeat Yourself) principle:

**Single Source of Truth**: `apps/api/src/services/vapi/assistant-config.ts`

- Contains the canonical VAPI assistant configuration
- Defines all prompts, conversation flow, analysis schema
- Used by BOTH Kestra scripts AND direct API calls

**Kestra Script Integration**: `kestra/scripts/call-provider.js`

- Imports configuration from compiled TypeScript: `apps/api/dist/services/vapi/assistant-config.js`
- No configuration duplication
- Requires `pnpm build` before execution

**Benefits**:

- Single place to update prompts and logic
- Guaranteed consistency across execution paths
- Type-safe configuration with TypeScript
- Reduces maintenance burden

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Fastify API Layer                       │
│                                                             │
│  POST /api/v1/providers/call                               │
│         ↓                                                   │
│  ┌──────────────────────────────────┐                      │
│  │  ProviderCallingService          │                      │
│  │  (Orchestrator)                  │                      │
│  └──────────────────────────────────┘                      │
│         ↓                                                   │
│  ┌─────────────────┐  Environment Check                    │
│  │ KESTRA_ENABLED? │  (KESTRA_URL + health check)          │
│  └─────────────────┘                                        │
│         ↓                                                   │
│    ┌────┴────┐                                             │
│    │         │                                             │
│   YES       NO                                             │
│    │         │                                             │
│    ↓         ↓                                             │
│  ┌───────┐ ┌──────────────┐                               │
│  │Kestra │ │ DirectVAPI   │                               │
│  │Client │ │ Client       │                               │
│  └───────┘ └──────────────┘                               │
│      │           │                                         │
└──────┼───────────┼─────────────────────────────────────────┘
       │           │
       ↓           ↓
  ┌─────────┐  ┌──────────────┐
  │ Kestra  │  │  VAPI.ai API │
  │ Flow    │  │              │
  └─────────┘  └──────────────┘
       │           │
       └─────┬─────┘
             ↓
    ┌─────────────────┐
    │  Call Complete  │
    │  (Webhook/Poll) │
    └─────────────────┘
             ↓
    ┌─────────────────┐
    │  Update DB      │
    │  - providers    │
    │  - logs         │
    │  - requests     │
    └─────────────────┘
```

## File Structure

```
apps/api/src/
├── config/
│   └── vapi.config.ts              # Environment-based configuration
├── services/
│   ├── vapi/
│   │   ├── assistant-config.ts     # SINGLE SOURCE OF TRUTH for VAPI config
│   │   └── types.ts                # VAPI-specific types
│   ├── providerCalling.service.ts  # Main orchestrator service
│   ├── kestra.client.ts            # Kestra API client
│   ├── vapi.client.ts              # Direct VAPI.ai client
│   └── callResult.service.ts       # DB update service
├── routes/
│   ├── providers.ts                # Provider calling endpoints
│   └── webhooks/
│       └── vapi.ts                 # VAPI webhook handler
└── types/
    └── vapi.types.ts               # Shared type definitions

kestra/scripts/
└── call-provider.js                # Imports from apps/api/dist/services/vapi/assistant-config.js
```

## New Features (Latest Version)

### 1. Disqualification Detection

The assistant now intelligently detects when a provider is disqualified during the call:

**Triggers**:

- Provider doesn't have anyone available
- Provider can't meet a specific requirement
- Provider doesn't do the type of work needed
- Rate is significantly higher than reasonable

**Behavior**:

- Politely exits: "Thank you so much for taking the time to chat. Unfortunately, it sounds like this particular request might not be the best fit right now..."
- Immediately invokes `endCall`
- Does NOT mention calling back to schedule

**Structured Data**:

```typescript
{
  disqualified: boolean,
  disqualification_reason: string
}
```

### 2. Conditional Closing Script

The closing script is now conditional based on provider qualification:

**If ALL criteria met**:

```
"Perfect, thank you so much for all that information! Once I confirm with my
client, if they decide to proceed, I'll call you back to schedule. Does that
sound good?"
```

**If disqualified**:

```
"Thank you so much for taking the time to chat. Unfortunately, it sounds like
this particular request might not be the best fit right now, but I really
appreciate your help. Have a wonderful day!"
```

### 3. Earliest Availability Tracking

The system now captures specific earliest availability:

**Enhanced Questions**:

- "Are you available within 2 days?"
- If YES: "Great! What's your soonest availability? When could you come out?"

**Structured Data**:

```typescript
{
  availability: "available" | "unavailable" | "callback_requested" | "unclear",
  earliest_availability: "Tomorrow at 2pm" | "Friday morning" | "Next Monday"
}
```

**Examples**:

- "Tomorrow at 2pm"
- "Friday morning"
- "Next Monday"
- "This afternoon"

### 4. Single Person Tracking

Enhanced verification that ALL requirements are met by ONE person:

**Conversation Flow**:

- First question: "Do you have a technician who [first requirement]?"
- Follow-up: "And is this same person also [next requirement]?"
- Continued tracking: "The technician you mentioned - are they also [requirement]?"

**Structured Data**:

```typescript
{
  single_person_found: boolean,
  technician_name: string,
  all_criteria_met: boolean,
  criteria_details: object
}
```

## 1. Configuration Layer

### File: `apps/api/src/config/vapi.config.ts`

```typescript
import { z } from "zod";

// Environment variable schema
const envSchema = z.object({
  // Kestra configuration
  KESTRA_ENABLED: z.enum(["true", "false"]).default("false"),
  KESTRA_URL: z.string().url().optional(),
  KESTRA_HEALTH_CHECK: z.enum(["true", "false"]).default("true"),

  // VAPI configuration
  VAPI_API_KEY: z.string().min(1),
  VAPI_PHONE_NUMBER_ID: z.string().min(1),
  VAPI_WEBHOOK_URL: z.string().url().optional(),

  // Gemini configuration (for prompt generation)
  GEMINI_API_KEY: z.string().min(1),

  // General
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type VapiConfig = z.infer<typeof envSchema>;

// Parse and validate environment
export const vapiConfig: VapiConfig = envSchema.parse({
  KESTRA_ENABLED: process.env.KESTRA_ENABLED,
  KESTRA_URL: process.env.KESTRA_URL,
  KESTRA_HEALTH_CHECK: process.env.KESTRA_HEALTH_CHECK,
  VAPI_API_KEY: process.env.VAPI_API_KEY,
  VAPI_PHONE_NUMBER_ID: process.env.VAPI_PHONE_NUMBER_ID,
  VAPI_WEBHOOK_URL: process.env.VAPI_WEBHOOK_URL,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  NODE_ENV: process.env.NODE_ENV,
});

/**
 * Check if Kestra is available and healthy
 */
export async function isKestraAvailable(): Promise<boolean> {
  if (vapiConfig.KESTRA_ENABLED !== "true") {
    return false;
  }

  if (!vapiConfig.KESTRA_URL) {
    return false;
  }

  // Skip health check if disabled
  if (vapiConfig.KESTRA_HEALTH_CHECK !== "true") {
    return true;
  }

  try {
    const response = await fetch(`${vapiConfig.KESTRA_URL}/api/v1/health`, {
      method: "GET",
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });
    return response.ok;
  } catch (error) {
    console.warn("[Kestra] Health check failed:", error);
    return false;
  }
}
```

## 2. Type Definitions

### File: `apps/api/src/types/vapi.types.ts`

```typescript
import { z } from "zod";

// Provider call request schema
export const providerCallRequestSchema = z.object({
  providerId: z.string().uuid(),
  providerName: z.string(),
  providerPhone: z.string().regex(/^\+?[1-9]\d{1,14}$/), // E.164 format
  serviceType: z.string(),
  userCriteria: z.string(),
  location: z.string(),
  urgency: z.enum([
    "immediate",
    "within_1_day",
    "within_2_days",
    "within_week",
    "flexible",
  ]),
  requestId: z.string().uuid(),
});

export type ProviderCallRequest = z.infer<typeof providerCallRequestSchema>;

// Call status enum
export const callStatusSchema = z.enum([
  "queued",
  "initiating",
  "ringing",
  "in-progress",
  "forwarding",
  "ended",
  "busy",
  "no-answer",
  "failed",
  "voicemail",
]);

export type CallStatus = z.infer<typeof callStatusSchema>;

// Structured call result
export const callResultSchema = z.object({
  // Call metadata
  callId: z.string(),
  status: callStatusSchema,
  duration: z.number().optional(),
  endedReason: z.string().optional(),
  cost: z.number().optional(),

  // Analysis results
  availability: z.enum([
    "available",
    "unavailable",
    "callback_requested",
    "unclear",
  ]),
  earliestAvailability: z.string().optional(), // NEW: Specific date/time
  estimatedRate: z.string().optional(),
  singlePersonFound: z.boolean().optional(),
  technicianName: z.string().optional(),
  allCriteriaMet: z.boolean().optional(),
  criteriaDetails: z.record(z.any()).optional(),
  disqualified: z.boolean().optional(), // NEW: Was provider disqualified?
  disqualificationReason: z.string().optional(), // NEW: Why disqualified?
  callOutcome: z.enum([
    "positive",
    "negative",
    "neutral",
    "no_answer",
    "voicemail",
  ]),
  recommended: z.boolean().optional(),
  notes: z.string().optional(),

  // Raw data
  transcript: z.string().optional(),
  summary: z.string().optional(),
  structuredData: z.record(z.any()).optional(),

  // Provider info
  provider: z.object({
    id: z.string().uuid(),
    name: z.string(),
    phone: z.string(),
    service: z.string(),
    location: z.string(),
  }),

  // Request info
  requestId: z.string().uuid(),
  timestamp: z.string().datetime(),
});

export type CallResult = z.infer<typeof callResultSchema>;

// Kestra execution response
export interface KestraExecutionResponse {
  id: string;
  namespace: string;
  flowId: string;
  state: {
    current: string;
    histories: Array<{ state: string; date: string }>;
  };
}

// VAPI call response
export interface VapiCallResponse {
  id: string;
  orgId: string;
  createdAt: string;
  updatedAt: string;
  type: "outboundPhoneCall" | "inboundPhoneCall";
  status: CallStatus;
  phoneNumberId?: string;
  customerId?: string;
  customer?: {
    number: string;
    name?: string;
  };
  assistantId?: string;
  endedReason?: string;
  cost?: number;
  costBreakdown?: {
    transport?: number;
    stt?: number;
    llm?: number;
    tts?: number;
    vapi?: number;
    total?: number;
  };
  messages?: Array<{
    role: "system" | "user" | "assistant" | "function";
    message: string;
    time: number;
  }>;
  transcript?: string;
  artifact?: {
    transcript?: string;
    video?: string;
  };
  analysis?: {
    summary?: string;
    structuredData?: Record<string, any>;
    successEvaluation?: string;
  };
  durationMinutes?: number;
}
```

## 3. Assistant Configuration (Single Source of Truth)

### File: `apps/api/src/services/vapi/assistant-config.ts`

This is the CANONICAL source for VAPI assistant configuration. Both Kestra scripts and direct API calls import from this file.

```typescript
import type { CallRequest } from "./types.js";

export function createAssistantConfig(request: CallRequest) {
  const urgencyText = request.urgency.replace(/_/g, " ");

  const systemPrompt = `You are a warm, friendly AI Concierge making a real phone call to ${request.providerName}.
// ... full prompt with:
// - Disqualification detection logic
// - Conditional closing scripts
// - Single person tracking instructions
// - Earliest availability questions
`;

  return {
    name: `Concierge-${Date.now().toString().slice(-8)}`,
    voice: {
      provider: "11labs" as const,
      voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel - warm, professional
      stability: 0.5,
      similarityBoost: 0.75,
    },
    model: {
      provider: "google" as const,
      model: "gemini-2.0-flash-exp",
      messages: [{ role: "system" as const, content: systemPrompt }],
    },
    analysisPlan: {
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
            earliest_availability: {
              type: "string",
              description: "Specific date/time",
            },
            disqualified: {
              type: "boolean",
              description: "Was provider disqualified?",
            },
            disqualification_reason: { type: "string" },
            single_person_found: { type: "boolean" },
            all_criteria_met: { type: "boolean" },
            // ... other fields
          },
        },
      },
    },
  };
}

export type AssistantConfig = ReturnType<typeof createAssistantConfig>;
```

### Usage in Kestra Script: `kestra/scripts/call-provider.js`

```javascript
// Import from compiled TypeScript
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

// Initiate call with shared config
const call = await vapi.calls.create({
  phoneNumberId: VAPI_PHONE_NUMBER_ID,
  customer: { number: PHONE_NUMBER },
  assistant: assistantConfig,
});
```

## 4. Service Layer - Main Orchestrator

### File: `apps/api/src/services/providerCalling.service.ts`

```typescript
import { FastifyBaseLogger } from "fastify";
import { isKestraAvailable } from "../config/vapi.config.js";
import { KestraClient } from "./kestra.client.js";
import { DirectVapiClient } from "./vapi.client.js";
import { CallResultService } from "./callResult.service.js";
import type { ProviderCallRequest, CallResult } from "../types/vapi.types.js";

export class ProviderCallingService {
  private kestraClient: KestraClient;
  private vapiClient: DirectVapiClient;
  private callResultService: CallResultService;

  constructor(
    private logger: FastifyBaseLogger,
    private supabase: any, // Supabase client from plugin
  ) {
    this.kestraClient = new KestraClient(logger);
    this.vapiClient = new DirectVapiClient(logger);
    this.callResultService = new CallResultService(supabase, logger);
  }

  /**
   * Initiate a provider call with automatic fallback
   * Returns a call tracking ID immediately (async operation)
   */
  async initiateCall(request: ProviderCallRequest): Promise<{
    callTrackingId: string;
    method: "kestra" | "direct";
    status: "initiated" | "failed";
    message: string;
  }> {
    this.logger.info({ request }, "Initiating provider call");

    // Check Kestra availability
    const kestraAvailable = await isKestraAvailable();
    this.logger.info({ kestraAvailable }, "Kestra availability check");

    try {
      if (kestraAvailable) {
        // Use Kestra orchestration
        this.logger.info("Using Kestra orchestration");
        const executionId = await this.kestraClient.triggerCall(request);

        return {
          callTrackingId: executionId,
          method: "kestra",
          status: "initiated",
          message: "Call initiated via Kestra orchestration",
        };
      } else {
        // Fallback to direct VAPI
        this.logger.info("Falling back to direct VAPI.ai integration");
        const callId = await this.vapiClient.initiateCall(request);

        return {
          callTrackingId: callId,
          method: "direct",
          status: "initiated",
          message: "Call initiated via direct VAPI.ai API",
        };
      }
    } catch (error) {
      this.logger.error({ error, request }, "Failed to initiate call");

      // Log failure to database
      await this.callResultService.logCallFailure({
        requestId: request.requestId,
        providerId: request.providerId,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        callTrackingId: "",
        method: kestraAvailable ? "kestra" : "direct",
        status: "failed",
        message:
          error instanceof Error ? error.message : "Call initiation failed",
      };
    }
  }

  /**
   * Get call status (works for both Kestra and direct VAPI)
   */
  async getCallStatus(
    callTrackingId: string,
    method: "kestra" | "direct",
  ): Promise<{
    status: string;
    isComplete: boolean;
    result?: CallResult;
  }> {
    if (method === "kestra") {
      return this.kestraClient.getExecutionStatus(callTrackingId);
    } else {
      return this.vapiClient.getCallStatus(callTrackingId);
    }
  }

  /**
   * Handle completed call (called by webhook or polling)
   */
  async handleCallCompletion(callResult: CallResult): Promise<void> {
    this.logger.info(
      { callId: callResult.callId },
      "Processing completed call",
    );

    try {
      await this.callResultService.saveCallResult(callResult);
      this.logger.info(
        { callId: callResult.callId },
        "Call result saved successfully",
      );
    } catch (error) {
      this.logger.error({ error, callResult }, "Failed to save call result");
      throw error;
    }
  }
}
```

## 5. Kestra Client

### File: `apps/api/src/services/kestra.client.ts`

```typescript
import axios from "axios";
import { FastifyBaseLogger } from "fastify";
import { vapiConfig } from "../config/vapi.config.js";
import type {
  ProviderCallRequest,
  CallResult,
  KestraExecutionResponse,
} from "../types/vapi.types.js";

export class KestraClient {
  private baseUrl: string;

  constructor(private logger: FastifyBaseLogger) {
    this.baseUrl = vapiConfig.KESTRA_URL || "http://localhost:8082";
  }

  /**
   * Trigger Kestra flow for provider calling
   */
  async triggerCall(request: ProviderCallRequest): Promise<string> {
    const url = `${this.baseUrl}/api/v1/executions/ai_concierge/contact_providers`;

    const inputs = {
      provider_name: request.providerName,
      provider_phone: request.providerPhone,
      service_needed: request.serviceType,
      user_criteria: request.userCriteria,
      location: request.location,
      urgency: request.urgency,
      provider_id: request.providerId,
      request_id: request.requestId,
    };

    this.logger.info({ url, inputs }, "Triggering Kestra flow");

    try {
      const response = await axios.post<KestraExecutionResponse>(url, inputs, {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000, // 10 second timeout
      });

      this.logger.info(
        { executionId: response.data.id },
        "Kestra execution started",
      );
      return response.data.id;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          {
            error: error.message,
            status: error.response?.status,
            data: error.response?.data,
          },
          "Kestra API error",
        );
        throw new Error(
          `Kestra API error: ${error.response?.data?.message || error.message}`,
        );
      }
      throw error;
    }
  }

  /**
   * Get execution status and result
   */
  async getExecutionStatus(executionId: string): Promise<{
    status: string;
    isComplete: boolean;
    result?: CallResult;
  }> {
    const url = `${this.baseUrl}/api/v1/executions/${executionId}`;

    try {
      const response = await axios.get<KestraExecutionResponse>(url, {
        timeout: 5000,
      });

      const currentState = response.data.state.current;
      const isComplete = ["SUCCESS", "FAILED", "KILLED"].includes(currentState);

      let result: CallResult | undefined;
      if (isComplete && currentState === "SUCCESS") {
        // Fetch execution outputs
        result = await this.getExecutionOutput(executionId);
      }

      return {
        status: currentState,
        isComplete,
        result,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          { error: error.message, executionId },
          "Failed to get Kestra execution status",
        );
        throw new Error(`Failed to get execution status: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get execution output (call result)
   */
  private async getExecutionOutput(
    executionId: string,
  ): Promise<CallResult | undefined> {
    const url = `${this.baseUrl}/api/v1/executions/${executionId}/outputs`;

    try {
      const response = await axios.get(url, { timeout: 5000 });

      // Parse the output from Kestra
      // The script outputs JSON via console.log('[KESTRA_OUTPUT]')
      const outputData = response.data?.outputs?.call_result;

      if (outputData && typeof outputData === "string") {
        return JSON.parse(outputData) as CallResult;
      } else if (outputData && typeof outputData === "object") {
        return outputData as CallResult;
      }

      this.logger.warn(
        { executionId },
        "No output data found in Kestra execution",
      );
      return undefined;
    } catch (error) {
      this.logger.error(
        { error, executionId },
        "Failed to get Kestra execution output",
      );
      return undefined;
    }
  }
}
```

## 6. Direct VAPI Client

### File: `apps/api/src/services/vapi.client.ts`

```typescript
import { VapiClient } from "@vapi-ai/server-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { FastifyBaseLogger } from "fastify";
import { vapiConfig } from "../config/vapi.config.js";
import type {
  ProviderCallRequest,
  CallResult,
  VapiCallResponse,
} from "../types/vapi.types.js";

export class DirectVapiClient {
  private vapi: VapiClient;
  private gemini: GoogleGenerativeAI;

  constructor(private logger: FastifyBaseLogger) {
    this.vapi = new VapiClient({ token: vapiConfig.VAPI_API_KEY });
    this.gemini = new GoogleGenerativeAI(vapiConfig.GEMINI_API_KEY);
  }

  /**
   * Initiate a VAPI call directly
   */
  async initiateCall(request: ProviderCallRequest): Promise<string> {
    this.logger.info({ request }, "Initiating direct VAPI call");

    const assistantConfig = await this.createAssistantConfig(request);

    try {
      const call = await this.vapi.calls.create({
        phoneNumberId: vapiConfig.VAPI_PHONE_NUMBER_ID,
        customer: {
          number: request.providerPhone,
          name: request.providerName,
        },
        assistant: assistantConfig,
      });

      this.logger.info(
        { callId: call.id, status: call.status },
        "VAPI call initiated",
      );
      return call.id;
    } catch (error) {
      this.logger.error({ error, request }, "VAPI call initiation failed");
      throw new Error(
        `VAPI call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Get call status
   */
  async getCallStatus(callId: string): Promise<{
    status: string;
    isComplete: boolean;
    result?: CallResult;
  }> {
    try {
      const call = (await this.vapi.calls.get(callId)) as VapiCallResponse;

      const isComplete = call.status === "ended";
      let result: CallResult | undefined;

      if (isComplete) {
        result = this.transformVapiResponse(call);
      }

      return {
        status: call.status,
        isComplete,
        result,
      };
    } catch (error) {
      this.logger.error({ error, callId }, "Failed to get VAPI call status");
      throw error;
    }
  }

  /**
   * Create assistant configuration
   * NOTE: This now imports from the shared config source
   */
  private async createAssistantConfig(
    request: ProviderCallRequest,
  ): Promise<any> {
    // Import the shared configuration
    const { createAssistantConfig } = await import(
      "./vapi/assistant-config.js"
    );

    // Use the shared configuration function
    return createAssistantConfig({
      phoneNumber: request.providerPhone,
      serviceNeeded: request.serviceType,
      userCriteria: request.userCriteria,
      location: request.location,
      providerName: request.providerName,
      urgency: request.urgency,
    });
  }

  /**
   * LEGACY: Old inline configuration approach (no longer used)
   * Kept for reference only - DO NOT USE
   */
  private async createAssistantConfigLegacy(
    request: ProviderCallRequest,
  ): Promise<any> {
    const urgencyText = request.urgency.replace(/_/g, " ");

    const systemPrompt = `You are a warm, friendly AI Concierge making a real phone call to ${request.providerName}.
You are calling on behalf of a client in ${request.location} who needs ${request.serviceType} services.

═══════════════════════════════════════════════════════════════════
CRITICAL: SINGLE PERSON REQUIREMENT
═══════════════════════════════════════════════════════════════════
Your client needs to find ONE SINGLE PERSON who has ALL of these qualities:
${request.userCriteria}

You are NOT looking for different people with different qualities.
You need ONE person who possesses ALL requirements together.

═══════════════════════════════════════════════════════════════════
QUESTIONS TO ASK (ONLY THESE - DO NOT INVENT OTHERS)
═══════════════════════════════════════════════════════════════════
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
DO NOT ask about licensing/certification unless it's in the criteria.

═══════════════════════════════════════════════════════════════════
SPEECH RULES
═══════════════════════════════════════════════════════════════════
- NEVER start sentences with: "Okay", "So", "Well", "Alright", "Um"
- NEVER invent names or call them by a name they didn't give
- NEVER say incomplete sentences
- NEVER bundle multiple questions together
- Keep responses short and complete
- Wait for their answer before asking the next question

═══════════════════════════════════════════════════════════════════
CONVERSATION FLOW
═══════════════════════════════════════════════════════════════════
1. GREETING: Ask if they have a moment to chat

2. AVAILABILITY: "My client needs help ${urgencyText}. Are you available?"
   - If NO: Thank them warmly and END THE CALL
   - If YES: Continue

3. RATES: "What would your typical rate be?"

4. CLIENT REQUIREMENTS: Ask about each requirement ONE AT A TIME
   - Always reference the SAME person
   - Use phrases like: "And this person - are they also..."
   - Acknowledge each answer warmly before the next question

5. CLOSING: "Thank you so much for your time! I'll share this with my client."
   Then immediately END THE CALL using your endCall function.

═══════════════════════════════════════════════════════════════════
ENDING THE CALL
═══════════════════════════════════════════════════════════════════
You have an endCall function available. You MUST use it to hang up.
After your closing statement, immediately invoke endCall.
DO NOT wait for them to hang up - YOU end the call.

Use endCall when:
- You have all the information you need
- They say they're not available
- They decline to answer
- The conversation naturally concludes

═══════════════════════════════════════════════════════════════════
TONE
═══════════════════════════════════════════════════════════════════
Be warm, genuine, and conversational - like a helpful friend.
Acknowledge their answers: "That's great!", "Perfect!", "I appreciate that!"
For unusual requirements, frame naturally: "My client specifically mentioned..."`;

    return {
      name: `Concierge-${Date.now().toString().slice(-8)}`,
      voice: {
        provider: "11labs",
        voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel - warm, professional
        stability: 0.5,
        similarityBoost: 0.75,
      },
      model: {
        provider: "google",
        model: "gemini-2.0-flash-exp",
        messages: [{ role: "system", content: systemPrompt }],
      },
      transcriber: {
        provider: "deepgram",
        language: "en",
      },
      firstMessage: `Hi there! This is the AI Concierge calling on behalf of a client in ${request.location} who needs ${request.serviceType} help. Do you have just a quick moment?`,
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
              single_person_found: {
                type: "boolean",
                description:
                  "Did we find ONE person with ALL required qualities?",
              },
              technician_name: {
                type: "string",
                description:
                  "Name of the specific technician discussed (if given)",
              },
              all_criteria_met: {
                type: "boolean",
                description:
                  "Does the SAME person meet ALL client requirements?",
              },
              criteria_details: {
                type: "object",
                description: "Details about each criterion for the SAME person",
              },
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
5. Did we properly end the call (not wait for them to hang up)?`,
            },
          ],
        },
      },
    };
  }

  /**
   * Transform VAPI response to standardized CallResult
   */
  private transformVapiResponse(call: VapiCallResponse): CallResult {
    const structuredData = call.analysis?.structuredData || {};

    return {
      callId: call.id,
      status: call.status,
      duration: call.durationMinutes,
      endedReason: call.endedReason,
      cost: call.cost,

      availability: structuredData.availability || "unclear",
      estimatedRate: structuredData.estimated_rate,
      singlePersonFound: structuredData.single_person_found,
      technicianName: structuredData.technician_name,
      allCriteriaMet: structuredData.all_criteria_met,
      criteriaDetails: structuredData.criteria_details,
      callOutcome: structuredData.call_outcome || "neutral",
      recommended: structuredData.recommended,
      notes: structuredData.notes,

      transcript: call.artifact?.transcript || call.transcript,
      summary: call.analysis?.summary,
      structuredData: call.analysis?.structuredData,

      provider: {
        id: "", // Will be filled by caller
        name: call.customer?.name || "",
        phone: call.customer?.number || "",
        service: "", // Will be filled by caller
        location: "", // Will be filled by caller
      },

      requestId: "", // Will be filled by caller
      timestamp: call.createdAt,
    };
  }
}
```

## 7. Call Result Service (Database Updates)

### File: `apps/api/src/services/callResult.service.ts`

```typescript
import { FastifyBaseLogger } from "fastify";
import type { CallResult } from "../types/vapi.types.js";

export class CallResultService {
  constructor(
    private supabase: any,
    private logger: FastifyBaseLogger,
  ) {}

  /**
   * Save call result to database
   */
  async saveCallResult(callResult: CallResult): Promise<void> {
    this.logger.info({ callId: callResult.callId }, "Saving call result");

    try {
      // 1. Update provider record with call results
      const { error: providerError } = await this.supabase
        .from("providers")
        .update({
          call_status: callResult.status,
          call_result: {
            availability: callResult.availability,
            estimatedRate: callResult.estimatedRate,
            recommended: callResult.recommended,
            allCriteriaMet: callResult.allCriteriaMet,
            callOutcome: callResult.callOutcome,
          },
          call_transcript: callResult.transcript,
          call_summary: callResult.summary,
          call_cost: callResult.cost,
          call_duration_minutes: callResult.duration,
          updated_at: new Date().toISOString(),
        })
        .eq("id", callResult.provider.id);

      if (providerError) {
        throw providerError;
      }

      // 2. Create interaction log
      const { error: logError } = await this.supabase
        .from("interaction_logs")
        .insert({
          request_id: callResult.requestId,
          timestamp: callResult.timestamp,
          step_name: "provider_call",
          detail: `Call to ${callResult.provider.name} - ${callResult.callOutcome}`,
          transcript: {
            callId: callResult.callId,
            transcript: callResult.transcript,
            summary: callResult.summary,
            structuredData: callResult.structuredData,
            analysis: {
              availability: callResult.availability,
              rate: callResult.estimatedRate,
              recommended: callResult.recommended,
            },
          },
          status: this.mapCallOutcomeToLogStatus(callResult.callOutcome),
        });

      if (logError) {
        throw logError;
      }

      // 3. Update service request status if needed
      await this.updateServiceRequestStatus(callResult.requestId);

      this.logger.info(
        { callId: callResult.callId },
        "Call result saved successfully",
      );
    } catch (error) {
      this.logger.error({ error, callResult }, "Failed to save call result");
      throw error;
    }
  }

  /**
   * Log call failure
   */
  async logCallFailure(params: {
    requestId: string;
    providerId: string;
    error: string;
  }): Promise<void> {
    this.logger.info({ params }, "Logging call failure");

    try {
      // Update provider
      await this.supabase
        .from("providers")
        .update({
          call_status: "failed",
          call_result: { error: params.error },
          updated_at: new Date().toISOString(),
        })
        .eq("id", params.providerId);

      // Create log
      await this.supabase.from("interaction_logs").insert({
        request_id: params.requestId,
        step_name: "provider_call_failed",
        detail: `Call initiation failed: ${params.error}`,
        status: "error",
      });
    } catch (error) {
      this.logger.error({ error, params }, "Failed to log call failure");
      throw error;
    }
  }

  /**
   * Update service request status based on call completion
   */
  private async updateServiceRequestStatus(requestId: string): Promise<void> {
    // Get all providers for this request
    const { data: providers, error } = await this.supabase
      .from("providers")
      .select("call_status")
      .eq("request_id", requestId);

    if (error || !providers) {
      this.logger.error(
        { error, requestId },
        "Failed to get providers for request",
      );
      return;
    }

    // Check if all providers have been called
    const allCalled = providers.every(
      (p: any) => p.call_status && ["ended", "failed"].includes(p.call_status),
    );

    if (allCalled) {
      // Update request status to ANALYZING
      await this.supabase
        .from("service_requests")
        .update({
          status: "ANALYZING",
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      this.logger.info(
        { requestId },
        "All providers called, updated request to ANALYZING",
      );
    }
  }

  /**
   * Map call outcome to log status
   */
  private mapCallOutcomeToLogStatus(
    outcome: string,
  ): "success" | "warning" | "error" | "info" {
    switch (outcome) {
      case "positive":
        return "success";
      case "negative":
        return "warning";
      case "no_answer":
      case "voicemail":
        return "warning";
      default:
        return "info";
    }
  }
}
```

## 8. API Routes

### File: `apps/api/src/routes/providers.ts`

```typescript
import { FastifyInstance } from "fastify";
import { ProviderCallingService } from "../services/providerCalling.service.js";
import { providerCallRequestSchema } from "../types/vapi.types.js";

export default async function providerRoutes(fastify: FastifyInstance) {
  const providerCallingService = new ProviderCallingService(
    fastify.log,
    fastify.supabase,
  );

  /**
   * Initiate a provider call
   */
  fastify.post(
    "/call",
    {
      schema: {
        tags: ["providers"],
        description: "Initiate a call to a service provider",
        body: providerCallRequestSchema,
        response: {
          200: {
            type: "object",
            properties: {
              callTrackingId: { type: "string" },
              method: { type: "string", enum: ["kestra", "direct"] },
              status: { type: "string", enum: ["initiated", "failed"] },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const callRequest = request.body;

      const result = await providerCallingService.initiateCall(callRequest);

      return reply.send(result);
    },
  );

  /**
   * Get call status
   */
  fastify.get<{
    Querystring: {
      callTrackingId: string;
      method: "kestra" | "direct";
    };
  }>(
    "/call/status",
    {
      schema: {
        tags: ["providers"],
        description: "Get the status of a provider call",
        querystring: {
          type: "object",
          required: ["callTrackingId", "method"],
          properties: {
            callTrackingId: { type: "string" },
            method: { type: "string", enum: ["kestra", "direct"] },
          },
        },
      },
    },
    async (request, reply) => {
      const { callTrackingId, method } = request.query;

      const status = await providerCallingService.getCallStatus(
        callTrackingId,
        method,
      );

      return reply.send(status);
    },
  );
}
```

### File: `apps/api/src/routes/webhooks/vapi.ts`

```typescript
import { FastifyInstance } from "fastify";
import { ProviderCallingService } from "../../services/providerCalling.service.js";
import { callResultSchema } from "../../types/vapi.types.js";

export default async function vapiWebhookRoutes(fastify: FastifyInstance) {
  const providerCallingService = new ProviderCallingService(
    fastify.log,
    fastify.supabase,
  );

  /**
   * VAPI webhook endpoint for call completion
   * This receives callbacks when calls end (if using direct VAPI)
   */
  fastify.post(
    "/call-ended",
    {
      schema: {
        tags: ["webhooks"],
        description: "Webhook endpoint for VAPI call completion",
        body: {
          type: "object",
          properties: {
            event: { type: "string" },
            call: { type: "object" },
          },
        },
      },
    },
    async (request, reply) => {
      const { event, call } = request.body as { event: string; call: any };

      if (event !== "call-ended") {
        return reply.status(400).send({ error: "Invalid event type" });
      }

      fastify.log.info({ callId: call.id }, "Received call-ended webhook");

      try {
        // Transform VAPI call object to CallResult
        const callResult = callResultSchema.parse({
          callId: call.id,
          status: call.status,
          duration: call.durationMinutes,
          endedReason: call.endedReason,
          cost: call.cost,
          availability:
            call.analysis?.structuredData?.availability || "unclear",
          estimatedRate: call.analysis?.structuredData?.estimated_rate,
          singlePersonFound: call.analysis?.structuredData?.single_person_found,
          technicianName: call.analysis?.structuredData?.technician_name,
          allCriteriaMet: call.analysis?.structuredData?.all_criteria_met,
          criteriaDetails: call.analysis?.structuredData?.criteria_details,
          callOutcome: call.analysis?.structuredData?.call_outcome || "neutral",
          recommended: call.analysis?.structuredData?.recommended,
          notes: call.analysis?.structuredData?.notes,
          transcript: call.artifact?.transcript || call.transcript,
          summary: call.analysis?.summary,
          structuredData: call.analysis?.structuredData,
          provider: {
            id: call.metadata?.providerId || "",
            name: call.customer?.name || "",
            phone: call.customer?.number || "",
            service: call.metadata?.serviceType || "",
            location: call.metadata?.location || "",
          },
          requestId: call.metadata?.requestId || "",
          timestamp: call.createdAt,
        });

        await providerCallingService.handleCallCompletion(callResult);

        return reply.send({ status: "success", message: "Webhook processed" });
      } catch (error) {
        fastify.log.error({ error, call }, "Failed to process webhook");
        return reply.status(500).send({ error: "Webhook processing failed" });
      }
    },
  );
}
```

## 9. Database Schema Updates

Add new columns to `providers` table for call tracking:

```sql
-- Migration: Add call tracking columns to providers table
-- File: supabase/migrations/20250108000000_add_call_tracking.sql

ALTER TABLE providers
ADD COLUMN IF NOT EXISTS call_status TEXT,
ADD COLUMN IF NOT EXISTS call_result JSONB,
ADD COLUMN IF NOT EXISTS call_transcript TEXT,
ADD COLUMN IF NOT EXISTS call_summary TEXT,
ADD COLUMN IF NOT EXISTS call_cost DECIMAL(10,4),
ADD COLUMN IF NOT EXISTS call_duration_minutes DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS call_tracking_id TEXT,
ADD COLUMN IF NOT EXISTS call_method TEXT CHECK (call_method IN ('kestra', 'direct'));

-- Create index for call tracking
CREATE INDEX IF NOT EXISTS idx_providers_call_tracking_id ON providers(call_tracking_id);
CREATE INDEX IF NOT EXISTS idx_providers_call_status ON providers(call_status);

-- Add comment for documentation
COMMENT ON COLUMN providers.call_status IS 'Current status of the provider call (queued, in-progress, ended, failed, etc.)';
COMMENT ON COLUMN providers.call_result IS 'Structured result data from the call (availability, rates, criteria met, etc.)';
COMMENT ON COLUMN providers.call_transcript IS 'Full transcript of the call conversation';
COMMENT ON COLUMN providers.call_summary IS 'AI-generated summary of the call';
COMMENT ON COLUMN providers.call_cost IS 'Total cost of the call in USD';
COMMENT ON COLUMN providers.call_duration_minutes IS 'Duration of the call in minutes';
COMMENT ON COLUMN providers.call_tracking_id IS 'Kestra execution ID or VAPI call ID for tracking';
COMMENT ON COLUMN providers.call_method IS 'Method used to make the call (kestra or direct)';
```

## 10. Environment Variables

Update `apps/api/.env.example`:

```bash
# Kestra Configuration (Optional - falls back to direct VAPI if unavailable)
KESTRA_ENABLED=false                           # Enable/disable Kestra integration
KESTRA_URL=http://localhost:8082               # Kestra server URL
KESTRA_HEALTH_CHECK=true                       # Perform health check before using Kestra

# VAPI Voice AI Configuration (Required)
VAPI_API_KEY=your-vapi-api-key-here
VAPI_PHONE_NUMBER_ID=your-vapi-phone-number-id-here
VAPI_WEBHOOK_URL=https://your-api.com/api/v1/webhooks/vapi/call-ended  # Optional: for webhook callbacks
```

## 11. Usage Flow

### Scenario 1: Kestra Available (with Shared Config)

```
1. Frontend → POST /api/v1/providers/call
2. ProviderCallingService checks Kestra health
3. Kestra available → KestraClient.triggerCall()
4. Kestra executes flow → Node.js script (call-provider.js)
5. Script imports createAssistantConfig from apps/api/dist/services/vapi/assistant-config.js
6. Script creates VAPI assistant with shared config
7. Script polls VAPI for call completion
8. Script outputs result via console.log (includes disqualified, earliest_availability, etc.)
9. Kestra captures output
10. Backend polls Kestra for completion
11. Backend processes result → CallResultService.saveCallResult()
12. Database updated with new fields (disqualified, earliest_availability)
13. Frontend notified via real-time subscriptions
```

### Scenario 2: Kestra Unavailable (Fallback with Shared Config)

```
1. Frontend → POST /api/v1/providers/call
2. ProviderCallingService checks Kestra health
3. Kestra unavailable → DirectVapiClient.initiateCall()
4. DirectVapiClient imports createAssistantConfig from ./vapi/assistant-config.js
5. DirectVapiClient creates VAPI assistant with shared config
6. VAPI call initiated directly (same config as Kestra path)
7. Two options for completion:
   a) Webhook: VAPI → POST /api/v1/webhooks/vapi/call-ended
   b) Polling: Backend polls DirectVapiClient.getCallStatus()
8. Backend processes result → CallResultService.saveCallResult()
9. Database updated with new fields (disqualified, earliest_availability)
10. Frontend notified via real-time subscriptions
```

**Key Point**: Both paths use IDENTICAL assistant configuration from `assistant-config.ts`, ensuring consistent behavior.

## 12. Polling Strategy (Alternative to Webhooks)

For production without webhook support, implement polling:

```typescript
// In ProviderCallingService
async startPolling(callTrackingId: string, method: 'kestra' | 'direct'): Promise<void> {
  const maxAttempts = 60; // 5 minutes max (60 * 5s)
  let attempts = 0;

  const pollInterval = setInterval(async () => {
    attempts++;

    try {
      const status = await this.getCallStatus(callTrackingId, method);

      if (status.isComplete) {
        clearInterval(pollInterval);

        if (status.result) {
          await this.handleCallCompletion(status.result);
        }

        return;
      }

      if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        this.logger.error({ callTrackingId }, 'Polling timeout');
      }
    } catch (error) {
      this.logger.error({ error, callTrackingId }, 'Polling error');
      clearInterval(pollInterval);
    }
  }, 5000); // Poll every 5 seconds
}
```

## 13. Testing Strategy

### Unit Tests

```typescript
// Test Kestra fallback
describe("ProviderCallingService", () => {
  it("should use Kestra when available", async () => {
    // Mock isKestraAvailable to return true
    // Assert KestraClient.triggerCall was called
  });

  it("should fall back to direct VAPI when Kestra unavailable", async () => {
    // Mock isKestraAvailable to return false
    // Assert DirectVapiClient.initiateCall was called
  });

  it("should handle Kestra health check timeout", async () => {
    // Mock health check timeout
    // Assert fallback to direct VAPI
  });
});
```

### Integration Tests

```typescript
// Test end-to-end flow
describe("Provider Calling Integration", () => {
  it("should complete full call workflow with Kestra", async () => {
    // Trigger call
    // Poll for completion
    // Verify database updates
  });

  it("should complete full call workflow with direct VAPI", async () => {
    // Disable Kestra
    // Trigger call
    // Poll for completion
    // Verify database updates
  });
});
```

## Summary

This architecture provides:

1. **Single Source of Truth**: All VAPI configuration in `assistant-config.ts`
2. **DRY Principle**: No configuration duplication between Kestra and direct API
3. **Automatic Fallback**: Environment-based detection with health checks
4. **Unified Interface**: Both paths use the same service layer and config
5. **Consistent Results**: Standardized CallResult type with new fields
6. **Database Consistency**: Single CallResultService for all updates
7. **Flexibility**: Supports webhooks OR polling for async completion
8. **Production Ready**: Error handling, logging, and monitoring
9. **Type Safety**: Full TypeScript with Zod validation
10. **Scalability**: Can add more fallback methods or orchestration layers

### Key Innovations

1. **DRY Architecture**: The `assistant-config.ts` file is the ONLY place to define VAPI behavior
2. **Build Integration**: Kestra scripts import from compiled TypeScript (`apps/api/dist`)
3. **Enhanced Call Logic**:
   - Disqualification detection with polite exit
   - Conditional closing (callback only if qualified)
   - Earliest availability tracking
   - Single person verification
4. **ProviderCallingService Orchestrator**: Abstracts implementation details and provides consistent interface

### Configuration Update Workflow

1. Edit prompts/logic in `apps/api/src/services/vapi/assistant-config.ts`
2. Run `pnpm build` to compile TypeScript
3. Both Kestra scripts and direct API calls use the updated config
4. No code changes needed in Kestra scripts or API routes
