import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  CaseNotFoundError,
  InvalidStageTransitionError,
  appendCaseEvent,
  assertStageTransition,
  attachCall,
  attachSms,
  createCase,
  deleteCase,
  getCase,
  listCaseEvents,
  listCases,
  setNextAction,
  sortCasesForList,
  transitionStage,
  updateCase,
} from "./case-service.js";
import { CaseRecord, CasesDbClient } from "./types.js";
import { FakeCasesDb } from "./fake-cases-db.js";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const asClient = (db: FakeCasesDb): CasesDbClient =>
  db as unknown as CasesDbClient;

async function seedCase(db: FakeCasesDb, orgId = ORG_A, title = "Fridge repair") {
  return createCase(asClient(db), orgId, {
    title,
    counterpartyName: "Mike",
    counterpartyCompany: "Ajax Appliance",
    disputeType: "contractor",
    amountAtStake: 450,
    leverageNotes: "Final payment withheld",
  });
}

describe("createCase", () => {
  test("inserts an org-scoped row with playbook defaults", async () => {
    const db = new FakeCasesDb();
    const created = await seedCase(db);

    assert.equal(created.org_id, ORG_A);
    assert.equal(created.title, "Fridge repair");
    assert.equal(created.dispute_type, "contractor");
    assert.equal(created.escalation_stage, 1);
    assert.equal(created.status, "open");
    assert.equal(created.amount_at_stake, 450);
    assert.equal(created.next_action_at, null);
    assert.ok(created.id, "row gets an id");
  });

  test("rejects missing title, bad dispute type, stage, and amount", async () => {
    const db = asClient(new FakeCasesDb());
    await assert.rejects(
      () => createCase(db, ORG_A, { title: "  " }),
      /title is required/,
    );
    await assert.rejects(
      () =>
        createCase(db, ORG_A, {
          title: "x",
          // @ts-expect-error deliberately invalid
          disputeType: "feud",
        }),
      /unknown dispute type/,
    );
    await assert.rejects(
      () => createCase(db, ORG_A, { title: "x", escalationStage: 5 }),
      /escalation stage must be 1-4/,
    );
    await assert.rejects(
      () => createCase(db, ORG_A, { title: "x", amountAtStake: -5 }),
      /non-negative/,
    );
    await assert.rejects(
      () => createCase(db, "", { title: "x" }),
      /orgId is required/,
    );
  });
});

describe("sortCasesForList", () => {
  const stub = (id: string, nextActionAt: string | null, createdAt: string) =>
    ({
      id,
      next_action_at: nextActionAt,
      created_at: createdAt,
    }) as CaseRecord;

  test("overdue first (most overdue on top), then upcoming, then unscheduled newest-first", () => {
    const now = new Date("2026-07-03T12:00:00Z");
    const sorted = sortCasesForList(
      [
        stub("unscheduled-old", null, "2026-06-01T00:00:00Z"),
        stub("upcoming", "2026-07-10T00:00:00Z", "2026-06-02T00:00:00Z"),
        stub("overdue-recent", "2026-07-02T00:00:00Z", "2026-06-03T00:00:00Z"),
        stub("unscheduled-new", null, "2026-06-20T00:00:00Z"),
        stub("overdue-old", "2026-06-15T00:00:00Z", "2026-06-04T00:00:00Z"),
      ],
      now,
    );
    assert.deepEqual(
      sorted.map((c) => c.id),
      [
        "overdue-old",
        "overdue-recent",
        "upcoming",
        "unscheduled-new",
        "unscheduled-old",
      ],
    );
  });
});

describe("listCases / getCase org scoping", () => {
  test("lists only the requested org's cases and filters by status", async () => {
    const db = new FakeCasesDb();
    await seedCase(db, ORG_A, "A case");
    await seedCase(db, ORG_B, "B case");
    const resolved = await createCase(asClient(db), ORG_A, {
      title: "Done case",
      status: "resolved",
    });

    const all = await listCases(asClient(db), ORG_A);
    assert.deepEqual(new Set(all.map((c) => c.title)), new Set(["A case", "Done case"]));

    const resolvedOnly = await listCases(asClient(db), ORG_A, {
      status: "resolved",
    });
    assert.deepEqual(
      resolvedOnly.map((c) => c.id),
      [resolved.id],
    );
  });

  test("getCase does not return another org's case", async () => {
    const db = new FakeCasesDb();
    const created = await seedCase(db, ORG_A);
    assert.equal(await getCase(asClient(db), ORG_B, created.id), null);
    const own = await getCase(asClient(db), ORG_A, created.id);
    assert.equal(own?.id, created.id);
  });
});

