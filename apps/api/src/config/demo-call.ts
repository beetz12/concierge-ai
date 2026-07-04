/**
 * Configuration for the public marketing demo-call endpoint
 * (POST /api/v1/demo-call).
 *
 * The endpoint is OFF by default and only dials when BOTH the feature flag is
 * explicitly enabled AND Retell telephony is configured. Either check failing
 * makes the endpoint return a graceful "unavailable" response instead of
 * placing a real call.
 */

/**
 * True only when `DEMO_CALL_ENABLED` is the exact string "true".
 * Any other value (or unset) leaves the demo-call endpoint disabled.
 */
export const isDemoCallEnabled = (
  env: NodeJS.ProcessEnv = process.env,
): boolean => env.DEMO_CALL_ENABLED === "true";

/**
 * True when the Retell backend has enough env to place a call: an API key and
 * an outbound caller-id number. Without these, the endpoint stays "unavailable"
 * even if the flag is on.
 */
export const isRetellConfigured = (
  env: NodeJS.ProcessEnv = process.env,
): boolean =>
  Boolean(env.RETELL_API_KEY?.trim()) && Boolean(env.RETELL_FROM_NUMBER?.trim());
