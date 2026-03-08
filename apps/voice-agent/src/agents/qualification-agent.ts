import { decideHandoff } from "../handoffs.js";
import { buildPromptMutation, parseProviderSignals, shouldEndForWrongNumber } from "../policies.js";
import { VoiceSessionManager } from "../session-manager.js";
import type { VoiceSession } from "../types.js";

interface BackendClientLike {
  upsertVoiceSession?(input: {
    sessionId: string;
    serviceRequestId: string;
    providerId: string;
    runtimeProvider: string;
    status: string;
    activeAgent: string;
    metadata?: Record<string, string>;
    outcome?: Record<string, unknown> | null;
    startedAt?: string;
    updatedAt?: string;
    closedAt?: string | null;
  }): Promise<unknown>;
  appendVoiceSessionEvent?(input: {
    sessionId: string;
    serviceRequestId: string;
    providerId: string;
    eventType: string;
    agentRole?: string;
    payload?: Record<string, unknown>;
  }): Promise<unknown>;
  saveProviderOutcome(input: {
    providerId: string;
    sessionId: string;
    callStatus: string;
    summary: string;
    availability?: string;
    estimatedRate?: string;
    outcome?: Record<string, unknown>;
  }): Promise<unknown>;
}

export interface AgentTurnResult {
  action: "ask" | "handoff" | "end";
  text: string;
  promptMutation: string;
  nextAgent?: "booking" | "supervisor";
}

export class QualificationAgent {
  constructor(
    private readonly sessionManager: VoiceSessionManager,
    private readonly backendClient: BackendClientLike,
  ) {}

  private async persistSession(
    session: VoiceSession,
    eventType?: string,
    payload?: Record<string, unknown>,
  ) {
    if (this.backendClient.upsertVoiceSession) {
      await this.backendClient.upsertVoiceSession({
        sessionId: session.id,
        serviceRequestId: session.serviceRequestId,
        providerId: session.providerId,
        runtimeProvider: session.runtimeProvider,
        status: session.status,
        activeAgent: session.activeAgent,
        metadata: session.metadata,
        outcome: session.outcome
          ? {
              disposition: session.outcome.disposition,
              summary: session.outcome.summary,
              availability: session.outcome.availability,
              estimatedRate: session.outcome.estimatedRate,
              nextStep: session.outcome.nextStep,
            }
          : null,
        startedAt: session.createdAt,
        updatedAt: session.updatedAt,
        closedAt: session.closedAt || null,
      });
    }

    if (eventType && this.backendClient.appendVoiceSessionEvent) {
      await this.backendClient.appendVoiceSessionEvent({
        sessionId: session.id,
        serviceRequestId: session.serviceRequestId,
        providerId: session.providerId,
        eventType,
        agentRole: session.activeAgent,
        payload,
      });
    }
  }

  async processProviderReply(sessionId: string, providerText: string): Promise<AgentTurnResult> {
    this.sessionManager.recordTurn(sessionId, {
      speaker: "provider",
      text: providerText,
    });

    const session = this.sessionManager.getSession(sessionId);
    const signal = parseProviderSignals(providerText);
    await this.persistSession(session, "provider_reply_received", {
      text: providerText,
      signal,
    });

    if (shouldEndForWrongNumber(signal)) {
      this.sessionManager.closeSession(sessionId, {
        outcome: {
          disposition: "wrong_number",
          summary: "Provider indicated the number or contact was incorrect.",
        },
      });
      await this.persistSession(this.sessionManager.getSession(sessionId), "session_completed", {
        reason: "wrong_number",
      });
      return {
        action: "end",
        text: "Understood. Sorry for the interruption.",
        promptMutation: buildPromptMutation(this.sessionManager.getSession(sessionId)),
      };
    }

    if (signal.availability) {
      this.sessionManager.updateMetadata(sessionId, {
        availability: signal.availability,
      });
    }

    if (signal.estimatedRate) {
      this.sessionManager.updateMetadata(sessionId, {
        estimatedRate: signal.estimatedRate,
      });
    }

    if (signal.schedulingIntent) {
      this.sessionManager.updateMetadata(sessionId, {
        readyToBook: "true",
      });
    }

    const updatedSession = this.sessionManager.getSession(sessionId);
    const handoff = decideHandoff(updatedSession, signal);

    if (handoff.nextAgent) {
      this.sessionManager.handoffSession(sessionId, {
        to: handoff.nextAgent,
        reason: handoff.reason || "handoff_requested",
      });
      await this.persistSession(this.sessionManager.getSession(sessionId), "agent_handoff", {
        to: handoff.nextAgent,
        reason: handoff.reason || "handoff_requested",
      });
      return {
        action: "handoff",
        nextAgent: handoff.nextAgent,
        text:
          handoff.nextAgent === "booking"
            ? "The provider is ready to schedule. Handing off to booking."
            : "Escalating this conversation for supervisor handling.",
        promptMutation: buildPromptMutation(this.sessionManager.getSession(sessionId)),
      };
    }

    if (!updatedSession.metadata.availability) {
      await this.persistSession(updatedSession, "clarification_requested", {
        missingField: "availability",
      });
      return {
        action: "ask",
        text: signal.clarificationNeeded
          ? "I missed the availability. What is your earliest opening?"
          : "What is your earliest availability?",
        promptMutation: buildPromptMutation(updatedSession),
      };
    }

    if (!updatedSession.metadata.estimatedRate) {
      await this.persistSession(updatedSession, "clarification_requested", {
        missingField: "estimatedRate",
      });
      return {
        action: "ask",
        text: "Thanks. What is your estimated rate for this job?",
        promptMutation: buildPromptMutation(updatedSession),
      };
    }

    try {
      await this.backendClient.saveProviderOutcome({
        providerId: updatedSession.providerId,
        sessionId: updatedSession.id,
        callStatus: "qualified",
        summary: `Qualified provider with availability ${updatedSession.metadata.availability} and rate ${updatedSession.metadata.estimatedRate}.`,
        availability: updatedSession.metadata.availability,
        estimatedRate: updatedSession.metadata.estimatedRate,
        outcome: {
          disposition: "qualified",
        },
      });
    } catch {
      this.sessionManager.recordInterruption(sessionId, {
        source: "system",
        reason: "tool_failure",
      });
      await this.persistSession(this.sessionManager.getSession(sessionId), "fallback_triggered", {
        reason: "tool_failure",
      });
      return {
        action: "ask",
        text: "I have the availability and rate. I am retrying my notes capture now.",
        promptMutation: buildPromptMutation(updatedSession),
      };
    }

    this.sessionManager.closeSession(sessionId, {
      outcome: {
        disposition: "qualified",
        summary: `Provider qualified with availability ${updatedSession.metadata.availability} and rate ${updatedSession.metadata.estimatedRate}.`,
        availability: updatedSession.metadata.availability,
        estimatedRate: updatedSession.metadata.estimatedRate,
        nextStep: "qualified_for_follow_up",
      },
    });
    await this.persistSession(this.sessionManager.getSession(sessionId), "session_completed", {
      disposition: "qualified",
    });

    return {
      action: "end",
      text: "Thank you. I have everything I need for the next step.",
      promptMutation: buildPromptMutation(this.sessionManager.getSession(sessionId)),
    };
  }
}
