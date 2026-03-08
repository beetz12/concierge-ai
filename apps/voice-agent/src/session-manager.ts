import {
  type CloseSessionInput,
  type CreateSessionInput,
  type HandoffInput,
  type RecordInterruptionInput,
  type RecordTurnInput,
  type SessionInterruption,
  type SessionTurn,
  type StartToolExecutionInput,
  type ToolExecution,
  type VoiceSession,
} from "./types.js";

const createId = (prefix: string): string => {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
};

const cloneSession = (session: VoiceSession): VoiceSession => {
  return structuredClone(session);
};

export class VoiceSessionManager {
  private readonly sessions = new Map<string, VoiceSession>();

  createSession(input: CreateSessionInput): VoiceSession {
    const now = new Date().toISOString();
    const session: VoiceSession = {
      id: input.id || createId("session"),
      serviceRequestId: input.serviceRequestId,
      providerId: input.providerId,
      runtimeProvider: input.runtimeProvider || "livekit",
      status: "active",
      activeAgent: input.initialAgent || "qualification",
      agentHistory: [
        {
          role: input.initialAgent || "qualification",
          assignedAt: now,
          reason: "session_started",
        },
      ],
      turns: [],
      interruptions: [],
      toolExecutions: [],
      metadata: { ...(input.metadata || {}) },
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.set(session.id, session);
    return cloneSession(session);
  }

  getSession(sessionId: string): VoiceSession {
    return cloneSession(this.requireSession(sessionId));
  }

  listSessions(): VoiceSession[] {
    return [...this.sessions.values()].map(cloneSession);
  }

  updateMetadata(sessionId: string, metadata: Record<string, string>): VoiceSession {
    const session = this.requireActiveSession(sessionId);
    session.metadata = {
      ...session.metadata,
      ...metadata,
    };
    return this.commit(session);
  }

  recordTurn(sessionId: string, input: RecordTurnInput): VoiceSession {
    const session = this.requireActiveSession(sessionId);
    const turn: SessionTurn = {
      id: createId("turn"),
      speaker: input.speaker,
      text: input.text,
      createdAt: new Date().toISOString(),
      metadata: input.metadata,
    };
    session.turns.push(turn);
    return this.commit(session);
  }

  recordInterruption(sessionId: string, input: RecordInterruptionInput): VoiceSession {
    const session = this.requireActiveSession(sessionId);
    const interruption: SessionInterruption = {
      id: createId("interrupt"),
      source: input.source,
      reason: input.reason,
      offsetMs: input.offsetMs,
      createdAt: new Date().toISOString(),
    };
    session.interruptions.push(interruption);
    return this.commit(session);
  }

  startToolExecution(sessionId: string, input: StartToolExecutionInput): ToolExecution {
    const session = this.requireActiveSession(sessionId);
    const execution: ToolExecution = {
      id: createId("tool"),
      name: input.name,
      status: "pending",
      args: input.args || {},
      createdAt: new Date().toISOString(),
    };
    session.toolExecutions.push(execution);
    this.commit(session);
    return structuredClone(execution);
  }

  completeToolExecution(sessionId: string, toolExecutionId: string, result: unknown): VoiceSession {
    const session = this.requireActiveSession(sessionId);
    const execution = this.requireToolExecution(session, toolExecutionId);
    execution.status = "completed";
    execution.result = result;
    execution.completedAt = new Date().toISOString();
    return this.commit(session);
  }

  failToolExecution(sessionId: string, toolExecutionId: string, error: string): VoiceSession {
    const session = this.requireActiveSession(sessionId);
    const execution = this.requireToolExecution(session, toolExecutionId);
    execution.status = "failed";
    execution.error = error;
    execution.completedAt = new Date().toISOString();
    return this.commit(session);
  }

  handoffSession(sessionId: string, input: HandoffInput): VoiceSession {
    const session = this.requireActiveSession(sessionId);
    session.status = "handoff_pending";
    session.activeAgent = input.to;
    session.agentHistory.push({
      role: input.to,
      assignedAt: new Date().toISOString(),
      reason: input.reason,
    });
    session.status = "active";
    return this.commit(session);
  }

  closeSession(sessionId: string, input: CloseSessionInput): VoiceSession {
    const session = this.requireActiveSession(sessionId);
    session.status = input.status || "completed";
    session.outcome = input.outcome;
    session.closedAt = new Date().toISOString();
    return this.commit(session);
  }

  private requireSession(sessionId: string): VoiceSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Voice session not found: ${sessionId}`);
    }

    return session;
  }

  private requireActiveSession(sessionId: string): VoiceSession {
    const session = this.requireSession(sessionId);
    if (session.closedAt || ["completed", "failed", "cancelled"].includes(session.status)) {
      throw new Error(`Voice session is already closed: ${sessionId}`);
    }

    return session;
  }

  private requireToolExecution(session: VoiceSession, toolExecutionId: string): ToolExecution {
    const execution = session.toolExecutions.find((candidate) => candidate.id === toolExecutionId);
    if (!execution) {
      throw new Error(`Tool execution not found: ${toolExecutionId}`);
    }

    return execution;
  }

  private commit(session: VoiceSession): VoiceSession {
    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.id, session);
    return cloneSession(session);
  }
}
