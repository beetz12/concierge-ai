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
 * DEMO_MODE has no database: the API keeps cases in an in-memory store
 * (apps/api services/cases/demo-store.ts) behind the same /api/v1/cases
 * routes, so these server-side queries fetch from the API instead of
 * Supabase. Auth is bypassed by the API's demo identity.
 */
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

async function demoFetch<T>(path: string): Promise<T | null> {
  const response = await fetch(`${BACKEND_URL}${path}`, { cache: "no-store" });
  if (!response.ok) return null;
  return (await response.json()) as T;
}

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
  if (DEMO_MODE) {
    const payload = await demoFetch<{ cases: CaseRow[] }>("/api/v1/cases");
    return sortCasesForList(payload?.cases ?? []);
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase.from("cases").select("*");
  if (error) throw error;
  return sortCasesForList(data ?? []);
}

export async function getCaseById(caseId: string): Promise<CaseRow | null> {
  if (DEMO_MODE) {
    return demoFetch<CaseRow>(`/api/v1/cases/${encodeURIComponent(caseId)}`);
  }
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
  if (DEMO_MODE) {
    const payload = await demoFetch<{ events: CaseEventRow[] }>(
      `/api/v1/cases/${encodeURIComponent(caseId)}/timeline`,
    );
    return payload?.events ?? [];
  }
  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("case_events")
    .select("*")
    .eq("case_id", caseId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
