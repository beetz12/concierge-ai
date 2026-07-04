import { VapiClient } from "@vapi-ai/server-sdk";
import { getCallRuntimeConfig } from "../../config/call-runtime.js";
import { createBookingAssistantConfig } from "../vapi/booking-assistant-config.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

/**
 * Minimal shape of a VAPI call object as returned (polymorphically) by
 * calls.create / calls.get. The SDK response can be the object, an array, or
 * a { data } envelope; we normalize to this before reading fields.
 */
interface VapiCallLike {
  id: string;
  status?: string;
  analysis?: { structuredData?: Record<string, unknown> };
  artifact?: { transcript?: unknown };
  data?: VapiCallLike;
  // Index signature so the object satisfies the loose Record<string, unknown>
  // passthrough consumed downstream, while the named fields above give the
  // internal normalization real types.
  [key: string]: unknown;
}

/**
 * Normalize the polymorphic VAPI calls.create / calls.get response (object |
 * array | { data } envelope) to a single call object, or null when the shape
 * has no usable id.
 */
function normalizeVapiCall(response: unknown): VapiCallLike | null {
  const candidate = Array.isArray(response) ? response[0] : response;
  if (!candidate || typeof candidate !== "object") return null;
  const obj = candidate as VapiCallLike;
  if (typeof obj.id === "string") return obj;
  if (obj.data && typeof obj.data.id === "string") return obj.data;
  return null;
}

export interface BookingCallRequest {
  providerName: string;
  providerPhone: string;
  phoneToCall?: string;
  serviceNeeded: string;
  clientName?: string;
  clientPhone?: string;
  location: string;
  clientAddress?: string;
  preferredDateTime: string;
  serviceRequestId: string;
  providerId: string;
  additionalNotes?: string;
}

export interface CompletedBookingCallResult {
  runtimeProvider: "vapi";
  kind: "completed";
  callId: string;
  bookingConfirmed: boolean;
  // Dynamic passthrough of the VAPI analysis payload; consumers in
  // routes/bookings.ts and routes/providers.ts read arbitrary fields off it as
  // strings, so a stricter type would ripple untyped-narrowing across the
  // whole booking flow. Kept loose deliberately.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic VAPI analysis passthrough
  structuredData: Record<string, any>;
  transcript: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic VAPI call object passthrough
  completedCall: Record<string, any>;
}

export interface DispatchedBookingCallResult {
  runtimeProvider: "livekit";
  kind: "dispatched";
  accepted: true;
  dispatchId: string;
  sessionId: string;
  providerId: string;
  serviceRequestId: string;
}

export type BookingCallResult =
  | CompletedBookingCallResult
  | DispatchedBookingCallResult;

export class BookingCallService {
  constructor(private readonly logger: Logger) {}

  async execute(request: BookingCallRequest): Promise<BookingCallResult> {
    const config = getCallRuntimeConfig();

    if (config.provider === "livekit") {
      return this.dispatchToVoiceAgent(request);
    }

    return this.executeViaVapi(request);
  }

  private async dispatchToVoiceAgent(
    request: BookingCallRequest,
  ): Promise<DispatchedBookingCallResult> {
    const voiceAgentUrl = process.env.VOICE_AGENT_SERVICE_URL || "http://127.0.0.1:8787";
    const config = getCallRuntimeConfig();
    const response = await fetch(`${voiceAgentUrl}/dispatch/provider-booking`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-voice-agent-key": config.voiceAgent.sharedSecret,
      },
      body: JSON.stringify({ request }),
    });

    const payload = (await response.json()) as DispatchedBookingCallResult;
    if (!response.ok) {
      throw new Error(
        `Voice agent booking dispatch failed (${response.status}): ${JSON.stringify(payload)}`,
      );
    }

    this.logger.info(
      {
        runtimeProvider: "livekit",
        dispatchId: payload.dispatchId,
        sessionId: payload.sessionId,
        provider: request.providerName,
      },
      "Dispatched booking call to voice-agent service",
    );

    return payload;
  }

  private async executeViaVapi(
    request: BookingCallRequest,
  ): Promise<CompletedBookingCallResult> {
    const phoneToCall = request.phoneToCall || request.providerPhone;
    const bookingConfig = createBookingAssistantConfig({
      providerName: request.providerName,
      providerPhone: phoneToCall,
      serviceNeeded: request.serviceNeeded,
      clientName: request.clientName,
      clientPhone: request.clientPhone,
      location: request.location,
      clientAddress: request.clientAddress,
      preferredDateTime: request.preferredDateTime,
      serviceRequestId: request.serviceRequestId,
      providerId: request.providerId,
      additionalNotes: request.additionalNotes,
    });

    const vapi = new VapiClient({ token: process.env.VAPI_API_KEY! });
    const callResponse = await vapi.calls.create({
      phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
      customer: {
        number: phoneToCall,
        name: request.providerName,
      },
      assistant: bookingConfig,
    } as unknown as Parameters<typeof vapi.calls.create>[0]);

    const call = normalizeVapiCall(callResponse);
    if (!call) {
      throw new Error("Unexpected response format from VAPI calls.create");
    }

    const maxAttempts = 60;
    let attempts = 0;
    let completedCall: VapiCallLike | null = null;

    while (attempts < maxAttempts) {
      const callData = await vapi.calls.get({ id: call.id });
      const currentCall = normalizeVapiCall(callData);
      if (!currentCall) {
        throw new Error("Unexpected response format from VAPI calls.get");
      }

      if (
        !["queued", "ringing", "in-progress"].includes(
          currentCall.status ?? "",
        )
      ) {
        completedCall = currentCall;
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;
    }

    if (!completedCall) {
      throw new Error(`Booking call ${call.id} timed out after ${maxAttempts * 5} seconds`);
    }

    const analysis = completedCall.analysis || {};
    const structuredData = analysis.structuredData || {};
    const transcript = completedCall.artifact?.transcript || "";
    const transcriptStr =
      typeof transcript === "string" ? transcript : JSON.stringify(transcript);

    return {
      runtimeProvider: "vapi",
      kind: "completed",
      callId: completedCall.id,
      bookingConfirmed: Boolean(structuredData.booking_confirmed),
      structuredData,
      transcript: transcriptStr,
      completedCall,
    };
  }
}
