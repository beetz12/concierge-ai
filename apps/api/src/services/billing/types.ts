/**
 * Billing service types and placeholder plan catalog.
 *
 * Plans are placeholders (pricing is a later product decision); the Stripe
 * price ids come from env so environments can point at real prices without
 * code changes.
 */

export type PlanId = "starter" | "pro";

export interface PlanConfig {
  id: PlanId;
  name: string;
  priceId: string;
}

export function getPlan(plan: string): PlanConfig {
  switch (plan) {
    case "starter":
      return {
        id: "starter",
        name: "Starter",
        priceId: process.env.STRIPE_PRICE_STARTER ?? "price_starter_placeholder",
      };
    case "pro":
      return {
        id: "pro",
        name: "Pro",
        priceId: process.env.STRIPE_PRICE_PRO ?? "price_pro_placeholder",
      };
    default:
      throw new Error(`Unknown plan: ${plan}`);
  }
}

export const PLAN_IDS: PlanId[] = ["starter", "pro"];

export type UsageEventType = "call_minutes" | "call_count" | "sms_count";

export const USAGE_EVENT_TYPES: UsageEventType[] = [
  "call_minutes",
  "call_count",
  "sms_count",
];

/**
 * Subscription lifecycle statuses mirrored from Stripe. Must stay in sync
 * with the CHECK constraint on public.subscriptions.
 */
export type SubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";
