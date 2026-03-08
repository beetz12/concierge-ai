import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { VoiceToolsClient } from "../src/backend-client.js";

test("VoiceToolsClient sends authenticated requests for session, event, and provider outcome persistence", async () => {
  const requests: Array<{
    method: string;
    url: string;
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
  }> = [];

  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const raw = Buffer.concat(chunks).toString("utf8");
    requests.push({
      method: req.method || "GET",
      url: req.url || "/",
      headers: req.headers,
      body: raw ? JSON.parse(raw) : null,
    });

    const payload =
      req.url?.endsWith("/events")
        ? { events: [] }
        : req.url?.includes("/providers/")
          ? { persisted: true, provider: { id: "provider_1" } }
          : { persisted: true, session: { id: "session_1" } };

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server");
  }

  const client = new VoiceToolsClient({
    baseUrl: `http://127.0.0.1:${address.port}`,
    sharedSecret: "contract-secret",
  });

  try {
    await client.upsertVoiceSession({
      sessionId: "session_1",
      serviceRequestId: "request_1",
      providerId: "provider_1",
      runtimeProvider: "livekit",
      status: "active",
      activeAgent: "qualification",
      metadata: { providerName: "Acme Plumbing" },
    });

    await client.appendVoiceSessionEvent({
      sessionId: "session_1",
      serviceRequestId: "request_1",
      providerId: "provider_1",
      eventType: "session_created",
      agentRole: "qualification",
      payload: { source: "test" },
    });

    await client.saveProviderOutcome({
      sessionId: "session_1",
      providerId: "provider_1",
      callStatus: "qualified",
      summary: "Qualified provider",
      availability: "tomorrow at 9am",
      estimatedRate: "$120/hour",
    });
  } finally {
    server.close();
  }

  assert.equal(requests.length, 3);
  assert.equal(requests[0]?.method, "PUT");
  assert.equal(requests[0]?.url, "/sessions/session_1");
  assert.equal(requests[1]?.method, "POST");
  assert.equal(requests[1]?.url, "/sessions/session_1/events");
  assert.equal(requests[2]?.method, "POST");
  assert.equal(requests[2]?.url, "/providers/provider_1/outcome");

  for (const request of requests) {
    assert.equal(request.headers["x-voice-agent-key"], "contract-secret");
    assert.equal(request.headers["content-type"], "application/json");
  }

  assert.deepEqual(requests[0]?.body, {
    serviceRequestId: "request_1",
    providerId: "provider_1",
    runtimeProvider: "livekit",
    status: "active",
    activeAgent: "qualification",
    metadata: { providerName: "Acme Plumbing" },
  });
  assert.deepEqual(requests[1]?.body, {
    serviceRequestId: "request_1",
    providerId: "provider_1",
    eventType: "session_created",
    agentRole: "qualification",
    payload: { source: "test" },
  });
  assert.deepEqual(requests[2]?.body, {
    sessionId: "session_1",
    callStatus: "qualified",
    summary: "Qualified provider",
    availability: "tomorrow at 9am",
    estimatedRate: "$120/hour",
  });
});
