import { randomUUID } from "node:crypto";
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  getCallBackend,
  type CallBackend,
  type CallPlan,
} from "../services/call-backend/index.js";
import {
  ComplianceDenyError,
  CompliantCallDispatcher,
  mergeDisclosuresIntoPlan,
} from "../services/compliance/dispatch.js";
import { evaluate } from "../services/compliance/policy-engine.js";
import {
  resolveCalleeLocalTimes,
  resolveTargetLocale,
} from "../services/compliance/timezone.js";
import type {
  ComplianceChannel,
  ComplianceTaskType,
  PolicyDecision,
} from "../services/compliance/types.js";
import {
  buildDispatchPlan,
  COMPLIANCE_TASK_TYPE_BY_TASK,
} from "../services/dispatch/plan.js";
import {
  getDispatch,
  isRedialBlocked,
  recordDispatch,
  setAttachedEvent,
} from "../services/dispatch/registry.js";
import {
  getMembershipStore,
  type MembershipStore,
} from "../services/membership/index.js";
import type { TaskType } from "../services/direct-task/types.js";
import {
  attachCall,
  caseContext,
  getCase,
  type CasesDbClient,
} from "../services/cases/index.js";
import { getDemoCasesDb } from "../services/cases/demo-store.js";
import { DirectTwilioClient } from "../services/notifications/direct-twilio.client.js";
import {
  createDispatchRateLimiterFromEnv,
  type RateLimiter,
} from "../services/rate-limit/token-bucket.js";
import { recordUsage } from "../services/billing/usage.js";
import { isDemoMode } from "../config/demo.js";

/**
 * Dispatch flow routes (SaaS slice 8) - the two-gate call dispatch UX,
 * registered under the /api/v1/dispatch prefix.
 *
 * - POST /api/v1/dispatch/plan       Gate 1: analyzer + playbook plan
 * - POST /api/v1/dispatch/preflight  policy engine WITHOUT dispatching
 * - POST /api/v1/dispatch            Gate 2: userApproved dispatch
 * - GET  /api/v1/dispatch/:callId    live status (+ reviewed plan for retry)
 * - GET  /api/v1/dispatch/:callId/artifacts  recording/transcript/outcome
 * - POST /api/v1/dispatch/:callId/attach-case  write the case_events row
 *
 * DEMO_MODE runs the same pure policy engine with demo-resolved inputs (no
 * kill-switch/suppression tables exist) and a pinned evaluation instant so
 * demos and e2e runs do not flake on wall-clock quiet hours. Real mode goes
 * through the slice-6 CompliantCallDispatcher (authorization + audit rows).
 */

const TASK_TYPES = [
  "negotiate_price",
  "request_refund",
  "complain_issue",
  "schedule_appointment",
  "cancel_service",
  "make_inquiry",
  "deliver_message",
  "general_task",
] as const;

const VOICEMAIL_POLICIES = ["leave_message", "hang_up", "retry_later"] as const;

/**
 * Fixed evaluation instant for DEMO_MODE: 2026-07-01 19:00 UTC is inside the
 * quiet-hours window in every US zone (ET 15:00 ... HT 09:00), so demo
 * decisions depend only on the plan, never on when the demo runs.
 */
const DEMO_EVAL_NOW = new Date("2026-07-01T19:00:00Z");

const planBodySchema = z.object({
  taskDescription: z.string().min(1),
  contactName: z.string().min(1),
  contactPhone: z.string().optional(),
  clientName: z.string().optional(),
  grantedPreAuthorizations: z.array(z.string().min(1)).optional(),
  caseId: z.string().uuid().optional(),
});

const preflightBodySchema = z.object({
  phoneNumber: z.string().min(1),
  taskType: z.enum(TASK_TYPES),
  contactName: z.string().optional(),
  clientName: z.string().optional(),
  callbackNumber: z.string().optional(),
  channel: z.enum(["voice", "sms"]).default("voice"),
});

const grantedPreAuthSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});

