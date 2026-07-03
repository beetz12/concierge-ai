import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { recordUsage, UsageDbClient } from "../src/services/billing/usage.js";
import {
  createCheckoutSession,
  CheckoutStripeClient,
} from "../src/services/billing/checkout.js";
import {
  handleStripeWebhookEvent,
  SubscriptionDbClient,
  StripeLifecycleEvent,
} from "../src/services/billing/webhook.js";

const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

// ---------------------------------------------------------------------------
// recordUsage
// ---------------------------------------------------------------------------

interface InsertCapture {
  table?: string;
  values?: Record<string, unknown>;
}

function mockUsageDb(capture: InsertCapture, error: { message: string } | null = null): UsageDbClient {
  return {
    from(table: string) {
      capture.table = table;
      return {
        insert(values: Record<string, unknown>) {
          capture.values = values;
          return Promise.resolve({ error });
        },
      };
    },
  };
}

describe("recordUsage", () => {
  test("writes a usage_events row with the given fields", async () => {
    const capture: InsertCapture = {};
    const occurredAt = new Date("2026-07-01T12:00:00Z");

    await recordUsage(mockUsageDb(capture), {
      orgId: ORG_ID,
      type: "call_minutes",
      quantity: 7.5,
      callId: "session-123",
      occurredAt,
    });

    assert.equal(capture.table, "usage_events");
    assert.deepEqual(capture.values, {
      org_id: ORG_ID,
      type: "call_minutes",
      quantity: 7.5,
      call_id: "session-123",
      occurred_at: occurredAt.toISOString(),
    });
  });

  test("defaults callId to null and occurredAt to now", async () => {
    const capture: InsertCapture = {};
    const before = Date.now();

    await recordUsage(mockUsageDb(capture), {
      orgId: ORG_ID,
      type: "sms_count",
      quantity: 1,
    });

    assert.equal(capture.values?.call_id, null);
    const occurredAt = Date.parse(capture.values?.occurred_at as string);
    assert.ok(occurredAt >= before && occurredAt <= Date.now());
  });

  test("rejects missing orgId, bad type, and negative quantity", async () => {
    const capture: InsertCapture = {};
    const db = mockUsageDb(capture);

    await assert.rejects(
      () => recordUsage(db, { orgId: "", type: "call_count", quantity: 1 }),
      /orgId is required/,
    );
    await assert.rejects(
      () =>
        recordUsage(db, {
          orgId: ORG_ID,
          // @ts-expect-error deliberately invalid
          type: "carrier_pigeons",
          quantity: 1,
        }),
      /unknown usage type/,
    );
    await assert.rejects(
      () => recordUsage(db, { orgId: ORG_ID, type: "call_count", quantity: -1 }),
      /non-negative/,
    );
    assert.equal(capture.values, undefined, "no insert should have happened");
  });

  test("surfaces database errors", async () => {
    const db = mockUsageDb({}, { message: "connection refused" });
    await assert.rejects(
      () => recordUsage(db, { orgId: ORG_ID, type: "call_count", quantity: 1 }),
      /connection refused/,
    );
  });
});

// ---------------------------------------------------------------------------
// createCheckoutSession
// ---------------------------------------------------------------------------

describe("createCheckoutSession", () => {
  function mockStripe(capture: { params?: Record<string, unknown> }): CheckoutStripeClient {
    return {
      checkout: {
        sessions: {
          async create(params: Record<string, unknown>) {
            capture.params = params;
            return { id: "cs_test_123", url: "https://checkout.stripe.test/cs_test_123" };
          },
        },
      },
    };
  }

  test("creates a subscription checkout session with org metadata", async () => {
    const capture: { params?: Record<string, unknown> } = {};

    const result = await createCheckoutSession(mockStripe(capture), {
      orgId: ORG_ID,
      plan: "pro",
      successUrl: "https://app.test/success",
      cancelUrl: "https://app.test/cancel",
      customerEmail: "owner@example.com",
    });

    assert.deepEqual(result, {
      sessionId: "cs_test_123",
      url: "https://checkout.stripe.test/cs_test_123",
    });
    assert.equal(capture.params?.mode, "subscription");
    assert.equal(capture.params?.client_reference_id, ORG_ID);
    assert.deepEqual(capture.params?.metadata, { org_id: ORG_ID, plan: "pro" });
    assert.deepEqual(capture.params?.subscription_data, {
      metadata: { org_id: ORG_ID, plan: "pro" },
    });
    const lineItems = capture.params?.line_items as Array<{ price: string; quantity: number }>;
    assert.equal(lineItems.length, 1);
    assert.equal(lineItems[0]?.quantity, 1);
    assert.ok(lineItems[0]?.price, "placeholder price id should be set");
  });

  test("rejects unknown plans and missing orgId", async () => {
    const stripe = mockStripe({});
    await assert.rejects(
      () =>
        createCheckoutSession(stripe, {
          orgId: ORG_ID,
          // @ts-expect-error deliberately invalid
          plan: "enterprise",
          successUrl: "https://app.test/s",
          cancelUrl: "https://app.test/c",
        }),
      /Unknown plan/,
    );
    await assert.rejects(
      () =>
        createCheckoutSession(stripe, {
          orgId: "",
          plan: "starter",
          successUrl: "https://app.test/s",
          cancelUrl: "https://app.test/c",
        }),
      /orgId is required/,
    );
  });
});

