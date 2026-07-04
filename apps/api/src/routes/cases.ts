import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CASE_EVENT_KINDS,
  CASE_STATUSES,
  CaseNotFoundError,
  CaseStatus,
  CasesDbClient,
  DISPUTE_TYPES,
  InvalidStageTransitionError,
  appendCaseEvent,
  attachCall,
  attachSms,
  caseContext,
  createCase,
  deleteCase,
  getCase,
  listCaseEvents,
  listCases,
  setNextAction,
  transitionStage,
  updateCase,
} from "../services/cases/index.js";
import { getDemoCasesDb } from "../services/cases/demo-store.js";
import { isDemoMode } from "../config/demo.js";

/**
 * Case management routes (SaaS slice 7).
 *
 * All routes are org-scoped: the slice-5 auth middleware verifies the JWT
 * and resolves request.auth.orgId; every service call filters by that org.
 *
 * - POST   /                      create a case
 * - GET    /                      list cases (?status=), overdue next-actions first
 * - GET    /:caseId               fetch one case
 * - PATCH  /:caseId               update mutable fields
 * - DELETE /:caseId               delete a case
 * - GET    /:caseId/timeline      list events (?order=asc|desc, default desc)
 * - POST   /:caseId/events        append a manual event (note/evidence/email)
 * - POST   /:caseId/stage         stage transition (monotonic unless override)
 * - PUT    /:caseId/next-action   set ({at}) or clear ({at: null}) next action
 * - POST   /:caseId/attach-call   record a call as a timeline event
 * - POST   /:caseId/attach-sms    record an SMS as a timeline event
 * - GET    /:caseId/context       prior-interaction block for a CallPlan
 */

const isoTimestamp = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "must be an ISO-8601 timestamp",
  });

const namedPromiseSchema = z.object({
  who: z.string().min(1),
  what: z.string().min(1),
  dueDate: z.string().nullable().optional(),
});

const createCaseSchema = z.object({
  title: z.string().min(1),
  counterpartyName: z.string().nullable().optional(),
  counterpartyCompany: z.string().nullable().optional(),
  counterpartyPhone: z.string().nullable().optional(),
  counterpartyEmail: z.string().email().nullable().optional(),
  disputeType: z.enum(DISPUTE_TYPES).optional(),
  escalationStage: z.number().int().min(1).max(4).optional(),
  amountAtStake: z.number().nonnegative().nullable().optional(),
  status: z.enum(CASE_STATUSES).optional(),
  leverageNotes: z.string().nullable().optional(),
  nextActionAt: isoTimestamp.nullable().optional(),
});

const updateCaseSchema = z
  .object({
    title: z.string().min(1).optional(),
    counterpartyName: z.string().nullable().optional(),
    counterpartyCompany: z.string().nullable().optional(),
    counterpartyPhone: z.string().nullable().optional(),
    counterpartyEmail: z.string().email().nullable().optional(),
    disputeType: z.enum(DISPUTE_TYPES).optional(),
    amountAtStake: z.number().nonnegative().nullable().optional(),
    status: z.enum(CASE_STATUSES).optional(),
    leverageNotes: z.string().nullable().optional(),
    resolution: z.string().nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: "at least one field is required",
  });

const listQuerySchema = z.object({
  status: z.enum(CASE_STATUSES).optional(),
});

const timelineQuerySchema = z.object({
  order: z.enum(["asc", "desc"]).optional(),
});

/** Manual timeline entries; calls and SMS go through the attach routes. */
const appendEventSchema = z.object({
  kind: z.enum(CASE_EVENT_KINDS),
  summary: z.string().min(1),
  occurredAt: isoTimestamp.optional(),
  payload: z.record(z.unknown()).optional(),
});

const stageSchema = z.object({
  stage: z.number().int(),
  override: z.boolean().optional(),
  note: z.string().optional(),
});

const nextActionSchema = z.object({
  at: isoTimestamp.nullable(),
});

