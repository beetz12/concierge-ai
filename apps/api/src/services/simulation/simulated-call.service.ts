/**
 * Simulated Call Service
 *
 * Generates realistic AI-simulated phone conversations for demo mode.
 * When ADMIN_TEST_NUMBER is set, real calls go to test phones while
 * remaining providers get simulated conversations via Gemini AI.
 *
 * Simulated calls are stored in the same database format as real VAPI calls,
 * allowing the recommendation engine to process both seamlessly.
 *
 * Call Distribution (matching real-world patterns):
 * - 60% completed (person answers)
 * - 20% voicemail
 * - 20% no_answer/busy
 */

import { GoogleGenAI } from "@google/genai";
import { v4 as uuidv4 } from "uuid";
import type { CallRequest, CallResult, StructuredCallData } from "../vapi/types.js";
import type { FastifyBaseLogger } from "fastify";

// Initialize Gemini AI client
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is required");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Extended request with provider metadata for realistic simulations
 */
export interface SimulatedCallRequest extends CallRequest {
  rating?: number; // Google rating (0-5)
  reviewCount?: number; // Number of reviews
  hoursOfOperation?: Record<string, string>; // Business hours
  isOpenNow?: boolean;
}

/**
 * Call scenario types for realistic distribution
 */
type CallScenario = "completed" | "voicemail" | "no_answer";

/**
 * Result of Gemini's simulation generation
 */
interface SimulationOutput {
  call_outcome: "positive" | "negative" | "neutral";
  availability: "available" | "unavailable" | "callback_requested" | "unclear";
  earliest_availability: string;
  estimated_rate: string;
  single_person_found: boolean;
  technician_name: string;
  all_criteria_met: boolean;
  criteria_details: Record<string, boolean>;
  recommended: boolean;
  disqualified: boolean;
  disqualification_reason: string;
  notes: string;
  summary: string;
  transcript: Array<{ speaker: "AI" | "Provider"; text: string }>;
  duration_minutes: number;
}

/**
 * Service for generating simulated provider calls
 */
export class SimulatedCallService {
  private ai: GoogleGenAI;
  private logger?: FastifyBaseLogger;

  constructor(logger?: FastifyBaseLogger) {
    this.ai = getAiClient();
    this.logger = logger;
  }

  /**
   * Determine call scenario based on realistic distribution
   * 60% completed, 20% voicemail, 20% no_answer
   */
  private determineCallScenario(): CallScenario {
    const rand = Math.random();
    if (rand < 0.60) {
      return "completed";
    } else if (rand < 0.80) {
      return "voicemail";
    } else {
      return "no_answer";
    }
  }

