import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  __resetObservabilityForTests,
  captureException,
  initObservability,
} from "./observability.js";

test("initObservability is a no-op without SENTRY_DSN", async () => {
  __resetObservabilityForTests();
  const active = await initObservability(undefined, {} as NodeJS.ProcessEnv);
  assert.equal(active, false);
});

test("initObservability with DSN but missing @sentry/node fails open", async () => {
  __resetObservabilityForTests();
  // @sentry/node is not installed in this workspace, so init should warn and
  // return false rather than throw.
  const warnings: unknown[] = [];
  const active = await initObservability(
    {
      info: () => {},
      warn: (obj) => warnings.push(obj),
    },
    { SENTRY_DSN: "https://example@o0.ingest.sentry.io/0" } as NodeJS.ProcessEnv,
  );
  assert.equal(active, false);
  assert.ok(warnings.length >= 1);
});

test("captureException is a safe no-op when Sentry is inactive", () => {
  __resetObservabilityForTests();
  // Must not throw even though nothing is initialized.
  assert.doesNotThrow(() => captureException(new Error("x"), { a: 1 }));
});

test("initObservability is idempotent", async () => {
  __resetObservabilityForTests();
  const first = await initObservability(undefined, {} as NodeJS.ProcessEnv);
  const second = await initObservability(undefined, {
    SENTRY_DSN: "https://example@o0.ingest.sentry.io/0",
  } as NodeJS.ProcessEnv);
  // Second call is a no-op returning the first result (still disabled).
  assert.equal(first, false);
  assert.equal(second, false);
});