const attachCallSchema = z.object({
  callId: z.string().min(1),
  summary: z.string().min(1),
  occurredAt: isoTimestamp.optional(),
  repName: z.string().optional(),
  promises: z.array(namedPromiseSchema).optional(),
});

const attachSmsSchema = z.object({
  messageId: z.string().min(1),
  direction: z.enum(["inbound", "outbound"]),
  summary: z.string().min(1),
  occurredAt: isoTimestamp.optional(),
});

const caseParamsSchema = z.object({
  caseId: z.string().uuid(),
});

const badRequest = (reply: FastifyReply, message: string) =>
  reply.code(400).send({ statusCode: 400, error: "Bad Request", message });

const notFound = (reply: FastifyReply, message: string) =>
  reply.code(404).send({ statusCode: 404, error: "Not Found", message });

const zodMessage = (error: z.ZodError): string =>
  error.issues
    .map((issue) =>
      issue.path.length > 0
        ? `${issue.path.join(".")}: ${issue.message}`
        : issue.message,
    )
    .join("; ");

/** Resolve the caller's org or send a 403; returns null after replying. */
const requireOrg = (
  request: FastifyRequest,
  reply: FastifyReply,
): string | null => {
  const orgId = request.auth?.orgId;
  if (!orgId) {
    reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "No organization membership for this user",
    });
    return null;
  }
  return orgId;
};

const parseParams = (
  request: FastifyRequest,
  reply: FastifyReply,
): string | null => {
  const parsed = caseParamsSchema.safeParse(request.params);
  if (!parsed.success) {
    badRequest(reply, "caseId must be a UUID");
    return null;
  }
  return parsed.data.caseId;
};

