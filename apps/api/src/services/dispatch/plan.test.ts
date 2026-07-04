import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDispatchPlan,
  classifyTask,
  COMPLIANCE_TASK_TYPE_BY_TASK,
} from "./plan.js";

test("classifyTask routes refund language to request_refund", () => {
  const analysis = classifyTask(
    "Call Acme and request a refund for the failed dryer repair",
  );
  assert.equal(analysis.taskType, "request_refund");
  assert.equal(analysis.difficulty, "complex");
});

test("classifyTask routes scheduling language to schedule_appointment", () => {
  assert.equal(
    classifyTask("Reschedule my appointment to Tuesday afternoon").taskType,
    "schedule_appointment",
  );
});

test("classifyTask is deterministic and falls back to general_task", () => {
  const description = "Handle the thing with the vendor";
  assert.equal(classifyTask(description).taskType, "general_task");
  assert.deepEqual(classifyTask(description), classifyTask(description));
});

test("buildDispatchPlan surfaces disclosure line and ungranted pre-auths", () => {
  const plan = buildDispatchPlan({
    taskDescription: "Request a refund for the broken dryer delivery",
    contactName: "Acme Appliances",
    clientName: "Jordan Lee",
  });
  assert.equal(plan.taskAnalysis.taskType, "request_refund");
  assert.equal(plan.playbookId, "disputes");
  assert.ok(plan.generatedPrompt.disclosureLine?.includes("AI assistant"));
  assert.ok(plan.generatedPrompt.disclosureLine?.includes("recorded"));
  const preAuths = plan.generatedPrompt.preAuthorizations ?? [];
  assert.ok(preAuths.length >= 2);
  for (const auth of preAuths) {
    assert.equal(auth.requiresExplicitGrant, true);
    assert.equal(auth.granted, false);
  }
  assert.ok(plan.mustAsk.length > 0);
  assert.equal(plan.complianceTaskType, "dispute_followup");
});

test("buildDispatchPlan grants only the requested pre-auth keys", () => {
  const plan = buildDispatchPlan({
    taskDescription: "Request a refund for the broken dryer delivery",
    contactName: "Acme Appliances",
    grantedPreAuthorizations: ["cancel_if_needed"],
  });
  const byKey = new Map(
    (plan.generatedPrompt.preAuthorizations ?? []).map((auth) => [
      auth.key,
      auth.granted,
    ]),
  );
  assert.equal(byKey.get("cancel_if_needed"), true);
  assert.equal(byKey.get("chargeback_or_regulator"), false);
});

test("every direct task type maps to a non-solicitation compliance type", () => {
  for (const complianceType of Object.values(COMPLIANCE_TASK_TYPE_BY_TASK)) {
    assert.notEqual(complianceType, "outbound_sales");
    assert.notEqual(complianceType, "promotional_notice");
    assert.notEqual(complianceType, "unknown");
  }
});
