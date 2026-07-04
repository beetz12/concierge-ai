import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { CallBackend, CallPlan } from "../src/services/call-backend/types.js";
import {
  ComplianceDenyError,
  CompliantCallDispatcher,
  hashCallPlan,
} from "../src/services/compliance/dispatch.js";
import { POLICY_VERSION } from "../src/services/compliance/policy-engine.js";
import { resolveLocalSupabaseKeys } from "./helpers/local-supabase.js";

/**
 * Compliance dispatch integration tests.
 *
 * Run against the LOCAL Supabase stack (supabase start; ports come from
 * supabase/config.toml), like tests/rls.test.ts. They exercise the dispatch
 * orchestrator end to end with a mock CallBackend: policy evaluation happens
 * BEFORE any backend dispatch, denies write audit rows with typed reasons,
 * and allows write authorization + audit rows and inject disclosure lines
 * into the dispatched plan.
 */

const { url: SUPABASE_URL, anonKey: ANON_KEY, serviceKey: SERVICE_KEY } =
  resolveLocalSupabaseKeys();

// Skip the live-DB suite when no local Supabase service key is available
// (e.g. CI, where `supabase start` is not run). Without this guard the
// top-level createClient(...) throws "supabaseKey is required" at import time.
const SKIP = !SERVICE_KEY;

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

const admin = SKIP
  ? (undefined as unknown as SupabaseClient)
  : createClient(SUPABASE_URL, SERVICE_KEY, clientOptions);

// Fixed UTC instants (July 2026 = US daylight time).
const NOON_EASTERN = new Date("2026-07-03T16:00:00.000Z"); // 12:00 p.m. EDT
const LATE_EASTERN = new Date("2026-07-04T01:30:00.000Z"); // 9:30 p.m. EDT
const AFTERNOON_PACIFIC = new Date("2026-07-03T20:00:00.000Z"); // 1:00 p.m. PDT

const makePlan = (phoneNumber: string, overrides: Partial<CallPlan> = {}): CallPlan => ({
  businessName: "Ajax Plumbing",
  phoneNumber,
  objective: "Ask about drain repair availability this week",
  context: "Client has a slow kitchen drain.",
  mustAsk: ["Are you taking new customers?"],
  callerIdentity: "Jane Client",
  voicemailPolicy: "hang_up",
  preAuthorizations: [],
  userApproved: true,
  ...overrides,
});