const casesRoutes: FastifyPluginAsync = async (fastify) => {
  // CasesDbClient is a narrow structural view of the Supabase client; the
  // cast avoids TS2589 (excessively deep instantiation) when matching the
  // full SupabaseClient generic against it. DEMO_MODE has no database, so
  // it uses the process-wide in-memory store shared with /api/v1/dispatch.
  const db = isDemoMode()
    ? getDemoCasesDb()
    : (fastify.supabase as unknown as CasesDbClient);

  fastify.post(
    "/",
    { schema: { tags: ["cases"], summary: "Create a case" } },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;

      const parsed = createCaseSchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));

      const created = await createCase(db, orgId, {
        ...parsed.data,
        createdBy: request.auth?.userId ?? null,
      });
      return reply.code(201).send(created);
    },
  );

  fastify.get(
    "/",
    {
      schema: {
        tags: ["cases"],
        summary: "List the org's cases (overdue next-actions first)",
      },
    },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;

      const parsed = listQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));

      const cases = await listCases(db, orgId, {
        status: parsed.data.status as CaseStatus | undefined,
      });
      return reply.send({ cases });
    },
  );

  fastify.get(
    "/:caseId",
    { schema: { tags: ["cases"], summary: "Fetch one case" } },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;
      const caseId = parseParams(request, reply);
      if (!caseId) return;

      const found = await getCase(db, orgId, caseId);
      if (!found) return notFound(reply, `Case not found: ${caseId}`);
      return reply.send(found);
    },
  );

  fastify.patch(
    "/:caseId",
    { schema: { tags: ["cases"], summary: "Update mutable case fields" } },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;
      const caseId = parseParams(request, reply);
      if (!caseId) return;

      const parsed = updateCaseSchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));

      const updated = await updateCase(
        db,
        orgId,
        caseId,
        parsed.data,
      );
      if (!updated) return notFound(reply, `Case not found: ${caseId}`);
      return reply.send(updated);
    },
  );

  fastify.delete(
    "/:caseId",
    { schema: { tags: ["cases"], summary: "Delete a case" } },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;
      const caseId = parseParams(request, reply);
      if (!caseId) return;

      const deleted = await deleteCase(db, orgId, caseId);
      if (!deleted) return notFound(reply, `Case not found: ${caseId}`);
      return reply.code(204).send();
    },
  );

  fastify.get(
    "/:caseId/timeline",
    {
      schema: {
        tags: ["cases"],
        summary: "List the case timeline (newest first by default)",
      },
    },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;
      const caseId = parseParams(request, reply);
      if (!caseId) return;

      const parsed = timelineQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));

      const found = await getCase(db, orgId, caseId);
      if (!found) return notFound(reply, `Case not found: ${caseId}`);

      const events = await listCaseEvents(db, orgId, caseId, {
        newestFirst: parsed.data.order !== "asc",
      });
      return reply.send({ events });
    },
  );

  fastify.post(
    "/:caseId/events",
    { schema: { tags: ["cases"], summary: "Append a timeline event" } },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;
      const caseId = parseParams(request, reply);
      if (!caseId) return;

      const parsed = appendEventSchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));

      try {
        const event = await appendCaseEvent(
          db,
          orgId,
          caseId,
          parsed.data,
        );
        return reply.code(201).send(event);
      } catch (error) {
        if (error instanceof CaseNotFoundError) {
          return notFound(reply, error.message);
        }
        throw error;
      }
    },
  );

  fastify.post(
    "/:caseId/stage",
    {
      schema: {
        tags: ["cases"],
        summary:
          "Transition the escalation stage (monotonic 1->2->3->4 unless override)",
      },
    },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;
      const caseId = parseParams(request, reply);
      if (!caseId) return;

      const parsed = stageSchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));

      try {
        const result = await transitionStage(db, orgId, caseId, {
          targetStage: parsed.data.stage,
          override: parsed.data.override,
          note: parsed.data.note,
        });
        return reply.send({ case: result.caseRecord, event: result.event });
      } catch (error) {
        if (error instanceof CaseNotFoundError) {
          return notFound(reply, error.message);
        }
        if (error instanceof InvalidStageTransitionError) {
          return reply.code(409).send({
            statusCode: 409,
            error: "Conflict",
            message: error.message,
          });
        }
        throw error;
      }
    },
  );

  fastify.put(
    "/:caseId/next-action",
    {
      schema: {
        tags: ["cases"],
        summary: "Set ({at: ISO timestamp}) or clear ({at: null}) the next action",
      },
    },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;
      const caseId = parseParams(request, reply);
      if (!caseId) return;

      const parsed = nextActionSchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));

      const updated = await setNextAction(
        db,
        orgId,
        caseId,
        parsed.data.at,
      );
      if (!updated) return notFound(reply, `Case not found: ${caseId}`);
      return reply.send(updated);
    },
  );

  fastify.post(
    "/:caseId/attach-call",
    {
      schema: {
        tags: ["cases"],
        summary: "Record a call (with refs and named promises) on the timeline",
      },
    },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;
      const caseId = parseParams(request, reply);
      if (!caseId) return;

      const parsed = attachCallSchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));

      try {
        const event = await attachCall(
          db,
          orgId,
          caseId,
          parsed.data,
        );
        return reply.code(201).send(event);
      } catch (error) {
        if (error instanceof CaseNotFoundError) {
          return notFound(reply, error.message);
        }
        throw error;
      }
    },
  );

  fastify.post(
    "/:caseId/attach-sms",
    { schema: { tags: ["cases"], summary: "Record an SMS on the timeline" } },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;
      const caseId = parseParams(request, reply);
      if (!caseId) return;

      const parsed = attachSmsSchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));

      try {
        const event = await attachSms(
          db,
          orgId,
          caseId,
          parsed.data,
        );
        return reply.code(201).send(event);
      } catch (error) {
        if (error instanceof CaseNotFoundError) {
          return notFound(reply, error.message);
        }
        throw error;
      }
    },
  );

  fastify.get(
    "/:caseId/context",
    {
      schema: {
        tags: ["cases"],
        summary:
          "Prior-interaction context block for a follow-up CallPlan context field",
      },
    },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;
      const caseId = parseParams(request, reply);
      if (!caseId) return;

      const context = await caseContext(db, orgId, caseId);
      if (context === null) return notFound(reply, `Case not found: ${caseId}`);
      return reply.send({ caseId, context });
    },
  );
};

export default casesRoutes;
