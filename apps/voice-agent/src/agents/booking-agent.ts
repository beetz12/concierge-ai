import type { VoiceSession } from "../types.js";

export interface BookingAgentResponse {
  action: "speak";
  text: string;
}

export class BookingAgent {
  handleQualifiedProvider(session: VoiceSession): BookingAgentResponse {
    const availability = session.metadata.availability || "the discussed time";
    const rate = session.metadata.estimatedRate || "the discussed rate";

    return {
      action: "speak",
      text: `Great. I have your availability as ${availability} and your estimated rate as ${rate}. Let's move to scheduling details.`,
    };
  }
}
