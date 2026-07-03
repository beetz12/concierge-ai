import { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getStripe } from "../services/billing/stripe-client.js";
import { createCheckoutSession } from "../services/billing/checkout.js";
import {
  handleStripeWebhookEvent,
  StripeLifecycleEvent,
} from "../services/billing/webhook.js";
import { PLAN_IDS, PlanId } from "../services/billing/types.js";

const checkoutBodySchema = z.object({
  plan: z.enum(PLAN_IDS as [PlanId, ...PlanId[]]),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

/**
 * Billing routes.
 *
 * - POST /api/v1/billing/checkout  (auth required; creates a Stripe Checkout
 *   session for the caller's org)
 * - POST /api/v1/billing/webhook   (exempt from user auth; authenticated by
 *   Stripe signature when STRIPE_WEBHOOK_SECRET is set)
 */
const billingRoutes: FastifyPluginAsync = async (fastify) => {
  // The Stripe webhook must be signature-verified against the RAW request
  // body, so within this plugin scope JSON bodies are kept as buffers and
  // parsed explicitly where needed.
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_request, body, done) => {
      done(null, body);
    },
  );

  fastify.post(
    "/checkout",
    {
      schema: {
        tags: ["billing"],
        summary: "Create a Stripe Checkout session for the caller's org",
      },
    },
    async (request, reply) => {
      if (!request.auth?.orgId) {
        return reply.code(403).send({
          statusCode: 403,
          error: "Forbidden",
          message: "No organization membership for this user",
        });
      }

      const parsed = checkoutBodySchema.safeParse(
        JSON.parse((request.body as Buffer).toString("utf8") || "{}"),
      );
      if (!parsed.success) {
        return reply.code(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: parsed.error.issues.map((i) => i.message).join("; "),
        });
      }

      const appUrl = process.env.APP_URL ?? "http://localhost:3000";

      let stripe;
      try {
        stripe = getStripe();
      } catch {
        return reply.code(503).send({
          statusCode: 503,
          error: "Service Unavailable",
          message: "Billing is not configured (missing STRIPE_SECRET_KEY)",
        });
      }

      const session = await createCheckoutSession(stripe, {
        orgId: request.auth.orgId,
        plan: parsed.data.plan,
        successUrl:
          parsed.data.successUrl ?? `${appUrl}/settings/billing?checkout=success`,
        cancelUrl:
          parsed.data.cancelUrl ?? `${appUrl}/settings/billing?checkout=cancelled`,
        customerEmail: request.auth.email,
      });

      return reply.send(session);
    },
  );

  fastify.post(
    "/webhook",
    {
      schema: {
        tags: ["billing"],
        summary: "Stripe subscription lifecycle webhook",
      },
      config: {
        // Stripe retries aggressively; don't rate-limit-ban Stripe's IPs.
        rateLimit: false,
      },
    },
    async (request, reply) => {
      const rawBody = request.body as Buffer;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      let event: StripeLifecycleEvent;
      if (webhookSecret) {
        const signature = request.headers["stripe-signature"];
        if (typeof signature !== "string") {
          return reply.code(400).send({ error: "Missing stripe-signature" });
        }
        try {
          event = getStripe().webhooks.constructEvent(
            rawBody,
            signature,
            webhookSecret,
          ) as unknown as StripeLifecycleEvent;
        } catch (error) {
          request.log.warn({ error }, "Stripe webhook signature verification failed");
          return reply.code(400).send({ error: "Invalid signature" });
        }
      } else {
        // Dev/test only: without a webhook secret the payload is trusted as-is.
        try {
          event = JSON.parse(rawBody.toString("utf8")) as StripeLifecycleEvent;
        } catch {
          return reply.code(400).send({ error: "Invalid JSON payload" });
        }
      }

      // Service-role usage justification: Stripe webhooks carry no user
      // context; subscription state is written with the admin client and is
      // read-only for tenants (see subscriptions_tenant_* policies).
      const result = await handleStripeWebhookEvent(fastify.supabase, event);
      request.log.info({ result, type: event.type }, "Stripe webhook processed");

      return reply.send({ received: true, handled: result.handled });
    },
  );
};

export default billingRoutes;
