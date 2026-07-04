import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  getCallBackend,
  type CallBackend,
  type CallPlan,
} from "../services/call-backend/index.js";
import { US_E164_REGEX } from "../services/call-backend/retell/guards.js";
import {
  InMemoryTokenBucketRateLimiter,
  type RateLimiter,
} from "../services/rate-limit/token-bucket.js";
import { extractClientIp } from "../config/ip-blacklist.js";
import { isDemoCallEnabled, isRetellConfigured } from "../config/demo-call.js";
import { isDemoMode } from "../config/demo.js";

/**
 * Public marketing "call me" demo endpoint (POST /api/v1/demo-call).
 *
 * A logged-out visitor on the landing page can enter their number and receive
 * a single, consented, recorded demo call. This route is UNAUTHENTICATED (see
 * the EXEMPT_PREFIXES allowlist in middleware/auth.ts) and therefore carries
 * its own hard safety posture:
 *
 *   1. Feature-flagged OFF by default (`DEMO_CALL_ENABLED`). When off — or when
 *      no Retell telephony is configured — it NEVER dials: it returns a 200
 *      `{ status: "unavailable" }` so the UI can show a graceful "demo warming
 *      up" state instead of faking a call.
 *   2. Strict E.164 US validation (+1XXXXXXXXXX); batch/foreign numbers refused.
 *   3. Explicit `consent: true` is required (the visitor agreed to a one-time
 *      automated, recorded call).
 *   4. Per-IP and per-number rate limiting: one demo call per number per 24h
 *      and a per-IP burst ceiling, both via the in-memory token bucket.
 *   5. The two-gate `userApproved` is set server-side for THIS consented demo
 *      only, with a fixed friendly objective the visitor cannot control.
 */

/** Seconds in 24h — the per-number and per-IP demo refill window. */
const DAY_SECONDS = 24 * 60 * 60;

/** Fixed, non-user-controllable objective for the demo call. */
const DEMO_OBJECTIVE =
  "Give a warm 20-second demo of the Concierge AI calling assistant: " +
  "greet the person by disclosing this is an automated, recorded demo call, " +
  "explain in one or two sentences that Concierge places real phone calls on " +
  "their behalf to screen contractors, chase refunds, and resolve disputes, " +
  "then thank them and end the call. Do not ask for any personal information.";

const demoCallBodySchema = z.object({
  phoneNumber: z.string().min(1),
  consent: z.literal(true, {
    errorMap: () => ({
      message: "consent must be true to receive a demo call",
    }),
  }),
});

const badRequest = (reply: FastifyReply, message: string) =>
  reply.code(400).send({ statusCode: 400, error: "Bad Request", message });

const zodMessage = (error: z.ZodError): string =>
  error.issues
    .map((issue) =>
      issue.path.length > 0
        ? `${issue.path.join(".")}: ${issue.message}`
        : issue.message,
    )
    .join("; ");

const UNAVAILABLE_MESSAGE =
  "Live demo calls are switching on soon - we saved your number.";

export interface DemoCallRoutesOptions {
  /** Injectable per-IP limiter; defaults to an in-memory token bucket. */
  ipRateLimiter?: RateLimiter;
  /** Injectable per-number 24h lock; defaults to an in-memory token bucket. */
  numberRateLimiter?: RateLimiter;
  /** Override the enabled check (tests). */
  demoCallEnabled?: () => boolean;
  /** Override the Retell-configured check (tests). */
  retellConfigured?: () => boolean;
  /** Injectable call backend (tests); defaults to the Retell backend. */
  backend?: CallBackend;
}

