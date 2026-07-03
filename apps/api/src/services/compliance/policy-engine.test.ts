import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { evaluate, POLICY_VERSION } from "./policy-engine.js";
import { localTimeIn, resolveCalleeLocalTimes } from "./timezone.js";
import type {
  ComplianceCallContext,
  ComplianceTaskType,
  StateCode,
} from "./types.js";

/**
 * Pure engine tests: contexts are constructed directly (the engine does no
 * I/O), with callee-local times taken from the timezone resolver at fixed
 * UTC instants so quiet-hour boundaries are exercised in the CALLEE's zone.
 */

const baseContext = (
  overrides: Partial<ComplianceCallContext> = {},
): ComplianceCallContext => ({
  orgId: "org-1",
  targetNumber: "+18645550100",
  targetState: "SC",
  taskType: "availability_inquiry",
  channel: "voice",
  requestedAtUtc: "2026-07-03T16:00:00.000Z",
  // Noon Eastern on 2026-07-03 (EDT) — mid-window everywhere it is used.
  calleeLocalTimes: [{ zone: "America/New_York", hour: 12, minute: 0 }],
  onBehalfOfEntity: "Jane Client",
  userApproved: true,
  killSwitchActive: false,
  suppressionHit: false,
  recipientConsentTier: "none",
  ...overrides,
});

const atLocal = (
  number: string,
  state: StateCode | null,
  utcIso: string,
  overrides: Partial<ComplianceCallContext> = {},
): ComplianceCallContext =>
  baseContext({
    targetNumber: number,
    targetState: state,
    requestedAtUtc: utcIso,
    calleeLocalTimes: resolveCalleeLocalTimes(number, new Date(utcIso)),
    ...overrides,
  });

describe("policy engine: allow path", () => {
  test("clean buyer-side daytime call is allowed", () => {
    const decision = evaluate(baseContext());
    assert.equal(decision.allow, true);
    assert.deepEqual(decision.reasons, []);
    assert.equal(decision.policyVersion, POLICY_VERSION);
  });

  test("decision always carries the policy version and redial delegation", () => {
    const decision = evaluate(baseContext({ userApproved: false }));
    assert.equal(decision.policyVersion, POLICY_VERSION);
    assert.equal(decision.redialGuard, "delegated_to_backend");
    assert.equal(decision.suppressionChecked, true);
  });
});

describe("policy engine: quiet hours (callee-local, R-7)", () => {
  // 2026-07-04T00:59Z = 8:59 p.m. EDT on 2026-07-03 for a Manhattan number.
  test("8:59 p.m. callee-local is allowed", () => {
    const decision = evaluate(
      atLocal("+12125550100", "NY", "2026-07-04T00:59:00.000Z"),
    );
    assert.equal(decision.allow, true);
  });

  // 2026-07-04T01:01Z = 9:01 p.m. EDT on 2026-07-03.
  test("9:01 p.m. callee-local is denied", () => {
    const decision = evaluate(
      atLocal("+12125550100", "NY", "2026-07-04T01:01:00.000Z"),
    );
    assert.equal(decision.allow, false);
    assert.deepEqual(decision.reasons, ["quiet_hours"]);
  });

  test("9:00 p.m. exactly is outside the window", () => {
    const decision = evaluate(
      atLocal("+12125550100", "NY", "2026-07-04T01:00:00.000Z"),
    );
    assert.equal(decision.allow, false);
    assert.ok(decision.reasons.includes("quiet_hours"));
  });

  test("7:59 a.m. callee-local is denied, 8:00 a.m. is allowed", () => {
    // 11:59Z / 12:00Z = 7:59 / 8:00 a.m. EDT.
    const early = evaluate(atLocal("+12125550100", "NY", "2026-07-03T11:59:00.000Z"));
    assert.ok(early.reasons.includes("quiet_hours"));
    const onTime = evaluate(atLocal("+12125550100", "NY", "2026-07-03T12:00:00.000Z"));
    assert.equal(onTime.allow, true);
  });

  test("quiet hours are evaluated in the CALLEE's zone, not the platform's", () => {
    // 2026-07-04T03:30Z is 11:30 p.m. EDT but 8:30 p.m. PDT — a Los Angeles
    // number is still callable while a New York number is not.
    const la = evaluate(atLocal("+13105550100", "CA", "2026-07-04T03:30:00.000Z"));
    assert.equal(la.allow, true);
    const ny = evaluate(atLocal("+12125550100", "NY", "2026-07-04T03:30:00.000Z"));
    assert.ok(ny.reasons.includes("quiet_hours"));
  });

  test("Florida delta: 7:59 p.m. allowed, 8:01 p.m. denied (8a-8p)", () => {
    // Miami (305) is Eastern: 23:59Z = 7:59 p.m. EDT; 00:01Z(+1d) = 8:01 p.m.
    const before = evaluate(atLocal("+13055550100", "FL", "2026-07-03T23:59:00.000Z"));
    assert.equal(before.allow, true);
    const after = evaluate(atLocal("+13055550100", "FL", "2026-07-04T00:01:00.000Z"));
    assert.deepEqual(after.reasons, ["quiet_hours"]);
    assert.equal(after.quietHoursWindow.endMinute, 20 * 60);
  });

  test("8:30 p.m. is fine federally but past the Florida window", () => {
    // 00:30Z(+1d) = 8:30 p.m. EDT: NY allows, FL denies.
    const ny = evaluate(atLocal("+12125550100", "NY", "2026-07-04T00:30:00.000Z"));
    assert.equal(ny.allow, true);
    const fl = evaluate(atLocal("+13055550100", "FL", "2026-07-04T00:30:00.000Z"));
    assert.ok(fl.reasons.includes("quiet_hours"));
  });

  test("unknown area code fails closed: window must hold in every US zone", () => {
    // 559 area codes exist, but +1999... has no NANP region. At 18:00Z it is
    // 8:00 a.m. in Hawaii (inside) and 2:00 p.m. Eastern (inside) — allowed;
    // at 15:00Z Hawaii is 5:00 a.m. — denied even though Eastern is fine.
    const inAllZones = evaluate(atLocal("+19995550100", null, "2026-07-03T18:30:00.000Z"));
    assert.equal(inAllZones.allow, true);
    const tooEarlyWest = evaluate(atLocal("+19995550100", null, "2026-07-03T15:00:00.000Z"));
    assert.ok(tooEarlyWest.reasons.includes("quiet_hours"));
  });

  test("empty callee-local-times input fails closed", () => {
    const decision = evaluate(baseContext({ calleeLocalTimes: [] }));
    assert.ok(decision.reasons.includes("quiet_hours"));
  });
});

