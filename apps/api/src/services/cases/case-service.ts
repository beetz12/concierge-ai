import {
  CASE_EVENT_KINDS,
  CASE_STATUSES,
  CaseEventKind,
  CaseEventPayload,
  CaseEventRecord,
  CaseRecord,
  CaseStatus,
  CasesDbClient,
  DISPUTE_TYPES,
  DisputeType,
  ESCALATION_STAGE_LABELS,
  MAX_ESCALATION_STAGE,
  MIN_ESCALATION_STAGE,
  NamedPromise,
} from "./types.js";

/**
 * Case service: org-scoped CRUD, timeline, monotonic stage transitions,
 * next-action scheduling, and attach-call / attach-sms helpers.
 *
 * Callers pass the service-role Supabase client (fastify.supabase); tenancy
 * is enforced by the slice-5 auth middleware resolving the caller's orgId
 * plus the explicit `org_id` filter on every query here. RLS provides the
 * same guarantees for user-context clients (see cases_tenant_* policies).
 */

export class CaseNotFoundError extends Error {
  constructor(caseId: string) {
    super(`Case not found: ${caseId}`);
    this.name = "CaseNotFoundError";
  }
}

export class InvalidStageTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidStageTransitionError";
  }
}

const requireOrgId = (orgId: string, fn: string): void => {
  if (!orgId) throw new Error(`${fn}: orgId is required`);
};

const fail = (fn: string, error: { message: string }): never => {
  throw new Error(`${fn}: ${error.message}`);
};

// ---------------------------------------------------------------------------
// Create / read / update / delete
// ---------------------------------------------------------------------------

export interface CreateCaseInput {
  title: string;
  counterpartyName?: string | null;
  counterpartyCompany?: string | null;
  counterpartyPhone?: string | null;
  counterpartyEmail?: string | null;
  disputeType?: DisputeType;
  escalationStage?: number;
  amountAtStake?: number | null;
  status?: CaseStatus;
  leverageNotes?: string | null;
  nextActionAt?: string | null;
  createdBy?: string | null;
}

export async function createCase(
  db: CasesDbClient,
  orgId: string,
  input: CreateCaseInput,
): Promise<CaseRecord> {
  requireOrgId(orgId, "createCase");
  if (!input.title?.trim()) {
    throw new Error("createCase: title is required");
  }
  const disputeType = input.disputeType ?? "other";
  if (!DISPUTE_TYPES.includes(disputeType)) {
    throw new Error(`createCase: unknown dispute type: ${disputeType}`);
  }
  const stage = input.escalationStage ?? MIN_ESCALATION_STAGE;
  if (
    !Number.isInteger(stage) ||
    stage < MIN_ESCALATION_STAGE ||
    stage > MAX_ESCALATION_STAGE
  ) {
    throw new Error(`createCase: escalation stage must be 1-4, got ${stage}`);
  }
  const status = input.status ?? "open";
  if (!CASE_STATUSES.includes(status)) {
    throw new Error(`createCase: unknown status: ${status}`);
  }
  if (
    input.amountAtStake != null &&
    (!Number.isFinite(input.amountAtStake) || input.amountAtStake < 0)
  ) {
    throw new Error("createCase: amountAtStake must be a non-negative number");
  }

  const { data, error } = await db
    .from("cases")
    .insert({
      org_id: orgId,
      title: input.title.trim(),
      counterparty_name: input.counterpartyName ?? null,
      counterparty_company: input.counterpartyCompany ?? null,
      counterparty_phone: input.counterpartyPhone ?? null,
      counterparty_email: input.counterpartyEmail ?? null,
      dispute_type: disputeType,
      escalation_stage: stage,
      amount_at_stake: input.amountAtStake ?? null,
      status,
      leverage_notes: input.leverageNotes ?? null,
      next_action_at: input.nextActionAt ?? null,
      resolution: null,
      created_by: input.createdBy ?? null,
    })
    .select()
    .single();

  if (error || !data) return fail("createCase", error ?? { message: "no row" });
  return data;
}

