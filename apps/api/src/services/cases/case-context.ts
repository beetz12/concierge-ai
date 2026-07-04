import { getCase, listCaseEvents } from "./case-service.js";
import {
  CaseEventRecord,
  CaseRecord,
  CasesDbClient,
  ESCALATION_STAGE_LABELS,
  MAX_ESCALATION_STAGE,
} from "./types.js";

/**
 * caseContext: build the prior-interaction context block for a follow-up
 * call, suitable for injection into a CallPlan `context` field
 * (apps/api/src/services/call-backend/types.ts).
 *
 * Ports the follow-up playbook's case-ledger model: the agent opens with
 * case continuity ("this is a follow-up on a commitment made <date>, not a
 * new request"), quotes named promises verbatim ("on <date>, <who>
 * committed to <what> by <due>"), and reads back the ledger of prior
 * interactions in chronological order.
 */

const isoDate = (timestamp: string): string => {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return timestamp;
  return parsed.toISOString().slice(0, 10);
};

const formatAmount = (amount: number | null): string | null => {
  if (amount == null) return null;
  return `$${amount.toFixed(2)}`;
};

/** One chronological ledger line for a single case event. */
export function formatEventLine(event: CaseEventRecord): string {
  const refs: string[] = [];
  const payload = event.payload ?? {};
  if (typeof payload.rep_name === "string" && payload.rep_name) {
    refs.push(`spoke with ${payload.rep_name}`);
  }
  if (typeof payload.call_id === "string" && payload.call_id) {
    refs.push(`call ref ${payload.call_id}`);
  }
  if (typeof payload.message_id === "string" && payload.message_id) {
    const direction =
      payload.direction === "inbound" || payload.direction === "outbound"
        ? `${payload.direction} `
        : "";
    refs.push(`${direction}sms ref ${payload.message_id}`);
  }
  const suffix = refs.length > 0 ? ` (${refs.join(", ")})` : "";
  return `- ${isoDate(event.occurred_at)} [${event.kind}] ${event.summary}${suffix}`;
}

/**
 * Extract named promises across events, oldest first, as quotable
 * one-liners ("On <date>, <who> committed to: <what> (due <date>)").
 */
export function extractNamedPromises(events: CaseEventRecord[]): string[] {
  const lines: string[] = [];
  for (const event of events) {
    for (const promise of event.payload?.promises ?? []) {
      if (!promise?.who || !promise?.what) continue;
      const due = promise.due_date ? ` (due ${isoDate(promise.due_date)})` : "";
      lines.push(
        `- On ${isoDate(event.occurred_at)}, ${promise.who} committed to: ${promise.what}${due}`,
      );
    }
  }
  return lines;
}

/**
 * Pure formatter: renders the context block from an already-loaded case and
 * its events. Events may be passed in any order; they are sorted oldest
 * first here so the ledger reads chronologically.
 */
export function buildCaseContext(
  caseRecord: CaseRecord,
  events: CaseEventRecord[],
): string {
  const sorted = [...events].sort(
    (a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at),
  );

  const counterpartyParts = [
    caseRecord.counterparty_name,
    caseRecord.counterparty_company
      ? `(${caseRecord.counterparty_company})`
      : null,
    caseRecord.counterparty_phone
      ? `phone ${caseRecord.counterparty_phone}`
      : null,
    caseRecord.counterparty_email
      ? `email ${caseRecord.counterparty_email}`
      : null,
  ].filter(Boolean);

  const stageLabel =
    ESCALATION_STAGE_LABELS[caseRecord.escalation_stage] ?? "Unknown";
  const amount = formatAmount(caseRecord.amount_at_stake);

  const lines: string[] = [
    "PRIOR CASE CONTEXT (existing case - this is a follow-up, not a new request)",
    `Case: ${caseRecord.title} (ref ${caseRecord.id}, opened ${isoDate(caseRecord.created_at)})`,
  ];
  if (counterpartyParts.length > 0) {
    lines.push(`Counterparty: ${counterpartyParts.join(", ")}`);
  }
  lines.push(
    `Dispute type: ${caseRecord.dispute_type} | Status: ${caseRecord.status} | ` +
      `Escalation stage: ${caseRecord.escalation_stage} of ${MAX_ESCALATION_STAGE} (${stageLabel})`,
  );
  if (amount) lines.push(`Amount at stake: ${amount}`);
  if (caseRecord.leverage_notes) {
    lines.push(`Leverage: ${caseRecord.leverage_notes}`);
  }
  if (caseRecord.next_action_at) {
    lines.push(`Next action due: ${isoDate(caseRecord.next_action_at)}`);
  }

  lines.push("Prior interactions (oldest first):");
  if (sorted.length === 0) {
    lines.push("- None recorded yet.");
  } else {
    for (const event of sorted) lines.push(formatEventLine(event));
  }

  const promises = extractNamedPromises(sorted);
  if (promises.length > 0) {
    lines.push("Named promises to quote and hold them to:");
    lines.push(...promises);
  }

  if (caseRecord.resolution) {
    lines.push(`Resolution on file: ${caseRecord.resolution}`);
  }

  return lines.join("\n");
}

/**
 * Load a case plus its timeline and render the context block. Returns null
 * when the case does not exist in the caller's org.
 */
export async function caseContext(
  db: CasesDbClient,
  orgId: string,
  caseId: string,
): Promise<string | null> {
  const caseRecord = await getCase(db, orgId, caseId);
  if (!caseRecord) return null;
  const events = await listCaseEvents(db, orgId, caseId);
  return buildCaseContext(caseRecord, events);
}
