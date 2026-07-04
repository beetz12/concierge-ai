"use server";

/**
 * Server Actions for case management (slice 7).
 *
 * All writes run as the signed-in user (anon-key client + session cookies),
 * so cases/case_events RLS does the authorization; org_id comes from the
 * case row the caller can already read.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "../supabase/server";

const COMPOSER_KINDS = ["note", "evidence"] as const;
type ComposerKind = (typeof COMPOSER_KINDS)[number];

export interface AddCaseEventResult {
  ok: boolean;
  error?: string;
}

/**
 * Append a note or evidence entry to a case timeline from the detail-page
 * composer form.
 */
export async function addCaseEvent(
  caseId: string,
  formData: FormData,
): Promise<AddCaseEventResult> {
  const kind = String(formData.get("kind") ?? "note") as ComposerKind;
  const summary = String(formData.get("summary") ?? "").trim();

  if (!COMPOSER_KINDS.includes(kind)) {
    return { ok: false, error: "Entry type must be a note or evidence." };
  }
  if (!summary) {
    return { ok: false, error: "Please write something before adding it." };
  }

  const supabase = await createClient();

  const { data: caseRow, error: caseError } = await supabase
    .from("cases")
    .select("id, org_id")
    .eq("id", caseId)
    .maybeSingle();
  if (caseError) {
    return { ok: false, error: `Failed to load case: ${caseError.message}` };
  }
  if (!caseRow) {
    return { ok: false, error: "Case not found." };
  }

  const { error } = await supabase.from("case_events").insert({
    case_id: caseRow.id,
    org_id: caseRow.org_id,
    kind,
    summary,
    occurred_at: new Date().toISOString(),
    payload: {},
  });
  if (error) {
    return { ok: false, error: `Failed to add entry: ${error.message}` };
  }

  revalidatePath(`/cases/${caseId}`);
  revalidatePath("/cases");
  return { ok: true };
}
