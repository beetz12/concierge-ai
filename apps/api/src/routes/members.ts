import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  getCallBackend,
  type CallBackend,
} from "../services/call-backend/index.js";
import {
  NumberPurchaseError,
  purchaseOrgNumber,
} from "../services/call-backend/retell/number-purchase.js";
import { RetellProvisioner } from "../services/call-backend/retell/provisioning.js";
import { RetellHttpClient } from "../services/call-backend/retell/retell-http.js";
import { listDispatches } from "../services/dispatch/registry.js";
import {
  getMembershipStore,
  type MembershipStore,
  type OrgCallSettings,
  type OrgPhoneNumber,
} from "../services/membership/index.js";
import { isDemoMode } from "../config/demo.js";

/**
 * Membership routes, registered under the /api/v1/members prefix (JWT + org
 * required — NOT exempt from the tenant auth middleware).
 *
 * - GET  /api/v1/members/me                 org, subscription, number, settings
 * - POST /api/v1/members/onboarding/number  provision the org's dedicated number
 * - GET  /api/v1/members/settings           per-org call settings
 * - PUT  /api/v1/members/settings           upsert per-org call settings
 * - GET  /api/v1/members/calls              org call history (dispatch registry)
 *
 * Number purchases NEVER spend real money unless RETELL_NUMBER_PURCHASE_ENABLED
 * is explicitly "true"; the default provisions a deterministic simulated
 * number (see services/call-backend/retell/number-purchase.ts).
 *
 * Subscription state comes from the durable `subscriptions` table maintained
 * by the Stripe webhook (services/billing/webhook.ts); DEMO_MODE reports a
 * synthetic 'demo_active' subscription so the flow works without Stripe.
 */

const VOICEMAIL_POLICIES = ["leave_message", "hang_up", "retry_later"] as const;

/** Single US E.164 number, e.g. +18645551234 (same shape the guards use). */
const US_E164_REGEX = /^\+1\d{10}$/;

/** Subscription statuses that unlock number onboarding. */
const ONBOARDING_STATUSES = new Set(["active", "trialing"]);

const onboardingNumberSchema = z.object({
  areaCode: z
    .string()
    .regex(/^\d{3}$/, "areaCode must be a 3-digit US area code")
    .optional(),
});

const settingsSchema = z
  .object({
    callerIdentity: z.string().trim().min(1).max(200).nullable().optional(),
    voicemailPolicy: z.enum(VOICEMAIL_POLICIES).optional(),
    transferNumber: z
      .string()
      .regex(US_E164_REGEX, "transferNumber must be a US E.164 number")
      .nullable()
      .optional(),
  })
  .strict();

const callsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).optional(),
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

const requireOrg = (
  request: FastifyRequest,
  reply: FastifyReply,
): string | null => {
  const orgId = request.auth?.orgId;
  if (!orgId) {
    reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Membership routes require an organization context",
    });
    return null;
  }
  return orgId;
};

const settingsView = (settings: OrgCallSettings | null) => ({
  callerIdentity: settings?.callerIdentity ?? null,
  voicemailPolicy: settings?.voicemailPolicy ?? "hang_up",
  transferNumber: settings?.transferNumber ?? null,
  updatedAt: settings?.updatedAt ?? null,
});

const numberView = (number: OrgPhoneNumber | null) =>
  number
    ? {
        id: number.id,
        phoneE164: number.phoneE164,
        status: number.status,
        areaCode: number.areaCode,
        purchasedAt: number.purchasedAt,
        releasedAt: number.releasedAt,
      }
    : null;

export interface MembersRoutesOptions {
  /** Injectable membership store (tests); defaults per DEMO_MODE. */
  store?: MembershipStore;
  /** Injectable call backend for call-history status lookups (tests). */
  backend?: CallBackend;
  /** Injectable demo-mode probe (tests); defaults to the DEMO_MODE env. */
  demoMode?: () => boolean;
  /** Number-purchase wiring overrides (tests). */
  purchase?: {
    enabled?: boolean;
    client?: RetellHttpClient;
    agentId?: string;
    provisioner?: RetellProvisioner;
  };
}

