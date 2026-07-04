/**
 * Inbound webhook signature verification.
 *
 * Each provider signs its webhooks differently:
 * - Stripe: verified in-route via `stripe.webhooks.constructEvent` (billing.ts).
 * - Twilio: HMAC-SHA1 over the full URL + sorted POST params, base64, in the
 *   `X-Twilio-Signature` header. The official SDK's `validateRequest` does
 *   this; we wrap it so the route stays thin and testable.
 * - VAPI: a shared secret. VAPI lets you configure a server-auth header
 *   (commonly `X-Vapi-Secret`); we compare it in constant time against
 *   `VAPI_WEBHOOK_SECRET`.
 *
 * Posture: fail-CLOSED when the secret is configured (reject bad/missing
 * signatures). When the secret is UNSET, behavior depends on environment: in
 * production a missing secret fails CLOSED (reject unsigned) so an
 * unauthenticated webhook can never be trusted, while in dev/test it fails OPEN
 * with a warning so local dev and demos keep working. Production readiness
 * therefore requires setting the secrets -- documented in docs/deployment.md
 * and .env.example.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
// twilio is a CommonJS module; `validateRequest` is a property of the default
// export, not a named ESM export, so destructure it off the default import.
import twilio from "twilio";

const { validateRequest } = twilio;

export type WebhookVerifyResult =
  | { ok: true; enforced: boolean }
  | { ok: false; reason: string };

/** True when running under NODE_ENV=production (fail-closed on missing secrets). */
const isProductionEnv = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.NODE_ENV === "production";

/** Constant-time string comparison that tolerates length differences. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Compare against self to keep timing uniform, then return false.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify a VAPI webhook using a shared secret header.
 *
 * @param headerValue value of the configured secret header (e.g. X-Vapi-Secret)
 * @param secret      the expected secret (VAPI_WEBHOOK_SECRET); when empty,
 *                    verification is not enforced (fail-open with warning)
 */
export function verifyVapiSignature(
  headerValue: string | undefined,
  secret: string | undefined,
  isProduction: boolean = isProductionEnv(),
): WebhookVerifyResult {
  if (!secret) {
    if (isProduction) {
      return { ok: false, reason: "VAPI webhook secret is not configured" };
    }
    return { ok: true, enforced: false };
  }
  if (!headerValue) {
    return { ok: false, reason: "Missing VAPI webhook secret header" };
  }
  if (!safeEqual(headerValue, secret)) {
    return { ok: false, reason: "Invalid VAPI webhook secret" };
  }
  return { ok: true, enforced: true };
}

/**
 * Optional HMAC variant for VAPI when a signing secret (not a static token) is
 * configured: HMAC-SHA256 of the raw body, hex-encoded. Exposed for
 * deployments that prefer body signing over a static header token.
 */
export function verifyVapiHmac(
  rawBody: string,
  signatureHeader: string | undefined,
  signingSecret: string | undefined,
  isProduction: boolean = isProductionEnv(),
): WebhookVerifyResult {
  if (!signingSecret) {
    if (isProduction) {
      return { ok: false, reason: "VAPI signing secret is not configured" };
    }
    return { ok: true, enforced: false };
  }
  if (!signatureHeader) {
    return { ok: false, reason: "Missing VAPI signature header" };
  }
  const expected = createHmac("sha256", signingSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  if (!safeEqual(signatureHeader, expected)) {
    return { ok: false, reason: "Invalid VAPI HMAC signature" };
  }
  return { ok: true, enforced: true };
}

export interface TwilioVerifyInput {
  /** Value of the X-Twilio-Signature header. */
  signature: string | undefined;
  /** The full public URL Twilio POSTed to (scheme + host + path). */
  url: string;
  /** The parsed application/x-www-form-urlencoded body params. */
  params: Record<string, unknown>;
  /** Twilio auth token; when empty, verification is not enforced. */
  authToken: string | undefined;
}

/**
 * Verify a Twilio webhook signature using the official algorithm. Fail-open
 * (with a caller-side warning) when no auth token is configured.
 */
export function verifyTwilioSignature(
  input: TwilioVerifyInput,
  isProduction: boolean = isProductionEnv(),
): WebhookVerifyResult {
  if (!input.authToken) {
    if (isProduction) {
      return { ok: false, reason: "Twilio auth token is not configured" };
    }
    return { ok: true, enforced: false };
  }
  if (!input.signature) {
    return { ok: false, reason: "Missing X-Twilio-Signature header" };
  }
  // Twilio's validateRequest wants string param values.
  const stringParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.params ?? {})) {
    stringParams[key] = value == null ? "" : String(value);
  }
  const valid = validateRequest(
    input.authToken,
    input.signature,
    input.url,
    stringParams,
  );
  return valid
    ? { ok: true, enforced: true }
    : { ok: false, reason: "Invalid Twilio signature" };
}

/**
 * Reconstruct the public URL Twilio signed. Behind a proxy/load balancer the
 * request sees the internal scheme/host, so honor `x-forwarded-proto` /
 * `x-forwarded-host` and an explicit `PUBLIC_BASE_URL` override when present.
 */
export function reconstructPublicUrl(
  headers: Record<string, unknown>,
  originalUrl: string,
  publicBaseUrl: string | undefined,
): string {
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/$/, "")}${originalUrl}`;
  }
  const proto =
    firstHeader(headers["x-forwarded-proto"]) ??
    firstHeader(headers["x-forwarded-protocol"]) ??
    "https";
  const host =
    firstHeader(headers["x-forwarded-host"]) ?? firstHeader(headers["host"]);
  return `${proto}://${host ?? "localhost"}${originalUrl}`;
}

function firstHeader(value: unknown): string | undefined {
  if (Array.isArray(value)) return value[0] == null ? undefined : String(value[0]);
  if (value == null) return undefined;
  return String(value).split(",")[0]?.trim();
}
