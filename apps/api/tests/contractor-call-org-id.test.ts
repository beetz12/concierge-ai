import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ContractorCallService } from "../src/services/voice/contractor-call.service.js";
import { resetCallRuntimeConfigForTests } from "../src/config/call-runtime.js";

/**
 * FIX 3: ContractorCallService.createPersistenceContext threads the caller's
 * orgId onto the service_requests, providers, and interaction_logs inserts so
 * dispatched contractor-call rows land in the correct tenant.
 */

const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

interface InsertCapture {
  table: string;
  values: Record<string, unknown>;
}

/**
 * Capturing Supabase stub. service_requests/providers inserts return an id via
 * .select().single(); interaction_logs inserts resolve directly.
 */
function capturingSupabase(captures: InsertCapture[]) {
  let idCounter = 0;
  return {
    from(table: string) {
      return {
        insert(values: Record<string, unknown>) {
          captures.push({ table, values });
          return {
            select() {
              return {
                async single() {
                  idCounter += 1;
                  return { data: { id: `${table}-${idCounter}` }, error: null };
                },
              };
            },
            // interaction_logs insert is awaited directly (no select()).
            then(resolve: (v: { error: null }) => void) {
              resolve({ error: null });
            },
          };
        },
      };
    },
  } as never;
}

const withRuntimeEnv = <T>(run: () => Promise<T>): Promise<T> => {
  const previous = {
    CALL_RUNTIME_PROVIDER: process.env.CALL_RUNTIME_PROVIDER,
    LIVEKIT_URL: process.env.LIVEKIT_URL,
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
    VOICE_AGENT_SHARED_SECRET: process.env.VOICE_AGENT_SHARED_SECRET,
  };
  process.env.CALL_RUNTIME_PROVIDER = "livekit";
  process.env.LIVEKIT_URL = "wss://example.livekit.cloud";
  process.env.LIVEKIT_API_KEY = "key";
  process.env.LIVEKIT_API_SECRET = "secret";
  process.env.VOICE_AGENT_SHARED_SECRET = "shared-secret";
  resetCallRuntimeConfigForTests();
  const restore = () => {
    process.env.CALL_RUNTIME_PROVIDER = previous.CALL_RUNTIME_PROVIDER;
    process.env.LIVEKIT_URL = previous.LIVEKIT_URL;
    process.env.LIVEKIT_API_KEY = previous.LIVEKIT_API_KEY;
    process.env.LIVEKIT_API_SECRET = previous.LIVEKIT_API_SECRET;
    process.env.VOICE_AGENT_SHARED_SECRET = previous.VOICE_AGENT_SHARED_SECRET;
    resetCallRuntimeConfigForTests();
  };
  return run().finally(restore);
};

/** Voice-agent stub: preview endpoint returns a preview; dispatch returns ids. */
const voiceAgentFetch = (async (input) => {
  const url = String(input);
  if (url.endsWith("/preview/call")) {
    return new Response(
      JSON.stringify({ preview: { kind: "booking", openingPrompt: "hi" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
  return new Response(
    JSON.stringify({
      success: true,
      accepted: true,
      runtimeProvider: "livekit",
      sessionId: "session-1",
      dispatchId: "dispatch-1",
      providerId: "provider-1",
      serviceRequestId: "req-1",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}) as typeof fetch;

describe("ContractorCallService org_id persistence (FIX 3)", () => {
  afterEach(() => {
    delete process.env.DEMO_MODE;
  });

  test("stamps org_id on service_requests, providers, and interaction_logs inserts", async () => {
    delete process.env.DEMO_MODE;
    await withRuntimeEnv(async () => {
      const captures: InsertCapture[] = [];
      const service = new ContractorCallService({
        supabase: capturingSupabase(captures),
        fetchImpl: voiceAgentFetch,
      });

      await service.dispatchCall(
        {
          mode: "booking",
          contractorName: "Acme Plumbing",
          contractorPhone: "+18035550123",
          serviceNeeded: "plumbing",
          location: "Greenville, SC",
          problemDescription: "Leaky faucet",
        },
        ORG_ID,
      );

      const byTable = (table: string) =>
        captures.find((c) => c.table === table);

      assert.equal(byTable("service_requests")?.values.org_id, ORG_ID);
      assert.equal(byTable("providers")?.values.org_id, ORG_ID);
      assert.equal(byTable("interaction_logs")?.values.org_id, ORG_ID);
    });
  });
});
