"use client";

import React, { useEffect, useRef, useId, useState } from "react";
import {
  X,
  MapPin,
  Star,
  Phone,
  Clock,
  Globe,
  ExternalLink,
  Copy,
  Check,
  Calendar,
} from "lucide-react";
import { Provider } from "@/lib/types";

interface ProviderDetailPanelProps {
  provider: Provider | null;
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (provider: Provider) => void;
}

export function ProviderDetailPanel({
  provider,
  isOpen,
  onClose,
  onSelect,
}: ProviderDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<"details" | "callLog" | "actions">(
    "details"
  );
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Focus trap and escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEscape);
    // Prevent body scroll when panel is open
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  // Reset to details tab when opening
  useEffect(() => {
    if (isOpen) {
      setActiveTab("details");
      setCopied(false);
    }
  }, [isOpen]);

  // Copy phone to clipboard
  const copyPhone = () => {
    if (provider?.phone) {
      navigator.clipboard.writeText(provider.phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen || !provider) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity animate-fadeIn"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed right-0 top-0 h-full w-full max-w-md bg-surface border-l border-surface-highlight shadow-2xl z-50 transform transition-transform duration-300 ease-out animate-fadeIn"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-highlight">
          <h2 id={titleId} className="text-lg font-bold text-slate-100">
            {provider.name}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-highlight rounded-lg transition-colors"
            aria-label="Close panel"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-surface-highlight">
          {(["details", "callLog", "actions"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "text-primary-400 border-b-2 border-primary-400"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab === "callLog"
                ? "Call Log"
                : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto h-[calc(100%-140px)]">
          {activeTab === "details" && (
            <div className="space-y-4">
              {/* Basic Info */}
              {provider.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-200">{provider.address}</span>
                </div>
              )}

              {provider.rating !== undefined && (
                <div className="flex items-center gap-3">
                  <Star className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                  <span className="text-slate-200">
                    {provider.rating.toFixed(1)}
                    {provider.reviewCount &&
                      ` (${provider.reviewCount} reviews)`}
                  </span>
                </div>
              )}

              {provider.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  <a
                    href={`tel:${provider.phone}`}
                    className="text-primary-400 hover:text-primary-300 hover:underline transition-colors"
                  >
                    {provider.phone}
                  </a>
                </div>
              )}

              {provider.distanceText && (
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5 text-slate-400 flex-shrink-0" />
                  <span className="text-slate-200">
                    {provider.distanceText} away
                  </span>
                </div>
              )}

              {(() => {
                  // Safely extract hours array from JSONB (could be array, object, or object with weekdayText)
                  const hours = Array.isArray(provider.hoursOfOperation)
                    ? provider.hoursOfOperation
                    : Array.isArray((provider.hoursOfOperation as any)?.weekdayText)
                      ? (provider.hoursOfOperation as any).weekdayText
                      : provider.hoursOfOperation && typeof provider.hoursOfOperation === "object"
                        ? Object.values(provider.hoursOfOperation)
                        : [];
                  return hours.length > 0 ? (
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-slate-200">Hours</span>
                          {provider.isOpenNow && (
                            <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">
                              Open Now
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-400 space-y-0.5">
                          {hours.slice(0, 7).map((h: unknown, i: number) => (
                            <div key={i}>{String(h)}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null;
                })()}

              {/* Links */}
              {(provider.website || provider.googleMapsUri) && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {provider.website && (
                    <a
                      href={provider.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-2 text-sm text-slate-200 bg-surface-highlight rounded-lg hover:bg-surface-hover transition-colors"
                    >
                      <Globe className="w-4 h-4" /> Website
                    </a>
                  )}
                  {provider.googleMapsUri && (
                    <a
                      href={provider.googleMapsUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-2 text-sm text-slate-200 bg-surface-highlight rounded-lg hover:bg-surface-hover transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" /> Google Maps
                    </a>
                  )}
                </div>
              )}

              {/* Call Result Info */}
              {provider.callResult && (
                <div className="mt-4 p-4 bg-surface-highlight rounded-lg border border-surface-highlight">
                  <h4 className="font-medium text-slate-200 mb-3">
                    From Phone Call
                  </h4>
                  <div className="space-y-2.5 text-sm">
                    {provider.callResult.earliest_availability && (
                      <div className="flex items-start gap-2">
                        <Calendar className="w-4 h-4 text-primary-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="text-slate-400 text-xs mb-0.5">
                            Available
                          </div>
                          <div className="text-slate-200">
                            {provider.callResult.earliest_availability}
                          </div>
                        </div>
                      </div>
                    )}
                    {provider.callResult.estimated_rate && (
                      <div className="flex items-start gap-2">
                        <div className="w-4 h-4 flex items-center justify-center text-primary-400 mt-0.5 flex-shrink-0">
                          $
                        </div>
                        <div>
                          <div className="text-slate-400 text-xs mb-0.5">
                            Rate
                          </div>
                          <div className="text-slate-200">
                            {provider.callResult.estimated_rate}
                          </div>
                        </div>
                      </div>
                    )}
                    {typeof provider.callResult.all_criteria_met === "boolean" && (
                      <div
                        className={`flex items-center gap-2 ${provider.callResult.all_criteria_met === true ? "text-green-400" : "text-yellow-400"}`}
                      >
                        <span className="text-lg">
                          {provider.callResult.all_criteria_met === true ? "✓" : "⚠"}
                        </span>
                        <span>
                          {provider.callResult.all_criteria_met === true
                            ? "All criteria met"
                            : "Some criteria not met"}
                        </span>
                      </div>
                    )}
                    {provider.callResult.disqualified === true && (
                      <div className="flex items-center gap-2 text-red-400">
                        <span className="text-lg">✗</span>
                        <div>
                          <div className="font-medium">Disqualified</div>
                          {provider.callResult.disqualification_reason && (
                            <div className="text-sm text-red-300/80 mt-0.5">
                              {String(provider.callResult.disqualification_reason)}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {provider.callResult.notes && typeof provider.callResult.notes === "string" && (
                      <div className="pt-2 border-t border-surface-highlight/50">
                        <div className="text-slate-400 text-xs mb-1">Notes</div>
                        <div className="text-slate-300 text-sm">
                          {provider.callResult.notes}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "callLog" && (
            <div className="space-y-4">
              {provider.callSummary || provider.callTranscript ? (
                <>
                  {provider.callSummary && (
                    <div>
                      <h4 className="font-medium text-slate-200 mb-2">
                        Summary
                      </h4>
                      <p className="text-slate-300 text-sm leading-relaxed">
                        {provider.callSummary}
                      </p>
                    </div>
                  )}

                  {provider.callTranscript && (
                    <div>
                      <h4 className="font-medium text-slate-200 mb-2">
                        Transcript
                      </h4>
                      <div className="bg-abyss/50 rounded-lg p-3 border border-surface-highlight">
                        <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                          {provider.callTranscript}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* Call metadata */}
                  <div className="pt-3 border-t border-surface-highlight space-y-1.5 text-sm">
                    {provider.callStatus && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Status</span>
                        <span className="text-slate-200 capitalize">
                          {provider.callStatus}
                        </span>
                      </div>
                    )}
                    {provider.callDurationMinutes && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Duration</span>
                        <span className="text-slate-200">
                          {provider.callDurationMinutes} min
                        </span>
                      </div>
                    )}
                    {provider.calledAt && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Called</span>
                        <span className="text-slate-200">
                          {new Date(provider.calledAt).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center text-slate-400 py-8">
                  <Phone className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No call log available for this provider.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "actions" && (
            <div className="space-y-3">
              {onSelect && (
                <button
                  onClick={() => onSelect(provider)}
                  className="w-full py-3 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 hover:shadow-lg hover:shadow-primary-500/20 transition-all"
                >
                  Select This Provider
                </button>
              )}
              {provider.googleMapsUri && (
                <a
                  href={provider.googleMapsUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-surface-highlight text-slate-200 rounded-lg font-medium hover:bg-surface-hover transition-colors flex items-center justify-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" /> View on Google Maps
                </a>
              )}
              {provider.phone && (
                <button
                  onClick={copyPhone}
                  className="w-full py-3 bg-surface-highlight text-slate-200 rounded-lg font-medium hover:bg-surface-hover transition-colors flex items-center justify-center gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-green-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Phone Number</span>
                    </>
                  )}
                </button>
              )}
              {provider.website && (
                <a
                  href={provider.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-surface-highlight text-slate-200 rounded-lg font-medium hover:bg-surface-hover transition-colors flex items-center justify-center gap-2"
                >
                  <Globe className="w-4 h-4" /> Visit Website
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default ProviderDetailPanel;
