import { VoiceSessionManager } from "./session-manager.js";

export interface DiagnosticEvent {
  timestamp: string;
  level: "info" | "warn" | "error";
  eventType: string;
  message: string;
  sessionId?: string;
  serviceRequestId?: string;
  providerId?: string;
  details?: Record<string, unknown>;
}

const MAX_DIAGNOSTIC_EVENTS = 100;

export class VoiceObservability {
  private readonly events: DiagnosticEvent[] = [];

  record(event: DiagnosticEvent) {
    this.events.push(event);
    if (this.events.length > MAX_DIAGNOSTIC_EVENTS) {
      this.events.splice(0, this.events.length - MAX_DIAGNOSTIC_EVENTS);
    }

    const logger = event.level === "error" ? console.error : event.level === "warn" ? console.warn : console.info;
    logger(
      JSON.stringify({
        service: "voice-agent",
        level: event.level,
        eventType: event.eventType,
        sessionId: event.sessionId,
        serviceRequestId: event.serviceRequestId,
        providerId: event.providerId,
        message: event.message,
        details: event.details || {},
      }),
    );
  }

  getRecentEvents(limit = 20): DiagnosticEvent[] {
    return this.events.slice(-limit).reverse();
  }

  getRecentFailures(limit = 20): DiagnosticEvent[] {
    return this.events
      .filter((event) => event.level !== "info")
      .slice(-limit)
      .reverse();
  }

  buildHealth(sessionManager: VoiceSessionManager, runtimeProvider: string) {
    const sessions = sessionManager.listSessions();
    const activeSessions = sessions.filter((session) => session.status === "active").length;
    const completedSessions = sessions.filter((session) => session.status === "completed").length;
    const failedSessions = sessions.filter((session) => session.status === "failed").length;
    const handoffSessions = sessions.filter((session) => session.agentHistory.length > 1).length;
    const recentFailures = this.getRecentFailures(10).length;

    return {
      status: recentFailures > 0 ? "degraded" : "ok",
      service: "voice-agent",
      runtimeProvider,
      activeSessions,
      completedSessions,
      failedSessions,
      handoffSessions,
      recentFailureCount: recentFailures,
      timestamp: new Date().toISOString(),
    };
  }
}
