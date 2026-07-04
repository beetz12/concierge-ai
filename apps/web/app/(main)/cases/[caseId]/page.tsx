import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  CalendarClock,
  Mail,
  Phone,
  Shield,
} from "lucide-react";
import {
  CaseStatusBadge,
  EventKindBadge,
  STAGE_LABELS,
  StageIndicator,
} from "@/components/cases/CaseBadges";
import { CaseEventComposer } from "@/components/cases/CaseEventComposer";
import {
  getCaseById,
  getCaseEvents,
  type CaseEventRow,
} from "@/lib/supabase/case-queries";

/**
 * Case detail: escalation stage indicator, counterparty and leverage
 * summary, newest-first timeline, and a note/evidence composer.
 */
export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;

  const caseRow = await getCaseById(caseId).catch(() => null);
  if (!caseRow) notFound();

  const events: CaseEventRow[] = await getCaseEvents(caseId).catch(() => []);

  const overdue =
    !!caseRow.next_action_at && Date.parse(caseRow.next_action_at) < Date.now();

  const counterpartyLine =
    [caseRow.counterparty_name, caseRow.counterparty_company]
      .filter(Boolean)
      .join(" - ") || "No counterparty on file";

  const promisesOf = (event: CaseEventRow) => {
    const payload = event.payload as {
      promises?: Array<{ who?: string; what?: string; due_date?: string | null }>;
    } | null;
    return (payload?.promises ?? []).filter((p) => p.who && p.what);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <Link
        href="/cases"
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to cases
      </Link>

      {/* Header */}
      <div className="bg-surface rounded-2xl border border-surface-highlight shadow-xl p-6 space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <CaseStatusBadge status={caseRow.status} />
              <span className="text-xs text-slate-500 uppercase tracking-wider">
                {caseRow.dispute_type} dispute
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-100">
              {caseRow.title}
            </h1>
            <p className="text-sm text-slate-400 mt-1">{counterpartyLine}</p>
            <div className="flex flex-wrap gap-4 mt-2 text-xs text-slate-500">
              {caseRow.counterparty_phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {caseRow.counterparty_phone}
                </span>
              )}
              {caseRow.counterparty_email && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="w-3 h-3" /> {caseRow.counterparty_email}
                </span>
              )}
            </div>
          </div>
          <div className="text-left md:text-right space-y-2">
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
              Escalation stage
            </span>
            <StageIndicator stage={caseRow.escalation_stage} showLabel />
            <p className="text-xs text-slate-500">
              {STAGE_LABELS[caseRow.escalation_stage] ?? "Unknown"} approach
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-surface-highlight">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Amount at stake
            </span>
            <span className="inline-flex items-center gap-1 text-sm text-slate-200">
              <Banknote className="w-4 h-4 text-slate-500" />
              {caseRow.amount_at_stake != null
                ? `$${Number(caseRow.amount_at_stake).toFixed(2)}`
                : "Not set"}
            </span>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Next action
            </span>
            <span
              className={
                overdue
                  ? "inline-flex items-center gap-1 text-sm text-red-400 font-medium"
                  : "inline-flex items-center gap-1 text-sm text-slate-200"
              }
            >
              <CalendarClock className="w-4 h-4 text-slate-500" />
              {caseRow.next_action_at
                ? `${new Date(caseRow.next_action_at).toLocaleString()}${overdue ? " (overdue)" : ""}`
                : "Nothing scheduled"}
            </span>
          </div>
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">
              Leverage
            </span>
            <span className="inline-flex items-start gap-1 text-sm text-slate-200">
              <Shield className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              {caseRow.leverage_notes || "No leverage notes yet"}
            </span>
          </div>
        </div>

        {caseRow.resolution && (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block mb-1">
              Resolution
            </span>
            <p className="text-sm text-emerald-200">{caseRow.resolution}</p>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="bg-surface rounded-2xl border border-surface-highlight shadow-xl p-6">
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4">
          Add to the record
        </h2>
        <CaseEventComposer caseId={caseRow.id} />
      </div>

      {/* Timeline */}
      <div className="bg-surface rounded-2xl border border-surface-highlight shadow-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-highlight">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
            Timeline (newest first)
          </h2>
        </div>
        {events.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No interactions recorded yet. Calls, texts, notes, and evidence
            will appear here.
          </div>
        ) : (
          <div className="divide-y divide-surface-highlight">
            {events.map((event) => (
              <div key={event.id} className="px-6 py-4">
                <div className="flex items-center gap-3 mb-1">
                  <EventKindBadge kind={event.kind} />
                  <span className="text-xs text-slate-500">
                    {new Date(event.occurred_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-slate-200">{event.summary}</p>
                {promisesOf(event).length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {promisesOf(event).map((promise, index) => (
                      <li
                        key={index}
                        className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1 inline-block"
                      >
                        {promise.who} committed to: {promise.what}
                        {promise.due_date ? ` (due ${promise.due_date})` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
