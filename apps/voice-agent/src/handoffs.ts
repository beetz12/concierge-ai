import type { VoiceSession } from "./types.js";
import {
  type ParsedProviderSignal,
  shouldEscalateToSupervisor,
  shouldHandoffToBooking,
} from "./policies.js";

export interface HandoffDecision {
  nextAgent: "booking" | "supervisor" | null;
  reason?: string;
}

export const decideHandoff = (
  session: VoiceSession,
  signal: ParsedProviderSignal,
): HandoffDecision => {
  if (shouldEscalateToSupervisor(signal)) {
    return {
      nextAgent: "supervisor",
      reason: "policy_escalation",
    };
  }

  if (shouldHandoffToBooking(session, signal)) {
    return {
      nextAgent: "booking",
      reason: "provider_ready_to_schedule",
    };
  }

  return { nextAgent: null };
};
