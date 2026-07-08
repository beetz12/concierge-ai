import assert from "node:assert/strict";
import test from "node:test";
import { InMemoryMembershipStore } from "../../membership/memory-store.js";
import { createMockFetch } from "./mock-retell-api.js";
import { NumberPurchaseError, purchaseOrgNumber } from "./number-purchase.js";
import { RetellProvisioner } from "./provisioning.js";
import { RetellHttpClient } from "./retell-http.js";

const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function makeClient(routes: Parameters<typeof createMockFetch>[0]) {
  const { fetchImpl, requests } = createMockFetch(routes);
  const client = new RetellHttpClient({
    apiKey: "test-key",
    fetchImpl,
    retryDelayMs: 0,
  });
  return { client, requests };
}

test("purchase-disabled provisions a deterministic simulated number with no HTTP call", async () => {
  const store = new InMemoryMembershipStore();
  const { client, requests } = makeClient([]);

  const result = await purchaseOrgNumber(
    { store, purchaseEnabled: false, client },
    { orgId: ORG_A, areaCode: "864" },
  );

  assert.equal(result.simulated, true);
  assert.equal(result.alreadyProvisioned, false);
  assert.equal(result.number.status, "simulated");
  assert.equal(result.number.retellNumberRef, null);
  assert.match(result.number.phoneE164, /^\+1864555\d{4}$/);
  assert.equal(requests.length, 0, "simulated path must not touch Retell");

  // Persisted: the store now returns the same row.
  const persisted = await store.getOrgPhoneNumber(ORG_A);
  assert.equal(persisted?.id, result.number.id);

  // Deterministic: the same org gets the same number in a fresh store.
  const rerun = await purchaseOrgNumber(
    { store: new InMemoryMembershipStore(), purchaseEnabled: false },
    { orgId: ORG_A, areaCode: "864" },
  );
  assert.equal(rerun.number.phoneE164, result.number.phoneE164);
});

test("simulated allocation skips numbers already held by another org", async () => {
  // Find ORG_A's deterministic number, then squat on it with ORG_B.
  const probeStore = new InMemoryMembershipStore();
  const probe = await purchaseOrgNumber(
    { store: probeStore, purchaseEnabled: false },
    { orgId: ORG_A },
  );

  const store = new InMemoryMembershipStore();
  await store.insertOrgPhoneNumber({
    orgId: ORG_B,
    phoneE164: probe.number.phoneE164,
    retellNumberRef: null,
    status: "simulated",
    areaCode: null,
  });

  const result = await purchaseOrgNumber(
    { store, purchaseEnabled: false },
    { orgId: ORG_A },
  );
  assert.notEqual(result.number.phoneE164, probe.number.phoneE164);
  assert.match(result.number.phoneE164, /^\+1555555\d{4}$/);
});

test("purchase-enabled posts /create-phone-number and persists the response number", async () => {
  const store = new InMemoryMembershipStore();
  const { client, requests } = makeClient([
    {
      method: "POST",
      path: "/create-phone-number",
      json: { phone_number: "+18645550142" },
    },
  ]);

  const result = await purchaseOrgNumber(
    { store, purchaseEnabled: true, client, agentId: "agent_123" },
    { orgId: ORG_A, areaCode: "864" },
  );

  assert.equal(result.simulated, false);
  assert.equal(result.alreadyProvisioned, false);
  assert.equal(result.number.status, "active");
  assert.equal(result.number.phoneE164, "+18645550142");
  assert.equal(result.number.retellNumberRef, "+18645550142");

  const dispatch = requests.find((request) =>
    request.url.includes("/create-phone-number"),
  );
  assert.ok(dispatch, "expected a POST /create-phone-number");
  assert.deepEqual(dispatch?.body, {
    nickname: ORG_A,
    area_code: 864,
    inbound_agent_id: "agent_123",
    outbound_agent_id: "agent_123",
  });

  const persisted = await store.getOrgPhoneNumber(ORG_A);
  assert.equal(persisted?.phoneE164, "+18645550142");
});

test("purchaseOrgNumber is idempotent: second call returns the same row with no second HTTP call", async () => {
  const store = new InMemoryMembershipStore();
  const { client, requests } = makeClient([
    {
      method: "POST",
      path: "/create-phone-number",
      json: { phone_number: "+18645550142" },
    },
  ]);
  const deps = { store, purchaseEnabled: true, client, agentId: "agent_123" };

  const first = await purchaseOrgNumber(deps, { orgId: ORG_A });
  const second = await purchaseOrgNumber(deps, { orgId: ORG_A });

  assert.equal(second.alreadyProvisioned, true);
  assert.equal(second.number.id, first.number.id);
  assert.equal(second.number.phoneE164, first.number.phoneE164);
  assert.equal(
    requests.filter((request) => request.url.includes("/create-phone-number"))
      .length,
    1,
    "only the first purchase may call Retell",
  );
});

test("purchase-enabled resolves the agent via the provisioner when no agentId is configured", async () => {
  const store = new InMemoryMembershipStore();
  const { client, requests } = makeClient([
    {
      method: "GET",
      path: "/list-agents",
      json: [{ agent_id: "agent_9", agent_name: "concierge-outbound-caller" }],
    },
    {
      method: "POST",
      path: "/create-phone-number",
      json: { phone_number: "+18645550177" },
    },
  ]);
  const provisioner = new RetellProvisioner(client, { agentId: "agent_9" });

  const result = await purchaseOrgNumber(
    { store, purchaseEnabled: true, client, provisioner },
    { orgId: ORG_A },
  );
  assert.equal(result.number.phoneE164, "+18645550177");

  const dispatch = requests.find((request) =>
    request.url.includes("/create-phone-number"),
  );
  const body = dispatch?.body as Record<string, unknown>;
  assert.equal(body.outbound_agent_id, "agent_9");
  assert.equal(body.inbound_agent_id, "agent_9");
});

test("Retell error responses become typed failures and persist no partial row", async () => {
  const store = new InMemoryMembershipStore();
  const { client } = makeClient([
    {
      method: "POST",
      path: "/create-phone-number",
      status: 402,
      json: { message: "insufficient funds" },
    },
  ]);

  await assert.rejects(
    purchaseOrgNumber(
      { store, purchaseEnabled: true, client, agentId: "agent_123" },
      { orgId: ORG_A },
    ),
    (error: unknown) =>
      error instanceof NumberPurchaseError &&
      error.code === "retell_error" &&
      error.status === 402 &&
      /insufficient funds/.test(error.reason),
  );
  assert.equal(await store.getOrgPhoneNumber(ORG_A), null, "no partial row");
});

test("purchase-enabled without a configured client fails as retell_not_configured", async () => {
  const store = new InMemoryMembershipStore();
  await assert.rejects(
    purchaseOrgNumber({ store, purchaseEnabled: true }, { orgId: ORG_A }),
    (error: unknown) =>
      error instanceof NumberPurchaseError &&
      error.code === "retell_not_configured",
  );
  assert.equal(await store.getOrgPhoneNumber(ORG_A), null);
});
