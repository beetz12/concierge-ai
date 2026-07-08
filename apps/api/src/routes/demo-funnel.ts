import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  getCallBackend,
  type CallBackend,
  type CallPlan,
} from "../services/call-backend/index.js";
import {
  DISCLOSURE_VERSION,
  getScenario,
  listPublicScenarios,
} from "../services/demo-funnel/scenarios.js";
import {
  OtpService,
  normalizeUsE164,
  resolveOtpHashSecret,
  verifyVerificationToken,
} from "../services/demo-funnel/otp.js";
import {
  InMemoryDemoFunnelStore,
  SupabaseDemoFunnelStore,
  type DemoFunnelStore,
  type OtpSendWindow,
} from "../services/demo-funnel/store.js";
import {
  TwilioOtpSmsSender,
  type OtpSmsSender,
} from "../services/demo-funnel/sms.js";
import { extractClientIp } from "../config/ip-blacklist.js";
import { isDemoFunnelEnabled } from "../config/demo-funnel.js";
import { isDemoMode } from "../config/demo.js";

/**
 * Public landing-page demo funnel (/api/v1/demo-funnel/*).
 *
 * Flow: pick a curated scenario -> prove phone ownership via SMS OTP ->
 * receive ONE AI demo call to that number — once per E.164 number, for life.
 *
 * These routes are UNAUTHENTICATED (see EXEMPT_PREFIXES in middleware/auth.ts)
 * and carry their own hard safety posture:
 *
 *   1. Feature-flagged OFF by default (DEMO_FUNNEL_ENABLED). While off, every
 *      endpoint returns `{ status: "unavailable" }` — nothing sends or dials.
 *   2. The call dials ONLY the OTP-verified number: the dial target is read
 *      exclusively from the server-signed verification token. No request
 *      field can influence it (unknown body fields are stripped by zod).
 *   3. One demo call per number for life, enforced by the demo_calls
 *      UNIQUE(phone_e164) constraint — the INSERT is the atomic gate.
 *   4. OTP: 6 digits, 10-minute expiry, 5 verify attempts per code, and
 *      DURABLE (DB-counted) send limits: per-number 3/hour + 5/day, per-IP
 *      5/hour + 10/day.
 */

// Durable send-limit windows (counted against demo_otp_requests rows).
const HOUR_SECONDS = 60 * 60;
const DAY_SECONDS = 24 * HOUR_SECONDS;
const SEND_LIMITS = {
  phone: [
    { limit: 3, windowSeconds: HOUR_SECONDS },
    { limit: 5, windowSeconds: DAY_SECONDS },
  ],
  ip: [
    { limit: 5, windowSeconds: HOUR_SECONDS },
    { limit: 10, windowSeconds: DAY_SECONDS },
  ],
} as const;

const UNAVAILABLE_MESSAGE =
  "The demo experience is switching on soon — check back shortly.";

const otpSendBodySchema = z.object({
  phoneNumber: z.string().min(1),
});

const otpVerifyBodySchema = z.object({
  phoneNumber: z.string().min(1),
  code: z.string().min(1),
});

const callBodySchema = z.object({
  verificationToken: z.string().min(1),
  scenarioId: z.string().min(1),
});

