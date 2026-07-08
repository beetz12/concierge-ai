/**
 * Persistence layer for the landing-page demo funnel.
 *
 * Two implementations of {@link DemoFunnelStore}:
 *   - {@link SupabaseDemoFunnelStore}: production. Rate limits are durable by
 *     construction (they count demo_otp_requests rows in the window) and the
 *     lifetime one-call-per-number gate is the UNIQUE(phone_e164) constraint
 *     on demo_calls — INSERT ... on conflict is the atomic check.
 *   - {@link InMemoryDemoFunnelStore}: DEMO_MODE and tests. Same contract,
 *     process-local state.
 */

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface OtpRequestRecord {
  id: string;
  phoneE164: string;
  codeHash: string;
  ip: string | null;
  attempts: number;
  verifiedAt: string | null;
  consumedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface DemoCallRecord {
  id: string;
  phoneE164: string;
  scenarioId: string;
  callId: string | null;
  backend: string | null;
  status: string;
  consentCapturedAt: string;
  consentIp: string | null;
  disclosureVersion: string;
  summary: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** Row-count + oldest timestamp for a rate-limit window. */
export interface OtpSendWindow {
  count: number;
  /** ISO timestamp of the oldest send in the window, when count > 0. */
  oldestCreatedAt: string | null;
}

export interface CreateDemoCallInput {
  phoneE164: string;
  scenarioId: string;
  consentCapturedAt: string;
  consentIp: string | null;
  disclosureVersion: string;
}

export interface DemoCallUpdate {
  callId?: string;
  backend?: string;
  status?: string;
  summary?: string | null;
  completedAt?: string | null;
}

export interface DemoFunnelStore {
  /** Persist a new OTP send (the row itself is the rate-limit counter). */
  createOtpRequest(input: {
    phoneE164: string;
    codeHash: string;
    ip: string | null;
    expiresAt: string;
  }): Promise<OtpRequestRecord>;

  /** Latest not-yet-consumed OTP for a number (may be expired or locked). */
  findActiveOtp(phoneE164: string): Promise<OtpRequestRecord | null>;

  /** Increment the failed-attempt counter; returns the new count. */
  recordFailedAttempt(id: string): Promise<number>;

  /** Mark an OTP verified AND consumed (codes are strictly single-use). */
  markOtpVerified(id: string, atIso: string): Promise<void>;

  /** Count OTP sends for a number since a cutoff (durable rate limit). */
  countOtpSendsByPhone(phoneE164: string, sinceIso: string): Promise<OtpSendWindow>;

  /** Count OTP sends from an IP since a cutoff (durable rate limit). */
  countOtpSendsByIp(ip: string, sinceIso: string): Promise<OtpSendWindow>;

  /** The lifetime-limit lookup used to short-circuit OTP sends. */
  findDemoCallByPhone(phoneE164: string): Promise<DemoCallRecord | null>;

  /**
   * Atomic lifetime gate: insert the demo_calls row for a number. Returns
   * `created: false` when the number already has a row (unique conflict) —
   * callers must treat that as "already used" and NOT dispatch.
   */
  createDemoCall(
    input: CreateDemoCallInput,
  ): Promise<{ created: boolean; record: DemoCallRecord | null }>;

  updateDemoCall(id: string, patch: DemoCallUpdate): Promise<void>;

  /**
   * Remove a reserved row after a dispatch failure so a transient telephony
   * error does not burn the number's single lifetime call.
   */
  deleteDemoCall(id: string): Promise<void>;

  findDemoCallByCallId(callId: string): Promise<DemoCallRecord | null>;
}

// ============================================================================
// In-memory implementation (DEMO_MODE + tests)
// ============================================================================

export class InMemoryDemoFunnelStore implements DemoFunnelStore {
  /** Exposed for tests (e.g. forcing an OTP to be expired). */
  readonly otpRequests: OtpRequestRecord[] = [];
  /** Exposed for tests. Keyed by phoneE164 — the uniqueness gate. */
  readonly demoCalls = new Map<string, DemoCallRecord>();

  async createOtpRequest(input: {
    phoneE164: string;
    codeHash: string;
    ip: string | null;
    expiresAt: string;
  }): Promise<OtpRequestRecord> {
    const record: OtpRequestRecord = {
      id: randomUUID(),
      phoneE164: input.phoneE164,
      codeHash: input.codeHash,
      ip: input.ip,
      attempts: 0,
      verifiedAt: null,
      consumedAt: null,
      expiresAt: input.expiresAt,
      createdAt: new Date().toISOString(),
    };
    this.otpRequests.push(record);
    return record;
  }

  async findActiveOtp(phoneE164: string): Promise<OtpRequestRecord | null> {
    const candidates = this.otpRequests
      .filter((r) => r.phoneE164 === phoneE164 && r.consumedAt === null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return candidates[0] ?? null;
  }

  async recordFailedAttempt(id: string): Promise<number> {
    const record = this.otpRequests.find((r) => r.id === id);
    if (!record) throw new Error(`Unknown OTP request: ${id}`);
    record.attempts += 1;
    return record.attempts;
  }

  async markOtpVerified(id: string, atIso: string): Promise<void> {
    const record = this.otpRequests.find((r) => r.id === id);
    if (!record) throw new Error(`Unknown OTP request: ${id}`);
    record.verifiedAt = atIso;
    record.consumedAt = atIso;
  }

  async countOtpSendsByPhone(
    phoneE164: string,
    sinceIso: string,
  ): Promise<OtpSendWindow> {
    return this.window(
      this.otpRequests.filter(
        (r) => r.phoneE164 === phoneE164 && r.createdAt >= sinceIso,
      ),
    );
  }

  async countOtpSendsByIp(ip: string, sinceIso: string): Promise<OtpSendWindow> {
    return this.window(
      this.otpRequests.filter((r) => r.ip === ip && r.createdAt >= sinceIso),
    );
  }

  private window(rows: OtpRequestRecord[]): OtpSendWindow {
    if (rows.length === 0) return { count: 0, oldestCreatedAt: null };
    const oldest = rows.reduce((min, r) =>
      r.createdAt < min.createdAt ? r : min,
    );
    return { count: rows.length, oldestCreatedAt: oldest.createdAt };
  }

  async findDemoCallByPhone(phoneE164: string): Promise<DemoCallRecord | null> {
    return this.demoCalls.get(phoneE164) ?? null;
  }

  async createDemoCall(
    input: CreateDemoCallInput,
  ): Promise<{ created: boolean; record: DemoCallRecord | null }> {
    if (this.demoCalls.has(input.phoneE164)) {
      return { created: false, record: null };
    }
    const record: DemoCallRecord = {
      id: randomUUID(),
      phoneE164: input.phoneE164,
      scenarioId: input.scenarioId,
      callId: null,
      backend: null,
      status: "dispatched",
      consentCapturedAt: input.consentCapturedAt,
      consentIp: input.consentIp,
      disclosureVersion: input.disclosureVersion,
      summary: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    this.demoCalls.set(input.phoneE164, record);
    return { created: true, record };
  }

  async updateDemoCall(id: string, patch: DemoCallUpdate): Promise<void> {
    for (const record of this.demoCalls.values()) {
      if (record.id === id) {
        if (patch.callId !== undefined) record.callId = patch.callId;
        if (patch.backend !== undefined) record.backend = patch.backend;
        if (patch.status !== undefined) record.status = patch.status;
        if (patch.summary !== undefined) record.summary = patch.summary;
        if (patch.completedAt !== undefined) record.completedAt = patch.completedAt;
        return;
      }
    }
    throw new Error(`Unknown demo call: ${id}`);
  }

  async deleteDemoCall(id: string): Promise<void> {
    for (const [phone, record] of this.demoCalls) {
      if (record.id === id) {
        this.demoCalls.delete(phone);
        return;
      }
    }
  }

  async findDemoCallByCallId(callId: string): Promise<DemoCallRecord | null> {
    for (const record of this.demoCalls.values()) {
      if (record.callId === callId) return record;
    }
    return null;
  }
}

// ============================================================================
// Supabase implementation (production)
// ============================================================================

/** Postgres unique-violation SQLSTATE, surfaced by PostgREST as error.code. */
const UNIQUE_VIOLATION = "23505";

interface OtpRow {
  id: string;
  phone_e164: string;
  code_hash: string;
  ip: string | null;
  attempts: number;
  verified_at: string | null;
  consumed_at: string | null;
  expires_at: string;
  created_at: string;
}

interface DemoCallRow {
  id: string;
  phone_e164: string;
  scenario_id: string;
  call_id: string | null;
  backend: string | null;
  status: string;
  consent_captured_at: string;
  consent_ip: string | null;
  disclosure_version: string;
  summary: string | null;
  created_at: string;
  completed_at: string | null;
}

const mapOtpRow = (row: OtpRow): OtpRequestRecord => ({
  id: row.id,
  phoneE164: row.phone_e164,
  codeHash: row.code_hash,
  ip: row.ip,
  attempts: row.attempts,
  verifiedAt: row.verified_at,
  consumedAt: row.consumed_at,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
});

const mapDemoCallRow = (row: DemoCallRow): DemoCallRecord => ({
  id: row.id,
  phoneE164: row.phone_e164,
  scenarioId: row.scenario_id,
  callId: row.call_id,
  backend: row.backend,
  status: row.status,
  consentCapturedAt: row.consent_captured_at,
  consentIp: row.consent_ip,
  disclosureVersion: row.disclosure_version,
  summary: row.summary,
  createdAt: row.created_at,
  completedAt: row.completed_at,
});

export class SupabaseDemoFunnelStore implements DemoFunnelStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async createOtpRequest(input: {
    phoneE164: string;
    codeHash: string;
    ip: string | null;
    expiresAt: string;
  }): Promise<OtpRequestRecord> {
    const { data, error } = await this.supabase
      .from("demo_otp_requests")
      .insert({
        phone_e164: input.phoneE164,
        code_hash: input.codeHash,
        ip: input.ip,
        expires_at: input.expiresAt,
      })
      .select()
      .single();
    if (error || !data) {
      throw new Error(`Failed to create OTP request: ${error?.message}`);
    }
    return mapOtpRow(data as OtpRow);
  }

  async findActiveOtp(phoneE164: string): Promise<OtpRequestRecord | null> {
    const { data, error } = await this.supabase
      .from("demo_otp_requests")
      .select()
      .eq("phone_e164", phoneE164)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to look up OTP request: ${error.message}`);
    }
    return data ? mapOtpRow(data as OtpRow) : null;
  }

  async recordFailedAttempt(id: string): Promise<number> {
    // Single round-trip guarded increment is not available through PostgREST
    // without an RPC; read-then-write is acceptable here because the attempt
    // ceiling is a small integer and phone/code brute force is additionally
    // bounded by the send rate limits.
    const { data, error } = await this.supabase
      .from("demo_otp_requests")
      .select("attempts")
      .eq("id", id)
      .single();
    if (error || data === null) {
      throw new Error(`Failed to read OTP attempts: ${error?.message}`);
    }
    const attempts = (data as { attempts: number }).attempts + 1;
    const { error: updateError } = await this.supabase
      .from("demo_otp_requests")
      .update({ attempts })
      .eq("id", id);
    if (updateError) {
      throw new Error(`Failed to record OTP attempt: ${updateError.message}`);
    }
    return attempts;
  }

  async markOtpVerified(id: string, atIso: string): Promise<void> {
    const { error } = await this.supabase
      .from("demo_otp_requests")
      .update({ verified_at: atIso, consumed_at: atIso })
      .eq("id", id);
    if (error) {
      throw new Error(`Failed to mark OTP verified: ${error.message}`);
    }
  }

  async countOtpSendsByPhone(
    phoneE164: string,
    sinceIso: string,
  ): Promise<OtpSendWindow> {
    return this.countWindow("phone_e164", phoneE164, sinceIso);
  }

  async countOtpSendsByIp(ip: string, sinceIso: string): Promise<OtpSendWindow> {
    return this.countWindow("ip", ip, sinceIso);
  }

  private async countWindow(
    column: "phone_e164" | "ip",
    value: string,
    sinceIso: string,
  ): Promise<OtpSendWindow> {
    const { data, error, count } = await this.supabase
      .from("demo_otp_requests")
      .select("created_at", { count: "exact" })
      .eq(column, value)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) {
      throw new Error(`Failed to count OTP sends: ${error.message}`);
    }
    const oldest = (data as Array<{ created_at: string }> | null)?.[0];
    return { count: count ?? 0, oldestCreatedAt: oldest?.created_at ?? null };
  }

  async findDemoCallByPhone(phoneE164: string): Promise<DemoCallRecord | null> {
    const { data, error } = await this.supabase
      .from("demo_calls")
      .select()
      .eq("phone_e164", phoneE164)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to look up demo call: ${error.message}`);
    }
    return data ? mapDemoCallRow(data as DemoCallRow) : null;
  }

  async createDemoCall(
    input: CreateDemoCallInput,
  ): Promise<{ created: boolean; record: DemoCallRecord | null }> {
    const { data, error } = await this.supabase
      .from("demo_calls")
      .insert({
        phone_e164: input.phoneE164,
        scenario_id: input.scenarioId,
        status: "dispatched",
        consent_captured_at: input.consentCapturedAt,
        consent_ip: input.consentIp,
        disclosure_version: input.disclosureVersion,
      })
      .select()
      .single();
    if (error) {
      // UNIQUE(phone_e164) conflict IS the lifetime "already used" answer.
      if (error.code === UNIQUE_VIOLATION) {
        return { created: false, record: null };
      }
      throw new Error(`Failed to create demo call: ${error.message}`);
    }
    return { created: true, record: mapDemoCallRow(data as DemoCallRow) };
  }

  async updateDemoCall(id: string, patch: DemoCallUpdate): Promise<void> {
    const update: Record<string, unknown> = {};
    if (patch.callId !== undefined) update.call_id = patch.callId;
    if (patch.backend !== undefined) update.backend = patch.backend;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.summary !== undefined) update.summary = patch.summary;
    if (patch.completedAt !== undefined) update.completed_at = patch.completedAt;
    if (Object.keys(update).length === 0) return;
    const { error } = await this.supabase
      .from("demo_calls")
      .update(update)
      .eq("id", id);
    if (error) {
      throw new Error(`Failed to update demo call: ${error.message}`);
    }
  }

  async deleteDemoCall(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("demo_calls")
      .delete()
      .eq("id", id);
    if (error) {
      throw new Error(`Failed to delete demo call: ${error.message}`);
    }
  }

  async findDemoCallByCallId(callId: string): Promise<DemoCallRecord | null> {
    const { data, error } = await this.supabase
      .from("demo_calls")
      .select()
      .eq("call_id", callId)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to look up demo call by call id: ${error.message}`);
    }
    return data ? mapDemoCallRow(data as DemoCallRow) : null;
  }
}
