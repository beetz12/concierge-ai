import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  FEDERAL_QUIET_HOURS,
  FLORIDA_QUIET_HOURS,
  requiresAllPartyRecording,
  STATE_RULES,
} from "./state-rules.js";
import { TASK_TYPE_RULES } from "./task-types.js";

describe("state rules: matrix integrity", () => {
  test("covers all 50 states + DC (51 rows)", () => {
    const codes = Object.keys(STATE_RULES);
    assert.equal(codes.length, 51);
    assert.ok(codes.includes("DC"));
    for (const [code, stateRule] of Object.entries(STATE_RULES)) {
      assert.equal(stateRule.code, code);
    }
  });

  test("exactly the matrix's 13 all-party states, incl. disputed CT/NV/DE/MI", () => {
    const allParty = Object.values(STATE_RULES)
      .filter((stateRule) => requiresAllPartyRecording(stateRule.recordingConsent))
      .map((stateRule) => stateRule.code)
      .sort();
    assert.deepEqual(allParty, [
      "CA", "CT", "DE", "FL", "IL", "MA", "MD", "MI", "MT", "NH", "NV", "PA", "WA",
    ]);
    const disputed = Object.values(STATE_RULES)
      .filter((stateRule) => stateRule.recordingConsent === "all_party_disputed")
      .map((stateRule) => stateRule.code)
      .sort();
    assert.deepEqual(disputed, ["CT", "DE", "MI", "NV"]);
  });

  test("Oregon is one-party for telephone despite two-party lists", () => {
    assert.equal(STATE_RULES.OR.recordingConsent, "one_party");
  });

  test("only Florida deviates from the federal quiet-hours window (8a-8p)", () => {
    assert.deepEqual(FEDERAL_QUIET_HOURS, { startMinute: 480, endMinute: 1260 });
    assert.deepEqual(STATE_RULES.FL.quietHours, FLORIDA_QUIET_HOURS);
    assert.deepEqual(FLORIDA_QUIET_HOURS, { startMinute: 480, endMinute: 1200 });
    for (const stateRule of Object.values(STATE_RULES)) {
      if (stateRule.code === "FL") continue;
      assert.deepEqual(stateRule.quietHours, FEDERAL_QUIET_HOURS, stateRule.code);
    }
  });

  test("only Washington carries the ADAD solicitation flat ban", () => {
    const banned = Object.values(STATE_RULES)
      .filter((stateRule) => stateRule.adadSolicitationBan)
      .map((stateRule) => stateRule.code);
    assert.deepEqual(banned, ["WA"]);
  });

  test("CA/UT/CO independently mandate AI disclosure", () => {
    const mandated = Object.values(STATE_RULES)
      .filter((stateRule) => stateRule.aiDisclosureMandated)
      .map((stateRule) => stateRule.code)
      .sort();
    assert.deepEqual(mandated, ["CA", "CO", "UT"]);
  });
});

describe("task-type taxonomy (R-27)", () => {
  test("every task type declares both solicitation flag and consent tier", () => {
    assert.equal(Object.keys(TASK_TYPE_RULES).length, 10);
    for (const [taskType, taskRule] of Object.entries(TASK_TYPE_RULES)) {
      assert.equal(typeof taskRule.isSolicitation, "boolean", taskType);
      assert.ok(
        ["prior_express", "prior_express_written"].includes(taskRule.defaultConsentTier),
        taskType,
      );
    }
  });

  test("solicitation types require written consent; unknown fails safe", () => {
    for (const taskType of ["outbound_sales", "promotional_notice", "unknown"] as const) {
      assert.equal(TASK_TYPE_RULES[taskType].isSolicitation, true, taskType);
      assert.equal(
        TASK_TYPE_RULES[taskType].defaultConsentTier,
        "prior_express_written",
        taskType,
      );
    }
  });
});