  /**
   * Generate a single simulated call
   */
  async simulateCall(request: SimulatedCallRequest): Promise<CallResult> {
    const startTime = Date.now();
    const callId = `sim-${uuidv4().slice(0, 8)}`;

    // Determine call scenario FIRST (before any AI generation)
    const scenario = this.determineCallScenario();

    this.logger?.info(
      { providerId: request.providerId, providerName: request.providerName, scenario },
      "[SimulatedCallService] Generating simulated call"
    );

    try {
      // Handle non-completed scenarios without AI generation
      if (scenario === "voicemail") {
        return this.createVoicemailResult(request, callId);
      }

      if (scenario === "no_answer") {
        return this.createNoAnswerResult(request, callId);
      }

      // Only generate AI conversation for completed calls
      const simulation = await this.generateSimulation(request);

      const duration = (Date.now() - startTime) / 1000 / 60; // minutes

      const result: CallResult = {
        status: "completed",
        callId,
        callMethod: "simulated" as any, // Extended type for simulated calls
        duration: simulation.duration_minutes || Math.round(duration * 10) / 10,
        endedReason: "assistant-ended-call",
        transcript: this.formatTranscript(simulation.transcript),
        analysis: {
          summary: simulation.summary,
          structuredData: {
            availability: simulation.availability,
            earliest_availability: simulation.earliest_availability,
            estimated_rate: simulation.estimated_rate,
            single_person_found: simulation.single_person_found,
            technician_name: simulation.technician_name,
            all_criteria_met: simulation.all_criteria_met,
            criteria_details: simulation.criteria_details,
            call_outcome: simulation.call_outcome,
            recommended: simulation.recommended,
            disqualified: simulation.disqualified,
            disqualification_reason: simulation.disqualification_reason,
            notes: simulation.notes,
          },
          successEvaluation: simulation.call_outcome === "positive" ? "true" : "false",
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
        cost: 0, // Simulated calls are free
        dataStatus: "complete",
      };

      this.logger?.info(
        {
          providerId: request.providerId,
          callId,
          scenario: "completed",
          outcome: simulation.call_outcome,
          duration: result.duration,
        },
        "[SimulatedCallService] Simulation complete"
      );

      return result;
    } catch (error: any) {
      this.logger?.error(
        { error: error.message, providerId: request.providerId },
        "[SimulatedCallService] Simulation failed"
      );

      // Return error result in same format as real VAPI errors
      return {
        status: "error",
        callId,
        callMethod: "simulated" as any,
        duration: 0,
        endedReason: error.message,
        transcript: "",
        analysis: {
          summary: "Simulation failed",
          structuredData: {
            availability: "unclear",
            earliest_availability: "",
            estimated_rate: "",
            single_person_found: false,
            all_criteria_met: false,
            call_outcome: "negative",
            recommended: false,
            disqualified: true,
            disqualification_reason: "Simulation error",
            notes: error.message,
          },
          successEvaluation: "false",
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
        cost: 0,
        error: error.message,
      };
    }
  }

  /**
   * Create a voicemail result (no AI generation needed)
   */
  private createVoicemailResult(
    request: SimulatedCallRequest,
    callId: string
  ): CallResult {
    const voicemailGreetings = [
      `You've reached ${request.providerName}. We're unable to take your call right now. Please leave a message after the tone.`,
      `Hi, you've reached ${request.providerName}. We're currently helping other customers. Leave your name and number and we'll get back to you.`,
      `Thank you for calling ${request.providerName}. Our office is currently closed. Please leave a detailed message.`,
      `This is ${request.providerName}. Sorry we missed your call. Leave a message and we'll return your call as soon as possible.`,
    ];

    const greeting = voicemailGreetings[Math.floor(Math.random() * voicemailGreetings.length)];

    this.logger?.info(
      { providerId: request.providerId, callId, scenario: "voicemail" },
      "[SimulatedCallService] Created voicemail result"
    );

    return {
      status: "voicemail",
      callId,
      callMethod: "simulated" as any,
      duration: 0.3, // ~20 seconds for voicemail greeting
      endedReason: "voicemail",
      transcript: `[Voicemail greeting]: ${greeting}\n\n[Call ended - voicemail detected]`,
      analysis: {
        summary: `Reached voicemail for ${request.providerName}`,
        structuredData: {
          availability: "unclear",
          earliest_availability: "",
          estimated_rate: "",
          single_person_found: false,
          all_criteria_met: false,
          call_outcome: "voicemail",
          recommended: false,
          disqualified: false,
          disqualification_reason: "",
          notes: "Call went to voicemail - no live person reached",
        },
        successEvaluation: "false",
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
      cost: 0,
      dataStatus: "complete",
    };
  }

  /**
   * Create a no-answer result (no AI generation needed)
   */
  private createNoAnswerResult(
    request: SimulatedCallRequest,
    callId: string
  ): CallResult {
    this.logger?.info(
      { providerId: request.providerId, callId, scenario: "no_answer" },
      "[SimulatedCallService] Created no-answer result"
    );

    return {
      status: "no_answer",
      callId,
      callMethod: "simulated" as any,
      duration: 0.5, // ~30 seconds of ringing
      endedReason: "no-answer",
      transcript: "[Phone rang with no answer - call ended after timeout]",
      analysis: {
        summary: `No answer from ${request.providerName}`,
        structuredData: {
          availability: "unclear",
          earliest_availability: "",
          estimated_rate: "",
          single_person_found: false,
          all_criteria_met: false,
          call_outcome: "no_answer",
          recommended: false,
          disqualified: false,
          disqualification_reason: "",
          notes: "Phone rang but no one answered",
        },
        successEvaluation: "false",
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
      cost: 0,
      dataStatus: "complete",
    };
  }

  /**
   * Generate batch of simulated calls concurrently
   */
  async simulateBatch(
    requests: SimulatedCallRequest[],
    options: { maxConcurrent?: number } = {}
  ): Promise<{
    results: CallResult[];
    stats: {
      total: number;
      completed: number;
      voicemail: number;
      noAnswer: number;
      failed: number;
      duration: number;
    };
  }> {
    const maxConcurrent = options.maxConcurrent || 5;
    const startTime = Date.now();
    const results: CallResult[] = [];

    this.logger?.info(
      { count: requests.length, maxConcurrent },
      "[SimulatedCallService] Starting batch simulation"
    );

    // Process in batches
    for (let i = 0; i < requests.length; i += maxConcurrent) {
      const batch = requests.slice(i, i + maxConcurrent);
      const batchResults = await Promise.all(
        batch.map((req) => this.simulateCall(req))
      );
      results.push(...batchResults);

      // Small delay between batches to avoid rate limiting
      if (i + maxConcurrent < requests.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    const duration = Date.now() - startTime;
    const completed = results.filter((r) => r.status === "completed").length;
    const voicemail = results.filter((r) => r.status === "voicemail").length;
    const noAnswer = results.filter((r) => r.status === "no_answer").length;
    const failed = results.filter((r) => r.status === "error").length;

    this.logger?.info(
      { total: requests.length, completed, voicemail, noAnswer, failed, durationMs: duration },
      "[SimulatedCallService] Batch simulation complete"
    );

    return {
      results,
      stats: {
        total: requests.length,
        completed,
        voicemail,
        noAnswer,
        failed,
        duration,
      },
    };
  }

  /**
   * Generate the simulation using Gemini AI (only for completed calls)
   */
  private async generateSimulation(
    request: SimulatedCallRequest
  ): Promise<SimulationOutput> {
    const model = "gemini-2.5-flash";

    // Build provider context for realistic responses
    const providerContext = this.buildProviderContext(request);
    const urgencyContext = this.getUrgencyContext(request.urgency);
    const clientName = request.clientName || "my client";

    const systemInstruction = `You are a call simulator generating realistic phone conversations between an AI assistant (calling on behalf of a client) and a service provider.

## YOUR ROLE
Generate a REALISTIC phone conversation that could happen in the real world. The provider should respond naturally based on their business context and capabilities.

## CRITICAL RULE - NO SCHEDULING ON THIS CALL
This is an INFORMATION-GATHERING call only. The AI assistant must:
- NEVER agree to schedule or book an appointment
- NEVER say "yes" when provider offers to schedule
- NEVER confirm a specific appointment time
- ALWAYS say something like: "I'll share this information with ${clientName}, and if they'd like to proceed, we'll call back to schedule."
- The purpose is ONLY to gather availability, pricing, and whether they meet the criteria

If the provider asks "Would you like to go ahead and schedule?" or similar, the AI MUST respond with:
"Not just yet - I need to share this information with ${clientName} first. If they'd like to move forward, we'll call you back to book the appointment."

## PROVIDER CONTEXT
${providerContext}

## CLIENT REQUIREMENTS
Service Needed: ${request.serviceNeeded}
Location: ${request.location}
${request.clientAddress ? `Service Address: ${request.clientAddress}` : ""}
Urgency: ${urgencyContext}
Specific Criteria: ${request.userCriteria || "None specified"}
${request.problemDescription ? `Problem Description: ${request.problemDescription}` : ""}

## CONVERSATION FLOW
1. AI introduces themselves: "Hi, I'm calling on behalf of ${clientName} who needs ${request.serviceNeeded} services."
2. AI asks about availability, pricing, and whether they can meet specific criteria
3. Provider responds with their availability and rates
4. AI gathers all necessary information (earliest availability, rates, whether criteria can be met)
5. If provider offers to schedule, AI declines politely: "I need to check with ${clientName} first. We'll call back if they want to proceed."
6. AI closes with: "Thank you for the information! I'll share this with ${clientName} and we'll be in touch if they'd like to move forward."

## OUTCOME DISTRIBUTION (for realism in answered calls)
- ~60% should be POSITIVE (provider available, meets criteria)
- ~25% should be NEUTRAL (callback needed from provider, or partially meets criteria)
- ~15% should be NEGATIVE (unavailable, too expensive, can't meet criteria)

## IMPORTANT
- Use realistic pricing for the service type and location
- Include specific availability times (not just "available")
- Provider personality should vary (professional, friendly, busy, etc.)
- If provider can't meet requirements, have them explain why politely
- The AI NEVER commits to scheduling - only gathers information

Return ONLY valid JSON matching the exact schema.`;

    const prompt = `Generate a realistic phone conversation for this ${request.serviceNeeded} provider.

Remember: The AI is gathering information ONLY. If the provider offers to schedule, the AI must say "I need to check with ${clientName} first - we'll call back to schedule if they want to proceed."

Output this exact JSON structure:
{
  "call_outcome": "positive" | "negative" | "neutral",
  "availability": "available" | "unavailable" | "callback_requested" | "unclear",
  "earliest_availability": "Specific date/time like 'Tomorrow at 2pm' or 'Monday morning'",
  "estimated_rate": "Price quote like '$150/hour' or '$200-300 for the job'",
  "single_person_found": true/false,
  "technician_name": "Name if given, or empty string",
  "all_criteria_met": true/false,
  "criteria_details": {"criterion1": true, "criterion2": false},
  "recommended": true/false,
  "disqualified": true/false,
  "disqualification_reason": "Reason if disqualified, or empty string",
  "notes": "Additional relevant info from the call",
  "summary": "One sentence summary of the call result",
  "transcript": [
    {"speaker": "AI", "text": "Hi, I'm calling on behalf of ${clientName} who needs ${request.serviceNeeded} services..."},
    {"speaker": "Provider", "text": "Hello, how can I help you?"},
    ...more turns,
    {"speaker": "AI", "text": "...I'll share this with ${clientName} and we'll call back to schedule if they want to proceed. Thank you!"}
  ],
  "duration_minutes": 3.5
}`;

    const response = await this.ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.7, // Higher temperature for variety
      },
    });

    const text = response.text || "{}";
    const cleanedJson = this.cleanJson(text);

    try {
      const parsed = JSON.parse(cleanedJson) as SimulationOutput;

      // Validate and set defaults
      return {
        call_outcome: parsed.call_outcome || "neutral",
        availability: parsed.availability || "unclear",
        earliest_availability: parsed.earliest_availability || "",
        estimated_rate: parsed.estimated_rate || "Quote upon request",
        single_person_found: parsed.single_person_found ?? true,
        technician_name: parsed.technician_name || "",
        all_criteria_met: parsed.all_criteria_met ?? false,
        criteria_details: parsed.criteria_details || {},
        recommended: parsed.recommended ?? (parsed.call_outcome === "positive"),
        disqualified: parsed.disqualified ?? false,
        disqualification_reason: parsed.disqualification_reason || "",
        notes: parsed.notes || "",
        summary: parsed.summary || "Call completed",
        transcript: parsed.transcript || [],
        duration_minutes: parsed.duration_minutes || 3,
      };
    } catch (parseError) {
      this.logger?.warn(
        { error: parseError, rawText: text.slice(0, 200) },
        "[SimulatedCallService] JSON parse error, using fallback"
      );

      // Return fallback neutral result
      return {
        call_outcome: "neutral",
        availability: "callback_requested",
        earliest_availability: "Call back for availability",
        estimated_rate: "Quote upon request",
        single_person_found: false,
        technician_name: "",
        all_criteria_met: false,
        criteria_details: {},
        recommended: false,
        disqualified: false,
        disqualification_reason: "",
        notes: "Simulation parsing error - neutral result returned",
        summary: `${request.providerName} requested a callback for scheduling`,
        transcript: [
          { speaker: "AI", text: `Hi, I'm calling on behalf of ${clientName} who needs ${request.serviceNeeded} services in ${request.location}.` },
          { speaker: "Provider", text: `Thanks for calling ${request.providerName}. We're a bit busy right now - can we call you back to discuss?` },
          { speaker: "AI", text: `Of course! I'll let ${clientName} know and we'll follow up. Thank you for your time!` },
        ],
        duration_minutes: 1.5,
      };
    }
  }

  /**
   * Build provider context for realistic simulation
   */
  private buildProviderContext(request: SimulatedCallRequest): string {
    const lines: string[] = [`Provider Name: ${request.providerName}`];

    if (request.rating) {
      lines.push(
        `Google Rating: ${request.rating.toFixed(1)} stars${request.reviewCount ? ` (${request.reviewCount} reviews)` : ""}`
      );
    }

    if (request.hoursOfOperation) {
      lines.push(`Business Hours: ${JSON.stringify(request.hoursOfOperation)}`);
    }

    if (request.isOpenNow !== undefined) {
      lines.push(`Currently Open: ${request.isOpenNow ? "Yes" : "No"}`);
    }

    // Add service-specific context
    const serviceType = request.serviceNeeded.toLowerCase();
    if (serviceType.includes("plumb")) {
      lines.push("Industry: Plumbing services - typically $75-200/hour");
    } else if (serviceType.includes("electr")) {
      lines.push("Industry: Electrical services - typically $75-150/hour");
    } else if (serviceType.includes("hvac") || serviceType.includes("heat") || serviceType.includes("air")) {
      lines.push("Industry: HVAC services - typically $100-200/hour");
    } else if (serviceType.includes("paint")) {
      lines.push("Industry: Painting services - typically $25-50/hour or project-based");
    } else if (serviceType.includes("clean")) {
      lines.push("Industry: Cleaning services - typically $25-75/hour");
    } else if (serviceType.includes("lawn") || serviceType.includes("landscap")) {
      lines.push("Industry: Landscaping services - typically $50-100/hour");
    }

    return lines.join("\n");
  }

  /**
   * Get human-readable urgency context
   */
  private getUrgencyContext(urgency: string): string {
    switch (urgency) {
      case "immediate":
        return "URGENT - Same day service needed";
      case "within_24_hours":
        return "High priority - Within 24 hours";
      case "within_2_days":
        return "Moderate priority - Within 2 days";
      case "flexible":
      default:
        return "Flexible timing - Schedule at provider convenience";
    }
  }

  /**
   * Format transcript array into readable string
   */
  private formatTranscript(
    transcript: Array<{ speaker: string; text: string }>
  ): string {
    return transcript
      .map((turn) => `${turn.speaker}: ${turn.text}`)
      .join("\n\n");
  }

  /**
   * Clean JSON response from Gemini (remove markdown fences, etc.)
   */
  private cleanJson(text: string): string {
    let cleaned = text.trim();

    // Remove markdown code fences
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.slice(7);
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.slice(3);
    }

    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3);
    }

    return cleaned.trim();
  }
}

/**
 * Factory function for creating SimulatedCallService
 */
export function createSimulatedCallService(
  logger?: FastifyBaseLogger
): SimulatedCallService {
  return new SimulatedCallService(logger);
}
