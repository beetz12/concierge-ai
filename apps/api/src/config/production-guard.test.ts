import { strict as assert } from "node:assert";
import { test } from "node:test";
import { assertNotDemoInProduction } from "./production-guard.js";

/**
 * FIX 5(a): the bootstrap guard refuses to start when NODE_ENV=production and
 * DEMO_MODE=true, and is a no-op in every other combination.
 */

test("assertNotDemoInProduction throws when production + demo mode", () => {
  assert.throws(
    () =>
      assertNotDemoInProduction({
        NODE_ENV: "production",
        DEMO_MODE: "true",
      } as NodeJS.ProcessEnv),
    /DEMO_MODE=true is not allowed when NODE_ENV=production/,
  );
});

test("assertNotDemoInProduction allows production without demo mode", () => {
  assert.doesNotThrow(() =>
    assertNotDemoInProduction({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
  );
});

test("assertNotDemoInProduction allows demo mode outside production", () => {
  assert.doesNotThrow(() =>
    assertNotDemoInProduction({
      NODE_ENV: "development",
      DEMO_MODE: "true",
    } as NodeJS.ProcessEnv),
  );
});
