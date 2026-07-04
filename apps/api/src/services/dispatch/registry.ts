/**
 * In-memory dispatch registry (SaaS slice 8).
 *
 * Tracks the calls dispatched through /api/v1/dispatch so the live-status
 * and artifacts views can recover the reviewed plan, case linkage, and the
 * attach-to-case event id, and so the 24h same-number redial guard can be
 * enforced (and surfaced in preflight) for backends without their own guard.
 *
 * Process-local by design for this slice: the registry backs the dispatch
 * UX (status polling, retry, attach), not the compliance evidence trail -
 * that lives in call_authorizations / dispatch_audit_log (slice 6).
 */

import type { CallPlan } from "../call-backend/types.js";
import type { TaskType } from "../direct-task/types.js";
import type { ComplianceTaskType } from "../compliance/types.js";

export interface DispatchRecord {
  callId: string;
  orgId: string;
  plan: CallPlan;
  taskType: TaskType;
  complianceTaskType: ComplianceTaskType;
  dispatchedAt: string;
  caseId?: string;
  attachedEventId?: string;
}

const REDIAL_WINDOW_MS = 24 * 60 * 60 * 1000;

const records = new Map<string, DispatchRecord>();
const lastDialedAt = new Map<string, number>();

const redialKey = (orgId: string, phoneNumber: string): string =>
  `${orgId}:${phoneNumber}`;

export function recordDispatch(record: DispatchRecord): void {
  records.set(record.callId, record);
  lastDialedAt.set(
    redialKey(record.orgId, record.plan.phoneNumber),
    Date.parse(record.dispatchedAt),
  );
}

export function getDispatch(callId: string): DispatchRecord | null {
  return records.get(callId) ?? null;
}

export function setAttachedEvent(
  callId: string,
  caseId: string,
  eventId: string,
): void {
  const record = records.get(callId);
  if (record) {
    record.caseId = caseId;
    record.attachedEventId = eventId;
  }
}

/** True when the same org dialed the same number inside the 24h window. */
export function isRedialBlocked(
  orgId: string,
  phoneNumber: string,
  now: number = Date.now(),
): boolean {
  const dialedAt = lastDialedAt.get(redialKey(orgId, phoneNumber));
  return dialedAt !== undefined && now - dialedAt < REDIAL_WINDOW_MS;
}

/** Test hook: wipe all dispatch and redial state. */
export function resetDispatchRegistry(): void {
  records.clear();
  lastDialedAt.clear();
}
