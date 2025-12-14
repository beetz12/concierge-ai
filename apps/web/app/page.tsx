"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Clock,
  CheckCircle2,
  TrendingUp,
  Sparkles,
  Phone,
  Search,
  CheckCircle,
} from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { RequestStatus } from "@/lib/types";
import { useAppContext } from "@/lib/providers/AppProvider";

const StatCard: React.FC<{
  label: string;
  value: number;
  icon: any;
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

const HeroSection: React.FC = () => (
  <section
    className="relative overflow-hidden rounded-3xl border border-surface-highlight shadow-2xl mb-8"
    aria-labelledby="hero-title"
  >
    {/* Gradient Background */}
    <div className="absolute inset-0 bg-gradient-to-br from-teal-900/40 via-purple-900/40 to-slate-900/40" />
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-500/20 via-transparent to-transparent" />

    <div className="relative p-12 lg:p-16">
      <div className="max-w-4xl mx-auto text-center">
        {/* Main Headline */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500/10 border border-teal-500/20 rounded-full mb-6">
          <Sparkles className="w-4 h-4 text-teal-400" />
          <span className="text-teal-300 text-sm font-medium">
            Powered by AI & Real Phone Calls
          </span>
        </div>

        <h1
          id="hero-title"
          className="text-5xl lg:text-6xl font-bold text-slate-100 mb-6 bg-clip-text text-transparent bg-gradient-to-r from-teal-300 via-purple-300 to-teal-300"
        >
          Your AI Concierge Finds & Books Service Providers
        </h1>

        <p className="text-xl text-slate-300 mb-12 max-w-2xl mx-auto leading-relaxed">
          Tell us what you need. Our AI researches providers, makes concurrent
          phone calls to check availability and rates, then recommends the top 3
          options. You pick the best.
        </p>

        {/* 4-Step Flow */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          <div className="bg-surface/50 backdrop-blur-sm p-6 rounded-2xl border border-surface-highlight hover:border-teal-500/30 transition-all duration-300">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center mb-4 mx-auto">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-bold text-slate-100 mb-2">1. Tell Us</h3>
            <p className="text-sm text-slate-400">
              Describe what service you need and where
            </p>
          </div>

          <div className="bg-surface/50 backdrop-blur-sm p-6 rounded-2xl border border-surface-highlight hover:border-purple-500/30 transition-all duration-300">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mb-4 mx-auto">
              <Search className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-bold text-slate-100 mb-2">2. AI Research</h3>
            <p className="text-sm text-slate-400">
              We find qualified providers in your area
            </p>
          </div>

          <div className="bg-surface/50 backdrop-blur-sm p-6 rounded-2xl border border-surface-highlight hover:border-blue-500/30 transition-all duration-300">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-4 mx-auto">
              <Phone className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-bold text-slate-100 mb-2">3. Live Calls</h3>
            <p className="text-sm text-slate-400">
              Concurrent calls check availability & rates
            </p>
          </div>

          <div className="bg-surface/50 backdrop-blur-sm p-6 rounded-2xl border border-surface-highlight hover:border-emerald-500/30 transition-all duration-300">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center mb-4 mx-auto">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <h3 className="font-bold text-slate-100 mb-2">4. You Choose</h3>
            <p className="text-sm text-slate-400">
              Pick from top 3 AI-recommended options
            </p>
          </div>
        </div>

        {/* CTA Button */}
        <Link
          href="/new"
          className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-teal-500 to-teal-600 text-white text-lg font-semibold rounded-xl hover:from-teal-600 hover:to-teal-700 transition-all duration-300 shadow-xl shadow-teal-500/30 hover:shadow-2xl hover:shadow-teal-500/40 hover:scale-105"
        >
          Start Your First Request
          <ArrowRight className="w-5 h-5" />
        </Link>

        {/* Sponsor Technologies */}
        <div className="mt-12 pt-8 border-t border-surface-highlight">
          <p className="text-slate-500 text-sm mb-4">Powered by</p>
          <div className="flex items-center justify-center gap-8 flex-wrap">
            <div className="text-slate-400 font-semibold text-sm">
              Kestra Orchestration
            </div>
            <div className="text-slate-400 font-semibold text-sm">
              Vercel Hosting
            </div>
            <div className="text-slate-400 font-semibold text-sm">
              VAPI Voice AI
            </div>
            <div className="text-slate-400 font-semibold text-sm">
              Google Gemini
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
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

  // Show hero section for first-time users
  if (requests.length === 0) {
    return (
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader />
        <HeroSection />
      </div>
    );
  }

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
