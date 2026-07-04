import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildCaseContext,
  caseContext,
  extractNamedPromises,
} from "./case-context.js";
import { attachCall, attachSms, createCase } from "./case-service.js";
import { CaseEventRecord, CaseRecord, CasesDbClient } from "./types.js";
import { FakeCasesDb } from "./fake-cases-db.js";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

/**
 * Fixture case: a contractor dispute mid-escalation with a call (carrying a
 * named promise), an SMS, and a stage change - the shape a follow-up call
 * needs to open with case continuity and quote prior commitments.
 */
const fixtureCase: CaseRecord = {
  id: "11111111-1111-1111-1111-111111111111",
  org_id: ORG_A,
  title: "Deck repair dispute",
  counterparty_name: "Mike Rowe",
  counterparty_company: "Ajax Decks LLC",
  counterparty_phone: "+18645550100",
  counterparty_email: "mike@ajaxdecks.example",
  dispute_type: "contractor",
  escalation_stage: 2,
  amount_at_stake: 450.5,
  status: "pending_response",
  leverage_notes: "Final payment withheld; photos of unfinished railing",
  next_action_at: "2026-07-05T14:00:00.000Z",
  resolution: null,
  created_at: "2026-06-01T09:00:00.000Z",
  updated_at: "2026-06-20T09:00:00.000Z",
};

const fixtureEvents: CaseEventRecord[] = [
  {
    id: "e2",
    case_id: fixtureCase.id,
    org_id: ORG_A,
    kind: "sms",
    occurred_at: "2026-06-12T10:00:00.000Z",
    summary: "Sent photos of the unfinished railing",
    payload: { message_id: "SM900", direction: "outbound" },
    created_at: "2026-06-12T10:00:00.000Z",
  },
  {
    id: "e1",
    case_id: fixtureCase.id,
    org_id: ORG_A,
    kind: "call",
    occurred_at: "2026-06-10T16:30:00.000Z",
    summary: "Discussed unfinished railing; Mike agreed to return",
    payload: {
      call_id: "lk-room-42",
      rep_name: "Mike Rowe",
      promises: [
        {
          who: "Mike Rowe",
          what: "return to finish the railing",
          due_date: "2026-06-17",
        },
      ],
    },
    created_at: "2026-06-10T16:30:00.000Z",
  },
  {
    id: "e3",
    case_id: fixtureCase.id,
    org_id: ORG_A,
    kind: "status_change",
    occurred_at: "2026-06-19T08:00:00.000Z",
    summary: "Escalation stage 1 (Collaborative) -> 2 (Firm professional)",
    payload: { from_stage: 1, to_stage: 2, override: false },
    created_at: "2026-06-19T08:00:00.000Z",
  },
];