const membersRoutes: FastifyPluginAsync<MembersRoutesOptions> = async (
  fastify,
  options,
) => {
  const demoMode = options.demoMode ?? isDemoMode;
  const store: MembershipStore =
    options.store ?? getMembershipStore(fastify.supabase);
  const backend: CallBackend =
    options.backend ??
    getCallBackend(
      { supabase: fastify.supabase },
      demoMode() ? { ...process.env, CALL_BACKEND: "mock" } : process.env,
    );

  /**
   * Build the number-purchase dependencies lazily (only when onboarding is
   * actually invoked). The real-money path stays gated behind
   * RETELL_NUMBER_PURCHASE_ENABLED=true; simulated provisioning needs no
   * Retell credentials at all.
   */
  const purchaseDeps = () => {
    const enabled =
      options.purchase?.enabled ??
      process.env.RETELL_NUMBER_PURCHASE_ENABLED === "true";
    if (!enabled) {
      return { store, purchaseEnabled: false as const };
    }
    let client = options.purchase?.client;
    let provisioner = options.purchase?.provisioner;
    const agentId =
      options.purchase?.agentId ??
      (process.env.RETELL_AGENT_ID?.trim() || undefined);
    if (!client) {
      const apiKey = process.env.RETELL_API_KEY?.trim() ?? "";
      client = new RetellHttpClient({ apiKey });
      provisioner ??= new RetellProvisioner(client, {
        agentId,
        llmId: process.env.RETELL_LLM_ID?.trim() || undefined,
        agentName: process.env.RETELL_AGENT_NAME?.trim() || undefined,
        voiceId: process.env.RETELL_VOICE_ID?.trim() || undefined,
        transferNumber: process.env.RETELL_TRANSFER_NUMBER?.trim() || undefined,
      });
    }
    return { store, purchaseEnabled: true as const, client, agentId, provisioner };
  };

  const subscriptionOf = async (
    orgId: string,
  ): Promise<{ status: string | null; plan: string | null }> => {
    if (demoMode()) {
      return { status: "demo_active", plan: "demo" };
    }
    return store.getSubscription(orgId);
  };

  fastify.get(
    "/me",
    {
      schema: {
        tags: ["members"],
        summary:
          "Current member context: org, subscription, dedicated number, settings",
      },
    },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;

      const [org, subscription, dedicatedNumber, settings] = await Promise.all([
        store.getOrganization(orgId),
        subscriptionOf(orgId),
        store.getOrgPhoneNumber(orgId),
        store.getCallSettings(orgId),
      ]);

      return reply.send({
        org: org ?? {
          id: orgId,
          name: demoMode() ? "Demo Organization" : null,
        },
        subscription,
        dedicatedNumber: numberView(dedicatedNumber),
        settings: settingsView(settings),
      });
    },
  );

  fastify.post(
    "/onboarding/number",
    {
      schema: {
        tags: ["members"],
        summary:
          "Provision the org's dedicated outbound number (simulated unless purchase is enabled)",
      },
    },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;

      const parsed = onboardingNumberSchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));

      // Dedicated numbers are a paid-membership feature: require an active
      // (or trialing) subscription unless the stack runs in DEMO_MODE.
      if (!demoMode()) {
        const subscription = await store.getSubscription(orgId);
        if (
          !subscription.status ||
          !ONBOARDING_STATUSES.has(subscription.status)
        ) {
          return reply.code(402).send({
            statusCode: 402,
            error: "Payment Required",
            reason: "subscription_required",
            message:
              "An active subscription is required to provision a dedicated number.",
          });
        }
      }

      try {
        const result = await purchaseOrgNumber(purchaseDeps(), {
          orgId,
          areaCode: parsed.data.areaCode,
        });
        return reply.send({
          number: numberView(result.number),
          simulated: result.simulated,
          alreadyProvisioned: result.alreadyProvisioned,
        });
      } catch (error) {
        if (error instanceof NumberPurchaseError) {
          const statusCode = error.code === "retell_not_configured" ? 503 : 502;
          request.log.error(
            { orgId, code: error.code, reason: error.reason },
            "Dedicated number provisioning failed",
          );
          return reply.code(statusCode).send({
            statusCode,
            error: "NumberPurchaseFailed",
            code: error.code,
            reason: error.reason,
          });
        }
        throw error;
      }
    },
  );

  fastify.get(
    "/settings",
    {
      schema: {
        tags: ["members"],
        summary: "Per-org outbound call settings",
      },
    },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;
      const settings = await store.getCallSettings(orgId);
      return reply.send({ settings: settingsView(settings) });
    },
  );

  fastify.put(
    "/settings",
    {
      schema: {
        tags: ["members"],
        summary: "Update per-org outbound call settings",
      },
    },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;

      const parsed = settingsSchema.safeParse(request.body ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));

      const updated = await store.upsertCallSettings(orgId, parsed.data);
      return reply.send({ settings: settingsView(updated) });
    },
  );

  fastify.get(
    "/calls",
    {
      schema: {
        tags: ["members"],
        summary: "Org call history (artifacts stay behind /api/v1/dispatch/:callId/artifacts)",
      },
    },
    async (request, reply) => {
      const orgId = requireOrg(request, reply);
      if (!orgId) return;

      const parsed = callsQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) return badRequest(reply, zodMessage(parsed.error));
      const { limit, cursor } = parsed.data;

      const all = listDispatches(orgId);
      let start = 0;
      if (cursor) {
        const cursorIndex = all.findIndex(
          (record) => record.callId === cursor,
        );
        if (cursorIndex === -1) return badRequest(reply, "Unknown cursor");
        start = cursorIndex + 1;
      }
      const page = all.slice(start, start + limit);

      const calls = await Promise.all(
        page.map(async (record) => {
          let status = "unknown";
          let disposition: string | null = null;
          let summary: string | null = null;
          let hasArtifacts = false;
          try {
            const live = await backend.getStatus(record.callId);
            status = live.state;
            disposition = live.disposition;
            summary = live.summary;
            hasArtifacts = live.completed;
          } catch (error) {
            request.log.warn(
              { error, callId: record.callId },
              "Failed to resolve live status for call history (non-fatal)",
            );
          }
          return {
            callId: record.callId,
            businessName: record.plan.businessName,
            status,
            disposition,
            summary,
            createdAt: record.dispatchedAt,
            hasArtifacts,
          };
        }),
      );

      const last = page[page.length - 1];
      return reply.send({
        calls,
        nextCursor: last && start + limit < all.length ? last.callId : null,
      });
    },
  );
};

export default membersRoutes;
