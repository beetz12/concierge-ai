import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  InMemoryTokenBucketRateLimiter,
  createDispatchRateLimiterFromEnv,
} from "./token-bucket.js";

test("allows requests up to capacity then rejects", () => {
  let now = 0;
  const limiter = new InMemoryTokenBucketRateLimiter({
    capacity: 3,
    refillPerSecond: 1,
    now: () => now,
  });

  assert.equal(limiter.consume("org-a").allowed, true);
  assert.equal(limiter.consume("org-a").allowed, true);
  const third = limiter.consume("org-a");
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);

  const rejected = limiter.consume("org-a");
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.remaining, 0);
  assert.ok(rejected.retryAfterSeconds >= 1);
  assert.equal(rejected.limit, 3);
});

test("buckets are isolated per key", () => {
  let now = 0;
  const limiter = new InMemoryTokenBucketRateLimiter({
    capacity: 1,
    refillPerSecond: 1,
    now: () => now,
  });

  assert.equal(limiter.consume("org-a").allowed, true);
  assert.equal(limiter.consume("org-a").allowed, false);
  // A different org has its own full bucket.
  assert.equal(limiter.consume("org-b").allowed, true);
});

test("refills over time at the configured rate", () => {
  let now = 0;
  const limiter = new InMemoryTokenBucketRateLimiter({
    capacity: 2,
    refillPerSecond: 1,
    now: () => now,
  });

  assert.equal(limiter.consume("org-a").allowed, true);
  assert.equal(limiter.consume("org-a").allowed, true);
  assert.equal(limiter.consume("org-a").allowed, false);

  // One second later, exactly one token has refilled.
  now += 1000;
  assert.equal(limiter.consume("org-a").allowed, true);
  assert.equal(limiter.consume("org-a").allowed, false);
});

test("refill never exceeds capacity", () => {
  let now = 0;
  const limiter = new InMemoryTokenBucketRateLimiter({
    capacity: 2,
    refillPerSecond: 5,
    now: () => now,
  });

  // Drain, then wait a long time.
  limiter.consume("org-a");
  limiter.consume("org-a");
  now += 60_000;

  // Only capacity (2) tokens are available despite a long idle period.
  assert.equal(limiter.consume("org-a").allowed, true);
  assert.equal(limiter.consume("org-a").allowed, true);
  assert.equal(limiter.consume("org-a").allowed, false);
});

test("createDispatchRateLimiterFromEnv honors env overrides", () => {
  const limiter = createDispatchRateLimiterFromEnv({
    DISPATCH_RATE_LIMIT_PER_MINUTE: "2",
    DISPATCH_RATE_LIMIT_BURST: "2",
  } as NodeJS.ProcessEnv);

  assert.equal(limiter.consume("org-a").allowed, true);
  assert.equal(limiter.consume("org-a").allowed, true);
  assert.equal(limiter.consume("org-a").allowed, false);
});

test("createDispatchRateLimiterFromEnv falls back to defaults on bad input", () => {
  const limiter = createDispatchRateLimiterFromEnv({
    DISPATCH_RATE_LIMIT_PER_MINUTE: "not-a-number",
  } as NodeJS.ProcessEnv);
  // Default is 30/min burst 30; first consume must be allowed.
  assert.equal(limiter.consume("org-a").allowed, true);
});

test("constructor rejects invalid options", () => {
  assert.throws(
    () => new InMemoryTokenBucketRateLimiter({ capacity: 0, refillPerSecond: 1 }),
    /capacity/,
  );
  assert.throws(
    () =>
      new InMemoryTokenBucketRateLimiter({ capacity: 1, refillPerSecond: 0 }),
    /refillPerSecond/,
  );
});
