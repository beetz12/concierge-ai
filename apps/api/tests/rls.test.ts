import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { resolveLocalSupabaseKeys } from "./helpers/local-supabase.js";

/**
 * Tenant RLS integration tests.
 *
 * These run against the LOCAL Supabase stack (supabase start; ports come from
 * supabase/config.toml). They create two orgs with one user each and assert
 * that cross-tenant reads return zero rows and cross-tenant writes fail.
 *
 * Keys are resolved from `RLS_TEST_SUPABASE_*` env vars, falling back to
 * `supabase status` for the running local stack. No key literals are stored in
 * source (local-dev keys, but kept out of the repo for hygiene).
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

interface TenantFixture {
  client: SupabaseClient;
  userId: string;
  email: string;
  orgId: string;
}

const admin = SKIP
  ? (undefined as unknown as SupabaseClient)
  : createClient(SUPABASE_URL, SERVICE_KEY, clientOptions);

async function createTenant(label: string): Promise<TenantFixture> {
  const email = `rls-${label}-${randomUUID()}@example.com`;
  const password = `pw-${randomUUID()}`;

  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  assert.ifError(createError);
  const userId = created.user!.id;

  const client = createClient(SUPABASE_URL, ANON_KEY, clientOptions);
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password,
  });
  assert.ifError(signInError);

  const { data: org, error: orgError } = await client.rpc(
    "create_organization",
    { org_name: `Org ${label}` },
  );
  assert.ifError(orgError);
  assert.ok(org.id, "create_organization should return the new org");

  return { client, userId, email, orgId: org.id };
}

describe("tenant RLS (local Supabase stack)", { skip: SKIP && "rls.test.ts (skipped: no local Supabase)" }, () => {
  let tenantA: TenantFixture;
  let tenantB: TenantFixture;
  let requestAId: string;

  before(async () => {
    // Fail fast with a clear message when the local stack is not running.
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

    tenantA = await createTenant("a");
    tenantB = await createTenant("b");

    const { data: request, error } = await tenantA.client
      .from("service_requests")
      .insert({
        org_id: tenantA.orgId,
        user_id: tenantA.userId,
        type: "RESEARCH_AND_BOOK",
        title: "RLS fixture request",
        description: "Find a plumber",
        criteria: "licensed, insured",
      })
      .select()
      .single();
    assert.ifError(error);
    requestAId = request.id;
  });

  after(async () => {
    // Cleanup: orgs cascade to members/settings/requests/usage; then users.
    for (const tenant of [tenantA, tenantB]) {
      if (!tenant) continue;
      await admin.from("organizations").delete().eq("id", tenant.orgId);
      await admin.auth.admin.deleteUser(tenant.userId);
    }
  });

  test("members can read their own org's rows", async () => {
    const { data, error } = await tenantA.client
      .from("service_requests")
      .select("id, org_id")
      .eq("id", requestAId);
    assert.ifError(error);
    assert.equal(data?.length, 1);
  });

  test("cross-tenant reads return zero rows", async () => {
    const direct = await tenantB.client
      .from("service_requests")
      .select("id")
      .eq("id", requestAId);
    assert.ifError(direct.error);
    assert.equal(direct.data?.length, 0, "B must not see A's request by id");

    const all = await tenantB.client.from("service_requests").select("id, org_id");
    assert.ifError(all.error);
    assert.equal(
      all.data?.filter((row) => row.org_id === tenantA.orgId).length,
      0,
      "B's unfiltered select must not include A's org rows",
    );

    const orgs = await tenantB.client.from("organizations").select("id");
    assert.ifError(orgs.error);
    assert.deepEqual(
      orgs.data?.map((row) => row.id),
      [tenantB.orgId],
      "B must only see their own organization",
    );

    const settings = await tenantB.client
      .from("tenant_settings")
      .select("org_id")
      .eq("org_id", tenantA.orgId);
    assert.ifError(settings.error);
    assert.equal(settings.data?.length, 0, "B must not see A's tenant settings");

    const members = await tenantB.client
      .from("organization_members")
      .select("user_id")
      .eq("org_id", tenantA.orgId);
    assert.ifError(members.error);
    assert.equal(members.data?.length, 0, "B must not see A's member roster");
  });

  test("cross-tenant inserts fail the WITH CHECK policy", async () => {
    const { error } = await tenantB.client.from("service_requests").insert({
      org_id: tenantA.orgId,
      user_id: tenantB.userId,
      type: "DIRECT_TASK",
      title: "forged row",
      description: "should never exist",
      criteria: "n/a",
    });
    assert.ok(error, "insert into another org must be rejected");
    assert.match(error!.message, /row-level security/i);
  });

  test("cross-tenant updates and deletes affect zero rows", async () => {
    const update = await tenantB.client
      .from("service_requests")
      .update({ title: "hijacked" })
      .eq("id", requestAId)
      .select();
    assert.ifError(update.error);
    assert.equal(update.data?.length, 0, "B's update must match zero rows");

    const del = await tenantB.client
      .from("service_requests")
      .delete()
      .eq("id", requestAId)
      .select();
    assert.ifError(del.error);
    assert.equal(del.data?.length, 0, "B's delete must match zero rows");

    // Confirm the row is intact from A's perspective.
    const check = await tenantA.client
      .from("service_requests")
      .select("title")
      .eq("id", requestAId)
      .single();
    assert.ifError(check.error);
    assert.equal(check.data?.title, "RLS fixture request");
  });

  test("WITH CHECK blocks moving a row into a foreign org", async () => {
    const { error } = await tenantA.client
      .from("service_requests")
      .update({ org_id: tenantB.orgId })
      .eq("id", requestAId);
    assert.ok(error, "re-homing a row into another org must be rejected");
    assert.match(error!.message, /row-level security/i);
  });

  test("providers inherit tenant isolation", async () => {
    const { data: provider, error } = await tenantA.client
      .from("providers")
      .insert({
        org_id: tenantA.orgId,
        request_id: requestAId,
        name: "Ajax Plumbing",
        phone: "+18645550100",
      })
      .select()
      .single();
    assert.ifError(error);

    const crossRead = await tenantB.client
      .from("providers")
      .select("id")
      .eq("id", provider.id);
    assert.ifError(crossRead.error);
    assert.equal(crossRead.data?.length, 0);

    const crossInsert = await tenantB.client.from("providers").insert({
      org_id: tenantA.orgId,
      request_id: requestAId,
      name: "Forged Provider",
    });
    assert.ok(crossInsert.error, "cross-tenant provider insert must fail");
  });

  test("usage_events: members read their org only; user writes are blocked", async () => {
    // Service-role write (how recordUsage() runs in the API).
    const { error: seedError } = await admin.from("usage_events").insert({
      org_id: tenantA.orgId,
      type: "call_count",
      quantity: 1,
    });
    assert.ifError(seedError);

    const own = await tenantA.client
      .from("usage_events")
      .select("id")
      .eq("org_id", tenantA.orgId);
    assert.ifError(own.error);
    assert.equal(own.data?.length, 1, "A sees their org's usage");

    const cross = await tenantB.client
      .from("usage_events")
      .select("id")
      .eq("org_id", tenantA.orgId);
    assert.ifError(cross.error);
    assert.equal(cross.data?.length, 0, "B sees none of A's usage");

    const forge = await tenantA.client.from("usage_events").insert({
      org_id: tenantA.orgId,
      type: "call_count",
      quantity: 999,
    });
    assert.ok(
      forge.error,
      "even members cannot write the metering ledger directly",
    );
  });

  test("subscriptions: readable by members, writable only via service role", async () => {
    const { error: seedError } = await admin.from("subscriptions").upsert(
      {
        org_id: tenantA.orgId,
        plan: "starter",
        status: "active",
      },
      { onConflict: "org_id" },
    );
    assert.ifError(seedError);

    const own = await tenantA.client
      .from("subscriptions")
      .select("plan, status")
      .eq("org_id", tenantA.orgId);
    assert.ifError(own.error);
    assert.equal(own.data?.length, 1);

    const cross = await tenantB.client
      .from("subscriptions")
      .select("plan")
      .eq("org_id", tenantA.orgId);
    assert.ifError(cross.error);
    assert.equal(cross.data?.length, 0);

    const forge = await tenantA.client
      .from("subscriptions")
      .update({ plan: "pro" })
      .eq("org_id", tenantA.orgId)
      .select();
    assert.ifError(forge.error);
    assert.equal(forge.data?.length, 0, "member update must match zero rows");
  });
});