describe("policy engine: recording-consent mode (matrix)", () => {
  const modeFor = (number: string, state: StateCode | null) =>
    evaluate(baseContext({ targetNumber: number, targetState: state })).recordingMode;

  test("one-party state records one-party disclosed", () => {
    assert.equal(modeFor("+12125550100", "NY"), "one_party_disclosed");
    assert.equal(modeFor("+18645550100", "SC"), "one_party_disclosed");
  });

  test("firm all-party states force announced all-party recording", () => {
    for (const [number, state] of [
      ["+14155550100", "CA"],
      ["+13055550100", "FL"],
      ["+13125550100", "IL"],
      ["+16175550100", "MA"],
      ["+12065550100", "WA"],
      ["+14125550100", "PA"],
      ["+14105550100", "MD"],
      ["+14065550100", "MT"],
      ["+16035550100", "NH"],
    ] as const) {
      assert.equal(modeFor(number, state), "all_party_disclosed", state);
    }
  });

  test("disputed states (CT/NV/DE/MI) fail closed to all-party", () => {
    for (const [number, state] of [
      ["+12035550100", "CT"],
      ["+17025550100", "NV"],
      ["+13025550100", "DE"],
      ["+13135550100", "MI"],
    ] as const) {
      assert.equal(modeFor(number, state), "all_party_disclosed", state);
    }
  });

  test("unknown state fails closed to all-party (R-6)", () => {
    assert.equal(modeFor("+19995550100", null), "all_party_disclosed");
  });

  test("all-party mode adds the consent-flavored recording line", () => {
    const ca = evaluate(baseContext({ targetNumber: "+14155550100", targetState: "CA" }));
    assert.ok(
      ca.disclosureLines.some((line) => line.includes("consent to the recording")),
    );
    const ny = evaluate(baseContext({ targetNumber: "+12125550100", targetState: "NY" }));
    assert.ok(ny.disclosureLines.some((line) => line === "This call is being recorded."));
  });
});

describe("policy engine: disclosures (R-12 universal opener)", () => {
  test("every call gets identity, AI, and recording lines in order", () => {
    const decision = evaluate(baseContext({ onBehalfOfEntity: "Acme Corp" }));
    assert.equal(decision.disclosureLines.length, 3);
    assert.ok(decision.disclosureLines[0]!.includes("Acme Corp"));
    assert.ok(decision.disclosureLines[1]!.includes("AI assistant"));
    assert.ok(decision.disclosureLines[2]!.includes("recorded"));
  });

  test("AI disclosure is present even where no state mandates it", () => {
    const decision = evaluate(baseContext({ targetState: "WY", targetNumber: "+13075550100" }));
    assert.ok(decision.disclosureLines.some((line) => line.includes("AI assistant")));
  });

  test("callback number is woven into the identity line when present", () => {
    const decision = evaluate(baseContext({ callbackNumber: "+18005550199" }));
    assert.ok(decision.disclosureLines[0]!.includes("+18005550199"));
  });

  test("solicitation task types add the interactive opt-out line", () => {
    const decision = evaluate(
      baseContext({
        taskType: "outbound_sales",
        recipientConsentTier: "prior_express_written",
      }),
    );
    assert.equal(decision.disclosureLines.length, 4);
    assert.ok(decision.disclosureLines[3]!.includes("do-not-call"));
  });
});

