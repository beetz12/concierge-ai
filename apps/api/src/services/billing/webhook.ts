import { PLAN_IDS, PlanId, SubscriptionStatus } from "./types.js";

/**
 * Minimal structural view of the Supabase client used by the webhook
 * handler, so unit tests can inject a mock without a running database.
 */
export interface SubscriptionDbClient {
  from(table: string): {
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string },
    ): PromiseLike<{ error: { message: string } | null }>;
    update(values: Record<string, unknown>): {
      eq(
        column: string,
        value: string,
      ): PromiseLike<{ error: { message: string } | null }>;
    };
  };
}

/** The subset of a Stripe event the lifecycle handler consumes. */
export interface StripeLifecycleEvent {
  type: string;
  data: {
    object: {
      id: string;
      customer?: string | { id: string } | null;
      subscription?: string | { id: string } | null;
      status?: string;
      metadata?: Record<string, string | undefined> | null;
    };
  };
}

export interface WebhookHandleResult {
  handled: boolean;
  action?: "upsert" | "cancel";
  orgId?: string;
  reason?: string;
}

const VALID_STATUSES: SubscriptionStatus[] = [
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
];

const asId = (
  value: string | { id: string } | null | undefined,
): string | null => {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
};

const asPlan = (value: string | undefined): PlanId | null =>
  PLAN_IDS.includes(value as PlanId) ? (value as PlanId) : null;

const asStatus = (value: string | undefined): SubscriptionStatus | null =>
  VALID_STATUSES.includes(value as SubscriptionStatus)
    ? (value as SubscriptionStatus)
    : null;

/**
 * Apply a Stripe subscription-lifecycle event to the subscriptions table.
 *
 * Callers pass the service-role Supabase client. Service-role usage
 * justification: webhook requests carry no user context (they are
 * authenticated by Stripe signature at the route), and subscriptions has
 * `WITH CHECK (false)` user policies so lifecycle state can only be written
 * server-side.
 */
export async function handleStripeWebhookEvent(
  db: SubscriptionDbClient,
  event: StripeLifecycleEvent,
): Promise<WebhookHandleResult> {
  const object = event.data.object;

  switch (event.type) {
    case "checkout.session.completed": {
      const orgId = object.metadata?.org_id;
      if (!orgId) {
        return { handled: false, reason: "checkout session has no org_id metadata" };
      }

      // Seed the subscription ids/plan. Prefer the event's real subscription
      // status when Stripe provides one; otherwise leave status unset and let
      // the subsequent customer.subscription.created/updated event set it,
      // rather than forcing "active" before Stripe has confirmed the state.
      const values: Record<string, unknown> = {
        org_id: orgId,
        stripe_customer_id: asId(object.customer),
        stripe_subscription_id: asId(object.subscription),
        plan: asPlan(object.metadata?.plan) ?? "starter",
      };
      const status = asStatus(object.status);
      if (status) values.status = status;

      const { error } = await db
        .from("subscriptions")
        .upsert(values, { onConflict: "org_id" });
      if (error) {
        throw new Error(`billing webhook: upsert failed: ${error.message}`);
      }
      return { handled: true, action: "upsert", orgId };
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const orgId = object.metadata?.org_id;
      if (!orgId) {
        return { handled: false, reason: "subscription has no org_id metadata" };
      }

      const values: Record<string, unknown> = {
        org_id: orgId,
        stripe_customer_id: asId(object.customer),
        stripe_subscription_id: object.id,
        status: asStatus(object.status) ?? "incomplete",
      };
      const plan = asPlan(object.metadata?.plan);
      if (plan) values.plan = plan;

      const { error } = await db
        .from("subscriptions")
        .upsert(values, { onConflict: "org_id" });
      if (error) {
        throw new Error(`billing webhook: upsert failed: ${error.message}`);
      }
      return { handled: true, action: "upsert", orgId };
    }

    case "customer.subscription.deleted": {
      const { error } = await db
        .from("subscriptions")
        .update({ status: "canceled" })
        .eq("stripe_subscription_id", object.id);
      if (error) {
        throw new Error(`billing webhook: cancel failed: ${error.message}`);
      }
      return {
        handled: true,
        action: "cancel",
        orgId: object.metadata?.org_id,
      };
    }

    default:
      return { handled: false, reason: `unhandled event type: ${event.type}` };
  }
}
