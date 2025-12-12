"use client";

import React from "react";
import { RequestStatus } from "@/lib/types";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Search,
  PhoneOutgoing,
  BrainCircuit,
  Calendar,
} from "lucide-react";

interface Props {
  status: RequestStatus;
  size?: "sm" | "md";
  callProgress?: {
    total: number;
    queued: number;
    inProgress: number;
    completed: number;
    currentProviderName: string | null;
    percent: number;
  } | null;
}

const StatusBadge: React.FC<Props> = ({ status, size = "md", callProgress }) => {
  // CRITICAL FIX: Derive display status from call progress to match LiveStatus
  // When status is ANALYZING but calls are still running, show CALLING instead
  const displayStatus = (() => {
    if (status === RequestStatus.ANALYZING && callProgress) {
      const hasActiveCalls = callProgress.inProgress > 0;
      const hasQueuedCalls = callProgress.queued > 0;
      const callsNotFinished = callProgress.completed < callProgress.total;

      // If any calls are still running or queued, show CALLING status
      if (hasActiveCalls || hasQueuedCalls || callsNotFinished) {
        return RequestStatus.CALLING;
      }
    }
    return status;
  })();

  const config = {
    [RequestStatus.PENDING]: {
      color: "bg-slate-500/20 text-slate-300 border-slate-500/30",
      icon: Loader2,
      label: "Pending",
      animate: false,
    },
    [RequestStatus.SEARCHING]: {
      color: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      icon: Search,
      label: "Researching",
      animate: true,
    },
    [RequestStatus.CALLING]: {
      color: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      icon: PhoneOutgoing,
      label: "Calling Providers",
      animate: true,
    },
    [RequestStatus.ANALYZING]: {
      color: "bg-purple-500/20 text-purple-300 border-purple-500/30",
      icon: BrainCircuit,
      label: "Analyzing",
      animate: true,
    },
    [RequestStatus.RECOMMENDED]: {
      color: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
      icon: CheckCircle2,
      label: "Ready to Book",
      animate: false,
    },
    [RequestStatus.BOOKING]: {
      color: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      icon: Calendar,
      label: "Booking Appointment",
      animate: true,
    },
    [RequestStatus.COMPLETED]: {
      color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
      icon: CheckCircle2,
      label: "Completed",
      animate: false,
    },
    [RequestStatus.FAILED]: {
      color: "bg-red-500/20 text-red-300 border-red-500/30",
      icon: XCircle,
      label: "Failed",
      animate: false,
    },
  };

  // Fallback for unknown status values (e.g., from database strings)
  const fallback = {
    color: "bg-slate-500/20 text-slate-300 border-slate-500/30",
    icon: Loader2,
    label: String(status || "Unknown"),
    animate: false,
  };

  const current = config[displayStatus] || fallback;
  const Icon = current.icon;
  const sizeClass = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full font-medium border border-transparent ${current.color} ${sizeClass}`}
    >
      <Icon
        className={`w-3.5 h-3.5 ${current.animate ? "animate-pulse" : ""}`}
      />
      <span>{current.label}</span>
    </div>
  );
};

export default StatusBadge;
