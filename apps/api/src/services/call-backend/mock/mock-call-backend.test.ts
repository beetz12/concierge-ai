import assert from "node:assert/strict";
import test from "node:test";
import { getCallBackend } from "../index.js";
import type { CallBackendDependencies } from "../index.js";
import type { CallPlan } from "../types.js";
import {
  MockCallBackend,
  MOCK_RECORDING_DATA_URI,
  mockDispositionFor,
} from "./mock-call-backend.js";

const plan = (overrides: Partial<CallPlan> = {}): CallPlan => ({
  businessName: "Acme Appliance Repair",
  phoneNumber: "+18645550101",
  objective: "Get a refund for the failed dryer repair",
  context: "Repair on 2026-06-20 failed within a day.",
  mustAsk: ["What is the refund amount?", "When will it be issued?"],
  callerIdentity: "Jordan Lee",
  callbackNumber: "+18645550199",
  voicemailPolicy: "hang_up",
  preAuthorizations: [],
  userApproved: true,
  ...overrides,
});

const fakeDeps = { supabase: {} } as unknown as CallBackendDependencies;

test("factory returns the mock backend for CALL_BACKEND=mock", () => {
  const backend = getCallBackend(fakeDeps, { CALL_BACKEND: "mock" });
  assert.ok(backend instanceof MockCallBackend);
  assert.equal(backend.id, "mock");
});

test("factory reuses one mock instance so state survives across calls", async () => {
  const first = getCallBackend(fakeDeps, { CALL_BACKEND: "mock" });
  const second = getCallBackend(fakeDeps, { CALL_BACKEND: "mock" });
  const { callId } = await first.dispatchCall(plan());
  const status = await second.getStatus(callId);
  assert.equal(status.callId, callId);
});

test("dispatchCall rejects non-US-E.164 numbers", async () => {
  const backend = new MockCallBackend();
  await assert.rejects(
    backend.dispatchCall(plan({ phoneNumber: "+15551234" })),
    /E\.164/,
  );
});

test("status transitions in_progress on first poll then terminal", async () => {
  const backend = new MockCallBackend();
  const { callId } = await backend.dispatchCall(plan());
  const first = await backend.getStatus(callId);
  assert.equal(first.state, "in_progress");
  assert.equal(first.completed, false);
  const second = await backend.getStatus(callId);
  assert.equal(second.state, "completed");
  assert.equal(second.completed, true);
  assert.equal(second.disposition, "completed");
});

test("terminal disposition is scripted by the last dialed digit", () => {
  assert.equal(mockDispositionFor("+18645550101"), "completed");
  assert.equal(mockDispositionFor("+18645550102"), "voicemail");
  assert.equal(mockDispositionFor("+18645550103"), "no_answer");
  assert.equal(mockDispositionFor("+18645550104"), "error");
});

test("no_answer and error land as failed states", async () => {
  const backend = new MockCallBackend();
  const { callId } = await backend.dispatchCall(
    plan({ phoneNumber: "+18645550103" }),
  );
  await backend.getStatus(callId);
  const status = await backend.getStatus(callId);
  assert.equal(status.state, "failed");
  assert.equal(status.disposition, "no_answer");
});

test("completed artifacts carry recording, transcript, and outcome", async () => {
  const backend = new MockCallBackend();
  const dispatched = await backend.dispatchCall(plan());
  const artifacts = await backend.getArtifacts(dispatched.callId);
  assert.equal(artifacts.recordingRef, MOCK_RECORDING_DATA_URI);
  assert.ok(artifacts.recordingRef?.startsWith("data:audio/wav;base64,"));
  assert.ok(artifacts.transcript?.includes("What is the refund amount?"));
  const outcome = artifacts.structuredOutcome as {
    disposition: string;
    mustAskAnswers: Array<{ question: string; answer: string }>;
    costUsd: number;
    durationSeconds: number;
  };
  assert.equal(outcome.disposition, "completed");
  assert.equal(outcome.mustAskAnswers.length, 2);
  assert.equal(outcome.mustAskAnswers[0]?.question, "What is the refund amount?");
  assert.equal(outcome.costUsd, 0.42);
  assert.equal(outcome.durationSeconds, 184);
});

test("failed calls produce no recording and empty answers", async () => {
  const backend = new MockCallBackend();
  const dispatched = await backend.dispatchCall(
    plan({ phoneNumber: "+18645550104" }),
  );
  const artifacts = await backend.getArtifacts(dispatched.callId);
  assert.equal(artifacts.recordingRef, null);
  assert.equal(artifacts.transcript, null);
  const outcome = artifacts.structuredOutcome as {
    disposition: string;
    mustAskAnswers: unknown[];
  };
  assert.equal(outcome.disposition, "error");
  assert.equal(outcome.mustAskAnswers.length, 0);
});

test("cancelCall marks the call cancelled", async () => {
  const backend = new MockCallBackend();
  const { callId } = await backend.dispatchCall(plan());
  await backend.cancelCall(callId);
  const status = await backend.getStatus(callId);
  assert.equal(status.state, "cancelled");
  assert.equal(status.completed, true);
});

test("unknown call ids throw", async () => {
  const backend = new MockCallBackend();
  await assert.rejects(backend.getStatus("mock-nope"), /Unknown mock call/);
});