describe("policy engine: gates", () => {
  test("missing user approval denies", () => {
    const decision = evaluate(baseContext({ userApproved: false }));
    assert.deepEqual(decision.reasons, ["missing_user_approval"]);
  });

  test("tenant kill switch denies", () => {
    const decision = evaluate(baseContext({ killSwitchActive: true }));
    assert.deepEqual(decision.reasons, ["kill_switch"]);
  });

  test("suppression hit denies", () => {
    const decision = evaluate(baseContext({ suppressionHit: true }));
    assert.deepEqual(decision.reasons, ["suppressed"]);
  });

  test("surfaced redial block denies", () => {
    const decision = evaluate(baseContext({ redialBlocked: true }));
    assert.deepEqual(decision.reasons, ["redial_blocked"]);
  });

  test("non-US / malformed target number denies", () => {
    const decision = evaluate(
      baseContext({ targetNumber: "+442071234567", targetState: null }),
    );
    assert.ok(decision.reasons.includes("invalid_target_number"));
  });

  test("independent failures accumulate as distinct reasons", () => {
    const decision = evaluate(
      baseContext({
        userApproved: false,
        killSwitchActive: true,
        suppressionHit: true,
      }),
    );
    assert.equal(decision.allow, false);
    assert.deepEqual(decision.reasons, [
      "missing_user_approval",
      "kill_switch",
      "suppressed",
    ]);
  });
});

describe("policy engine: solicitation rules (R-3, R-8, R-27)", () => {
  test("WA flat ban denies AI-voice solicitation regardless of consent", () => {
    const decision = evaluate(
      baseContext({
        targetNumber: "+12065550100",
        targetState: "WA",
        taskType: "outbound_sales",
        recipientConsentTier: "prior_express_written",
      }),
    );
    assert.deepEqual(decision.reasons, ["wa_adad_ban"]);
  });

  test("WA buyer-side (non-solicitation) calls are not ADAD-banned", () => {
    const decision = evaluate(
      baseContext({ targetNumber: "+12065550100", targetState: "WA" }),
    );
    assert.equal(decision.allow, true);
  });

  test("solicitation without written consent denies", () => {
    for (const tier of ["none", "prior_express"] as const) {
      const decision = evaluate(
        baseContext({ taskType: "promotional_notice", recipientConsentTier: tier }),
      );
      assert.ok(decision.reasons.includes("consent_insufficient"), tier);
      assert.equal(decision.consentTierRequired, "prior_express_written");
    }
  });

  test("solicitation with written consent passes the consent gate", () => {
    const decision = evaluate(
      baseContext({
        taskType: "outbound_sales",
        recipientConsentTier: "prior_express_written",
      }),
    );
    assert.equal(decision.allow, true);
  });

  test("unknown task type fails safe to solicitation + written consent", () => {
    const decision = evaluate(baseContext({ taskType: "unknown" }));
    assert.ok(decision.reasons.includes("consent_insufficient"));
    assert.equal(decision.consentTierRequired, "prior_express_written");
    // A task type outside the taxonomy behaves the same way.
    const rogue = evaluate(
      baseContext({ taskType: "made_up_type" as ComplianceTaskType }),
    );
    assert.ok(rogue.reasons.includes("consent_insufficient"));
  });

  test("all buyer-side task types are non-solicitation and allowed", () => {
    const buyerSide: ComplianceTaskType[] = [
      "availability_inquiry",
      "rate_inquiry",
      "rate_negotiation",
      "appointment_booking",
      "general_inquiry",
      "complaint",
      "dispute_followup",
    ];
    for (const taskType of buyerSide) {
      const decision = evaluate(baseContext({ taskType }));
      assert.equal(decision.allow, true, taskType);
      assert.equal(decision.consentTierRequired, "prior_express");
    }
  });
});

describe("policy engine: end-to-end matrix rows via the timezone resolver", () => {
  test("a Seattle number resolves to WA + Pacific and evaluates accordingly", () => {
    const at = new Date("2026-07-04T02:30:00.000Z"); // 7:30 p.m. PDT
    const times = resolveCalleeLocalTimes("+12065550100", at);
    assert.equal(times.length, 1);
    assert.deepEqual(times[0], localTimeIn("America/Los_Angeles", at));
    const decision = evaluate(
      atLocal("+12065550100", "WA", "2026-07-04T02:30:00.000Z"),
    );
    assert.equal(decision.allow, true);
    assert.equal(decision.recordingMode, "all_party_disclosed");
  });
});
