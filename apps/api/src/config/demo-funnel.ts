/**
 * Configuration for the public landing-page demo funnel
 * (/api/v1/demo-funnel/*).
 *
 * OFF by default: every endpoint returns a graceful `{ status: "unavailable" }`
 * payload unless DEMO_FUNNEL_ENABLED is the exact string "true" (mirrors the
 * DEMO_CALL_ENABLED pattern in config/demo-call.ts).
 */
export const isDemoFunnelEnabled = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => env.DEMO_FUNNEL_ENABLED === "true";
