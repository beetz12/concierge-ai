import React from "react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { Calendar, MapPin, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { getServiceRequests } from "@/lib/supabase/queries";
import type { RequestStatus } from "@/lib/types";

export default async function RequestHistory() {
  // Query database directly with error handling
  let requests: Awaited<ReturnType<typeof getServiceRequests>> = [];
  let fetchError: string | null = null;

  try {
    requests = await getServiceRequests();
  } catch (error) {
    console.error("Failed to load request history:", error);
    fetchError = "Failed to load request history. Please refresh the page.";
  }

  // Sort by created_at (newest first) - already sorted by query but ensuring consistency
  const sorted = [...(requests || [])].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Request History"
        description="View and track all your service requests"
      />

      {/* Error State */}
      {fetchError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center mb-8">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400 font-medium">{fetchError}</p>
          <Link
            href="/history"
            className="inline-block mt-4 px-4 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            Try Again
          </Link>
        </div>
      )}

      <div className="bg-surface rounded-2xl border border-surface-highlight shadow-xl overflow-hidden">
        {!fetchError && sorted.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <p className="text-lg mb-2">No history found.</p>
            <p className="text-sm text-slate-500">Your request history will appear here.</p>
            <Link
              href="/new"
              className="inline-block mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors"
            >
              Create Your First Request
            </Link>
          </div>
        ) : fetchError ? null : (
          <div className="divide-y divide-surface-highlight">
            {sorted.map((req) => {
              // Find the selected provider from the providers array
              const providers = Array.isArray(req.providers)
                ? req.providers
                : [];
              const selectedProvider = req.selected_provider_id
                ? providers.find((p) => p.id === req.selected_provider_id)
                : null;

              return (
                <div
                  key={req.id}
                  className="p-6 hover:bg-surface-hover transition-colors"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <StatusBadge
                          status={req.status as RequestStatus}
                          size="sm"
                        />
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(req.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <Link href={`/request/${req.id}`} className="group">
                        <h3 className="text-lg font-bold text-slate-100 group-hover:text-primary-400 transition-colors mb-1">
                          {req.title || "Untitled Request"}
                        </h3>
                      </Link>
                      <p className="text-slate-400 text-sm mb-2">
                        {req.description || "No description"}
                      </p>
                      {req.location && (
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <MapPin className="w-3 h-3" /> {req.location}
                        </div>
                      )}

                      {/* Final Outcome (Fix #5) */}
                      {req.final_outcome && (
                        <p className="text-sm text-slate-400 mt-2 line-clamp-2 italic">
                          {req.final_outcome}
                        </p>
                      )}

                      {/* Call Status Summary (Fix #6) */}
                      {providers.length > 0 && (
                        <div className="flex gap-2 mt-2 flex-wrap">
                          {(() => {
                            const successCount = providers.filter(
                              (p) => p.call_status === "completed"
                            ).length;
                            const failedCount = providers.filter(
                              (p) => p.call_status === "failed"
                            ).length;
                            const pendingCount = providers.filter(
                              (p) => !p.call_status || p.call_status === "pending"
                            ).length;
                            return (
                              <>
                                {successCount > 0 && (
                                  <span className="inline-flex items-center gap-1 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">
                                    <CheckCircle className="w-3 h-3" />
                                    {successCount} completed
                                  </span>
                                )}
                                {failedCount > 0 && (
                                  <span className="inline-flex items-center gap-1 text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">
                                    <XCircle className="w-3 h-3" />
                                    {failedCount} failed
                                  </span>
                                )}
                                {pendingCount > 0 && providers.length > pendingCount && (
                                  <span className="text-xs bg-slate-500/20 text-slate-400 px-2 py-0.5 rounded">
                                    {pendingCount} pending
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4">
                      {selectedProvider && (
                        <div className="hidden md:block text-right">
                          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                            Booked With
                          </span>
                          <span className="text-sm font-medium text-primary-400">
                            {selectedProvider.name}
                          </span>
                        </div>
                      )}
                      <Link
                        href={`/request/${req.id}`}
                        className="px-4 py-2 bg-surface-highlight text-slate-300 text-sm font-medium rounded-lg hover:bg-slate-700/50 hover:text-white transition-colors border border-surface-highlight hover:border-slate-600"
                      >
                        View Log
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
