/**
 * Test-only helpers: an offline fetch mock for the Retell API and a
 * CallPlan factory. No network, no RETELL_API_KEY required.
 */
import type { CallPlan } from "../types.js";

export interface RecordedRequest {
  method: string;
  url: string;
  body: unknown;
}

export interface MockRoute {
  method: string;
  /** Substring matched against the request URL. */
  path: string;
  status?: number;
  json?: unknown;
  /** Raw response body (for binary payloads like recordings). */
  raw?: Uint8Array | string;
}

export interface MockFetch {
  fetchImpl: typeof fetch;
  requests: RecordedRequest[];
}

export function createMockFetch(routes: MockRoute[]): MockFetch {
  const requests: RecordedRequest[] = [];
  const fetchImpl = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ method, url, body });

    const route = routes.find(
      (candidate) =>
        candidate.method.toUpperCase() === method && url.includes(candidate.path),
    );
    if (!route) {
      throw new Error(`No mock route for ${method} ${url}`);
    }
    if (route.raw !== undefined) {
      return new Response(route.raw, { status: route.status ?? 200 });
    }
    return new Response(JSON.stringify(route.json ?? null), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return { fetchImpl, requests };
}

export function makePlan(overrides: Partial<CallPlan> = {}): CallPlan {
  return {
    businessName: "Acme Plumbing",
    phoneNumber: "+18645550123",
    objective: "Ask about drain cleaning availability and rates",
    context: "Kitchen sink is backing up.",
    mustAsk: ["Are you licensed?", "What is the hourly rate?"],
    callerIdentity: "Brian, an assistant calling on behalf of a local customer",
    callbackNumber: "+18645559999",
    voicemailPolicy: "hang_up",
    preAuthorizations: [{ key: "share_address", value: "123 Main St" }],
    userApproved: true,
    ...overrides,
  };
}