const dispatchBodySchema = z.object({
  contactName: z.string().min(1),
  phoneNumber: z.string().min(1),
  objective: z.string().min(1),
  context: z.string().default(""),
  mustAsk: z.array(z.string().min(1)).default([]),
  clientName: z.string().optional(),
  callbackNumber: z.string().optional(),
  voicemailPolicy: z.enum(VOICEMAIL_POLICIES).default("hang_up"),
  taskType: z.enum(TASK_TYPES),
  /** Gate 2: dispatch is only accepted with an explicit human approval. */
  userApproved: z.literal(true),
  grantedPreAuthorizations: z.array(grantedPreAuthSchema).default([]),
  caseId: z.string().uuid().optional(),
  allowRedial: z.boolean().optional(),
  channel: z.enum(["voice", "sms"]).default("voice"),
  smsBody: z.string().optional(),
});

const callParamsSchema = z.object({ callId: z.string().min(1) });

const attachCaseSchema = z.object({
  caseId: z.string().uuid(),
  summary: z.string().min(1).optional(),
});

const badRequest = (reply: FastifyReply, message: string) =>
  reply.code(400).send({ statusCode: 400, error: "Bad Request", message });

const notFound = (reply: FastifyReply, message: string) =>
  reply.code(404).send({ statusCode: 404, error: "Not Found", message });

const complianceDenied = (reply: FastifyReply, decision: PolicyDecision) =>
  reply.code(403).send({
    error: "ComplianceDenied",
    reasons: decision.reasons,
    quietHoursWindow: decision.quietHoursWindow,
    policyVersion: decision.policyVersion,
    message: `Dispatch denied by compliance policy: ${decision.reasons.join(", ")}`,
  });

const requireOrg = (
  request: FastifyRequest,
  reply: FastifyReply,
): string | null => {
  const orgId = request.auth?.orgId;
  if (!orgId) {
    reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Dispatching calls requires an organization context",
    });
    return null;
  }
  return orgId;
};

const zodMessage = (error: z.ZodError): string =>
  error.issues
    .map((issue) =>
      issue.path.length > 0
        ? `${issue.path.join(".")}: ${issue.message}`
        : issue.message,
    )
    .join("; ");

interface DemoEvaluateInput {
  orgId: string;
  phoneNumber: string;
  taskType: ComplianceTaskType;
  channel: ComplianceChannel;
  callerIdentity: string;
  callbackNumber?: string;
  redialBlocked: boolean;
}

/** Pure engine run with demo-resolved inputs (no DB, pinned clock). */
const demoEvaluate = (input: DemoEvaluateInput): PolicyDecision => {
  const locale = resolveTargetLocale(input.phoneNumber);
  return evaluate({
    orgId: input.orgId,
    targetNumber: input.phoneNumber,
    targetState: locale.state,
    taskType: input.taskType,
    channel: input.channel,
    requestedAtUtc: DEMO_EVAL_NOW.toISOString(),
    calleeLocalTimes: resolveCalleeLocalTimes(input.phoneNumber, DEMO_EVAL_NOW),
    onBehalfOfEntity: input.callerIdentity,
    callbackNumber: input.callbackNumber,
    userApproved: true,
    killSwitchActive: false,
    suppressionHit: false,
    recipientConsentTier: "none",
    redialBlocked: input.redialBlocked,
  });
};

const callerIdentityOf = (clientName?: string): string =>
  clientName?.trim() || "a client";

export interface DispatchRoutesOptions {
  /** Injectable per-org limiter; defaults to an env-configured token bucket. */
  rateLimiter?: RateLimiter;
  /** Injectable clock for the compliance dispatcher; defaults to wall clock. */
  now?: () => Date;
  /** Injectable call backend (tests); defaults to the CALL_BACKEND factory. */
  backend?: CallBackend;
  /** Injectable membership store (tests); defaults per DEMO_MODE. */
  membershipStore?: MembershipStore;
}

