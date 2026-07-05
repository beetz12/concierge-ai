/**
 * SMS OTP service for the landing-page demo funnel.
 *
 * Security posture:
 *   - Codes are 6 random digits from crypto (not Math.random).
 *   - Only HMAC-SHA256(code, OTP_HASH_SECRET) is persisted — never plaintext.
 *   - Codes expire after 10 minutes and lock after 5 failed verify attempts.
 *   - The secret FAILS CLOSED: outside DEMO_MODE, a missing OTP_HASH_SECRET
 *     disables the whole funnel (see resolveOtpHashSecret).
 *   - Successful verification issues a 15-minute jose JWT whose `phone` claim
 *     is THE ONLY source of the dialed number downstream — request bodies can
 *     never influence the dial target.
 */

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { isDemoMode } from "../../config/demo.js";
import type { DemoFunnelStore } from "./store.js";

/** OTP code lifetime. */
export const OTP_TTL_MINUTES = 10;
/** Failed verify attempts allowed per code before it locks. */
export const OTP_MAX_ATTEMPTS = 5;
/** Verification-token (JWT) lifetime. */
export const VERIFICATION_TOKEN_TTL = "15m";
/** JWT purpose claim — tokens are single-purpose. */
export const VERIFICATION_TOKEN_PURPOSE = "demo-call";

/**
 * Fixed development-only secret used when DEMO_MODE=true and OTP_HASH_SECRET
 * is unset. Deliberately worthless in production (DEMO_MODE refuses to boot
 * there — see config/production-guard.ts).
 */
const DEMO_MODE_DEV_SECRET = "demo-funnel-dev-otp-secret-not-for-production";

/**
 * Resolve the OTP hash/signing secret. Fail closed: outside DEMO_MODE a
 * missing OTP_HASH_SECRET returns null and callers must treat the funnel as
 * unavailable rather than invent a weaker secret.
 */
export const resolveOtpHashSecret = (
  env: NodeJS.ProcessEnv = process.env,
): string | null => {
  const secret = env.OTP_HASH_SECRET?.trim();
  if (secret) return secret;
  if (isDemoMode()) return DEMO_MODE_DEV_SECRET;
  return null;
};

/** Cryptographically random 6-digit code, zero-padded ("042311"). */
export const generateOtpCode = (): string =>
  String(randomInt(0, 1_000_000)).padStart(6, "0");

/** HMAC-SHA256(code, secret) as hex — the only form of the code we store. */
export const hashOtpCode = (code: string, secret: string): string =>
  createHmac("sha256", secret).update(code).digest("hex");

const codeMatches = (code: string, codeHash: string, secret: string): boolean => {
  const candidate = Buffer.from(hashOtpCode(code, secret), "hex");
  const stored = Buffer.from(codeHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
};

/**
 * Normalize a US phone number to strict E.164 (+1XXXXXXXXXX).
 * Accepts common formatting ((864) 555-0132, 864.555.0132, 1-864-555-0132,
 * +18645550132); anything that is not a 10-digit US number returns null.
 */
export const normalizeUsE164 = (input: string): string | null => {
  const digits = input.replace(/[\s().+-]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  const national =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  // NANP: area code and exchange cannot start with 0 or 1.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(national)) return null;
  return `+1${national}`;
};

export type OtpVerifyOutcome =
  | { status: "verified"; verificationToken: string }
  | { status: "invalid"; attemptsRemaining: number }
  | { status: "locked" }
  | { status: "expired" };

export interface VerifiedDemoToken {
  /** E.164 number proven via OTP — the ONLY permissible dial target. */
  phone: string;
}

/**
 * Issue the short-lived verification token a visitor exchanges for their one
 * demo call. Claims: { purpose: "demo-call", phone } — signed HS256 with the
 * OTP secret, 15-minute expiry.
 */
export const issueVerificationToken = async (
  phoneE164: string,
  secret: string,
): Promise<string> =>
  new SignJWT({ purpose: VERIFICATION_TOKEN_PURPOSE, phone: phoneE164 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(VERIFICATION_TOKEN_TTL)
    .sign(new TextEncoder().encode(secret));

/**
 * Verify a demo verification token's signature, expiry, and purpose.
 * Returns the proven phone number, or null for any invalid token.
 */
export const verifyVerificationToken = async (
  token: string,
  secret: string,
): Promise<VerifiedDemoToken | null> => {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
      { algorithms: ["HS256"] },
    );
    if (payload.purpose !== VERIFICATION_TOKEN_PURPOSE) return null;
    if (typeof payload.phone !== "string") return null;
    return { phone: payload.phone };
  } catch {
    return null;
  }
};

/**
 * Store-backed OTP lifecycle: create (hash + persist) and verify
 * (expiry -> attempts -> constant-time compare -> consume + issue token).
 */
export class OtpService {
  constructor(
    private readonly store: DemoFunnelStore,
    private readonly secret: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Generate + persist a code for a number; returns the plaintext code to SMS. */
  async createOtp(
    phoneE164: string,
    ip: string | null,
  ): Promise<{ code: string }> {
    const code = generateOtpCode();
    const expiresAt = new Date(
      this.now().getTime() + OTP_TTL_MINUTES * 60_000,
    ).toISOString();
    await this.store.createOtpRequest({
      phoneE164,
      codeHash: hashOtpCode(code, this.secret),
      ip,
      expiresAt,
    });
    return { code };
  }

  /** Verify a code for a number against the latest unconsumed OTP. */
  async verifyOtp(phoneE164: string, code: string): Promise<OtpVerifyOutcome> {
    const record = await this.store.findActiveOtp(phoneE164);
    // No live code is indistinguishable from an expired one to the caller.
    if (!record) return { status: "expired" };
    if (new Date(record.expiresAt).getTime() <= this.now().getTime()) {
      return { status: "expired" };
    }
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      return { status: "locked" };
    }
    if (!codeMatches(code, record.codeHash, this.secret)) {
      const attempts = await this.store.recordFailedAttempt(record.id);
      if (attempts >= OTP_MAX_ATTEMPTS) return { status: "locked" };
      return {
        status: "invalid",
        attemptsRemaining: OTP_MAX_ATTEMPTS - attempts,
      };
    }
    await this.store.markOtpVerified(record.id, this.now().toISOString());
    const verificationToken = await issueVerificationToken(
      phoneE164,
      this.secret,
    );
    return { status: "verified", verificationToken };
  }
}
