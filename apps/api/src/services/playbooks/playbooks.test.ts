import assert from "node:assert/strict";
import test from "node:test";
import type { TaskType } from "../direct-task/types.js";
import {
  ALL_PLAYBOOKS,
  CONTRACTORS_PLAYBOOK,
  CORE_PLAYBOOK,
  CorePlaybookSchema,
  DISPUTES_PLAYBOOK,
  ERRANDS_PLAYBOOK,
  FOLLOWUP_PLAYBOOK,
  PlaybookSchema,
  TRAVEL_PLAYBOOK,
  selectPlaybook,
} from "./index.js";

const ALL_TASK_TYPES: TaskType[] = [
  "negotiate_price",
  "request_refund",
  "complain_issue",
  "schedule_appointment",
  "cancel_service",
  "make_inquiry",
  "deliver_message",
  "general_task",
];

// ---------------------------------------------------------------------------
// Schema validation: all 9 scenario playbooks + the core floor
// ---------------------------------------------------------------------------

for (const playbook of ALL_PLAYBOOKS) {
  test(`playbook "${playbook.id}" passes Zod schema validation`, () => {
    const result = PlaybookSchema.safeParse(playbook);
    assert.ok(
      result.success,
      `schema errors: ${result.success ? "" : JSON.stringify(result.error.issues)}`
    );
  });
}

test("there are exactly 9 scenario playbooks with unique ids", () => {
  assert.equal(ALL_PLAYBOOKS.length, 9);
  const ids = new Set(ALL_PLAYBOOKS.map((p) => p.id));
  assert.equal(ids.size, 9);
});

test("core floor passes Zod schema validation", () => {
  const result = CorePlaybookSchema.safeParse(CORE_PLAYBOOK);
  assert.ok(
    result.success,
    `schema errors: ${result.success ? "" : JSON.stringify(result.error.issues)}`
  );
});

test("core floor covers a persona for every task type", () => {
  for (const taskType of ALL_TASK_TYPES) {
    assert.ok(
      CORE_PLAYBOOK.personaByTask[taskType],
      `missing persona for ${taskType}`
    );
  }
});

test("playbook and core content is ASCII-only (lands verbatim in prompts)", () => {
  for (const playbook of ALL_PLAYBOOKS) {
    assert.doesNotMatch(
      JSON.stringify(playbook),
      // eslint-disable-next-line no-control-regex
      /[^\x00-\x7F]/,
      `non-ASCII content in playbook ${playbook.id}`
    );
  }
  assert.doesNotMatch(JSON.stringify(CORE_PLAYBOOK), /[^\x00-\x7F]/);
});

test("substance survives: batteries, pre-auth flags, disqualifiers, criteria", () => {
  // Contractors keeps its fee + vetting batteries and hard disqualifiers.
  assert.ok(CONTRACTORS_PLAYBOOK.questionBattery.length >= 3);
  assert.ok(
    CONTRACTORS_PLAYBOOK.disqualifiers.some(
      (d) => d.severity === "hard_disqualify"
    )
  );
  // Disputes keeps its explicit-grant pre-authorizations (cancel bluff etc).
  assert.ok(DISPUTES_PLAYBOOK.preAuthorizations.length >= 2);
  assert.ok(
    DISPUTES_PLAYBOOK.preAuthorizations.every((a) => a.requiresExplicitGrant)
  );
  // Every playbook keeps success criteria and a source reference.
  for (const playbook of ALL_PLAYBOOKS) {
    assert.ok(playbook.successCriteria.length >= 1, playbook.id);
    assert.match(playbook.sourceRef, /call-business/);
  }
});

// ---------------------------------------------------------------------------
// selectPlaybook: task-type mapping
// ---------------------------------------------------------------------------

test("dispute task types map to the disputes playbook", () => {
  const disputeTypes: TaskType[] = [
    "negotiate_price",
    "request_refund",
    "complain_issue",
  ];
  for (const taskType of disputeTypes) {
    assert.equal(
      selectPlaybook(taskType, "sort out the cable bill overcharge")?.id,
      "disputes",
      taskType
    );
  }
});

test("errand task types map to the errands playbook", () => {
  const errandTypes: TaskType[] = [
    "schedule_appointment",
    "make_inquiry",
    "deliver_message",
  ];
  for (const taskType of errandTypes) {
    assert.equal(
      selectPlaybook(taskType, "set up a table for four at the restaurant")?.id,
      "errands",
      taskType
    );
  }
});

test("cancel_service routes to disputes when leverage intent is present", () => {
  assert.equal(
    selectPlaybook(
      "cancel_service",
      "cancel the internet unless they can offer a better price"
    )?.id,
    "disputes"
  );
});

test("cancel_service routes to errands for a plain cancellation", () => {
  assert.equal(
    selectPlaybook(
      "cancel_service",
      "cancel the gym membership effective next month"
    )?.id,
    "errands"
  );
});

test("general_task with no scenario signal is core-only (null)", () => {
  assert.equal(
    selectPlaybook("general_task", "let the front office know we said thanks"),
    null
  );
});

test("every task type returns a defined selection without throwing", () => {
  for (const taskType of ALL_TASK_TYPES) {
    const selected = selectPlaybook(taskType, "a plain everyday request");
    if (taskType === "general_task") {
      assert.equal(selected, null);
    } else {
      assert.ok(selected, `no playbook for ${taskType}`);
    }
  }
});

// ---------------------------------------------------------------------------
// selectPlaybook: description-based scenario detection
// ---------------------------------------------------------------------------

test("contractor-vetting descriptions route to the contractors playbook", () => {
  assert.equal(
    selectPlaybook("make_inquiry", "vet a plumber and get a repair quote")?.id,
    "contractors"
  );
  assert.equal(
    selectPlaybook(
      "general_task",
      "call the roofing contractor about the estimate"
    )?.id,
    "contractors"
  );
});

test("scenario keywords beat the generic task-type mapping", () => {
  // A refund about a flight runs on travel doctrine (DOT rules), not disputes.
  assert.equal(
    selectPlaybook("request_refund", "get a refund for the cancelled flight")?.id,
    TRAVEL_PLAYBOOK.id
  );
  // A status chase on an existing case runs on the follow-up doctrine.
  assert.equal(
    selectPlaybook("make_inquiry", "follow up on existing case 4821")?.id,
    FOLLOWUP_PLAYBOOK.id
  );
  // Warranty language routes to the warranty playbook.
  assert.equal(
    selectPlaybook("complain_issue", "the dishwasher is defective and under warranty")?.id,
    "warranty"
  );
  // Medical booking routes to the medical playbook.
  assert.equal(
    selectPlaybook("schedule_appointment", "book a dentist cleaning for next month")?.id,
    "medical"
  );
  // Insurance language routes to the insurance playbook.
  assert.equal(
    selectPlaybook("make_inquiry", "check the insurance claim status with the adjuster")?.id,
    "insurance"
  );
  // Government agencies route to the government playbook.
  assert.equal(
    selectPlaybook("make_inquiry", "ask the DMV which forms are needed")?.id,
    "government"
  );
});

test("errands stays the home for plain bookings despite generic words", () => {
  assert.equal(
    selectPlaybook(
      "schedule_appointment",
      "book a haircut for Saturday morning"
    )?.id,
    ERRANDS_PLAYBOOK.id
  );
});