describe("updateCase / deleteCase", () => {
  test("updates whitelisted fields only and bumps nothing else", async () => {
    const db = new FakeCasesDb();
    const created = await seedCase(db);

    const updated = await updateCase(asClient(db), ORG_A, created.id, {
      status: "pending_response",
      leverageNotes: "Sent stage-2 follow-up",
      resolution: null,
    });
    assert.equal(updated?.status, "pending_response");
    assert.equal(updated?.leverage_notes, "Sent stage-2 follow-up");
    assert.equal(updated?.escalation_stage, 1, "stage untouched by updates");
  });

  test("rejects empty patches and invalid values; null for unknown case", async () => {
    const db = new FakeCasesDb();
    const created = await seedCase(db);

    await assert.rejects(
      () => updateCase(asClient(db), ORG_A, created.id, {}),
      /no fields to update/,
    );
    await assert.rejects(
      () =>
        updateCase(asClient(db), ORG_A, created.id, {
          // @ts-expect-error deliberately invalid
          status: "escalating",
        }),
      /unknown status/,
    );
    assert.equal(
      await updateCase(asClient(db), ORG_A, "00000000-0000-0000-0000-000000000009", {
        title: "nope",
      }),
      null,
    );
  });

  test("deleteCase removes the case and reports missing ones", async () => {
    const db = new FakeCasesDb();
    const created = await seedCase(db);
    assert.equal(await deleteCase(asClient(db), ORG_A, created.id), true);
    assert.equal(await deleteCase(asClient(db), ORG_A, created.id), false);
    assert.equal(await getCase(asClient(db), ORG_A, created.id), null);
  });
});

describe("timeline", () => {
  test("appendCaseEvent writes a row and requires an existing case", async () => {
    const db = new FakeCasesDb();
    const created = await seedCase(db);

    const event = await appendCaseEvent(asClient(db), ORG_A, created.id, {
      kind: "note",
      summary: "Called office, left voicemail",
    });
    assert.equal(event.case_id, created.id);
    assert.equal(event.org_id, ORG_A);
    assert.equal(event.kind, "note");
    assert.deepEqual(event.payload, {});

    await assert.rejects(
      () =>
        appendCaseEvent(asClient(db), ORG_A, "00000000-0000-0000-0000-000000000009", {
          kind: "note",
          summary: "orphan",
        }),
      CaseNotFoundError,
    );
    await assert.rejects(
      () =>
        appendCaseEvent(asClient(db), ORG_A, created.id, {
          // @ts-expect-error deliberately invalid
          kind: "carrier_pigeon",
          summary: "x",
        }),
      /unknown event kind/,
    );
  });

  test("listCaseEvents orders by occurred_at (newest-first on demand)", async () => {
    const db = new FakeCasesDb();
    const created = await seedCase(db);
    await appendCaseEvent(asClient(db), ORG_A, created.id, {
      kind: "note",
      summary: "first",
      occurredAt: "2026-06-01T10:00:00.000Z",
    });
    await appendCaseEvent(asClient(db), ORG_A, created.id, {
      kind: "note",
      summary: "second",
      occurredAt: "2026-06-05T10:00:00.000Z",
    });

    const asc = await listCaseEvents(asClient(db), ORG_A, created.id);
    assert.deepEqual(
      asc.map((e) => e.summary),
      ["first", "second"],
    );

    const desc = await listCaseEvents(asClient(db), ORG_A, created.id, {
      newestFirst: true,
    });
    assert.deepEqual(
      desc.map((e) => e.summary),
      ["second", "first"],
    );
  });
});

describe("assertStageTransition", () => {
  test("allows single forward steps without override", () => {
    assert.doesNotThrow(() => assertStageTransition(1, 2, false));
    assert.doesNotThrow(() => assertStageTransition(3, 4, false));
  });

  test("rejects skips, backwards moves, same stage, and out-of-range", () => {
    assert.throws(
      () => assertStageTransition(1, 3, false),
      InvalidStageTransitionError,
    );
    assert.throws(
      () => assertStageTransition(3, 2, false),
      InvalidStageTransitionError,
    );
    assert.throws(
      () => assertStageTransition(2, 2, false),
      /already at stage 2/,
    );
    assert.throws(() => assertStageTransition(4, 5, true), /between 1 and 4/);
    assert.throws(() => assertStageTransition(1, 0, true), /between 1 and 4/);
  });

  test("override permits skips and de-escalation within range", () => {
    assert.doesNotThrow(() => assertStageTransition(1, 3, true));
    assert.doesNotThrow(() => assertStageTransition(4, 1, true));
  });
});

