export type VoiceRuntimeProvider = "livekit" | "vapi";

export type AgentRole = "qualification" | "booking" | "supervisor";

export type SessionStatus =
  | "active"
  | "handoff_pending"
  | "completed"
  | "failed"
  | "cancelled";

export type SpeakerRole = "assistant" | "provider" | "system";

export type ToolExecutionStatus = "pending" | "completed" | "failed";

export interface SessionTurn {
  id: string;
  speaker: SpeakerRole;
  text: string;
  createdAt: string;
  metadata?: Record<string, string>;
}

export interface SessionInterruption {
  id: string;
  source: "provider" | "system";
  reason: string;
  createdAt: string;
  offsetMs?: number;
}

export interface ToolExecution {
  id: string;
  name: string;
  status: ToolExecutionStatus;
  args: Record<string, unknown>;
  createdAt: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
}

export interface AgentAssignment {
  role: AgentRole;
  assignedAt: string;
  reason: string;
}

export interface SessionOutcome {
  disposition:
    | "qualified"
    | "disqualified"
    | "no_answer"
    | "wrong_number"
    | "callback_requested"
    | "failed";
  summary: string;
  availability?: string;
  estimatedRate?: string;
  nextStep?: string;
}

export interface VoiceSession {
  id: string;
  serviceRequestId: string;
  providerId: string;
  runtimeProvider: VoiceRuntimeProvider;
  status: SessionStatus;
  activeAgent: AgentRole;
  agentHistory: AgentAssignment[];
  turns: SessionTurn[];
  interruptions: SessionInterruption[];
  toolExecutions: ToolExecution[];
  metadata: Record<string, string>;
  outcome?: SessionOutcome;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface CreateSessionInput {
  id?: string;
  serviceRequestId: string;
  providerId: string;
  runtimeProvider?: VoiceRuntimeProvider;
  initialAgent?: AgentRole;
  metadata?: Record<string, string>;
}

export interface RecordTurnInput {
  speaker: SpeakerRole;
  text: string;
  metadata?: Record<string, string>;
}

export interface RecordInterruptionInput {
  source: "provider" | "system";
  reason: string;
  offsetMs?: number;
}

export interface StartToolExecutionInput {
  name: string;
  args?: Record<string, unknown>;
}

export interface HandoffInput {
  to: AgentRole;
  reason: string;
}

export interface CloseSessionInput {
  status?: Extract<SessionStatus, "completed" | "failed" | "cancelled">;
  outcome: SessionOutcome;
}
