import { VapiClient } from "@vapi-ai/server-sdk";
import { getCallRuntimeConfig } from "../../config/call-runtime.js";
import { createBookingAssistantConfig } from "../vapi/booking-assistant-config.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
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
  structuredData: Record<string, any>;
  transcript: string;
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
    } as any);

    let call: any;
    if (Array.isArray(callResponse)) {
      call = callResponse[0];
    } else if ((callResponse as any).id) {
      call = callResponse;
    } else if ((callResponse as any).data?.id) {
      call = (callResponse as any).data;
    } else {
      throw new Error("Unexpected response format from VAPI calls.create");
    }

    const maxAttempts = 60;
    let attempts = 0;
    let completedCall: any = null;

    while (attempts < maxAttempts) {
      const callData = await vapi.calls.get({ id: call.id });
      let currentCall: any;
      if (Array.isArray(callData)) {
        currentCall = callData[0];
      } else if ((callData as any).id) {
        currentCall = callData;
      } else if ((callData as any).data?.id) {
        currentCall = (callData as any).data;
      } else {
        throw new Error("Unexpected response format from VAPI calls.get");
      }

      if (!["queued", "ringing", "in-progress"].includes(currentCall.status)) {
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
      bookingConfirmed: structuredData.booking_confirmed || false,
      structuredData,
      transcript: transcriptStr,
      completedCall,
    };
  }
}
