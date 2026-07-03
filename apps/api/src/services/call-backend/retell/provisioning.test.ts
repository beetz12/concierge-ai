import assert from "node:assert/strict";
import test from "node:test";
import { createMockFetch, type MockRoute } from "./mock-retell-api.js";
import {
  DEFAULT_RETELL_AGENT_NAME,
  DEFAULT_RETELL_VOICE_ID,
  RetellProvisioner,
  type RetellProvisioningConfig,
} from "./provisioning.js";
import { RetellHttpClient } from "./retell-http.js";

function makeProvisioner(
  routes: MockRoute[],
  config: RetellProvisioningConfig = {},
) {
  const { fetchImpl, requests } = createMockFetch(routes);
  const client = new RetellHttpClient({
    apiKey: "test-key",
    fetchImpl,
    retryDelayMs: 0,
  });
  return { provisioner: new RetellProvisioner(client, config), requests };
}

test("ensureProvisioned reuses an existing agent by name without creating anything", async () => {
  const { provisioner, requests } = makeProvisioner([
    {
      method: "GET",
      path: "/list-agents",
      json: [
        { agent_id: "agent_other", agent_name: "someone-else" },
        { agent_id: "agent_x", agent_name: DEFAULT_RETELL_AGENT_NAME },
      ],
    },
  ]);
  const result = await provisioner.ensureProvisioned();
  assert.equal(result.agentId, "agent_x");
  assert.deepEqual(result.created, { llm: false, agent: false });
  assert.equal(requests.length, 1);
});

test("ensureProvisioned creates the LLM + agent once and caches the result", async () => {
  const { provisioner, requests } = makeProvisioner(
    [
      { method: "GET", path: "/list-agents", json: [] },
      { method: "POST", path: "/create-retell-llm", json: { llm_id: "llm_1" } },
      {
        method: "POST",
        path: "/create-agent",
        json: { agent_id: "agent_new", agent_name: DEFAULT_RETELL_AGENT_NAME },
      },
      {
        method: "GET",
        path: "/list-phone-numbers",
        json: [{ phone_number: "+18645550100" }],
      },
    ],
    { fromNumber: "+18645550100" },
  );

  const first = await provisioner.ensureProvisioned();
  assert.equal(first.agentId, "agent_new");
  assert.equal(first.llmId, "llm_1");
  assert.equal(first.fromNumber, "+18645550100");
  assert.deepEqual(first.created, { llm: true, agent: true });

  const llmCreate = requests.find((request) =>
    request.url.includes("/create-retell-llm"),
  );
  assert.ok(llmCreate);
  const llmBody = llmCreate.body as Record<string, unknown>;
  assert.match(String(llmBody["general_prompt"]), /\{\{objective\}\}/);
  assert.match(String(llmBody["general_prompt"]), /\{\{must_ask\}\}/);
  // press_digit (DTMF) is always provisioned; transfer_call only appears
  // when a transferNumber is configured (not set in this test).
  const tools = llmBody["general_tools"] as Array<Record<string, unknown>>;
  assert.deepEqual(
    tools.map((tool) => tool["type"]),
    ["end_call", "press_digit"],
  );

  const agentCreate = requests.find((request) =>
    request.url.includes("/create-agent"),
  );
  assert.ok(agentCreate);
  const agentBody = agentCreate.body as Record<string, unknown>;
  assert.equal(agentBody["agent_name"], DEFAULT_RETELL_AGENT_NAME);
  assert.equal(agentBody["voice_id"], DEFAULT_RETELL_VOICE_ID);
  assert.deepEqual(agentBody["response_engine"], {
    type: "retell-llm",
    llm_id: "llm_1",
  });

  // Second call is served from the cache: no additional HTTP traffic.
  const requestCount = requests.length;
  const second = await provisioner.ensureProvisioned();
  assert.equal(second.agentId, "agent_new");
  assert.equal(requests.length, requestCount);
});

