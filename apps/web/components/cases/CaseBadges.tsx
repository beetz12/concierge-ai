import React from "react";
import { cn } from "@/lib/utils";

/**
 * Presentational helpers for case management pages: status badge, escalation
 * stage indicator, and event-kind badge. Server-safe (no client hooks).
 */

const STATUS_STYLES: Record<string, string> = {
  open: "bg-sky-500/20 text-sky-300",
  pending_response: "bg-amber-500/20 text-amber-300",
  escalated: "bg-red-500/20 text-red-300",
  resolved: "bg-emerald-500/20 text-emerald-300",
  closed: "bg-slate-500/20 text-slate-400",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  pending_response: "Pending response",
  escalated: "Escalated",
  resolved: "Resolved",
  closed: "Closed",
};

export function CaseStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        STATUS_STYLES[status] ?? "bg-slate-500/20 text-slate-400",
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export const STAGE_LABELS: Record<number, string> = {
  1: "Collaborative",
  2: "Firm professional",
  3: "Reference consequences",
  4: "Ultimatum",
};

/**
 * Escalation stage indicator: four steps, filled up to the current stage,
 * hotter color the further the escalation has progressed.
 */
export function StageIndicator({
  stage,
  showLabel = false,
}: {
  stage: number;
  showLabel?: boolean;
}) {
  const heat = [
    "bg-emerald-400",
    "bg-amber-400",
    "bg-orange-400",
    "bg-red-400",
  ];
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              "h-2 w-4 rounded-sm",
              step <= stage ? heat[stage - 1] : "bg-slate-700",
            )}
          />
        ))}
      </span>
      <span className="text-xs text-slate-400">
        {stage}/4
        {showLabel ? ` - ${STAGE_LABELS[stage] ?? "Unknown"}` : ""}
      </span>
    </span>
  );
}

const KIND_STYLES: Record<string, string> = {
  call: "bg-violet-500/20 text-violet-300",
  sms: "bg-sky-500/20 text-sky-300",
  email: "bg-cyan-500/20 text-cyan-300",
  note: "bg-slate-500/20 text-slate-300",
  status_change: "bg-amber-500/20 text-amber-300",
  evidence: "bg-emerald-500/20 text-emerald-300",
};

export function EventKindBadge({ kind }: { kind: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide",
        KIND_STYLES[kind] ?? "bg-slate-500/20 text-slate-300",
      )}
    >
      {kind.replace("_", " ")}
    </span>
  );
}
