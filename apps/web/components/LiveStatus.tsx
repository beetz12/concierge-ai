"use client";

import React from "react";
import {
  Search,
  Phone,
  BrainCircuit,
  CheckCircle,
  XCircle,
  Sparkles,
  MapPin,
  Filter,
  PhoneCall,
  Clock,
  Zap,
} from "lucide-react";

interface LiveStatusProps {
  status: string;
  currentStep?: string;
  progress?: {
    current: number;
    total: number;
    currentProvider?: string;
  };
  callProgress?: {
    total: number;
    queued: number;
    inProgress: number;
    completed: number;
    currentProviderName: string | null;
    percent: number;
  } | null;
  providersFound?: number;
  interactions?: Array<{
    timestamp: string;
    stepName: string;
    detail: string;
    status: "success" | "warning" | "error" | "info";
  }>;
}

interface SearchStep {
  id: string;
  label: string;
  icon: React.ElementType;
  status: "pending" | "active" | "completed";
}

const LiveStatus: React.FC<LiveStatusProps> = ({
  status,
  currentStep,
  progress,
  callProgress,
  providersFound = 0,
  interactions = [],
}) => {
  const getStatusConfig = () => {
    // Null safety: ensure status is a string before calling toLowerCase
    const safeStatus = (status || "").toLowerCase();
    switch (safeStatus) {
      case "searching":
        return {
          icon: Search,
          color: "text-blue-400",
          bgColor: "bg-blue-500/20",
          borderColor: "border-blue-500/30",
          label: "Searching for providers...",
          animated: true,
        };
      case "calling":
        return {
          icon: Phone,
          color: "text-amber-400",
          bgColor: "bg-amber-500/20",
          borderColor: "border-amber-500/30",
          label: progress
            ? `Calling provider ${progress.current} of ${progress.total}${progress.currentProvider ? `: ${progress.currentProvider}` : ""}`
            : "Calling providers...",
          animated: true,
        };
      case "analyzing":
        return {
          icon: BrainCircuit,
          color: "text-purple-400",
          bgColor: "bg-purple-500/20",
          borderColor: "border-purple-500/30",
          label: "Analyzing results...",
          animated: true,
        };
      case "completed":
        return {
          icon: CheckCircle,
          color: "text-emerald-400",
          bgColor: "bg-emerald-500/20",
          borderColor: "border-emerald-500/30",
          label: "Complete!",
          animated: false,
        };
      case "failed":
        return {
          icon: XCircle,
          color: "text-red-400",
          bgColor: "bg-red-500/20",
          borderColor: "border-red-500/30",
          label: "Request failed",
          animated: false,
        };
      default:
        return {
          icon: Search,
          color: "text-slate-400",
          bgColor: "bg-slate-500/20",
          borderColor: "border-slate-500/30",
          label: currentStep || "Processing...",
          animated: false,
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  // Null safety: use safe status for all comparisons
  const safeStatus = (status || "").toLowerCase();

  // SEARCHING status - show detailed search steps
  if (safeStatus === "searching") {
    // Determine search progress from interactions (with null safety)
    const hasStartedSearch = interactions.some((i) =>
      (i.stepName || "").includes("Research") || (i.detail || "").includes("Found")
    );
    const hasFoundProviders = providersFound > 0;
    const hasFilteredProviders = hasFoundProviders && interactions.some((i) =>
      (i.detail || "").includes("providers using")
    );

    const searchSteps: SearchStep[] = [
      {
        id: "query",
        label: "Querying Google Maps API with grounding...",
        icon: Search,
        status: hasStartedSearch ? "completed" : "active",
      },
      {
        id: "found",
        label: hasFoundProviders
          ? `Found ${providersFound} providers matching criteria`
          : "Scanning local providers...",
        icon: MapPin,
        status: hasFoundProviders
          ? "completed"
          : hasStartedSearch
            ? "active"
            : "pending",
      },
      {
        id: "filter",
        label: "Filtering by rating and reviews...",
        icon: Filter,
        status: hasFilteredProviders
          ? "completed"
          : hasFoundProviders
            ? "active"
            : "pending",
      },
      {
        id: "ready",
        label: "Preparing to call providers",
        icon: PhoneCall,
        status: hasFilteredProviders ? "completed" : "pending",
      },
    ];

    return (
      <div
        className={`px-5 py-4 rounded-xl border ${config.bgColor} ${config.borderColor} animate-fadeIn`}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <Icon className={`w-6 h-6 ${config.color} animate-pulse`} />
            <Sparkles className="w-3 h-3 text-blue-300 absolute -top-1 -right-1 animate-pulse" />
          </div>
          <div>
            <p className={`text-base font-bold ${config.color}`}>
              {config.label}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              AI-powered market research in progress
            </p>
          </div>
        </div>

        {/* Search steps */}
        <div className="space-y-2.5">
          {searchSteps.map((step, index) => {
            const StepIcon = step.icon;
            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 transition-all duration-300 ${
                  step.status === "pending" ? "opacity-40" : "opacity-100"
                }`}
              >
                <div
                  className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                    step.status === "completed"
                      ? "bg-emerald-500/20 border-emerald-500/50"
                      : step.status === "active"
                        ? "bg-blue-500/20 border-blue-500/50 animate-pulse"
                        : "bg-slate-700/20 border-slate-600/30"
                  }`}
                >
                  {step.status === "completed" ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <StepIcon
                      className={`w-4 h-4 ${
                        step.status === "active"
                          ? "text-blue-400"
                          : "text-slate-500"
                      }`}
                    />
                  )}
                </div>
                <span
                  className={`text-sm ${
                    step.status === "completed"
                      ? "text-slate-200 font-medium"
                      : step.status === "active"
                        ? "text-blue-300 font-medium"
                        : "text-slate-500"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // CALLING status - show concurrent call progress
  if (safeStatus === "calling" && callProgress) {
    const hasQueuedCalls = callProgress.queued > 0;
    const hasActiveCalls = callProgress.inProgress > 0;
    const hasCompletedCalls = callProgress.completed > 0;

    return (
      <div
        className={`px-5 py-4 rounded-xl border ${config.bgColor} ${config.borderColor} animate-fadeIn`}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <Phone className="w-6 h-6 text-amber-400 animate-pulse" />
            <Zap className="w-3 h-3 text-amber-300 absolute -top-1 -right-1 animate-pulse" />
          </div>
          <div>
            <p className="text-base font-bold text-amber-400">
              Making {callProgress.total} Concurrent Calls
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time VAPI.ai voice calls in progress
            </p>
          </div>
        </div>

        {/* Call progress breakdown */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div
            className={`bg-slate-700/30 rounded-lg p-2.5 border ${
              hasQueuedCalls ? "border-slate-500/50" : "border-slate-700/30"
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock
                className={`w-4 h-4 ${
                  hasQueuedCalls ? "text-slate-400" : "text-slate-600"
                }`}
              />
              <div>
                <div className="text-xs text-slate-500">Queued</div>
                <div
                  className={`text-lg font-bold ${
                    hasQueuedCalls ? "text-slate-300" : "text-slate-600"
                  }`}
                >
                  {callProgress.queued}
                </div>
              </div>
            </div>
          </div>

          <div
            className={`bg-amber-500/10 rounded-lg p-2.5 border ${
              hasActiveCalls
                ? "border-amber-500/50 animate-pulse"
                : "border-amber-700/20"
            }`}
          >
            <div className="flex items-center gap-2">
              <PhoneCall
                className={`w-4 h-4 ${
                  hasActiveCalls ? "text-amber-400" : "text-amber-700"
                }`}
              />
              <div>
                <div className="text-xs text-slate-500">Active</div>
                <div
                  className={`text-lg font-bold ${
                    hasActiveCalls ? "text-amber-300" : "text-amber-700"
                  }`}
                >
                  {callProgress.inProgress}
                </div>
              </div>
            </div>
          </div>

          <div
            className={`bg-emerald-500/10 rounded-lg p-2.5 border ${
              hasCompletedCalls
                ? "border-emerald-500/50"
                : "border-emerald-700/20"
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle
                className={`w-4 h-4 ${
                  hasCompletedCalls ? "text-emerald-400" : "text-emerald-700"
                }`}
              />
              <div>
                <div className="text-xs text-slate-500">Done</div>
                <div
                  className={`text-lg font-bold ${
                    hasCompletedCalls ? "text-emerald-300" : "text-emerald-700"
                  }`}
                >
                  {callProgress.completed}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Currently calling */}
        {callProgress.currentProviderName && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              <span className="text-sm text-amber-200 font-medium">
                Currently calling: {callProgress.currentProviderName}
              </span>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>Overall Progress</span>
            <span className="font-mono font-bold text-amber-300">
              {callProgress.completed}/{callProgress.total} ({callProgress.percent}%)
            </span>
          </div>
          <div className="h-2.5 bg-slate-700/50 rounded-full overflow-hidden border border-slate-600/30">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500 relative overflow-hidden"
              style={{ width: `${callProgress.percent}%` }}
            >
              <div className="absolute inset-0 bg-white/20 animate-shimmer" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ANALYZING status - show AI analysis steps
  if (safeStatus === "analyzing") {
    const hasCompletedCalls = interactions.some((i) =>
      (i.stepName || "").includes("Calling") && i.status === "success"
    );
    const isGeneratingRecs = interactions.length > 0;

    const analysisSteps: SearchStep[] = [
      {
        id: "collect",
        label: "Collecting call transcripts and data...",
        icon: Phone,
        status: hasCompletedCalls ? "completed" : "active",
      },
      {
        id: "analyze",
        label: "Running Gemini AI analysis on results...",
        icon: BrainCircuit,
        status: hasCompletedCalls ? "completed" : isGeneratingRecs ? "active" : "pending",
      },
      {
        id: "score",
        label: "Scoring providers against criteria...",
        icon: Sparkles,
        status: hasCompletedCalls ? "active" : "pending",
      },
      {
        id: "recommend",
        label: "Generating top 3 recommendations...",
        icon: CheckCircle,
        status: "pending",
      },
    ];

    return (
      <div
        className={`px-5 py-4 rounded-xl border ${config.bgColor} ${config.borderColor} animate-fadeIn`}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <BrainCircuit className="w-6 h-6 text-purple-400 animate-pulse" />
            <Sparkles className="w-3 h-3 text-purple-300 absolute -top-1 -right-1 animate-pulse" />
          </div>
          <div>
            <p className="text-base font-bold text-purple-400">
              AI Analysis in Progress
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              Gemini 2.5 Flash analyzing call results
            </p>
          </div>
        </div>

        {/* Analysis steps */}
        <div className="space-y-2.5">
          {analysisSteps.map((step) => {
            const StepIcon = step.icon;
            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 transition-all duration-300 ${
                  step.status === "pending" ? "opacity-40" : "opacity-100"
                }`}
              >
                <div
                  className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                    step.status === "completed"
                      ? "bg-emerald-500/20 border-emerald-500/50"
                      : step.status === "active"
                        ? "bg-purple-500/20 border-purple-500/50 animate-pulse"
                        : "bg-slate-700/20 border-slate-600/30"
                  }`}
                >
                  {step.status === "completed" ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <StepIcon
                      className={`w-4 h-4 ${
                        step.status === "active"
                          ? "text-purple-400"
                          : "text-slate-500"
                      }`}
                    />
                  )}
                </div>
                <span
                  className={`text-sm ${
                    step.status === "completed"
                      ? "text-slate-200 font-medium"
                      : step.status === "active"
                        ? "text-purple-300 font-medium"
                        : "text-slate-500"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Default rendering for other statuses
  return (
    <div
      className={`px-4 py-3 rounded-xl border ${config.bgColor} ${config.borderColor} ${config.animated ? "animate-fadeIn" : ""}`}
    >
      <div className="flex items-center gap-3">
        <Icon
          className={`w-5 h-5 ${config.color} ${config.animated ? "animate-pulse" : ""}`}
        />
        <div className="flex-1">
          <p className={`text-sm font-medium ${config.color}`}>{config.label}</p>
          {currentStep && currentStep !== config.label && (
            <p className="text-xs text-slate-400 mt-1">{currentStep}</p>
          )}
        </div>
      </div>

      {safeStatus === "calling" && progress && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>
              {progress.current} of {progress.total} calls
            </span>
            <span>{Math.round((progress.current / progress.total) * 100)}%</span>
          </div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all duration-500"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveStatus;
