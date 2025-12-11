"use client";

import React, { useState, useId } from "react";
import { ChevronDown, Phone, Clock } from "lucide-react";
import { InteractionLog } from "@/lib/types";

interface ProviderCallSectionProps {
  log: InteractionLog;
  defaultExpanded?: boolean;
}

export function ProviderCallSection({
  log,
  defaultExpanded = false,
}: ProviderCallSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const contentId = useId();
  const headerId = useId();

  // Determine status badge color and text based on log.status
  const getStatusBadge = () => {
    const statusConfig = {
      success: {
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/30",
        text: "text-emerald-400",
        label: "Completed",
      },
      warning: {
        bg: "bg-amber-500/10",
        border: "border-amber-500/30",
        text: "text-amber-400",
        label: "Voicemail",
      },
      error: {
        bg: "bg-red-500/10",
        border: "border-red-500/30",
        text: "text-red-400",
        label: "No Answer",
      },
      info: {
        bg: "bg-blue-500/10",
        border: "border-blue-500/30",
        text: "text-blue-400",
        label: "In Progress",
      },
    };

    const config = statusConfig[log.status];

    return (
      <span
        className={`px-2 py-1 text-xs font-medium rounded-md border ${config.bg} ${config.border} ${config.text}`}
      >
        {config.label}
      </span>
    );
  };

  // Format the summary text (convert markdown-like syntax to plain text)
  const formatSummary = (detail: string) => {
    if (!detail) return "";

    // Remove markdown-style bold/italic
    let formatted = detail.replace(/\*\*(.+?)\*\*/g, "$1");
    formatted = formatted.replace(/\*(.+?)\*/g, "$1");
    formatted = formatted.replace(/_(.+?)_/g, "$1");

    // Convert "- " to bullet points (•)
    formatted = formatted.replace(/^- /gm, "• ");

    return formatted;
  };

  // Determine if speaker is AI
  const isAiSpeaker = (speaker: string) => {
    const lowerSpeaker = speaker.toLowerCase();
    return (
      lowerSpeaker.includes("ai") ||
      lowerSpeaker.includes("assistant") ||
      lowerSpeaker.includes("agent")
    );
  };

  // Format call duration
  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    if (minutes > 0) {
      return `${minutes}:${remainingSeconds.toString().padStart(2, "0")} min`;
    }
    return `${remainingSeconds} sec`;
  };

  return (
    <div className="border border-surface-highlight rounded-lg overflow-hidden mb-3 shadow-sm">
      {/* Header - always visible */}
      <button
        id={headerId}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        className="w-full flex items-center justify-between p-4 bg-surface-highlight hover:bg-surface-highlight/80 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/50"
      >
        <div className="flex items-center gap-3">
          <div className="bg-surface p-2 rounded-full">
            <Phone className="w-4 h-4 text-primary-400" />
          </div>
          <span className="font-medium text-slate-200">
            {/* Use provider name if available, otherwise fall back to stepName */}
            {log.providerName
              ? `Call to ${log.providerName}`
              : log.stepName === "provider_call"
                ? "Provider Call"
                : log.stepName}
          </span>
          {getStatusBadge()}
        </div>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Content - collapsible */}
      <div
        id={contentId}
        role="region"
        aria-labelledby={headerId}
        className={`transition-all duration-200 ease-in-out ${
          isExpanded
            ? "max-h-[2000px] opacity-100"
            : "max-h-0 opacity-0 overflow-hidden"
        }`}
      >
        <div className="p-5 bg-surface border-t border-surface-highlight space-y-5">
          {/* Summary Section */}
          <div>
            <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Summary
            </h4>
            <div className="text-slate-300 whitespace-pre-line leading-relaxed">
              {formatSummary(log.detail)}
            </div>
          </div>

          {/* Transcript Section */}
          {Array.isArray(log.transcript) && log.transcript.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Transcript
              </h4>
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
                {log.transcript.map((msg, idx) => {
                  const speaker = String(msg?.speaker || "Unknown");
                  const text = String(msg?.text || "");
                  const isAi = isAiSpeaker(speaker);
                  return (
                    <div
                      key={idx}
                      className={`flex ${isAi ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`p-3 rounded-2xl max-w-[80%] ${
                          isAi
                            ? "bg-primary-600/20 text-slate-200 border border-primary-500/20 rounded-tl-none"
                            : "bg-slate-700 text-slate-200 border border-slate-600 rounded-tr-none"
                        }`}
                      >
                        <span className="text-xs font-bold opacity-75 block mb-1">
                          {speaker}
                        </span>
                        <p className="text-sm leading-relaxed">{text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Call Metadata */}
          {log.callData && (
            <div className="pt-3 border-t border-surface-highlight">
              <div className="flex items-center gap-4 text-xs text-slate-500">
                {log.callData.duration !== undefined && (
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="font-medium">
                      {formatDuration(log.callData.duration)}
                    </span>
                  </span>
                )}
                {log.callData.callId && typeof log.callData.callId === "string" && (
                  <span className="font-mono">
                    ID: {log.callData.callId.substring(0, 8)}...
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProviderCallSection;