describe("buildCaseContext", () => {
  const block = buildCaseContext(fixtureCase, fixtureEvents);
  const lines = block.split("\n");

  test("opens with case continuity and identity anchors", () => {
    assert.match(lines[0]!, /^PRIOR CASE CONTEXT/);
    assert.match(block, /Case: Deck repair dispute \(ref 11111111-1111-1111-1111-111111111111, opened 2026-06-01\)/);
    assert.match(
      block,
      /Counterparty: Mike Rowe, \(Ajax Decks LLC\), phone \+18645550100, email mike@ajaxdecks\.example/,
    );
    assert.match(
      block,
      /Dispute type: contractor \| Status: pending_response \| Escalation stage: 2 of 4 \(Firm professional\)/,
    );
    assert.match(block, /Amount at stake: \$450\.50/);
    assert.match(block, /Leverage: Final payment withheld/);
    assert.match(block, /Next action due: 2026-07-05/);
  });

  test("renders the ledger chronologically regardless of input order", () => {
    const ledgerStart = lines.indexOf("Prior interactions (oldest first):");
    assert.ok(ledgerStart > 0);
    assert.match(
      lines[ledgerStart + 1]!,
      /^- 2026-06-10 \[call\] Discussed unfinished railing.*spoke with Mike Rowe, call ref lk-room-42/,
    );
    assert.match(
      lines[ledgerStart + 2]!,
      /^- 2026-06-12 \[sms\] Sent photos of the unfinished railing \(outbound sms ref SM900\)/,
    );
    assert.match(lines[ledgerStart + 3]!, /^- 2026-06-19 \[status_change\]/);
  });

  test("quotes named promises with who, what, and due date", () => {
    assert.match(
      block,
      /Named promises to quote and hold them to:\n- On 2026-06-10, Mike Rowe committed to: return to finish the railing \(due 2026-06-17\)/,
    );
  });

  test("keeps the block plain ASCII (safe for prompts and pasting)", () => {
    assert.ok(
      // eslint-disable-next-line no-control-regex
      /^[\x00-\x7F]*$/.test(block),
      "context block must contain only ASCII characters",
    );
  });

  test("handles an empty timeline and omits absent sections", () => {
    const bare = buildCaseContext(
      {
        ...fixtureCase,
        counterparty_name: null,
        counterparty_company: null,
        counterparty_phone: null,
        counterparty_email: null,
        amount_at_stake: null,
        leverage_notes: null,
        next_action_at: null,
      },
      [],
    );
    assert.match(bare, /Prior interactions \(oldest first\):\n- None recorded yet\./);
    assert.ok(!bare.includes("Counterparty:"));
    assert.ok(!bare.includes("Amount at stake:"));
    assert.ok(!bare.includes("Named promises"));
  });

  test("includes the resolution when one is on file", () => {
    const resolved = buildCaseContext(
      { ...fixtureCase, resolution: "Refund of $450 received 2026-06-30" },
      [],
    );
    assert.match(resolved, /Resolution on file: Refund of \$450 received 2026-06-30/);
  });
});

describe("extractNamedPromises", () => {
  test("skips malformed promises and events without any", () => {
    const promises = extractNamedPromises([
      fixtureEvents[0]!,
      {
        ...fixtureEvents[1]!,
        payload: {
          promises: [
            { who: "", what: "vague" },
            { who: "Dana", what: "call back with ETA" },
          ],
        },
      },
    ]);
    assert.deepEqual(promises, [
      "- On 2026-06-10, Dana committed to: call back with ETA",
    ]);
  });
});

describe("caseContext (loader)", () => {
  test("loads a case with its timeline and renders the block", async () => {
    const db = new FakeCasesDb();
    const client = db as unknown as CasesDbClient;
    const created = await createCase(client, ORG_A, {
      title: "Warranty follow-up",
      counterpartyCompany: "CoolCo Appliances",
      disputeType: "retail",
    });
    await attachCall(client, ORG_A, created.id, {
      callId: "call-1",
      summary: "Opened claim, ref CC-77",
      occurredAt: "2026-06-02T12:00:00.000Z",
      repName: "Dana",
      promises: [{ who: "Dana", what: "email claim form", dueDate: "2026-06-03" }],
    });
    await attachSms(client, ORG_A, created.id, {
      messageId: "SM1",
      direction: "inbound",
      summary: "Received claim form link",
      occurredAt: "2026-06-03T12:00:00.000Z",
    });

    const block = await caseContext(client, ORG_A, created.id);
    assert.ok(block);
    assert.match(block!, /Warranty follow-up/);
    assert.match(block!, /- 2026-06-02 \[call\] Opened claim, ref CC-77/);
    assert.match(block!, /- 2026-06-03 \[sms\] Received claim form link/);
    assert.match(block!, /On 2026-06-02, Dana committed to: email claim form/);
  });

  test("returns null for a case outside the org", async () => {
    const db = new FakeCasesDb();
    const client = db as unknown as CasesDbClient;
    const created = await createCase(client, ORG_A, { title: "Mine" });
    assert.equal(
      await caseContext(client, "cccccccc-cccc-cccc-cccc-cccccccccccc", created.id),
      null,
    );
  });
});