// ---------------------------------------------------------------------------
// handleStripeWebhookEvent
// ---------------------------------------------------------------------------

interface DbCapture {
  upserts: Array<{ table: string; values: Record<string, unknown>; onConflict: string }>;
  updates: Array<{ table: string; values: Record<string, unknown>; column: string; value: string }>;
}

function mockSubscriptionDb(capture: DbCapture): SubscriptionDbClient {
  return {
    from(table: string) {
      return {
        upsert(values: Record<string, unknown>, options: { onConflict: string }) {
          capture.upserts.push({ table, values, onConflict: options.onConflict });
          return Promise.resolve({ error: null });
        },
        update(values: Record<string, unknown>) {
          return {
            eq(column: string, value: string) {
              capture.updates.push({ table, values, column, value });
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

describe("handleStripeWebhookEvent", () => {
  test("checkout.session.completed upserts an active subscription", async () => {
    const capture: DbCapture = { upserts: [], updates: [] };

    const result = await handleStripeWebhookEvent(mockSubscriptionDb(capture), {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          customer: "cus_1",
          subscription: "sub_1",
          metadata: { org_id: ORG_ID, plan: "pro" },
        },
      },
    });

    assert.deepEqual(result, { handled: true, action: "upsert", orgId: ORG_ID });
    assert.equal(capture.upserts.length, 1);
    assert.equal(capture.upserts[0]?.table, "subscriptions");
    assert.equal(capture.upserts[0]?.onConflict, "org_id");
    assert.deepEqual(capture.upserts[0]?.values, {
      org_id: ORG_ID,
      stripe_customer_id: "cus_1",
      stripe_subscription_id: "sub_1",
      plan: "pro",
      status: "active",
    });
  });

  test("customer.subscription.updated mirrors the Stripe status", async () => {
    const capture: DbCapture = { upserts: [], updates: [] };

    const result = await handleStripeWebhookEvent(mockSubscriptionDb(capture), {
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          customer: { id: "cus_1" },
          status: "past_due",
          metadata: { org_id: ORG_ID, plan: "starter" },
        },
      },
    });

    assert.equal(result.handled, true);
    assert.equal(capture.upserts[0]?.values.status, "past_due");
    assert.equal(capture.upserts[0]?.values.stripe_customer_id, "cus_1");
    assert.equal(capture.upserts[0]?.values.plan, "starter");
  });

  test("customer.subscription.deleted marks the subscription canceled", async () => {
    const capture: DbCapture = { upserts: [], updates: [] };

    const result = await handleStripeWebhookEvent(mockSubscriptionDb(capture), {
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", metadata: { org_id: ORG_ID } } },
    });

    assert.deepEqual(result, { handled: true, action: "cancel", orgId: ORG_ID });
    assert.deepEqual(capture.updates, [
      {
        table: "subscriptions",
        values: { status: "canceled" },
        column: "stripe_subscription_id",
        value: "sub_1",
      },
    ]);
  });

  test("ignores events without org metadata and unknown event types", async () => {
    const capture: DbCapture = { upserts: [], updates: [] };
    const db = mockSubscriptionDb(capture);

    const noOrg = await handleStripeWebhookEvent(db, {
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", metadata: {} } },
    });
    assert.equal(noOrg.handled, false);

    const unknown = await handleStripeWebhookEvent(db, {
      type: "invoice.paid",
      data: { object: { id: "in_1" } },
    } as StripeLifecycleEvent);
    assert.equal(unknown.handled, false);

    assert.equal(capture.upserts.length, 0);
    assert.equal(capture.updates.length, 0);
  });
});
