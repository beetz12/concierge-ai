import test from "node:test";
import assert from "node:assert/strict";
import { QualificationAgent } from "./agents/qualification-agent.js";
import { BookingAgent } from "./agents/booking-agent.js";
import { SupervisorAgent } from "./agents/supervisor-agent.js";
import { VoiceSessionManager } from "./session-manager.js";

test("qualification agent captures availability and rate then closes the session", async () => {
  const sessionManager = new VoiceSessionManager();
  const saved: Array<Record<string, unknown>> = [];
  const sessions: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  const agent = new QualificationAgent(sessionManager, {
    async upsertVoiceSession(input) {
      sessions.push(input);
      return { persisted: true };
    },
    async appendVoiceSessionEvent(input) {
      events.push(input);
      return { persisted: true };
    },
    async saveProviderOutcome(input) {
      saved.push(input);
      return { persisted: true };
    },
  });

  const session = sessionManager.createSession({
    id: "agent_session_1",
    serviceRequestId: "request_1",
    providerId: "provider_1",
  });

  const firstTurn = await agent.processProviderReply(
    session.id,
    "We can do tomorrow at 9am.",
  );
  const secondTurn = await agent.processProviderReply(
    session.id,
    "It will be $120/hour.",
  );
  const closedSession = sessionManager.getSession(session.id);

  assert.equal(firstTurn.action, "ask");
  assert.match(firstTurn.text, /estimated rate/i);
  assert.equal(secondTurn.action, "end");
  assert.equal(closedSession.outcome?.disposition, "qualified");
  assert.equal(saved.length, 1);
  assert.equal(sessions.at(-1)?.status, "completed");
  assert.equal(events.some((event) => event.eventType === "provider_reply_received"), true);
  assert.equal(events.some((event) => event.eventType === "session_completed"), true);
});

test("handoff boundaries move qualified scheduling intents to the booking agent", async () => {
  const sessionManager = new VoiceSessionManager();
  const agent = new QualificationAgent(sessionManager, {
    async saveProviderOutcome() {
      return { persisted: true };
    },
  });
  const bookingAgent = new BookingAgent();
  const session = sessionManager.createSession({
    id: "agent_session_2",
    serviceRequestId: "request_2",
    providerId: "provider_2",
  });

  sessionManager.updateMetadata(session.id, {
    availability: "Tomorrow at 9am",
    estimatedRate: "$120/hour",
  });

  const handoff = await agent.processProviderReply(
    session.id,
    "Yes, you can book it now and schedule me for tomorrow at 9am.",
  );

  assert.equal(handoff.action, "handoff");
  assert.equal(handoff.nextAgent, "booking");
  assert.match(bookingAgent.handleQualifiedProvider(sessionManager.getSession(session.id)).text, /scheduling details/i);
});

test("policy violations escalate to the supervisor agent without losing session state", async () => {
  const sessionManager = new VoiceSessionManager();
  const agent = new QualificationAgent(sessionManager, {
    async saveProviderOutcome() {
      return { persisted: true };
    },
  });
  const supervisorAgent = new SupervisorAgent();
  const session = sessionManager.createSession({
    id: "agent_session_3",
    serviceRequestId: "request_3",
    providerId: "provider_3",
  });

  sessionManager.updateMetadata(session.id, {
    availability: "Tomorrow at 9am",
  });

  const escalation = await agent.processProviderReply(
    session.id,
    "Do not call again. I need a manager and I want payment up front.",
  );

  assert.equal(escalation.action, "handoff");
  assert.equal(escalation.nextAgent, "supervisor");
  assert.equal(sessionManager.getSession(session.id).activeAgent, "supervisor");
  assert.equal(supervisorAgent.handleEscalation(sessionManager.getSession(session.id)).action, "end");
});

test("tool failures trigger fallback behavior instead of dropping the call", async () => {
  const sessionManager = new VoiceSessionManager();
  const agent = new QualificationAgent(sessionManager, {
    async saveProviderOutcome() {
      throw new Error("backend unavailable");
    },
  });
  const session = sessionManager.createSession({
    id: "agent_session_4",
    serviceRequestId: "request_4",
    providerId: "provider_4",
  });

  sessionManager.updateMetadata(session.id, {
    availability: "Tomorrow at 9am",
  });

  const response = await agent.processProviderReply(
    session.id,
    "It is $120/hour.",
  );

  assert.equal(response.action, "ask");
  assert.match(response.text, /retrying my notes capture/i);
  assert.equal(sessionManager.getSession(session.id).interruptions.length, 1);
});

test("wrong-number handling exits immediately", async () => {
  const sessionManager = new VoiceSessionManager();
  const agent = new QualificationAgent(sessionManager, {
    async saveProviderOutcome() {
      return { persisted: true };
    },
  });
  const session = sessionManager.createSession({
    id: "agent_session_5",
    serviceRequestId: "request_5",
    providerId: "provider_5",
  });

  const result = await agent.processProviderReply(
    session.id,
    "You have the wrong number.",
  );

  assert.equal(result.action, "end");
  assert.equal(sessionManager.getSession(session.id).outcome?.disposition, "wrong_number");
});
