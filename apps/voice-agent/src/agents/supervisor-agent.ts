import type { VoiceSession } from "../types.js";

export interface SupervisorAgentResponse {
  action: "speak" | "end";
  text: string;
}

export class SupervisorAgent {
  handleEscalation(session: VoiceSession): SupervisorAgentResponse {
    const providerName = session.metadata.providerName || "the provider";

    return {
      action: "end",
      text: `Understood. I will stop the call with ${providerName} and flag this conversation for manual review.`,
    };
  }
}
