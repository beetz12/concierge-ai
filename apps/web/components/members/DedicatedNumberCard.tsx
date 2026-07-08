"use client";

import Link from "next/link";
import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatUsPhone,
  type DedicatedNumber,
  type OrgNumberStatus,
} from "@/lib/services/memberService";

const STATUS_STYLES: Record<OrgNumberStatus, { label: string; className: string }> = {
  active: {
    label: "Active",
    className: "bg-emerald-500/20 text-emerald-400",
  },
  simulated: {
    label: "Simulated (sandbox)",
    className: "bg-amber-500/20 text-amber-400",
  },
  released: {
    label: "Released",
    className: "bg-slate-500/20 text-slate-400",
  },
};

export function NumberStatusBadge({ status }: { status: OrgNumberStatus }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.released;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold",
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}

/**
 * The org's dedicated outbound number, or a prompt to finish onboarding when
 * none has been provisioned yet.
 */
export function DedicatedNumberCard({
  number,
  className,
}: {
  number: DedicatedNumber | null;
  className?: string;
}) {
  if (!number) {
    return (
      <div
        className={cn(
          "bg-surface rounded-2xl border border-surface-highlight shadow-xl p-6",
          className,
        )}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-500/15 flex items-center justify-center shrink-0">
              <Phone className="w-6 h-6 text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                No dedicated number yet
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Get a number that belongs to your organization only, so every
                call goes out from a consistent, trusted caller ID.
              </p>
            </div>
          </div>
          <Link
            href="/onboarding"
            className="shrink-0 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-500 transition-colors text-center"
          >
            Get your number
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-surface rounded-2xl border border-surface-highlight shadow-xl p-6",
        className,
      )}
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary-500/15 flex items-center justify-center shrink-0">
          <Phone className="w-6 h-6 text-primary-400" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-bold tracking-tight text-slate-100">
              {formatUsPhone(number.phoneE164)}
            </span>
            <NumberStatusBadge status={number.status} />
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Your dedicated outbound number
            {number.areaCode ? ` (area code ${number.areaCode})` : ""} - added{" "}
            {new Date(number.purchasedAt).toLocaleDateString()}
          </p>
          {number.status === "simulated" && (
            <p className="text-xs text-amber-400/80 mt-2">
              Sandbox number: no real phone line was purchased in this
              environment.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
