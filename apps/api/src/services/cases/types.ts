/**
 * Case management types (SaaS slice 7).
 *
 * The model ports the dispute-resolution playbook: a case tracks one dispute
 * or long-running follow-up against a counterparty, with a 1-4 progressive
 * escalation stage, a dispute-log status lifecycle, leverage notes, an amount
 * at stake, and a chronological event ledger whose payload carries call/SMS
 * refs and named promises ("on <date>, <who> committed to <what> by <due>").
 */

export const DISPUTE_TYPES = [
  "contractor",
  "delivery",
  "insurance",
  "service",
  "retail",
  "property",
  "other",
] as const;
export type DisputeType = (typeof DISPUTE_TYPES)[number];

export const CASE_STATUSES = [
  "open",
  "pending_response",
  "escalated",
  "resolved",
  "closed",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const CASE_EVENT_KINDS = [
  "call",
  "sms",
  "email",
  "note",
  "status_change",
  "evidence",
] as const;
export type CaseEventKind = (typeof CASE_EVENT_KINDS)[number];

export const MIN_ESCALATION_STAGE = 1;
export const MAX_ESCALATION_STAGE = 4;

/** Progressive escalation framework labels (dispute-resolution playbook). */
export const ESCALATION_STAGE_LABELS: Record<number, string> = {
  1: "Collaborative",
  2: "Firm professional",
  3: "Reference consequences",
  4: "Ultimatum",
};

/**
 * A commitment made by a named person on the other side, captured verbatim
 * enough to quote on a follow-up call ("on <date>, <who> committed to
 * <what> by <dueDate>").
 */
export interface NamedPromise {
  who: string;
  what: string;
  /** ISO date the promise is due, when one was given. */
  dueDate?: string | null;
}

/**
 * Structured refs carried by a case event. snake_case to match the stored
 * JSONB shape.
 */
export interface CaseEventPayload {
  /** Voice call session / backend call id (attach-call). */
  call_id?: string;
  /** SMS message ref, e.g. a Twilio SID (attach-sms). */
  message_id?: string;
  direction?: "inbound" | "outbound";
  /** Name of the rep spoken to, when known. */
  rep_name?: string;
  /** Named commitments extracted from the interaction. */
  promises?: Array<{ who: string; what: string; due_date?: string | null }>;
  /** Stage transition refs (status_change events). */
  from_stage?: number;
  to_stage?: number;
  override?: boolean;
  [key: string]: unknown;
}

/** Row shape of public.cases. */
export interface CaseRecord {
  id: string;
  org_id: string;
  title: string;
  counterparty_name: string | null;
  counterparty_company: string | null;
  counterparty_phone: string | null;
  counterparty_email: string | null;
  dispute_type: DisputeType;
  escalation_stage: number;
  amount_at_stake: number | null;
  status: CaseStatus;
  leverage_notes: string | null;
  next_action_at: string | null;
  resolution: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

/** Row shape of public.case_events. */
export interface CaseEventRecord {
  id: string;
  case_id: string;
  org_id: string;
  kind: CaseEventKind;
  occurred_at: string;
  summary: string;
  payload: CaseEventPayload;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Minimal structural view of the Supabase client used by the case service,
// so unit tests can inject an in-memory fake without a running database
// (same pattern as services/billing).
// ---------------------------------------------------------------------------

export interface CasesQueryError {
  message: string;
}

export interface CasesSingleResult<T> {
  data: T | null;
  error: CasesQueryError | null;
}

export interface CasesListResult<T> {
  data: T[] | null;
  error: CasesQueryError | null;
}

/** Filterable, orderable SELECT chain (thenable like supabase-js builders). */
export interface CasesSelectBuilder<T>
  extends PromiseLike<CasesListResult<T>> {
  eq(column: string, value: unknown): CasesSelectBuilder<T>;
  order(
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ): CasesSelectBuilder<T>;
  maybeSingle(): PromiseLike<CasesSingleResult<T>>;
}

export interface CasesUpdateBuilder<T> {
  eq(column: string, value: unknown): CasesUpdateBuilder<T>;
  select(): {
    maybeSingle(): PromiseLike<CasesSingleResult<T>>;
  };
}

export interface CasesDeleteBuilder<T>
  extends PromiseLike<CasesListResult<T>> {
  eq(column: string, value: unknown): CasesDeleteBuilder<T>;
  select(): PromiseLike<CasesListResult<T>>;
}

export interface CasesTableClient<T = Record<string, unknown>> {
  insert(values: Record<string, unknown>): {
    select(): {
      single(): PromiseLike<CasesSingleResult<T>>;
    };
  };
  select(columns?: string): CasesSelectBuilder<T>;
  update(values: Record<string, unknown>): CasesUpdateBuilder<T>;
  delete(): CasesDeleteBuilder<T>;
}

export interface CasesDbClient {
  from(table: "cases"): CasesTableClient<CaseRecord>;
  from(table: "case_events"): CasesTableClient<CaseEventRecord>;
  from(table: string): CasesTableClient;
}
