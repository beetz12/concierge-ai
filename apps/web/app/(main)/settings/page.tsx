"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { CallSettingsForm } from "@/components/members/CallSettingsForm";
import { DedicatedNumberCard } from "@/components/members/DedicatedNumberCard";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  getMemberMe,
  MemberApiError,
  type MemberMeResponse,
} from "@/lib/services/memberService";

function SettingsSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="bg-surface rounded-2xl border border-surface-highlight p-6">
        <div className="h-8 w-56 bg-slate-700/50 rounded mb-3" />
        <div className="h-4 w-72 bg-slate-700/50 rounded" />
      </div>
      <div className="bg-surface rounded-2xl border border-surface-highlight p-6 space-y-4">
        <div className="h-5 w-40 bg-slate-700/50 rounded" />
        <div className="h-10 w-full bg-slate-700/50 rounded-lg" />
        <div className="h-10 w-64 bg-slate-700/50 rounded-lg" />
        <div className="h-10 w-36 bg-slate-700/50 rounded-lg" />
      </div>
    </div>
  );
}

function SubscriptionPill({
  subscription,
}: {
  subscription: { status: string | null; plan: string | null };
}) {
  if (!subscription.status) {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold bg-slate-500/20 text-slate-400">
        No membership yet
      </span>
    );
  }
  const active = ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status);
  return (
    <span
      className={
        active
          ? "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-400"
          : "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-400"
      }
    >
      {subscription.plan ? `${subscription.plan} - ` : ""}
      {subscription.status.replace(/_/g, " ")}
    </span>
  );
}

export default function MemberSettingsPage() {
  const [me, setMe] = useState<MemberMeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getMemberMe()
      .then(setMe)
      .catch((err) => {
        setError(
          err instanceof MemberApiError
            ? err.message
            : "Could not load your settings. Please refresh the page.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <PageHeader
        title="Call Settings"
        description="Your dedicated number and outbound call preferences."
      />

      {loading && <SettingsSkeleton />}

      {!loading && error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-400 font-medium">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-4 px-4 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && me && (
        <>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span>
              Organization:{" "}
              <span className="text-slate-200 font-medium">
                {me.org.name ?? me.org.id}
              </span>
            </span>
            <SubscriptionPill subscription={me.subscription} />
          </div>

          <DedicatedNumberCard number={me.dedicatedNumber} />

          <section className="bg-surface rounded-2xl border border-surface-highlight shadow-xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                Outbound call preferences
              </h2>
              <p className="text-sm text-slate-400 mt-1">
                Applied to every call the AI places for your organization.
              </p>
            </div>
            <CallSettingsForm initial={me.settings} />
          </section>
        </>
      )}
    </div>
  );
}