describe("compliance-gated dispatch (local Supabase stack)", { skip: SKIP && "compliance-dispatch.test.ts (skipped: no local Supabase)" }, () => {
  let userId: string;
  let orgId: string;
  let currentNow = NOON_EASTERN;
  let dispatcher: CompliantCallDispatcher;
  const dispatchedPlans: CallPlan[] = [];

  const mockBackend: CallBackend = {
    id: "retell",
    capabilities: {
      supportsPause: false,
      supportsSupervision: false,
      supportsWarmTransfer: false,
      supportsDtmf: false,
    },
    dispatchCall: async (plan) => {
      dispatchedPlans.push(plan);
      return { callId: `mock-call-${dispatchedPlans.length}` };
    },
    getStatus: () => Promise.reject(new Error("not used")),
    getArtifacts: () => Promise.reject(new Error("not used")),
    cancelCall: () => Promise.resolve(),
  };

  const auditRowsFor = async (targetNumber: string) => {
    const { data, error } = await admin
      .from("dispatch_audit_log")
      .select("*")
      .eq("org_id", orgId)
      .eq("target_number", targetNumber)
      .order("created_at", { ascending: true });
    assert.ifError(error);
    return data ?? [];
  };

  before(async () => {
    try {
      await fetch(`${SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: ANON_KEY },
      });
    } catch {
      throw new Error(
        `Local Supabase stack is not reachable at ${SUPABASE_URL}. ` +
          "Run `supabase start` (and `supabase db reset --local`) first.",
      );
    }

    const email = `compliance-${randomUUID()}@example.com`;
    const password = `pw-${randomUUID()}`;
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    assert.ifError(createError);
    userId = created.user!.id;

    const userClient: SupabaseClient = createClient(SUPABASE_URL, ANON_KEY, clientOptions);
    const { error: signInError } = await userClient.auth.signInWithPassword({
      email,
      password,
    });
    assert.ifError(signInError);
    const { data: org, error: orgError } = await userClient.rpc(
      "create_organization",
      { org_name: "Compliance Test Org" },
    );
    assert.ifError(orgError);
    orgId = org.id;

    // The dispatcher runs with the API's service-role client, as in the app.
    dispatcher = new CompliantCallDispatcher({
      supabase: admin,
      backend: mockBackend,
      now: () => currentNow,
    });
  });

  after(async () => {
    if (orgId) {
      // Org delete cascades suppression/authorization/audit rows.
      await admin.from("organizations").delete().eq("id", orgId);
    }
    // Platform-wide suppression rows have no org to cascade from.
    await admin
      .from("suppression_entries")
      .delete()
      .is("org_id", null)
      .eq("phone_number", "+18645550172");
    if (userId) {
      await admin.auth.admin.deleteUser(userId);
    }
  });

  test("quiet-hours deny: no dispatch, audit row records the reason", async () => {
    const target = "+12125550171"; // Manhattan (Eastern)
    currentNow = LATE_EASTERN; // 9:30 p.m. callee-local

    const before = dispatchedPlans.length;
    await assert.rejects(
      dispatcher.dispatch({
        plan: makePlan(target),
        orgId,
        userId,
        taskType: "availability_inquiry",
      }),
      (error: unknown) => {
        assert.ok(error instanceof ComplianceDenyError);
        assert.deepEqual(error.reasons, ["quiet_hours"]);
        return true;
      },
    );
    assert.equal(dispatchedPlans.length, before, "backend must never be called");

    const rows = await auditRowsFor(target);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].decision, "deny");
    assert.deepEqual(rows[0].reasons, ["quiet_hours"]);
    assert.equal(rows[0].policy_version, POLICY_VERSION);
    assert.equal(rows[0].call_id, null);
  });

  test("suppression deny: org-scoped and platform-wide entries both block", async () => {
    const target = "+18645550172"; // Greenville SC (Eastern)
    currentNow = NOON_EASTERN;

    // Org-scoped suppression entry.
    const { error: seedError } = await admin.from("suppression_entries").insert({
      org_id: orgId,
      phone_number: target,
      reason: "recipient_optout",
    });
    assert.ifError(seedError);

    const before = dispatchedPlans.length;
    await assert.rejects(
      dispatcher.dispatch({
        plan: makePlan(target),
        orgId,
        userId,
        taskType: "availability_inquiry",
      }),
      (error: unknown) => {
        assert.ok(error instanceof ComplianceDenyError);
        assert.deepEqual(error.reasons, ["suppressed"]);
        return true;
      },
    );
    assert.equal(dispatchedPlans.length, before, "backend must never be called");

    const rows = await auditRowsFor(target);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].decision, "deny");
    assert.deepEqual(rows[0].reasons, ["suppressed"]);

    // Swap the org-scoped entry for a platform-wide one: still suppressed.
    await admin.from("suppression_entries").delete().eq("phone_number", target);
    const { error: globalError } = await admin.from("suppression_entries").insert({
      org_id: null,
      phone_number: target,
      reason: "national_dnc",
    });
    assert.ifError(globalError);
    await assert.rejects(
      dispatcher.dispatch({
        plan: makePlan(target),
        orgId,
        userId,
        taskType: "availability_inquiry",
      }),
      (error: unknown) =>
        error instanceof ComplianceDenyError &&
        error.reasons.includes("suppressed"),
    );
  });

  test("kill switch deny: tenant_settings.outbound_kill_switch blocks dispatch", async () => {
    const target = "+18645550174";
    currentNow = NOON_EASTERN;

    const { error: onError } = await admin
      .from("tenant_settings")
      .update({ outbound_kill_switch: true })
      .eq("org_id", orgId);
    assert.ifError(onError);

    try {
      await assert.rejects(
        dispatcher.dispatch({
          plan: makePlan(target),
          orgId,
          userId,
          taskType: "availability_inquiry",
        }),
        (error: unknown) => {
          assert.ok(error instanceof ComplianceDenyError);
          assert.deepEqual(error.reasons, ["kill_switch"]);
          return true;
        },
      );
    } finally {
      const { error: offError } = await admin
        .from("tenant_settings")
        .update({ outbound_kill_switch: false })
        .eq("org_id", orgId);
      assert.ifError(offError);
    }
  });

  test("all-party state: disclosure lines are injected into the dispatched plan", async () => {
    const target = "+14155550173"; // San Francisco (CA, all-party)
    currentNow = AFTERNOON_PACIFIC;

    const plan = makePlan(target);
    const { callId, decision } = await dispatcher.dispatch({
      plan,
      orgId,
      userId,
      taskType: "availability_inquiry",
    });

    assert.ok(callId.startsWith("mock-call-"));
    assert.equal(decision.allow, true);
    assert.equal(decision.recordingMode, "all_party_disclosed");

    const dispatched = dispatchedPlans.at(-1)!;
    assert.equal(dispatched.phoneNumber, target);
    assert.ok(
      dispatched.context.includes("REQUIRED COMPLIANCE DISCLOSURES"),
      "disclosure block must be merged into the plan context",
    );
    assert.ok(dispatched.context.includes("Jane Client"), "identity line");
    assert.ok(dispatched.context.includes("AI assistant"), "AI line");
    assert.ok(
      dispatched.context.includes("consent to the recording"),
      "all-party states get the consent-flavored recording line",
    );
    assert.ok(
      dispatched.context.includes(plan.context),
      "original plan context is preserved",
    );
  });

  test("allow path: authorization + audit rows are written and stamped", async () => {
    const target = "+14155550173"; // dispatched in the previous test
    const plan = makePlan(target);

    const { data: authRows, error: authError } = await admin
      .from("call_authorizations")
      .select("*")
      .eq("org_id", orgId);
    assert.ifError(authError);
    assert.equal(authRows!.length, 1);
    assert.equal(authRows![0].user_id, userId);
    assert.equal(authRows![0].channel, "voice");
    assert.equal(
      authRows![0].call_plan_hash,
      hashCallPlan(plan),
      "hash must cover the exact plan the human approved (pre-disclosure-merge)",
    );
    assert.ok(authRows![0].approved_at);

    const rows = await auditRowsFor(target);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].decision, "allow");
    assert.deepEqual(rows[0].reasons, []);
    assert.equal(rows[0].policy_version, POLICY_VERSION);
    assert.equal(rows[0].task_type, "availability_inquiry");
    assert.match(rows[0].call_id, /^mock-call-/);
  });
});
