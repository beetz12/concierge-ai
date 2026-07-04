import { USAGE_EVENT_TYPES, UsageEventType } from "./types.js";

export interface RecordUsageInput {
  orgId: string;
  type: UsageEventType;
  quantity: number;
  /** voice_call_sessions.id or a backend call id, when usage maps to a call. */
  callId?: string | null;
  occurredAt?: Date;
}

/**
 * Minimal structural view of the Supabase client used by recordUsage, so
 * unit tests can inject a mock without a running database.
 */
export interface UsageDbClient {
  from(table: string): {
    insert(
      values: Record<string, unknown>,
    ): PromiseLike<{ error: { message: string } | null }>;
  };
}

/**
 * Append a usage event to the metering ledger.
 *
 * Callers pass the service-role Supabase client. Service-role usage
 * justification: usage_events is an append-only ledger with `WITH CHECK
 * (false)` user policies — tenants must not be able to forge or suppress
 * their own metering, so writes intentionally bypass user RLS and only
 * happen server-side.
 */
export async function recordUsage(
  db: UsageDbClient,
  input: RecordUsageInput,
): Promise<void> {
  if (!input.orgId) {
    throw new Error("recordUsage: orgId is required");
  }
  if (!USAGE_EVENT_TYPES.includes(input.type)) {
    throw new Error(`recordUsage: unknown usage type: ${input.type}`);
  }
  if (!Number.isFinite(input.quantity) || input.quantity < 0) {
    throw new Error(
      `recordUsage: quantity must be a non-negative number, got ${input.quantity}`,
    );
  }

  const { error } = await db.from("usage_events").insert({
    org_id: input.orgId,
    type: input.type,
    quantity: input.quantity,
    call_id: input.callId ?? null,
    occurred_at: (input.occurredAt ?? new Date()).toISOString(),
  });

  if (error) {
    throw new Error(`recordUsage: failed to write usage event: ${error.message}`);
  }
}
