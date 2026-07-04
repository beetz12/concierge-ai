import type {
  ContractorCallInput,
  ContractorCallService,
} from "../../voice/contractor-call.service.js";
import type {
  CallArtifacts,
  CallBackend,
  CallBackendCapabilities,
  CallBackendId,
  CallPlan,
  CallStatus,
  CallStatusState,
} from "../types.js";

/**
 * LiveKit-backed {@link CallBackend}.
 *
 * Thin adapter over {@link ContractorCallService} — the existing LiveKit
 * dispatch/status/artifact logic used by the voice-calls routes. This wrapper
 * introduces no new behavior; it maps the provider-agnostic {@link CallPlan}
 * and {@link CallStatus}/{@link CallArtifacts} shapes onto the service's
 * qualification dispatch flow.
 */
export class LiveKitCallBackend implements CallBackend {
  readonly id: CallBackendId = "livekit";

  readonly capabilities: CallBackendCapabilities = {
    supportsPause: true,
    supportsSupervision: true,
    supportsWarmTransfer: true,
    supportsDtmf: false,
  };

  constructor(private readonly service: ContractorCallService) {}

  async dispatchCall(plan: CallPlan): Promise<{ callId: string }> {
    const result = await this.service.dispatchCall(mapPlanToInput(plan));
    return { callId: result.sessionId };
  }

  async getStatus(callId: string): Promise<CallStatus> {
    const status = await this.service.getCallStatus(callId);
    return {
      callId,
      state: mapSessionState(status.session["status"], status.completed),
      completed: status.completed,
      disposition: status.result.disposition,
      summary: status.result.summary,
    };
  }

  async getArtifacts(callId: string): Promise<CallArtifacts> {
    const status = await this.service.getCallStatus(callId);
    return {
      callId,
      recordingRef: status.result.recordingPath,
      transcript: status.result.transcript,
      structuredOutcome: {
        disposition: status.result.disposition,
        summary: status.result.summary,
        availability: status.result.availability,
        estimatedRate: status.result.estimatedRate,
        transcriptPath: status.result.transcriptPath,
        sessionReportPath: status.result.sessionReportPath,
      },
    };
  }

  async cancelCall(callId: string): Promise<void> {
    await this.service.controlActiveCall({ sessionId: callId, action: "pause" });
  }
}

/**
 * Translate a provider-agnostic {@link CallPlan} into the qualification
 * {@link ContractorCallInput} the LiveKit service expects.
 */
export function mapPlanToInput(plan: CallPlan): ContractorCallInput {
  const contextParts = [plan.context, ...plan.preAuthorizations.map((auth) => `${auth.key}: ${auth.value}`)]
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    mode: "qualification",
    contractorName: plan.businessName,
    contractorPhone: plan.phoneNumber,
    serviceNeeded: plan.objective,
    location: "",
    problemDescription: contextParts.join("\n") || undefined,
    clientName: plan.callerIdentity || undefined,
    clientPhone: plan.callbackNumber,
    mustAskQuestions: plan.mustAsk.length > 0 ? plan.mustAsk : undefined,
  };
}

function mapSessionState(
  sessionStatus: unknown,
  completed: boolean,
): CallStatusState {
  if (typeof sessionStatus === "string") {
    switch (sessionStatus) {
      case "queued":
      case "in_progress":
      case "completed":
      case "failed":
      case "cancelled":
        return sessionStatus;
      default:
        break;
    }
  }

  return completed ? "completed" : "in_progress";
}
