/**
 * Per-org dedicated outbound number provisioning.
 *
 * SAFETY: buying a phone number costs real money. The real Retell purchase
 * path (`POST /create-phone-number`) only runs when the caller passes
 * `purchaseEnabled: true` — wired from the RETELL_NUMBER_PURCHASE_ENABLED
 * env var, default false. While disabled, a deterministic *simulated* number
 * is persisted instead (status 'simulated', no HTTP, no money), which is
 * enough for the full membership flow to work locally and in demos.
 *
 * Idempotent by design: an org holds at most one number (org_id UNIQUE), so
 * a second purchase returns the existing row without touching Retell.
 */
import { createHash } from "node:crypto";
import {
  OrgNumberConflictError,
  type MembershipStore,
  type OrgPhoneNumber,
} from "../../membership/types.js";
import type { RetellProvisioner } from "./provisioning.js";
import { describeApiError, type RetellHttpClient } from "./retell-http.js";
import { retellPhoneNumberSchema } from "./schemas.js";

export type NumberPurchaseFailureCode =
  | "retell_error"
  | "retell_not_configured"
  | "simulated_allocation_failed";

/** Typed failure: never leaves a partial org_phone_numbers row behind. */
export class NumberPurchaseError extends Error {
  constructor(
    readonly code: NumberPurchaseFailureCode,
    readonly reason: string,
    readonly status?: number,
  ) {
    super(`Number purchase failed (${code}): ${reason}`);
    this.name = "NumberPurchaseError";
  }
}

export interface PurchaseOrgNumberDeps {
  store: MembershipStore;
  /** Gate for the real-money Retell purchase path (default: off). */
  purchaseEnabled: boolean;
  /** Required when purchaseEnabled; unused for simulated numbers. */
  client?: RetellHttpClient;
  /** Agent bound to the purchased number; resolved via provisioner if unset. */
  agentId?: string;
  /** Resolves the outbound agent when no explicit agentId is configured. */
  provisioner?: RetellProvisioner;
}

export interface PurchaseOrgNumberInput {
  orgId: string;
  /** Preferred 3-digit US area code. */
  areaCode?: string;
}

export interface PurchaseOrgNumberResult {
  number: OrgPhoneNumber;
  simulated: boolean;
  alreadyProvisioned: boolean;
}

const SIMULATED_ATTEMPTS = 100;

/** Deterministic per-org seed for the simulated number suffix. */
function orgSeed(orgId: string): number {
  const digest = createHash("sha256").update(orgId).digest();
  return digest.readUInt32BE(0) % 10_000;
}

/**
 * Pick a deterministic simulated number for the org:
 * `+1{areaCode|555}555{4-digit suffix}`, where the suffix derives from a
 * hash of the org id and increments until it does not collide with a number
 * already held by any org.
 */
async function pickSimulatedNumber(
  store: MembershipStore,
  orgId: string,
  areaCode: string | undefined,
): Promise<string> {
  const area = areaCode && /^\d{3}$/.test(areaCode) ? areaCode : "555";
  const seed = orgSeed(orgId);
  for (let attempt = 0; attempt < SIMULATED_ATTEMPTS; attempt++) {
    const suffix = String((seed + attempt) % 10_000).padStart(4, "0");
    const candidate = `+1${area}555${suffix}`;
    if (!(await store.findOrgPhoneNumberByPhone(candidate))) {
      return candidate;
    }
  }
  throw new NumberPurchaseError(
    "simulated_allocation_failed",
    `Could not allocate a unique simulated number after ${SIMULATED_ATTEMPTS} attempts.`,
  );
}

/**
 * Insert the number, treating a concurrent insert for the same org as
 * idempotent success (re-read and return the winner's row).
 */
async function insertIdempotent(
  store: MembershipStore,
  input: Parameters<MembershipStore["insertOrgPhoneNumber"]>[0],
): Promise<{ row: OrgPhoneNumber; alreadyProvisioned: boolean }> {
  try {
    return { row: await store.insertOrgPhoneNumber(input), alreadyProvisioned: false };
  } catch (error) {
    if (error instanceof OrgNumberConflictError) {
      const existing = await store.getOrgPhoneNumber(input.orgId);
      if (existing) return { row: existing, alreadyProvisioned: true };
    }
    throw error;
  }
}

/**
 * Provision (or return) the org's dedicated outbound number.
 *
 * - Existing row → returned as-is with `alreadyProvisioned: true` (no HTTP).
 * - Purchase gate off → deterministic simulated number, persisted, no HTTP.
 * - Purchase gate on → `POST /create-phone-number` on Retell; the row is only
 *   persisted after a successful response (typed {@link NumberPurchaseError}
 *   otherwise, never partial rows).
 */
export async function purchaseOrgNumber(
  deps: PurchaseOrgNumberDeps,
  input: PurchaseOrgNumberInput,
): Promise<PurchaseOrgNumberResult> {
  const existing = await deps.store.getOrgPhoneNumber(input.orgId);
  if (existing) {
    return {
      number: existing,
      simulated: existing.status === "simulated",
      alreadyProvisioned: true,
    };
  }

  const areaCode =
    input.areaCode && /^\d{3}$/.test(input.areaCode) ? input.areaCode : undefined;

  if (!deps.purchaseEnabled) {
    const phoneE164 = await pickSimulatedNumber(
      deps.store,
      input.orgId,
      areaCode,
    );
    const { row, alreadyProvisioned } = await insertIdempotent(deps.store, {
      orgId: input.orgId,
      phoneE164,
      retellNumberRef: null,
      status: "simulated",
      areaCode: areaCode ?? null,
    });
    return {
      number: row,
      simulated: row.status === "simulated",
      alreadyProvisioned,
    };
  }

  // ------------------------------------------------------------------
  // REAL PURCHASE PATH — costs money; only reachable when the caller
  // explicitly enabled it (RETELL_NUMBER_PURCHASE_ENABLED=true).
  // ------------------------------------------------------------------
  const client = deps.client;
  if (!client || !client.hasApiKey) {
    throw new NumberPurchaseError(
      "retell_not_configured",
      "Number purchase is enabled but the Retell client is not configured (set RETELL_API_KEY).",
    );
  }

  let agentId = deps.agentId ?? null;
  if (!agentId && deps.provisioner) {
    try {
      agentId = (await deps.provisioner.ensureProvisioned()).agentId;
    } catch (error) {
      throw new NumberPurchaseError(
        "retell_error",
        `Agent provisioning failed before number purchase: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const payload: Record<string, unknown> = { nickname: input.orgId };
  if (areaCode) payload.area_code = Number(areaCode);
  if (agentId) {
    payload.inbound_agent_id = agentId;
    payload.outbound_agent_id = agentId;
  }

  const { status, json } = await client.request(
    "POST",
    "/create-phone-number",
    payload,
  );
  if (status !== 200 && status !== 201) {
    throw new NumberPurchaseError(
      "retell_error",
      `Retell create-phone-number failed with HTTP ${status}: ${describeApiError(json)}`,
      status,
    );
  }
  const purchased = retellPhoneNumberSchema.parse(json);

  const { row, alreadyProvisioned } = await insertIdempotent(deps.store, {
    orgId: input.orgId,
    phoneE164: purchased.phone_number,
    retellNumberRef: purchased.phone_number,
    status: "active",
    areaCode: areaCode ?? null,
  });
  return {
    number: row,
    simulated: row.status === "simulated",
    alreadyProvisioned,
  };
}
