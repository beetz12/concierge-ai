"use client";

import React, { useActionState } from "react";
import { Loader2, Plus } from "lucide-react";
import { addCaseEvent, AddCaseEventResult } from "@/lib/actions/cases";

/**
 * Note / evidence composer for the case detail page. Appends a case_events
 * row via the addCaseEvent server action; the page revalidates on success.
 */
export function CaseEventComposer({ caseId }: { caseId: string }) {
  const [state, formAction, pending] = useActionState<
    AddCaseEventResult | null,
    FormData
  >(async (_previous, formData) => addCaseEvent(caseId, formData), null);

  return (
    <form action={formAction} className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <select
          name="kind"
          defaultValue="note"
          className="bg-surface-highlight border border-surface-highlight rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-primary-500"
          aria-label="Entry type"
        >
          <option value="note">Note</option>
          <option value="evidence">Evidence</option>
        </select>
        <textarea
          name="summary"
          rows={2}
          required
          placeholder="Add a note or log a piece of evidence (what, when, where it is stored)..."
          className="flex-1 bg-surface-highlight border border-surface-highlight rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-primary-500 resize-y"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-500 transition-colors disabled:opacity-50 self-start"
        >
          {pending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          Add entry
        </button>
      </div>
      {state && !state.ok && (
        <p className="text-sm text-red-400">{state.error}</p>
      )}
    </form>
  );
}
