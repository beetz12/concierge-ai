/**
 * Pure mapping functions between the provider-agnostic CallBackend shapes
 * ({@link CallPlan}, {@link CallStatus}, {@link CallArtifacts}) and the VAPI
 * REST API's call-creation payload and call response shape.
 *
 * Kept side-effect free and independently unit-testable.
 */

import type {
  CallArtifacts,
  CallPlan,
  CallStatus,
  CallStatusState,
  VoicemailPolicy,
} from "../types.js";

/**
 * Minimal shape of the VAPI `POST /call` request body this adapter sends.
 * Only the fields the adapter actually populates are modeled here.
 */
export interface VapiCreateCallRequest {
  phoneNumberId: string;
  customer: {
    number: string;
    name: string;
  };
  assistant: {
    model: {
      provider: "google";
      model: string;
      messages: Array<{ role: "system"; content: string }>;
    };
    voice: {
      provider: "11labs";
      voiceId: string;
    };
    transcriber: {
      provider: "deepgram";
      language: "en";
    };
    voicemailDetection: {
      provider: "twilio";
      enabled: boolean;
      machineDetectionTimeout: number;
      machineDetectionSpeechThreshold: number;
      machineDetectionSpeechEndThreshold: number;
    };
    firstMessage: string;
    endCallFunctionEnabled: boolean;
    silenceTimeoutSeconds: number;
  };
  metadata?: Record<string, string>;
}

/**
 * Minimal shape of a VAPI `GET /call/{id}` response this adapter consumes.
 * Mirrors {@link VAPICallResponse} from `services/vapi/vapi-api.client.ts`
 * without importing it, to keep this adapter decoupled from the legacy
 * VAPI client internals.
 */
export interface VapiCallResponse {
  id: string;
  status: "queued" | "ringing" | "in-progress" | "forwarding" | "ended";
  endedReason?: string;
  transcript?: string;
  recordingUrl?: string;
  analysis?: {
    summary?: string;
    structuredData?: Record<string, unknown>;
    successEvaluation?: string;
  };
}

/** E.164 US number: +1 followed by exactly 10 digits. */
const US_E164_PATTERN = /^\+1\d{10}$/;

export function isUsE164(phoneNumber: string): boolean {
  return US_E164_PATTERN.test(phoneNumber);
}

/**
 * Translate a VoicemailPolicy into VAPI's voicemail-detection behavior.
 * VAPI itself only detects+reports voicemail; how the assistant reacts
 * (hang up vs. leave a message) is instructed via the system prompt, so
 * this returns both the detection config and an instruction line to
 * include in the prompt.
 */
export function mapVoicemailPolicy(policy: VoicemailPolicy): {
  detection: VapiCreateCallRequest["assistant"]["voicemailDetection"];
  instruction: string;
} {
  const detection = {
    provider: "twilio" as const,
    enabled: true,
    machineDetectionTimeout: 10,
    machineDetectionSpeechThreshold: 2500,
    machineDetectionSpeechEndThreshold: 2500,
  };

  switch (policy) {
    case "hang_up":
      return {
        detection,
        instruction:
          "If you detect voicemail or an automated greeting, immediately end the call. Do not leave a message.",
      };
    case "leave_message":
      return {
        detection,
        instruction:
          "If you detect voicemail or an automated greeting, leave a brief, clear message stating who you are calling on behalf of and a callback number, then end the call.",
      };
    case "retry_later":
      return {
        detection,
        instruction:
          "If you detect voicemail or an automated greeting, end the call immediately without leaving a message. This contact will be retried later.",
      };
    default:
      return {
        detection,
        instruction:
          "If you detect voicemail or an automated greeting, immediately end the call. Do not leave a message.",
      };
  }
}

/**
 * Map a provider-agnostic {@link CallPlan} to the VAPI `POST /call` request
 * body, using `phoneNumberId` from the environment.
 */
export function mapPlanToVapiCallRequest(
  plan: CallPlan,
  phoneNumberId: string,
): VapiCreateCallRequest {
  const { detection, instruction } = mapVoicemailPolicy(plan.voicemailPolicy);

  const mustAskLines =
    plan.mustAsk.length > 0
      ? `\n\nYou must ask the following before ending the call:\n${plan.mustAsk.map((q) => `- ${q}`).join("\n")}`
      : "";

  const preAuthLines =
    plan.preAuthorizations.length > 0
      ? `\n\nYou are pre-authorized to share the following if asked:\n${plan.preAuthorizations.map((auth) => `- ${auth.key}: ${auth.value}`).join("\n")}`
      : "";

  const callbackLine = plan.callbackNumber
    ? `\n\nIf they need a callback number, provide: ${plan.callbackNumber}.`
    : "";

  const systemPrompt = `You are an AI assistant calling ${plan.businessName} on behalf of ${plan.callerIdentity || "a client"}.

Objective: ${plan.objective}

Context: ${plan.context}${mustAskLines}${preAuthLines}${callbackLine}

${instruction}`;

  return {
    phoneNumberId,
    customer: {
      number: plan.phoneNumber,
      name: plan.businessName.slice(0, 40),
    },
    assistant: {
      model: {
        provider: "google",
        model: "gemini-2.0-flash",
        messages: [{ role: "system", content: systemPrompt }],
      },
      voice: {
        provider: "11labs",
        voiceId: "rachel",
      },
      transcriber: {
        provider: "deepgram",
        language: "en",
      },
      voicemailDetection: detection,
      firstMessage: `Hi, this is an AI assistant calling on behalf of ${plan.callerIdentity || "a client"} regarding ${plan.objective}. Do you have a moment?`,
      endCallFunctionEnabled: true,
      silenceTimeoutSeconds: 10,
    },
    metadata: {
      businessName: plan.businessName,
      objective: plan.objective,
    },
  };
}

/**
 * Map a VAPI status string (+ optional endedReason) onto the normalized
 * {@link CallStatusState}.
 */
export function mapVapiStatus(
  status: VapiCallResponse["status"],
  endedReason?: string,
): CallStatusState {
  switch (status) {
    case "queued":
    case "ringing":
      return "queued";
    case "in-progress":
    case "forwarding":
      return "in_progress";
    case "ended": {
      const reason = (endedReason || "").toLowerCase();
      const isFailure =
        reason.includes("error") ||
        reason.includes("failed") ||
        reason.includes("no-answer") ||
        reason.includes("no_answer") ||
        reason.includes("did-not-answer") ||
        reason.includes("did_not_answer") ||
        reason.includes("busy");
      return isFailure ? "failed" : "completed";
    }
    default:
      return "queued";
  }
}

/**
 * Map a VAPI call response onto the normalized {@link CallStatus}.
 */
export function mapVapiCallResponseToStatus(
  call: VapiCallResponse,
): CallStatus {
  const state = mapVapiStatus(call.status, call.endedReason);
  const completed = state === "completed" || state === "failed";

  return {
    callId: call.id,
    state,
    completed,
    disposition: completed ? call.endedReason || null : null,
    summary: call.analysis?.summary ?? null,
  };
}

/**
 * Map a VAPI call response onto the normalized {@link CallArtifacts}.
 */
export function mapVapiCallResponseToArtifacts(
  call: VapiCallResponse,
): CallArtifacts {
  return {
    callId: call.id,
    recordingRef: call.recordingUrl ?? null,
    transcript: call.transcript ?? null,
    structuredOutcome: call.analysis?.structuredData ?? null,
  };
}
