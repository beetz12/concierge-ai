import Stripe from "stripe";

let client: Stripe | null = null;

/**
 * Lazily construct the Stripe client from STRIPE_SECRET_KEY.
 *
 * Throws when billing is not configured so callers can translate that into a
 * 503 instead of crashing at boot (billing is optional in dev/demo).
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!client) {
    client = new Stripe(key);
  }
  return client;
}

/** Test hook: drop the cached client so env changes take effect. */
export function resetStripeClient(): void {
  client = null;
}