const dispatchRoutes: FastifyPluginAsync<DispatchRoutesOptions> = async (
  fastify,
  options,
) => {
  // DEMO_MODE has no telephony provider configured (GEMINI-only), so force the
  // in-memory mock backend; otherwise the default (livekit) would crash on the
  // missing LiveKit config at construction.
  const backend: CallBackend =
    options.backend ??
    getCallBackend(
      { supabase: fastify.supabase },
      isDemoMode() ? { ...process.env, CALL_BACKEND: "mock" } : process.env,
    );
  // Membership store: org dedicated number (caller id) + call-setting
  // defaults applied to plans that do not specify them.
  const membership: MembershipStore =
    options.membershipStore ?? getMembershipStore(fastify.supabase);
  const dispatcher = new CompliantCallDispatcher({
    supabase: fastify.supabase,
    backend,
    now: options.now,
  });
  const casesDb = (): CasesDbClient =>
    isDemoMode()
      ? getDemoCasesDb()
      : (fastify.supabase as unknown as CasesDbClient);

  // Per-org rate limiting for the cost-bearing dispatch surface. This is
  // ABOVE the global IP limiter: it throttles each tenant independently so one
  // org cannot exhaust another's budget, and it keys on the authenticated org
  // id rather than the source IP.
  const rateLimiter = options.rateLimiter ?? createDispatchRateLimiterFromEnv();

  /**
   * Append a usage-ledger row for a successful dispatch. Metering must never
   * break the caller's response, so failures (and demo mode, which has no DB)
   * are swallowed with a warning.
   */
  const meterDispatch = async (
    request: FastifyRequest,
    input: { orgId: string; type: "call_count" | "sms_count"; callId: string },
  ): Promise<void> => {
    if (isDemoMode()) return;
    try {
      await recordUsage(fastify.supabase as never, {
        orgId: input.orgId,
        type: input.type,
        quantity: 1,
        callId: input.callId,
      });
    } catch (error) {
      request.log.warn(
        { error, orgId: input.orgId, type: input.type },
        "Failed to record dispatch usage (non-fatal)",
      );
    }
  };

  /**
   * Enforce the per-org limit. Returns the org id when the request may
   * proceed, or null after sending a 429 (or 403 when no org context).
   */
  const enforceOrgRateLimit = (
    request: FastifyRequest,
    reply: FastifyReply,
  ): string | null => {
    const orgId = requireOrg(request, reply);
    if (!orgId) return null;
    const result = rateLimiter.consume(orgId);
    reply.header("x-ratelimit-limit", String(result.limit));
    reply.header("x-ratelimit-remaining", String(result.remaining));
    if (!result.allowed) {
      reply.header("retry-after", String(result.retryAfterSeconds));
      request.log.warn(
        { orgId, url: request.url, retryAfter: result.retryAfterSeconds },
        "Per-org dispatch rate limit exceeded",
      );
      reply.code(429).send({
        statusCode: 429,
        error: "Too Many Requests",
        message:
          "Per-organization dispatch rate limit exceeded. Retry after " +
          `${result.retryAfterSeconds}s.`,
        retryAfterSeconds: result.retryAfterSeconds,
      });
      return null;
    }
    return orgId;
  };

  fastify.post(
    "/plan",
    {
      schema: {
        tags: ["dispatch"],
        summary: "Generate the reviewable dispatch plan (Gate 1 input)",
      },
    },
    async (request, reply) => {
      const orgId = enforceOrgRateLimit(request, reply);
      if (!orgId) return;

      const parsed = planBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));
      const body = parsed.data;

      const plan = buildDispatchPlan(body);

      let linkedCase: Record<string, unknown> | null = null;
      let caseContextBlock: string | null = null;
      if (body.caseId) {
        const db = casesDb();
        const found = await getCase(db, orgId, body.caseId);
        if (!found) return notFound(reply, `Case not found: ${body.caseId}`);
        linkedCase = {
          id: found.id,
          title: found.title,
          counterpartyName: found.counterparty_name,
          counterpartyPhone: found.counterparty_phone,
          escalationStage: found.escalation_stage,
        };
        caseContextBlock = await caseContext(db, orgId, body.caseId);
      }

      return reply.send({
        ...plan,
        case: linkedCase,
        caseContext: caseContextBlock,
      });
    },
  );

  fastify.post(
    "/preflight",
    {
      schema: {
        tags: ["dispatch"],
        summary: "Run the compliance policy engine WITHOUT dispatching",
      },
    },
    async (request, reply) => {
      const orgId = enforceOrgRateLimit(request, reply);
      if (!orgId) return;

      const parsed = preflightBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));
      const body = parsed.data;

      const complianceTaskType = COMPLIANCE_TASK_TYPE_BY_TASK[body.taskType];
      const callerIdentity = callerIdentityOf(body.clientName);
      const redialBlocked =
        body.channel === "voice" && isRedialBlocked(orgId, body.phoneNumber);

      let decision: PolicyDecision;
      if (isDemoMode()) {
        decision = demoEvaluate({
          orgId,
          phoneNumber: body.phoneNumber,
          taskType: complianceTaskType,
          channel: body.channel,
          callerIdentity,
          callbackNumber: body.callbackNumber,
          redialBlocked,
        });
      } else {
        decision = await dispatcher.preflight(
          {
            plan: {
              businessName: body.contactName ?? "the business",
              phoneNumber: body.phoneNumber,
              objective: "preflight",
              context: "",
              mustAsk: [],
              callerIdentity,
              callbackNumber: body.callbackNumber,
              voicemailPolicy: "hang_up",
              preAuthorizations: [],
              // Preflight answers "would this be allowed once approved?";
              // the approval itself is still required at dispatch (Gate 2).
              userApproved: true,
            },
            orgId,
            userId: request.auth?.userId ?? "unknown",
            taskType: complianceTaskType,
            channel: body.channel,
          },
          { redialBlocked },
        );
      }

      const locale = resolveTargetLocale(body.phoneNumber);
      return reply.send({
        allow: decision.allow,
        reasons: decision.reasons,
        disclosureLines: decision.disclosureLines,
        recordingMode: decision.recordingMode,
        quietHoursWindow: decision.quietHoursWindow,
        consentTierRequired: decision.consentTierRequired,
        policyVersion: decision.policyVersion,
        redialBlocked,
        targetState: locale.state,
        complianceTaskType,
      });
    },
  );

  fastify.post(
    "/",
    {
      schema: {
        tags: ["dispatch"],
        summary: "Approve and dispatch the reviewed call plan (Gate 2)",
      },
    },
    async (request, reply) => {
      const orgId = enforceOrgRateLimit(request, reply);
      if (!orgId) return;

      const parsed = dispatchBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));
      const body = parsed.data;

      const complianceTaskType = COMPLIANCE_TASK_TYPE_BY_TASK[body.taskType];
      const callerIdentity = callerIdentityOf(body.clientName);

      // SMS channel switch (offered when the voice redial guard blocks a
      // retry): same policy evaluation, message transport instead of a call.
      if (body.channel === "sms") {
        const decision = isDemoMode()
          ? demoEvaluate({
              orgId,
              phoneNumber: body.phoneNumber,
              taskType: complianceTaskType,
              channel: "sms",
              callerIdentity,
              callbackNumber: body.callbackNumber,
              redialBlocked: false,
            })
          : await dispatcher.preflight({
              plan: buildCallPlan(body, callerIdentity, orgId),
              orgId,
              userId: request.auth?.userId ?? "unknown",
              taskType: complianceTaskType,
              channel: "sms",
            });
        if (!decision.allow) return complianceDenied(reply, decision);

        if (isDemoMode()) {
          return reply.send({
            channel: "sms",
            messageId: `mock-sms-${randomUUID()}`,
            status: "sent",
          });
        }
        const twilio = new DirectTwilioClient(fastify.log);
        if (!twilio.isAvailable()) {
          return reply.code(503).send({
            error: "TwilioNotConfigured",
            message: "Twilio credentials are not configured",
          });
        }
        const smsResult = await twilio.sendRawSms({
          to: body.phoneNumber,
          body:
            body.smsBody ||
            `Message from ${callerIdentity}: ${body.objective}`,
        });
        if (!smsResult.success) {
          return reply.code(502).send({
            error: "SmsSendFailed",
            message: smsResult.error || "Failed to send SMS",
          });
        }
        await meterDispatch(request, {
          orgId,
          type: "sms_count",
          callId: smsResult.messageSid ?? "",
        });
        return reply.send({
          channel: "sms",
          messageId: smsResult.messageSid,
          status: smsResult.messageStatus ?? "sent",
        });
      }

      // Voice dispatch. Resolve the linked case BEFORE dialing so a bad
      // caseId fails the request instead of orphaning a dispatched call.
      if (body.caseId) {
        const found = await getCase(casesDb(), orgId, body.caseId);
        if (!found) return notFound(reply, `Case not found: ${body.caseId}`);
      }

      const redialBlocked =
        body.allowRedial !== true && isRedialBlocked(orgId, body.phoneNumber);
      const plan = buildCallPlan(body, callerIdentity, orgId);

      // Org membership defaults: the org's dedicated number becomes the
      // outbound caller id, and org_call_settings fill callerIdentity /
      // voicemailPolicy when the reviewed plan did not specify them.
      // (org_call_settings.transfer_number has no CallPlan slot yet — warm
      // transfer destinations are provisioned at the backend level.)
      // Membership lookups must never block an approved dispatch.
      try {
        const [settings, orgNumber] = await Promise.all([
          membership.getCallSettings(orgId),
          membership.getOrgPhoneNumber(orgId),
        ]);
        if (settings?.callerIdentity && !body.clientName?.trim()) {
          plan.callerIdentity = settings.callerIdentity;
        }
        const rawVoicemailPolicy = (
          request.body as Record<string, unknown> | null
        )?.voicemailPolicy;
        if (rawVoicemailPolicy === undefined && settings) {
          plan.voicemailPolicy = settings.voicemailPolicy;
        }
        if (
          orgNumber &&
          (orgNumber.status === "active" || orgNumber.status === "simulated")
        ) {
          plan.fromNumber = orgNumber.phoneE164;
        }
      } catch (error) {
        request.log.warn(
          { error, orgId },
          "Failed to load org membership call defaults (non-fatal)",
        );
      }

      let callId: string;
      let decision: PolicyDecision;
      if (isDemoMode()) {
        decision = demoEvaluate({
          orgId,
          phoneNumber: body.phoneNumber,
          taskType: complianceTaskType,
          channel: "voice",
          callerIdentity,
          callbackNumber: body.callbackNumber,
          redialBlocked,
        });
        if (!decision.allow) return complianceDenied(reply, decision);
        const dispatched = await backend.dispatchCall(
          mergeDisclosuresIntoPlan(plan, decision.disclosureLines),
        );
        callId = dispatched.callId;
      } else {
        // The registry-level redial guard runs before the audited gate so a
        // blocked retry is refused without dialing (backend guards, where
        // present, enforce it a second time at dispatch).
        if (redialBlocked) {
          const denied = await dispatcher.preflight(
            {
              plan,
              orgId,
              userId: request.auth?.userId ?? "unknown",
              taskType: complianceTaskType,
              channel: "voice",
            },
            { redialBlocked: true },
          );
          return complianceDenied(reply, denied);
        }
        try {
          const result = await dispatcher.dispatch({
            plan,
            orgId,
            userId: request.auth?.userId ?? "unknown",
            taskType: complianceTaskType,
            channel: "voice",
          });
          callId = result.callId;
          decision = result.decision;
        } catch (error) {
          if (error instanceof ComplianceDenyError) {
            return complianceDenied(reply, error.decision);
          }
          throw error;
        }
      }

      const dispatchedAt = new Date().toISOString();
      recordDispatch({
        callId,
        orgId,
        plan,
        taskType: body.taskType as TaskType,
        complianceTaskType,
        dispatchedAt,
        caseId: body.caseId,
      });

      // Auto-attach when dispatched from a case: the timeline gets the call
      // row immediately; artifacts stay reachable via the call id.
      let attachedEventId: string | null = null;
      if (body.caseId) {
        const event = await attachCall(casesDb(), orgId, body.caseId, {
          callId,
          summary: `Outbound call to ${body.contactName}: ${body.objective}`,
          occurredAt: dispatchedAt,
        });
        attachedEventId = event.id;
        setAttachedEvent(callId, body.caseId, event.id);
      }

      await meterDispatch(request, {
        orgId,
        type: "call_count",
        callId,
      });

      return reply.send({
        callId,
        state: "queued",
        caseId: body.caseId ?? null,
        attachedEventId,
        decision: {
          disclosureLines: decision.disclosureLines,
          recordingMode: decision.recordingMode,
          policyVersion: decision.policyVersion,
        },
      });
    },
  );

  fastify.get(
    "/:callId",
    {
      schema: {
        tags: ["dispatch"],
        summary: "Normalized live status for a dispatched call",
      },
    },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;
      const params = callParamsSchema.safeParse(request.params);
      if (!params.success) return badRequest(reply, "callId is required");
      const { callId } = params.data;

      const record = getDispatch(callId);
      if (!record || record.orgId !== orgId) {
        return notFound(reply, `Call not found: ${callId}`);
      }

      try {
        const status = await backend.getStatus(callId);
        return reply.send({
          ...status,
          caseId: record?.caseId ?? null,
          attachedEventId: record?.attachedEventId ?? null,
          plan: record
            ? {
                contactName: record.plan.businessName,
                phoneNumber: record.plan.phoneNumber,
                objective: record.plan.objective,
                context: record.plan.context,
                mustAsk: record.plan.mustAsk,
                clientName: record.plan.callerIdentity,
                callbackNumber: record.plan.callbackNumber ?? null,
                voicemailPolicy: record.plan.voicemailPolicy,
                taskType: record.taskType,
                grantedPreAuthorizations: record.plan.preAuthorizations,
              }
            : null,
        });
      } catch {
        return notFound(reply, `Call not found: ${callId}`);
      }
    },
  );

  fastify.get(
    "/:callId/artifacts",
    {
      schema: {
        tags: ["dispatch"],
        summary: "Recording, transcript, and structured outcome for a call",
      },
    },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;
      const params = callParamsSchema.safeParse(request.params);
      if (!params.success) return badRequest(reply, "callId is required");
      const { callId } = params.data;

      const record = getDispatch(callId);
      if (!record || record.orgId !== orgId) {
        return notFound(reply, `Call not found: ${callId}`);
      }

      try {
        const artifacts = await backend.getArtifacts(callId);
        return reply.send({
          ...artifacts,
          caseId: record?.caseId ?? null,
          attachedEventId: record?.attachedEventId ?? null,
        });
      } catch {
        return notFound(reply, `Call not found: ${callId}`);
      }
    },
  );

  fastify.post(
    "/:callId/attach-case",
    {
      schema: {
        tags: ["dispatch"],
        summary: "Attach a dispatched call to a case timeline",
      },
    },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;
      const params = callParamsSchema.safeParse(request.params);
      if (!params.success) return badRequest(reply, "callId is required");
      const { callId } = params.data;

      const parsed = attachCaseSchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));
      const body = parsed.data;

      const record = getDispatch(callId);
      if (!record || record.orgId !== orgId) {
        return notFound(reply, `Call not found: ${callId}`);
      }

      const db = casesDb();
      const found = await getCase(db, orgId, body.caseId);
      if (!found) return notFound(reply, `Case not found: ${body.caseId}`);

      const event = await attachCall(db, orgId, body.caseId, {
        callId,
        summary:
          body.summary ||
          `Call to ${record.plan.businessName}: ${record.plan.objective}`,
      });
      setAttachedEvent(callId, body.caseId, event.id);
      return reply.send({ eventId: event.id, caseId: body.caseId });
    },
  );
};

/** Provider-agnostic call plan from the approved dispatch body. */
function buildCallPlan(
  body: z.infer<typeof dispatchBodySchema>,
  callerIdentity: string,
  orgId: string,
): CallPlan {
  return {
    businessName: body.contactName,
    phoneNumber: body.phoneNumber,
    objective: body.objective,
    context: body.context,
    mustAsk: body.mustAsk,
    callerIdentity,
    callbackNumber: body.callbackNumber,
    voicemailPolicy: body.voicemailPolicy,
    preAuthorizations: body.grantedPreAuthorizations,
    tenantId: orgId,
    userApproved: true,
    allowRedial: body.allowRedial,
  };
}

export default dispatchRoutes;