export interface ListCasesOptions {
  status?: CaseStatus;
}

/**
 * Sort for the case list: cases with an overdue next action first (most
 * overdue at the top), then upcoming next actions soonest-first, then
 * unscheduled cases newest-first.
 */
export function sortCasesForList(
  cases: CaseRecord[],
  now: Date = new Date(),
): CaseRecord[] {
  const nowMs = now.getTime();
  const bucket = (c: CaseRecord): number => {
    if (!c.next_action_at) return 2;
    return Date.parse(c.next_action_at) < nowMs ? 0 : 1;
  };
  return [...cases].sort((a, b) => {
    const bucketDiff = bucket(a) - bucket(b);
    if (bucketDiff !== 0) return bucketDiff;
    if (a.next_action_at && b.next_action_at) {
      return Date.parse(a.next_action_at) - Date.parse(b.next_action_at);
    }
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}

export async function listCases(
  db: CasesDbClient,
  orgId: string,
  options: ListCasesOptions = {},
): Promise<CaseRecord[]> {
  requireOrgId(orgId, "listCases");
  let query = db.from("cases").select("*").eq("org_id", orgId);
  if (options.status) {
    if (!CASE_STATUSES.includes(options.status)) {
      throw new Error(`listCases: unknown status: ${options.status}`);
    }
    query = query.eq("status", options.status);
  }
  const { data, error } = await query;
  if (error) return fail("listCases", error);
  return sortCasesForList(data ?? []);
}

export async function getCase(
  db: CasesDbClient,
  orgId: string,
  caseId: string,
): Promise<CaseRecord | null> {
  requireOrgId(orgId, "getCase");
  const { data, error } = await db
    .from("cases")
    .select("*")
    .eq("org_id", orgId)
    .eq("id", caseId)
    .maybeSingle();
  if (error) return fail("getCase", error);
  return data;
}

export interface UpdateCaseInput {
  title?: string;
  counterpartyName?: string | null;
  counterpartyCompany?: string | null;
  counterpartyPhone?: string | null;
  counterpartyEmail?: string | null;
  disputeType?: DisputeType;
  amountAtStake?: number | null;
  status?: CaseStatus;
  leverageNotes?: string | null;
  resolution?: string | null;
}

const UPDATE_COLUMN_MAP: Record<keyof UpdateCaseInput, string> = {
  title: "title",
  counterpartyName: "counterparty_name",
  counterpartyCompany: "counterparty_company",
  counterpartyPhone: "counterparty_phone",
  counterpartyEmail: "counterparty_email",
  disputeType: "dispute_type",
  amountAtStake: "amount_at_stake",
  status: "status",
  leverageNotes: "leverage_notes",
  resolution: "resolution",
};

/**
 * Patch mutable case fields. Escalation stage and next action deliberately
 * have their own entry points (transitionStage / setNextAction) so their
 * invariants cannot be bypassed by a generic update.
 */
export async function updateCase(
  db: CasesDbClient,
  orgId: string,
  caseId: string,
  input: UpdateCaseInput,
): Promise<CaseRecord | null> {
  requireOrgId(orgId, "updateCase");

  const patch: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(UPDATE_COLUMN_MAP) as Array<
    [keyof UpdateCaseInput, string]
  >) {
    if (input[key] !== undefined) patch[column] = input[key];
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("updateCase: no fields to update");
  }
  if (patch.title !== undefined && !String(patch.title).trim()) {
    throw new Error("updateCase: title cannot be empty");
  }
  if (
    patch.dispute_type !== undefined &&
    !DISPUTE_TYPES.includes(patch.dispute_type as DisputeType)
  ) {
    throw new Error(`updateCase: unknown dispute type: ${patch.dispute_type}`);
  }
  if (
    patch.status !== undefined &&
    !CASE_STATUSES.includes(patch.status as CaseStatus)
  ) {
    throw new Error(`updateCase: unknown status: ${patch.status}`);
  }
  if (
    patch.amount_at_stake != null &&
    (!Number.isFinite(patch.amount_at_stake as number) ||
      (patch.amount_at_stake as number) < 0)
  ) {
    throw new Error("updateCase: amountAtStake must be a non-negative number");
  }

  const { data, error } = await db
    .from("cases")
    .update(patch)
    .eq("org_id", orgId)
    .eq("id", caseId)
    .select()
    .maybeSingle();
  if (error) return fail("updateCase", error);
  return data;
}

export async function deleteCase(
  db: CasesDbClient,
  orgId: string,
  caseId: string,
): Promise<boolean> {
  requireOrgId(orgId, "deleteCase");
  const { data, error } = await db
    .from("cases")
    .delete()
    .eq("org_id", orgId)
    .eq("id", caseId)
    .select();
  if (error) return fail("deleteCase", error);
  return (data?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export interface AppendCaseEventInput {
  kind: CaseEventKind;
  summary: string;
  occurredAt?: string;
  payload?: CaseEventPayload;
}

export async function appendCaseEvent(
  db: CasesDbClient,
  orgId: string,
  caseId: string,
  input: AppendCaseEventInput,
): Promise<CaseEventRecord> {
  requireOrgId(orgId, "appendCaseEvent");
  if (!CASE_EVENT_KINDS.includes(input.kind)) {
    throw new Error(`appendCaseEvent: unknown event kind: ${input.kind}`);
  }
  if (!input.summary?.trim()) {
    throw new Error("appendCaseEvent: summary is required");
  }

  const existing = await getCase(db, orgId, caseId);
  if (!existing) throw new CaseNotFoundError(caseId);

  const { data, error } = await db
    .from("case_events")
    .insert({
      case_id: caseId,
      org_id: orgId,
      kind: input.kind,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      summary: input.summary.trim(),
      payload: input.payload ?? {},
    })
    .select()
    .single();
  if (error || !data) {
    return fail("appendCaseEvent", error ?? { message: "no row" });
  }
  return data;
}

export async function listCaseEvents(
  db: CasesDbClient,
  orgId: string,
  caseId: string,
  options: { newestFirst?: boolean } = {},
): Promise<CaseEventRecord[]> {
  requireOrgId(orgId, "listCaseEvents");
  const { data, error } = await db
    .from("case_events")
    .select("*")
    .eq("org_id", orgId)
    .eq("case_id", caseId)
    .order("occurred_at", { ascending: !options.newestFirst });
  if (error) return fail("listCaseEvents", error);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Escalation stage transitions
// ---------------------------------------------------------------------------

/**
 * Validate a stage transition. Stages advance one step at a time
 * (1 -> 2 -> 3 -> 4); skipping ahead or moving backwards requires the
 * explicit override flag. Throws InvalidStageTransitionError otherwise.
 */
export function assertStageTransition(
  currentStage: number,
  targetStage: number,
  override: boolean,
): void {
  if (
    !Number.isInteger(targetStage) ||
    targetStage < MIN_ESCALATION_STAGE ||
    targetStage > MAX_ESCALATION_STAGE
  ) {
    throw new InvalidStageTransitionError(
      `Target stage must be an integer between 1 and 4, got ${targetStage}`,
    );
  }
  if (targetStage === currentStage) {
    throw new InvalidStageTransitionError(
      `Case is already at stage ${currentStage}`,
    );
  }
  if (!override && targetStage !== currentStage + 1) {
    throw new InvalidStageTransitionError(
      `Stage transitions are monotonic (${currentStage} -> ${currentStage + 1}); ` +
        `moving from ${currentStage} to ${targetStage} requires override=true`,
    );
  }
}

export interface TransitionStageInput {
  targetStage: number;
  override?: boolean;
  note?: string;
}

export async function transitionStage(
  db: CasesDbClient,
  orgId: string,
  caseId: string,
  input: TransitionStageInput,
): Promise<{ caseRecord: CaseRecord; event: CaseEventRecord }> {
  requireOrgId(orgId, "transitionStage");
  const existing = await getCase(db, orgId, caseId);
  if (!existing) throw new CaseNotFoundError(caseId);

  const override = input.override ?? false;
  const fromStage = existing.escalation_stage;
  assertStageTransition(fromStage, input.targetStage, override);

  const { data, error } = await db
    .from("cases")
    .update({ escalation_stage: input.targetStage })
    .eq("org_id", orgId)
    .eq("id", caseId)
    .select()
    .maybeSingle();
  if (error || !data) {
    return fail("transitionStage", error ?? { message: "no row" });
  }

  const fromLabel = ESCALATION_STAGE_LABELS[fromStage];
  const toLabel = ESCALATION_STAGE_LABELS[input.targetStage];
  const summary =
    `Escalation stage ${fromStage} (${fromLabel}) -> ` +
    `${input.targetStage} (${toLabel})` +
    (override ? " [override]" : "") +
    (input.note ? `: ${input.note}` : "");

  const event = await appendCaseEvent(db, orgId, caseId, {
    kind: "status_change",
    summary,
    payload: {
      from_stage: fromStage,
      to_stage: input.targetStage,
      override,
    },
  });

  return { caseRecord: data, event };
}

// ---------------------------------------------------------------------------
// Next-action scheduling
// ---------------------------------------------------------------------------

/**
 * Set (ISO timestamp) or clear (null) the case's next scheduled action.
 */
export async function setNextAction(
  db: CasesDbClient,
  orgId: string,
  caseId: string,
  at: string | null,
): Promise<CaseRecord | null> {
  requireOrgId(orgId, "setNextAction");
  if (at !== null && Number.isNaN(Date.parse(at))) {
    throw new Error(`setNextAction: invalid timestamp: ${at}`);
  }
  const { data, error } = await db
    .from("cases")
    .update({ next_action_at: at })
    .eq("org_id", orgId)
    .eq("id", caseId)
    .select()
    .maybeSingle();
  if (error) return fail("setNextAction", error);
  return data;
}

// ---------------------------------------------------------------------------
// Attach helpers: normalize call / SMS interactions into case_events rows.
// ---------------------------------------------------------------------------

export interface AttachCallInput {
  callId: string;
  summary: string;
  occurredAt?: string;
  repName?: string;
  promises?: NamedPromise[];
}

export async function attachCall(
  db: CasesDbClient,
  orgId: string,
  caseId: string,
  input: AttachCallInput,
): Promise<CaseEventRecord> {
  if (!input.callId?.trim()) {
    throw new Error("attachCall: callId is required");
  }
  const payload: CaseEventPayload = { call_id: input.callId };
  if (input.repName) payload.rep_name = input.repName;
  if (input.promises?.length) {
    payload.promises = input.promises.map((p) => ({
      who: p.who,
      what: p.what,
      due_date: p.dueDate ?? null,
    }));
  }
  return appendCaseEvent(db, orgId, caseId, {
    kind: "call",
    summary: input.summary,
    occurredAt: input.occurredAt,
    payload,
  });
}

export interface AttachSmsInput {
  messageId: string;
  direction: "inbound" | "outbound";
  summary: string;
  occurredAt?: string;
}

export async function attachSms(
  db: CasesDbClient,
  orgId: string,
  caseId: string,
  input: AttachSmsInput,
): Promise<CaseEventRecord> {
  if (!input.messageId?.trim()) {
    throw new Error("attachSms: messageId is required");
  }
  if (input.direction !== "inbound" && input.direction !== "outbound") {
    throw new Error(`attachSms: invalid direction: ${input.direction}`);
  }
  return appendCaseEvent(db, orgId, caseId, {
    kind: "sms",
    summary: input.summary,
    occurredAt: input.occurredAt,
    payload: { message_id: input.messageId, direction: input.direction },
  });
}
