"use client";

import React from "react";
import {
  Search,
  Phone,
  BrainCircuit,
  CheckCircle,
  XCircle,
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
}

const LiveStatus: React.FC<LiveStatusProps> = ({
  status,
  currentStep,
  progress,
  callProgress,
}) => {
  const getStatusConfig = () => {
    switch (status.toLowerCase()) {
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

  // Use callProgress for CALLING status if available
  if (status.toLowerCase() === "calling" && callProgress) {
    return (
      <div
        className={`px-4 py-3 rounded-xl border ${config.bgColor} ${config.borderColor} animate-fadeIn`}
      >
        <div className="text-center">
          <div className="text-lg font-medium text-primary-400">
            Calling Providers ({callProgress.completed}/{callProgress.total})
          </div>
          {callProgress.currentProviderName && (
            <div className="text-sm text-slate-400 mt-1">
              Currently calling: {callProgress.currentProviderName}
            </div>
          )}
          {callProgress.queued > 0 && (
            <div className="text-xs text-slate-500 mt-1">
              {callProgress.queued} queued, {callProgress.inProgress} in progress
            </div>
          )}
          {/* Progress bar */}
          <div className="mt-3 w-full bg-slate-700 rounded-full h-2">
            <div
              className="bg-primary-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${callProgress.percent}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

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

      {status.toLowerCase() === "calling" && progress && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>{progress.current} of {progress.total} calls</span>
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
