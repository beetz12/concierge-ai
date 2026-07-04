/**
 * Query helpers for case management (slice 7). Server-side only; the
 * anon-key client + session cookies mean RLS (cases_tenant_*,
 * case_events_tenant_*) scopes every query to the caller's orgs.
 */

import { createClient as createServerClient } from "./server";
import type { Tables } from "../types/database";

export type CaseRow = Tables<"cases">;
export type CaseEventRow = Tables<"case_events">;

/**
 * Sort for the case list: overdue next actions first (most overdue on top),
 * then upcoming next actions soonest-first, then unscheduled newest-first.
 * Mirrors sortCasesForList in apps/api/src/services/cases/case-service.ts.
 */
export function sortCasesForList(cases: CaseRow[], now: Date = new Date()): CaseRow[] {
  const nowMs = now.getTime();
  const bucket = (c: CaseRow): number => {
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

export async function getCases(): Promise<CaseRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.from("cases").select("*");
  if (error) throw error;
  return sortCasesForList(data ?? []);
}

export async function getCaseById(caseId: string): Promise<CaseRow | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("cases")
    .select("*")
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCaseEvents(caseId: string): Promise<CaseEventRow[]> {
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("case_events")
    .select("*")
    .eq("case_id", caseId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
