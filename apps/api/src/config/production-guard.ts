/**
 * Fail-fast production safety guard.
 *
 * Demo mode bypasses authentication, skips the database, and simulates calls,
 * so it must never run in production. Throws when both `NODE_ENV=production`
 * and `DEMO_MODE=true` are set; callers invoke this during bootstrap.
 */
export function assertNotDemoInProduction(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV === "production" && env.DEMO_MODE === "true") {
    throw new Error(
      "Refusing to start: DEMO_MODE=true is not allowed when NODE_ENV=production. " +
        "Demo mode bypasses authentication and the database; disable it for production.",
    );
  }
}