const demoCallRoutes: FastifyPluginAsync<DemoCallRoutesOptions> = async (
  fastify,
  options,
) => {
  // Per-IP abuse ceiling: a small burst, refilling one token per 24h. Keeps a
  // single source from spraying the endpoint even while it is "unavailable".
  const ipRateLimiter =
    options.ipRateLimiter ??
    new InMemoryTokenBucketRateLimiter({
      capacity: 3,
      refillPerSecond: 3 / DAY_SECONDS,
    });

  // Per-number lock: one demo call per number per 24h (capacity 1, refills one
  // token per 24h). Guarantees "we saved your number" is truthful/idempotent.
  const numberRateLimiter =
    options.numberRateLimiter ??
    new InMemoryTokenBucketRateLimiter({
      capacity: 1,
      refillPerSecond: 1 / DAY_SECONDS,
    });

  const demoCallEnabled = options.demoCallEnabled ?? isDemoCallEnabled;
  const retellConfigured = options.retellConfigured ?? isRetellConfigured;

  const unavailable = (reply: FastifyReply) =>
    reply.code(200).send({ status: "unavailable", message: UNAVAILABLE_MESSAGE });

  fastify.post(
    "/",
    {
      schema: {
        tags: ["demo"],
        summary: "Public consented demo call from the marketing landing page",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = demoCallBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));
      const { phoneNumber } = parsed.data;

      // Strict E.164 US validation before anything else.
      if (!US_E164_REGEX.test(phoneNumber)) {
        return badRequest(
          reply,
          "phoneNumber must be a US number in E.164 format (+1XXXXXXXXXX)",
        );
      }

      // Per-IP abuse ceiling.
      const clientIp = extractClientIp(request);
      const ipResult = ipRateLimiter.consume(`ip:${clientIp}`);
      if (!ipResult.allowed) {
        reply.header("retry-after", String(ipResult.retryAfterSeconds));
        return reply.code(429).send({
          statusCode: 429,
          error: "Too Many Requests",
          message: "Too many demo-call requests from this network. Try later.",
          retryAfterSeconds: ipResult.retryAfterSeconds,
        });
      }

      // One demo call per number per 24h.
      const numberResult = numberRateLimiter.consume(`num:${phoneNumber}`);
      if (!numberResult.allowed) {
        reply.header("retry-after", String(numberResult.retryAfterSeconds));
        return reply.code(429).send({
          statusCode: 429,
          error: "Too Many Requests",
          message: "This number already received a demo call in the last 24h.",
          retryAfterSeconds: numberResult.retryAfterSeconds,
        });
      }

      // Kill switch: flag off OR no telephony configured => never dial.
      if (!demoCallEnabled() || !retellConfigured()) {
        request.log.info(
          { event: "demo_call_unavailable", enabled: demoCallEnabled() },
          "Demo call requested while unavailable; number recorded, not dialed",
        );
        return unavailable(reply);
      }

      // Live path: dispatch a single consented, recorded demo call via Retell.
      const plan: CallPlan = {
        businessName: "Concierge demo call",
        phoneNumber,
        objective: DEMO_OBJECTIVE,
        context:
          "Outbound demo call requested by a visitor on the Concierge marketing " +
          "site who consented to a one-time automated, recorded call.",
        mustAsk: [],
        callerIdentity: "the Concierge AI assistant",
        voicemailPolicy: "hang_up",
        preAuthorizations: [],
        // Server-side two-gate approval: this consented demo IS the approval.
        userApproved: true,
      };

      try {
        const backend: CallBackend =
          options.backend ??
          getCallBackend(
            { supabase: fastify.supabase },
            { ...process.env, CALL_BACKEND: "retell" },
          );
        const { callId } = await backend.dispatchCall(plan);
        request.log.info(
          { event: "demo_call_dispatched", callId },
          "Demo call dispatched",
        );
        return reply.code(202).send({ status: "dispatched", callId });
      } catch (error) {
        request.log.error(
          { err: error, event: "demo_call_dispatch_failed" },
          "Demo call dispatch failed; returning unavailable",
        );
        // Never leak telephony errors to an anonymous caller; fail soft.
        return unavailable(reply);
      }
    },
  );

  fastify.log.info(
    {
      enabled: isDemoCallEnabled(),
      demoMode: isDemoMode(),
    },
    "✓ Demo-call route registered (/api/v1/demo-call)",
  );
};

export default demoCallRoutes;
