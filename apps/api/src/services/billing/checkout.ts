import { getPlan, PlanId } from "./types.js";

/**
 * Minimal structural view of the Stripe client used for checkout, so unit
 * tests can inject a mock (no live Stripe calls in tests).
 */
export interface CheckoutStripeClient {
  checkout: {
    sessions: {
      create(params: Record<string, unknown>): Promise<{
        id: string;
        url: string | null;
      }>;
    };
  };
}

export interface CreateCheckoutSessionInput {
  orgId: string;
  plan: PlanId;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string;
}

export interface CheckoutSessionResult {
  sessionId: string;
  url: string | null;
}

/**
 * Create a Stripe Checkout session for one of the placeholder plans.
 *
 * The org id rides along as metadata on both the session and the resulting
 * subscription so the webhook handler can attribute lifecycle events back to
 * the tenant without any extra lookup table.
 */
export async function createCheckoutSession(
  stripe: CheckoutStripeClient,
  input: CreateCheckoutSessionInput,
): Promise<CheckoutSessionResult> {
  if (!input.orgId) {
    throw new Error("createCheckoutSession: orgId is required");
  }

  const plan = getPlan(input.plan);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: plan.priceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    customer_email: input.customerEmail,
    client_reference_id: input.orgId,
    metadata: { org_id: input.orgId, plan: plan.id },
    subscription_data: {
      metadata: { org_id: input.orgId, plan: plan.id },
    },
  });

  return { sessionId: session.id, url: session.url };
}
