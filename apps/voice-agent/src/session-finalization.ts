import { DisconnectReason } from "@livekit/rtc-node";

export type CompletedCallOutcome = {
  reason: "assistant-ended-call" | "user-ended-call" | "unknown-error" | "failed";
  disposition:
    | "qualified"
    | "disqualified"
    | "callback_requested"
    | "wrong_number"
    | "failed";
  summary: string;
  servicesOffered: string[];
  estimatedRate?: string;
  availability?: string;
};

const normalizeDisconnectReason = (
  reason?: DisconnectReason | string | null,
): string | null => {
  if (reason == null) {
    return null;
  }

  if (typeof reason === "string") {
    return reason;
  }

  return DisconnectReason[reason] || null;
};

export const resolveSessionStatus = (
  outcome: CompletedCallOutcome,
): "completed" | "failed" => {
  return outcome.disposition === "failed" ? "failed" : "completed";
};

export const buildFallbackCallOutcome = (input: {
  transcript?: string;
  disconnectReason?: DisconnectReason | string | null;
}): CompletedCallOutcome => {
  const transcript = input.transcript?.trim() || "";
  const disconnectReason = normalizeDisconnectReason(input.disconnectReason);

  return {
    reason:
      disconnectReason === "CLIENT_INITIATED" ? "user-ended-call" : "failed",
    disposition: "failed",
    summary: transcript
      ? "The provider disconnected before the call could be completed."
      : "The provider disconnected before a live conversation could happen.",
    servicesOffered: [],
  };
};
