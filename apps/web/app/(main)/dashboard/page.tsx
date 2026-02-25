"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { RequestStatus } from "@/lib/types";
import { useAppContext } from "@/lib/providers/AppProvider";

const StatCard: React.FC<{
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = ({ label, value, icon: Icon, color }) => (
  <div className="bg-surface p-6 rounded-2xl border border-surface-highlight shadow-xl flex items-center justify-between hover:border-primary-500/30 transition-all duration-300">
    <div>
      <p className="text-slate-400 text-sm font-medium mb-1">{label}</p>
      <h3 className="text-3xl font-bold text-slate-100">{value}</h3>
    </div>
    <div
      className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}
    >
      <Icon className="w-6 h-6 text-white" />
    </div>
  </div>
);

export default function Dashboard() {
  const { requests } = useAppContext();

  const activeCount = requests.filter((r) =>
    [
      RequestStatus.SEARCHING,
      RequestStatus.CALLING,
      RequestStatus.ANALYZING,
    ].includes(r.status),
  ).length;
  const completedCount = requests.filter(
    (r) => r.status === RequestStatus.COMPLETED,
  ).length;
  const totalCount = requests.length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Welcome back"
        description="Here's what your AI concierge is working on."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          label="Active Requests"
          value={activeCount}
          icon={TrendingUp}
          color="bg-blue-500"
        />
        <StatCard
          label="Completed Tasks"
          value={completedCount}
          icon={CheckCircle2}
          color="bg-emerald-500"
        />
        <StatCard
          label="Total History"
          value={totalCount}
          icon={Clock}
          color="bg-purple-500"
        />
      </div>

      <div className="bg-surface rounded-2xl border border-surface-highlight shadow-xl overflow-hidden">
        <div className="p-6 border-b border-surface-highlight flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100">Recent Activity</h2>
          <Link
            href="/history"
            className="text-primary-400 text-sm font-medium hover:text-primary-300 flex items-center gap-1"
          >
            View All <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {requests.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <div className="mx-auto w-16 h-16 bg-surface-highlight rounded-full flex items-center justify-center mb-4">
              <Clock className="w-8 h-8 opacity-50" />
            </div>
            <p>No requests yet. Start by creating a new task!</p>
            <Link
              href="/new"
              className="inline-block mt-4 px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-500 transition-colors shadow-lg shadow-primary-500/20"
            >
              New Request
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-surface-highlight">
            {requests.slice(0, 5).map((req) => (
              <Link
                key={req.id}
                href={`/request/${req.id}`}
                className="block p-4 hover:bg-surface-hover transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-surface-highlight flex items-center justify-center text-primary-300 font-bold shrink-0 border border-surface-highlight">
                      {((req.title || "??").substring(0, 2) || "??").toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-100">
                        {req.title || "Untitled Request"}
                      </h3>
                      <p className="text-slate-500 text-sm line-clamp-1">
                        {req.description || "No description"}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                        <span>
                          {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : "Unknown date"}
                        </span>
                        <span>•</span>
                        <span>{req.location || "Direct Task"}</span>
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={req.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
