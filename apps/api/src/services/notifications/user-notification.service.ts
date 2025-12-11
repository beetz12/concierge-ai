/**
 * User Notification Service
 *
 * Orchestrates VAPI calls to users to present recommendations
 * and capture their provider selection.
 */

import { VapiClient } from "@vapi-ai/server-sdk";
import type { FastifyBaseLogger } from "fastify";
import {
  createUserNotificationAssistantConfig,
  type UserNotificationRequest,
  type UserNotificationResult,
} from "../vapi/user-notification-assistant-config.js";

export class UserNotificationService {
  private vapi: VapiClient | null = null;
  private phoneNumberId: string;
  private isConfigured: boolean;

  constructor(private logger: FastifyBaseLogger) {
    const apiKey = process.env.VAPI_API_KEY;
    this.phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID || "";
    this.isConfigured = !!(apiKey && this.phoneNumberId);

    if (this.isConfigured && apiKey) {
      this.vapi = new VapiClient({ token: apiKey });
      this.logger.info("[UserNotificationService] Initialized with VAPI");
    } else {
      this.logger.warn("[UserNotificationService] VAPI not configured - user calls disabled");
    }
  }

  isAvailable(): boolean {
    return this.isConfigured && this.vapi !== null;
  }

  async callUser(request: UserNotificationRequest): Promise<UserNotificationResult> {
    if (!this.vapi) {
      return {
        success: false,
        callOutcome: "error",
        error: "VAPI not configured for user notification calls",
      };
    }

    try {
      this.logger.info(
        { userPhone: request.userPhone, serviceRequestId: request.serviceRequestId },
        "[UserNotificationService] Initiating user notification call"
      );

      // Create assistant configuration
      const assistantConfig = createUserNotificationAssistantConfig(request);

      // Create the call
      const call = await this.vapi.calls.create({
        phoneNumberId: this.phoneNumberId,
        customer: {
          number: request.userPhone,
          name: request.userName || "Customer",
        },
        assistant: assistantConfig as any,
      });

      // Extract call ID from response
      let callId: string;
      if (Array.isArray(call)) {
        callId = call[0]?.id;
      } else if ((call as any).id) {
        callId = (call as any).id;
      } else if ((call as any).data?.id) {
        callId = (call as any).data.id;
      } else {
        throw new Error("Unexpected response format from VAPI calls.create");
      }

      this.logger.info({ callId }, "[UserNotificationService] Call created, polling for completion");

      // Poll for completion (max 3 minutes for user notification calls)
      const maxAttempts = 36; // 3 minutes at 5s intervals
      let attempts = 0;
      let completedCall: any = null;

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        attempts++;

        try {
          const callData = await this.vapi.calls.get({ id: callId });

          let currentCall: any;
          if (Array.isArray(callData)) {
            currentCall = callData[0];
          } else if ((callData as any).id) {
            currentCall = callData;
          } else if ((callData as any).data?.id) {
            currentCall = (callData as any).data;
          } else {
            continue;
          }

          this.logger.debug(
            { callId, status: currentCall.status, attempt: attempts },
            "[UserNotificationService] Poll status"
          );

          if (!["queued", "ringing", "in-progress"].includes(currentCall.status)) {
            completedCall = currentCall;
            break;
          }
        } catch (pollError) {
          this.logger.warn(
            { error: pollError, attempt: attempts },
            "[UserNotificationService] Poll error"
          );
        }
      }

      if (!completedCall) {
        this.logger.warn({ callId }, "[UserNotificationService] Call timed out");
        return {
          success: false,
          callId,
          callOutcome: "no_answer",
          error: "Call timed out waiting for completion",
        };
      }

      // Extract results
      const analysis = completedCall.analysis || {};
      const structuredData = analysis.structuredData || {};
      const transcript = completedCall.artifact?.transcript || completedCall.transcript || "";

      // Determine call outcome
      let callOutcome: UserNotificationResult["callOutcome"] = "no_selection";
      if (structuredData.selected_provider && structuredData.selected_provider >= 1 && structuredData.selected_provider <= 3) {
        callOutcome = "selected";
      } else if (completedCall.endedReason === "voicemail") {
        callOutcome = "voicemail";
      } else if (completedCall.endedReason === "no-answer" || completedCall.status === "no-answer") {
        callOutcome = "no_answer";
      }

      this.logger.info(
        { callId, callOutcome, selectedProvider: structuredData.selected_provider },
        "[UserNotificationService] Call completed"
      );

      return {
        success: callOutcome === "selected",
        callId,
        selectedProvider: structuredData.selected_provider || undefined,
        callOutcome,
        transcript: typeof transcript === "string" ? transcript : JSON.stringify(transcript),
      };
    } catch (error) {
      this.logger.error({ error }, "[UserNotificationService] Failed to call user");
      return {
        success: false,
        callOutcome: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }
}