const statusQuerySchema = z.object({
  token: z.string().min(1),
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

export interface DemoFunnelRoutesOptions {
  /** Injectable store (tests / DEMO_MODE default to in-memory). */
  store?: DemoFunnelStore;
  /** Injectable OTP SMS sender (tests use a recording fake). */
  smsSender?: OtpSmsSender;
  /** Injectable call backend (tests); defaults to getCallBackend(). */
  backend?: CallBackend;
  /** Override the enabled check (tests). */
  demoFunnelEnabled?: () => boolean;
  /** Override the OTP hash/signing secret (tests). */
  otpHashSecret?: string;
  /** Injectable clock (tests). */
  now?: () => Date;
}

const demoFunnelRoutes: FastifyPluginAsync<DemoFunnelRoutesOptions> = async (
  fastify,
  options,
) => {
  const enabled = options.demoFunnelEnabled ?? isDemoFunnelEnabled;
  const now = options.now ?? (() => new Date());
  const store: DemoFunnelStore =
    options.store ??
    (isDemoMode()
      ? new InMemoryDemoFunnelStore()
      : new SupabaseDemoFunnelStore(fastify.supabase));
  const smsSender: OtpSmsSender =
    options.smsSender ?? new TwilioOtpSmsSender(fastify.log);

  // Fail closed: without a secret (outside DEMO_MODE) the funnel is
  // unavailable — we never fall back to a weaker or hardcoded secret.
  const secret = options.otpHashSecret ?? resolveOtpHashSecret();
  const otpService = secret ? new OtpService(store, secret, now) : null;

  const getBackend = (): CallBackend =>
    options.backend ?? getCallBackend({ supabase: fastify.supabase });

  const unavailable = (reply: FastifyReply) =>
    reply
      .code(200)
      .send({ status: "unavailable", message: UNAVAILABLE_MESSAGE });

  /** Funnel is usable only when the flag is on AND the OTP secret exists. */
  const funnelReady = (request: FastifyRequest): boolean => {
    if (!enabled()) return false;
    if (!otpService) {
      request.log.error(
        { event: "demo_funnel_secret_missing" },
        "DEMO_FUNNEL_ENABLED is on but OTP_HASH_SECRET is unset; failing closed",
      );
      return false;
    }
    return true;
  };

  const tooManyRequests = (
    reply: FastifyReply,
    retryAfterSeconds: number,
    message: string,
  ) => {
    reply.header("retry-after", String(retryAfterSeconds));
    return reply.code(429).send({
      statusCode: 429,
      error: "Too Many Requests",
      message,
      retryAfter: retryAfterSeconds,
    });
  };

  /** Seconds until the oldest send in a full window ages out. */
  const retryAfterFor = (window: OtpSendWindow, windowSeconds: number): number => {
    if (!window.oldestCreatedAt) return windowSeconds;
    const elapsed =
      (now().getTime() - new Date(window.oldestCreatedAt).getTime()) / 1000;
    return Math.max(1, Math.ceil(windowSeconds - elapsed));
  };

  // --------------------------------------------------------------------
  // GET /scenarios — public catalog (includes the disabled "custom" tile).
  // --------------------------------------------------------------------
  fastify.get(
    "/scenarios",
    {
      schema: {
        tags: ["demo-funnel"],
        summary: "List curated demo-call scenarios",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!funnelReady(request)) return unavailable(reply);
      return reply.send({ scenarios: listPublicScenarios() });
    },
  );

  // --------------------------------------------------------------------
  // POST /otp/send — normalize, lifetime short-circuit, durable rate
  // limits, then SMS (or simulated) the 6-digit code.
  // --------------------------------------------------------------------
  fastify.post(
    "/otp/send",
    {
      schema: {
        tags: ["demo-funnel"],
        summary: "Send a demo-funnel verification code via SMS",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!funnelReady(request)) return unavailable(reply);

      const parsed = otpSendBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));

      const phone = normalizeUsE164(parsed.data.phoneNumber);
      if (!phone) {
        return badRequest(
          reply,
          "phoneNumber must be a US number (E.164 +1XXXXXXXXXX)",
        );
      }

      // Lifetime short-circuit: a number that already got its demo call gets
      // an honest answer and NO SMS.
      if (await store.findDemoCallByPhone(phone)) {
        return reply.send({ status: "already_used" });
      }

      // Durable send rate limits — count rows in each window.
      const clientIp = extractClientIp(request);
      for (const { limit, windowSeconds } of SEND_LIMITS.phone) {
        const since = new Date(now().getTime() - windowSeconds * 1000);
        const window = await store.countOtpSendsByPhone(
          phone,
          since.toISOString(),
        );
        if (window.count >= limit) {
          return tooManyRequests(
            reply,
            retryAfterFor(window, windowSeconds),
            "Too many verification codes sent to this number. Try later.",
          );
        }
      }
      for (const { limit, windowSeconds } of SEND_LIMITS.ip) {
        const since = new Date(now().getTime() - windowSeconds * 1000);
        const window = await store.countOtpSendsByIp(
          clientIp,
          since.toISOString(),
        );
        if (window.count >= limit) {
          return tooManyRequests(
            reply,
            retryAfterFor(window, windowSeconds),
            "Too many verification codes requested from this network. Try later.",
          );
        }
      }

      // Persist first (the row IS the rate-limit counter), then send.
      const { code } = await otpService!.createOtp(phone, clientIp);
      const sms = await smsSender.sendOtp(phone, code);
      if (!sms.sent) {
        request.log.error(
          { event: "demo_funnel_otp_send_failed", error: sms.error },
          "OTP SMS send failed",
        );
        return reply.code(502).send({
          statusCode: 502,
          error: "Bad Gateway",
          message: "Could not send the verification code. Try again shortly.",
        });
      }

      request.log.info(
        { event: "demo_funnel_otp_sent", simulated: sms.simulated === true },
        "Demo-funnel OTP sent",
      );
      return reply.send(
        sms.simulated ? { status: "sent", simulated: true } : { status: "sent" },
      );
    },
  );

  // --------------------------------------------------------------------
  // POST /otp/verify — expiry -> 410; wrong code -> 400 with
  // attemptsRemaining (locks after 5); success -> verification token.
  // --------------------------------------------------------------------
  fastify.post(
    "/otp/verify",
    {
      schema: {
        tags: ["demo-funnel"],
        summary: "Verify a demo-funnel SMS code",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!funnelReady(request)) return unavailable(reply);

      const parsed = otpVerifyBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));

      const phone = normalizeUsE164(parsed.data.phoneNumber);
      if (!phone) {
        return badRequest(
          reply,
          "phoneNumber must be a US number (E.164 +1XXXXXXXXXX)",
        );
      }

      const outcome = await otpService!.verifyOtp(phone, parsed.data.code);
      switch (outcome.status) {
        case "verified":
          return reply.send({
            status: "verified",
            verificationToken: outcome.verificationToken,
          });
        case "expired":
          return reply.code(410).send({
            statusCode: 410,
            error: "Gone",
            status: "expired",
            message: "This code has expired. Request a new one.",
          });
        case "locked":
          return reply.code(400).send({
            statusCode: 400,
            error: "Bad Request",
            status: "locked",
            attemptsRemaining: 0,
            message:
              "Too many incorrect attempts. Request a new verification code.",
          });
        case "invalid":
          return reply.code(400).send({
            statusCode: 400,
            error: "Bad Request",
            status: "invalid",
            attemptsRemaining: outcome.attemptsRemaining,
            message: "Incorrect code.",
          });
      }
    },
  );

  // --------------------------------------------------------------------
  // POST /call — the dial target comes ONLY from the verified token.
  // The demo_calls INSERT (unique phone) is the atomic lifetime gate and
  // happens BEFORE dispatch.
  // --------------------------------------------------------------------
  fastify.post(
    "/call",
    {
      schema: {
        tags: ["demo-funnel"],
        summary: "Dispatch the one-per-number demo call",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!funnelReady(request)) return unavailable(reply);

      // zod strips unknown keys: extra body fields (e.g. a smuggled
      // phoneNumber) never reach the dispatch path.
      const parsed = callBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));

      const token = await verifyVerificationToken(
        parsed.data.verificationToken,
        secret!,
      );
      if (!token) {
        return reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid or expired verification token.",
        });
      }

      const scenario = getScenario(parsed.data.scenarioId);
      if (!scenario) {
        return badRequest(reply, "Unknown scenario.");
      }
      if (!scenario.enabled || scenario.requiresMembership) {
        return reply.code(403).send({
          statusCode: 403,
          error: "Forbidden",
          status: "membership_required",
          message: "This scenario requires a membership.",
        });
      }

      // Atomic lifetime gate BEFORE dispatch: UNIQUE(phone_e164) conflict
      // means this number already had its one demo call.
      const clientIp = extractClientIp(request);
      const consentAt = now().toISOString();
      const { created, record } = await store.createDemoCall({
        phoneE164: token.phone,
        scenarioId: scenario.id,
        consentCapturedAt: consentAt,
        consentIp: clientIp,
        disclosureVersion: DISCLOSURE_VERSION,
      });
      if (!created || !record) {
        return reply.code(409).send({
          statusCode: 409,
          error: "Conflict",
          status: "already_used",
          message: "This number has already received its demo call.",
        });
      }

      const plan: CallPlan = {
        businessName: "Demo visitor",
        // THE dial target: the token's phone claim, nothing else.
        phoneNumber: token.phone,
        objective: scenario.callScript,
        context:
          "Landing-page demo funnel: the visitor verified this number via SMS " +
          `and consented to one AI demo call (scenario: ${scenario.label}). ` +
          "Treat the person answering as the business in the scenario.",
        mustAsk: [],
        callerIdentity: scenario.callerIdentity,
        voicemailPolicy: "hang_up",
        preAuthorizations: [],
        // The OTP-verified consent IS the human approval for this call.
        userApproved: true,
      };

      try {
        const backend = getBackend();
        const { callId } = await backend.dispatchCall(plan);
        await store.updateDemoCall(record.id, {
          callId,
          backend: backend.id,
        });
        request.log.info(
          { event: "demo_funnel_call_dispatched", callId, scenario: scenario.id },
          "Demo-funnel call dispatched",
        );
        return reply.code(202).send({ status: "dispatched", callId });
      } catch (error) {
        // Release the reserved row so a transient telephony failure does not
        // burn the number's single lifetime call without a call happening.
        await store.deleteDemoCall(record.id);
        request.log.error(
          { err: error, event: "demo_funnel_dispatch_failed" },
          "Demo-funnel dispatch failed; lifetime slot released",
        );
        return reply.code(502).send({
          statusCode: 502,
          error: "Bad Gateway",
          message: "Could not start the demo call. Try again shortly.",
        });
      }
    },
  );

  // --------------------------------------------------------------------
  // GET /call/:callId/status?token=... — token must match the call's
  // phone; proxies backend status and persists progress.
  // --------------------------------------------------------------------
  fastify.get(
    "/call/:callId/status",
    {
      schema: {
        tags: ["demo-funnel"],
        summary: "Poll the status of a dispatched demo call",
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!funnelReady(request)) return unavailable(reply);

      const { callId } = request.params as { callId: string };
      const parsedQuery = statusQuerySchema.safeParse(request.query ?? {});
      if (!parsedQuery.success) {
        return badRequest(reply, zodMessage(parsedQuery.error));
      }

      const token = await verifyVerificationToken(
        parsedQuery.data.token,
        secret!,
      );
      if (!token) {
        return reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Invalid or expired verification token.",
        });
      }

      const record = await store.findDemoCallByCallId(callId);
      if (!record) {
        return reply.code(404).send({
          statusCode: 404,
          error: "Not Found",
          message: "Unknown call.",
        });
      }
      // The token only unlocks status for the number it verified.
      if (record.phoneE164 !== token.phone) {
        return reply.code(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "This token cannot access this call.",
        });
      }

      const status = await getBackend().getStatus(callId);
      await store.updateDemoCall(record.id, {
        status: status.state,
        summary: status.summary,
        completedAt: status.completed ? now().toISOString() : null,
      });

      return reply.send({
        state: status.state,
        completed: status.completed,
        disposition: status.disposition,
        summary: status.summary,
      });
    },
  );

  fastify.log.info(
    { enabled: isDemoFunnelEnabled(), demoMode: isDemoMode() },
    "✓ Demo-funnel routes registered (/api/v1/demo-funnel)",
  );
};

export default demoFunnelRoutes;