describe("transitionStage", () => {
  test("advances the stage and logs a status_change event", async () => {
    const db = new FakeCasesDb();
    const created = await seedCase(db);

    const { caseRecord, event } = await transitionStage(
      asClient(db),
      ORG_A,
      created.id,
      { targetStage: 2, note: "No reply to stage-1 email" },
    );
    assert.equal(caseRecord.escalation_stage, 2);
    assert.equal(event.kind, "status_change");
    assert.match(event.summary, /1 \(Collaborative\) -> 2 \(Firm professional\)/);
    assert.match(event.summary, /No reply to stage-1 email/);
    assert.deepEqual(event.payload, {
      from_stage: 1,
      to_stage: 2,
      override: false,
    });
  });

  test("blocks non-monotonic transitions unless override is set", async () => {
    const db = new FakeCasesDb();
    const created = await seedCase(db);

    await assert.rejects(
      () =>
        transitionStage(asClient(db), ORG_A, created.id, { targetStage: 4 }),
      InvalidStageTransitionError,
    );
    const unchanged = await getCase(asClient(db), ORG_A, created.id);
    assert.equal(unchanged?.escalation_stage, 1, "failed transition is a no-op");

    const { caseRecord, event } = await transitionStage(
      asClient(db),
      ORG_A,
      created.id,
      { targetStage: 4, override: true },
    );
    assert.equal(caseRecord.escalation_stage, 4);
    assert.equal(event.payload.override, true);
    assert.match(event.summary, /\[override\]/);
  });
});

describe("setNextAction", () => {
  test("sets and clears the next action", async () => {
    const db = new FakeCasesDb();
    const created = await seedCase(db);

    const set = await setNextAction(
      asClient(db),
      ORG_A,
      created.id,
      "2026-07-10T09:00:00.000Z",
    );
    assert.equal(set?.next_action_at, "2026-07-10T09:00:00.000Z");

    const cleared = await setNextAction(asClient(db), ORG_A, created.id, null);
    assert.equal(cleared?.next_action_at, null);
  });

  test("rejects invalid timestamps and unknown cases", async () => {
    const db = new FakeCasesDb();
    const created = await seedCase(db);
    await assert.rejects(
      () => setNextAction(asClient(db), ORG_A, created.id, "next tuesday-ish"),
      /invalid timestamp/,
    );
    assert.equal(
      await setNextAction(
        asClient(db),
        ORG_A,
        "00000000-0000-0000-0000-000000000009",
        null,
      ),
      null,
    );
  });
});

describe("attach helpers", () => {
  test("attachCall records call refs and named promises", async () => {
    const db = new FakeCasesDb();
    const created = await seedCase(db);

    const event = await attachCall(asClient(db), ORG_A, created.id, {
      callId: "lk-room-123",
      summary: "Spoke with Mike; refund agreed",
      occurredAt: "2026-06-20T15:00:00.000Z",
      repName: "Mike",
      promises: [
        { who: "Mike", what: "mail refund check", dueDate: "2026-06-27" },
      ],
    });
    assert.equal(event.kind, "call");
    assert.equal(event.payload.call_id, "lk-room-123");
    assert.equal(event.payload.rep_name, "Mike");
    assert.deepEqual(event.payload.promises, [
      { who: "Mike", what: "mail refund check", due_date: "2026-06-27" },
    ]);
    await assert.rejects(
      () =>
        attachCall(asClient(db), ORG_A, created.id, {
          callId: " ",
          summary: "x",
        }),
      /callId is required/,
    );
  });

  test("attachSms records message refs with direction", async () => {
    const db = new FakeCasesDb();
    const created = await seedCase(db);

    const event = await attachSms(asClient(db), ORG_A, created.id, {
      messageId: "SM123",
      direction: "outbound",
      summary: "Sent damage photos",
    });
    assert.equal(event.kind, "sms");
    assert.deepEqual(event.payload, {
      message_id: "SM123",
      direction: "outbound",
    });
    await assert.rejects(
      () =>
        attachSms(asClient(db), ORG_A, created.id, {
          messageId: "SM124",
          // @ts-expect-error deliberately invalid
          direction: "sideways",
          summary: "x",
        }),
      /invalid direction/,
    );
  });
});

describe("database error surfacing", () => {
  test("propagates query errors with the operation name", async () => {
    const db = new FakeCasesDb();
    db.nextError = { message: "connection refused" };
    await assert.rejects(
      () => listCases(asClient(db), ORG_A),
      /listCases: connection refused/,
    );
  });
});