test("ensureProvisioned attaches a warm transfer_call tool only when transferNumber is set", async () => {
  const { provisioner, requests } = makeProvisioner(
    [
      { method: "GET", path: "/list-agents", json: [] },
      { method: "POST", path: "/create-retell-llm", json: { llm_id: "llm_1" } },
      {
        method: "POST",
        path: "/create-agent",
        json: { agent_id: "agent_new", agent_name: DEFAULT_RETELL_AGENT_NAME },
      },
    ],
    { transferNumber: "+18645550111" },
  );
  await provisioner.ensureProvisioned();

  const llmCreate = requests.find((request) =>
    request.url.includes("/create-retell-llm"),
  );
  assert.ok(llmCreate);
  const tools = (llmCreate.body as Record<string, unknown>)[
    "general_tools"
  ] as Array<Record<string, unknown>>;
  assert.deepEqual(
    tools.map((tool) => tool["type"]),
    ["end_call", "press_digit", "transfer_call"],
  );
  const transfer = tools.find((tool) => tool["type"] === "transfer_call");
  assert.ok(transfer);
  assert.deepEqual(transfer["transfer_destination"], {
    type: "predefined",
    number: "+18645550111",
  });
  assert.deepEqual(transfer["transfer_option"], {
    type: "warm_transfer",
    show_transferee_as_caller: false,
  });
});

test("ensureProvisioned fails fast when the configured agent id is missing", async () => {
  const { provisioner, requests } = makeProvisioner(
    [
      {
        method: "GET",
        path: "/list-agents",
        json: [{ agent_id: "agent_other", agent_name: "someone-else" }],
      },
    ],
    { agentId: "agent_gone" },
  );
  await assert.rejects(provisioner.ensureProvisioned(), /agent_gone.*not found/);
  // Never auto-creates a replacement for an explicitly configured agent.
  assert.ok(
    requests.every((request) => !request.url.includes("/create-agent")),
  );
});

test("ensureProvisioned verifies the from-number but never purchases one", async () => {
  const { provisioner, requests } = makeProvisioner(
    [
      {
        method: "GET",
        path: "/list-agents",
        json: [{ agent_id: "agent_x", agent_name: DEFAULT_RETELL_AGENT_NAME }],
      },
      { method: "GET", path: "/list-phone-numbers", json: [] },
    ],
    { fromNumber: "+18645550100" },
  );
  await assert.rejects(
    provisioner.ensureProvisioned(),
    /\+18645550100 is not attached/,
  );
  assert.ok(requests.every((request) => request.method === "GET"));
});

test("doctor reports ok when key, config, api, agent, and number all check out", async () => {
  const { provisioner } = makeProvisioner(
    [
      {
        method: "GET",
        path: "/list-agents",
        json: [{ agent_id: "agent_x", agent_name: "custom-agent" }],
      },
      {
        method: "GET",
        path: "/list-phone-numbers",
        json: [{ phone_number: "+18645550100" }],
      },
    ],
    { agentId: "agent_x", fromNumber: "+18645550100" },
  );
  const report = await provisioner.doctor();
  assert.deepEqual(report, {
    ok: true,
    checks: {
      key: "ok",
      config: "ok",
      api: "ok",
      agent: "ok",
      number: "ok",
    },
  });
});

test("doctor flags a missing agent and missing number", async () => {
  const { provisioner } = makeProvisioner(
    [
      {
        method: "GET",
        path: "/list-agents",
        json: [{ agent_id: "agent_other", agent_name: "someone-else" }],
      },
      { method: "GET", path: "/list-phone-numbers", json: [] },
    ],
    { agentId: "agent_gone", fromNumber: "+18645550100" },
  );
  const report = await provisioner.doctor();
  assert.equal(report.ok, false);
  assert.equal(report.checks["key"], "ok");
  assert.equal(report.checks["api"], "ok");
  assert.match(report.checks["agent"]!, /agent_gone NOT FOUND/);
  assert.match(report.checks["number"]!, /\+18645550100 NOT FOUND/);
});
