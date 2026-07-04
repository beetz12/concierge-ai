import assert from "node:assert/strict";
import test from "node:test";
import type { CallPlan } from "../call-backend/types.js";
import {
  getDispatch,
  isRedialBlocked,
  recordDispatch,
  resetDispatchRegistry,
  setAttachedEvent,
} from "./registry.js";

const plan: CallPlan = {
  businessName: "Acme",
  phoneNumber: "+18645550110",
  objective: "Ask about hours",
  context: "",
  mustAsk: [],
  callerIdentity: "a client",
  voicemailPolicy: "hang_up",
  preAuthorizations: [],
  userApproved: true,
};

test("recordDispatch stores the record and arms the redial guard", () => {
  resetDispatchRegistry();
  const dispatchedAt = new Date().toISOString();
  recordDispatch({
    callId: "mock-1",
    orgId: "org-a",
    plan,
    taskType: "make_inquiry",
    complianceTaskType: "general_inquiry",
    dispatchedAt,
  });

  assert.equal(getDispatch("mock-1")?.orgId, "org-a");
  assert.equal(isRedialBlocked("org-a", plan.phoneNumber), true);
  // Scoped per tenant: another org dialing the same number is not blocked.
  assert.equal(isRedialBlocked("org-b", plan.phoneNumber), false);
});

test("redial guard expires after the 24h window", () => {
  resetDispatchRegistry();
  const dialedAt = Date.now() - 25 * 60 * 60 * 1000;
  recordDispatch({
    callId: "mock-2",
    orgId: "org-a",
    plan,
    taskType: "make_inquiry",
    complianceTaskType: "general_inquiry",
    dispatchedAt: new Date(dialedAt).toISOString(),
  });
  assert.equal(isRedialBlocked("org-a", plan.phoneNumber), false);
});

test("setAttachedEvent records the case linkage", () => {
  resetDispatchRegistry();
  recordDispatch({
    callId: "mock-3",
    orgId: "org-a",
    plan,
    taskType: "make_inquiry",
    complianceTaskType: "general_inquiry",
    dispatchedAt: new Date().toISOString(),
  });
  setAttachedEvent("mock-3", "case-1", "event-1");
  const record = getDispatch("mock-3");
  assert.equal(record?.caseId, "case-1");
  assert.equal(record?.attachedEventId, "event-1");
});
