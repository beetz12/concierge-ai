import React from "react";
import Link from "next/link";
import { AlertCircle, CalendarClock, Scale } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import {
  CaseStatusBadge,
  StageIndicator,
} from "@/components/cases/CaseBadges";
import { getCases } from "@/lib/supabase/case-queries";

/**
 * Cases list: one row per dispute / follow-up case with status, escalation
 * stage, and next action. Cases with an overdue next action sort first.
 */
export default async function CasesPage() {
  let cases: Awaited<ReturnType<typeof getCases>> = [];
  let fetchError: string | null = null;

  try {
    cases = await getCases();
  } catch (error) {
    console.error("Failed to load cases:", error);
    fetchError = "Failed to load cases. Please refresh the page.";
  }

  const now = Date.now();
  const isOverdue = (nextActionAt: string | null) =>
    !!nextActionAt && Date.parse(nextActionAt) < now;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Cases"
        description="Track disputes and follow-ups: status, escalation stage, and what is due next"
      />

      {fetchError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400 font-medium">{fetchError}</p>
        </div>
      )}

      {!fetchError && (
        <div className="bg-surface rounded-2xl border border-surface-highlight shadow-xl overflow-hidden">
          {cases.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Scale className="w-12 h-12 text-slate-500 mx-auto mb-4" />
              <p className="text-lg mb-2">No cases yet.</p>
              <p className="text-sm text-slate-500">
                Cases created via the API will appear here with their timeline
                and escalation stage.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-surface-highlight text-xs uppercase tracking-wider text-slate-500">
                    <th className="px-6 py-3 font-bold">Case</th>
                    <th className="px-6 py-3 font-bold">Status</th>
                    <th className="px-6 py-3 font-bold">Stage</th>
                    <th className="px-6 py-3 font-bold">Next action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-highlight">
                  {cases.map((c) => (
                    <tr
                      key={c.id}
                      className="hover:bg-surface-hover transition-colors"
                    >
                      <td className="px-6 py-4">
                        <Link href={`/cases/${c.id}`} className="group block">
                          <span className="font-bold text-slate-100 group-hover:text-primary-400 transition-colors">
                            {c.title}
                          </span>
                          <span className="block text-xs text-slate-500 mt-1">
                            {[c.counterparty_name, c.counterparty_company]
                              .filter(Boolean)
                              .join(" - ") || "No counterparty on file"}
                            {" | "}
                            {c.dispute_type}
                          </span>
                        </Link>
                      </td>
                      <td className="px-6 py-4">
                        <CaseStatusBadge status={c.status} />
                      </td>
                      <td className="px-6 py-4">
                        <StageIndicator stage={c.escalation_stage} />
                      </td>
                      <td className="px-6 py-4">
                        {c.next_action_at ? (
                          <span
                            className={
                              isOverdue(c.next_action_at)
                                ? "inline-flex items-center gap-1 text-xs font-medium text-red-400"
                                : "inline-flex items-center gap-1 text-xs text-slate-400"
                            }
                          >
                            <CalendarClock className="w-3 h-3" />
                            {new Date(c.next_action_at).toLocaleString()}
                            {isOverdue(c.next_action_at) && " (overdue)"}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">
                            Nothing scheduled
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
