"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Calendar, PhoneOutgoing } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import {
  listMemberCalls,
  MemberApiError,
  type MemberCall,
} from "@/lib/services/memberService";

const STATUS_STYLES: Record<string, string> = {
  completed: "bg-emerald-500/20 text-emerald-400",
  in_progress: "bg-blue-500/20 text-blue-400",
  queued: "bg-amber-500/20 text-amber-400",
  failed: "bg-red-500/20 text-red-400",
  cancelled: "bg-slate-500/20 text-slate-400",
  unknown: "bg-slate-500/20 text-slate-400",
};

function CallStatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold ${
        STATUS_STYLES[status] ?? STATUS_STYLES.unknown
      }`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function CallRowSkeleton() {
  return (
    <div className="p-6 animate-pulse">
      <div className="h-5 w-48 bg-slate-700/50 rounded mb-3" />
      <div className="h-4 w-full max-w-md bg-slate-700/50 rounded mb-2" />
      <div className="h-3 w-24 bg-slate-700/50 rounded" />
    </div>
  );
}

export default function MemberCallsPage() {
  const [calls, setCalls] = useState<MemberCall[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInitial = useCallback(() => {
    setLoading(true);
    setError(null);
    listMemberCalls({ limit: 20 })
      .then((page) => {
        setCalls(page.calls);
        setNextCursor(page.nextCursor);
      })
      .catch((err) => {
        setError(
          err instanceof MemberApiError
            ? err.message
            : "Could not load your call history. Please refresh the page.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const page = await listMemberCalls({ limit: 20, cursor: nextCursor });
      setCalls((existing) => [...existing, ...page.calls]);
      setNextCursor(page.nextCursor);
    } catch {
      setError("Could not load more calls. Please try again.");
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Call History"
        description="Every call the AI has placed for your organization."
      />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
          <p className="text-red-400 font-medium">{error}</p>
          <button
            type="button"
            onClick={loadInitial}
            className="mt-4 px-4 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      <div className="bg-surface rounded-2xl border border-surface-highlight shadow-xl overflow-hidden">
        {loading ? (
          <div className="divide-y divide-surface-highlight">
            <CallRowSkeleton />
            <CallRowSkeleton />
            <CallRowSkeleton />
          </div>
        ) : !error && calls.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <div className="mx-auto w-16 h-16 bg-surface-highlight rounded-full flex items-center justify-center mb-4">
              <PhoneOutgoing className="w-8 h-8 opacity-50" />
            </div>
            <p className="text-lg mb-2">No calls yet.</p>
            <p className="text-sm text-slate-500">
              Dispatch a call and it will show up here with its outcome.
            </p>
            <Link
              href="/dispatch"
              className="inline-block mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
            >
              Dispatch a Call
            </Link>
          </div>
        ) : error ? null : (
          <div className="divide-y divide-surface-highlight">
            {calls.map((call) => (
              <div
                key={call.callId}
                className="p-6 hover:bg-surface-hover transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <CallStatusPill status={call.status} />
                      {call.disposition && (
                        <span className="text-xs text-slate-400">
                          {call.disposition.replace(/_/g, " ")}
                        </span>
                      )}
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(call.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-100 mb-1">
                      {call.businessName}
                    </h3>
                    {call.summary && (
                      <p className="text-slate-400 text-sm line-clamp-2">
                        {call.summary}
                      </p>
                    )}
                  </div>
                  {call.hasArtifacts && (
                    <Link
                      href={`/dispatch/${encodeURIComponent(call.callId)}`}
                      className="shrink-0 px-4 py-2 bg-surface-highlight text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-700/50 hover:text-white transition-colors border border-surface-highlight hover:border-slate-600 text-center"
                    >
                      View call
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {!loading && !error && nextCursor && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="px-5 py-2.5 bg-surface-highlight text-slate-200 font-semibold rounded-xl hover:bg-surface-highlight/70 transition-colors disabled:opacity-50"
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
