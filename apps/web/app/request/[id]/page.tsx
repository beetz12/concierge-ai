"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAppContext } from "@/lib/providers/AppProvider";
import StatusBadge from "@/components/StatusBadge";
import LiveStatus from "@/components/LiveStatus";
import RecommendedProviders from "@/components/RecommendedProviders";
import SelectionModal from "@/components/SelectionModal";
import ProviderCallSection from "@/components/ProviderCallSection";
import ProviderDetailPanel from "@/components/ProviderDetailPanel";
import { toast } from "sonner";
import {
  ArrowLeft,
  MapPin,
  User,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Terminal,
  Loader2,
  Calendar,
  Clock,
  Hash,
  Phone,
} from "lucide-react";
import {
  InteractionLog,
  ServiceRequest,
  RequestStatus,
  RequestType,
  Provider,
  safeRequestStatus,
} from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import { notifyUser, scheduleBooking } from "@/lib/services/bookingService";

const LogItem: React.FC<{ log: InteractionLog; index: number }> = ({ log }) => {
  const iconMap = {
    success: <CheckCircle className="w-5 h-5 text-emerald-400" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400" />,
    error: <XCircle className="w-5 h-5 text-red-400" />,
    info: <Terminal className="w-5 h-5 text-blue-400" />,
  };

  return (
    <div className="relative pl-8 pb-8 last:pb-0 animate-fadeIn">
      {/* Timeline connector */}
      <div className="absolute left-[11px] top-6 bottom-0 w-px bg-surface-highlight last:hidden" />

      <div className="absolute left-0 top-1 bg-surface p-1 rounded-full border border-surface-highlight shadow-sm z-10">
        {iconMap[log.status]}
      </div>

      <div className="bg-surface rounded-xl border border-surface-highlight shadow-sm p-5 hover:border-primary-500/30 transition-shadow">
        <div className="flex justify-between items-start mb-2">
          <h4 className="font-bold text-slate-200">{log.stepName || "Unknown Step"}</h4>
          <span className="text-xs text-slate-500 font-mono">
            {log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "Unknown time"}
          </span>
        </div>
        <p className="text-slate-400 mb-3">{log.detail || "No details available"}</p>

        {Array.isArray(log.transcript) && log.transcript.length > 0 && (
          <div className="bg-abyss/50 rounded-lg p-4 border border-surface-highlight space-y-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Transcript
            </p>
            {log.transcript.map((line, idx) => {
              const speaker = String(line?.speaker || "Unknown");
              const text = String(line?.text || "");
              return (
                <div
                  key={idx}
                  className={`flex gap-3 text-sm ${speaker === "AI" || speaker === "assistant" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                      speaker === "AI" || speaker === "assistant"
                        ? "bg-primary-600/20 text-primary-200 border border-primary-500/20 rounded-tr-none"
                        : "bg-surface-highlight border border-surface-highlight text-slate-300 rounded-tl-none shadow-sm"
                    }`}
                  >
                    <span className="block text-xs opacity-75 mb-1 font-bold">
                      {speaker}
                    </span>
                    {text}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default function RequestDetails() {
  const params = useParams();
  const id = params.id as string;
  const { requests, addRequest } = useAppContext();
  const localRequest = requests.find((r) => r.id === id);
  const [dbRequest, setDbRequest] = useState<ServiceRequest | null>(null);
  const [realtimeRequest, setRealtimeRequest] = useState<ServiceRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Component state for new features
  const [selectedProvider, setSelectedProvider] = useState<{
    providerId: string;
    providerName: string;
    phone: string;
    earliestAvailability: string;
  } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<{
    providers: Array<{
      providerId: string;
      providerName: string;
      phone: string;
      rating: number;
      reviewCount?: number;
      earliestAvailability: string;
      estimatedRate: string;
      score: number;
      reasoning: string;
      criteriaMatched?: string[];
    }>;
    overallRecommendation: string;
  } | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [recommendationsChecked, setRecommendationsChecked] = useState(false);

  // Refs for latest values (2025 best practice: avoid stale closures)
  const requestRef = useRef<ServiceRequest | null>(null);
  const recommendationsCheckedRef = useRef(false);
  const fetchSequenceRef = useRef(0);

  // Inline feedback states (replacing native alert())
  const [bookingMessage, setBookingMessage] = useState<{
    type: "success" | "error";
    title: string;
    details: string;
  } | null>(null);
  // State for provider detail panel (click on candidate card)
  const [detailPanelProvider, setDetailPanelProvider] = useState<Provider | null>(null);
  // Track if user notification was sent
  const [notificationSent, setNotificationSent] = useState(false);

  // Use realtime data if available, otherwise DB request (authoritative), otherwise local request
  // IMPORTANT: dbRequest has authoritative status from database, localRequest may have stale status from localStorage
  const request = realtimeRequest || dbRequest || localRequest || null;

  // Keep refs synced with latest values (2025 best practice)
  useEffect(() => {
    requestRef.current = request;
  }, [request]);

  useEffect(() => {
    recommendationsCheckedRef.current = recommendationsChecked;
  }, [recommendationsChecked]);

  // Sync notificationSent state with database to prevent duplicate notifications on page refresh
  useEffect(() => {
    if (dbRequest?.notificationSentAt && !notificationSent) {
      console.log("[Notification] Syncing notificationSent from database:", dbRequest.notificationSentAt);
      setNotificationSent(true);
    }
  }, [dbRequest?.notificationSentAt, notificationSent]);

  // Helper to check if string is valid UUID format
  const isValidUuid = (str: string) => {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  // Calculate real-time call progress from provider data
  const callProgress = React.useMemo(() => {
    if (!request || !request.providersFound || request.providersFound.length === 0) return null;

    const providers = request.providersFound;
    const finalStatuses = ["completed", "failed", "no_answer", "voicemail", "error", "busy"];

    const queued = providers.filter((p) => p.callStatus === "queued").length;
    const inProgress = providers.filter((p) => p.callStatus === "in_progress").length;
    const completed = providers.filter((p) =>
      p.callStatus && finalStatuses.includes(p.callStatus)
    ).length;
    const total = providers.filter((p) => p.callStatus).length; // Only count providers with a call status

    if (total === 0) return null;

    const currentProvider = providers.find((p) => p.callStatus === "in_progress");

    return {
      total,
      queued,
      inProgress,
      completed,
      currentProviderName: currentProvider?.name || null,
      percent: Math.round((completed / total) * 100),
    };
  }, [request]);

  // Fetch and display recommendations that were generated by the backend
  // The backend automatically generates recommendations when all calls complete
  // Frontend ONLY displays recommendations - does NOT call the recommend API
  // 2025 best practices: sequence token, refs for latest values, idempotent
  const checkAndGenerateRecommendations = useCallback(async (retryCount = 0) => {
    const MAX_RETRIES = 8; // 8 retries * 2 seconds = 16 seconds max wait
    const currentSequence = ++fetchSequenceRef.current;

    // Use refs for latest values (avoid stale closures)
    const currentRequest = requestRef.current;
    const alreadyChecked = recommendationsCheckedRef.current;

    // Idempotent guard - if we already have recommendations, skip
    // But allow retry if checked but no recommendations yet
    if (!id || !isValidUuid(id)) {
      return;
    }

    // If already checked AND we have recommendations, skip
    if (alreadyChecked && recommendations) {
      console.log("[Recommendations] Already have recommendations, skipping");
      return;
    }

    try {
      const supabase = createClient();

      // Fetch all providers for this request with their call results
      const { data: providers, error } = await supabase
        .from("providers")
        .select("*")
        .eq("request_id", id);

      // Stale check - abort if newer request started
      if (fetchSequenceRef.current !== currentSequence) {
        console.log("[Recommendations] Stale fetch, ignoring results");
        return;
      }

      if (error) {
        console.error("Error fetching providers:", error);
        return;
      }

      if (!providers || providers.length === 0) {
        console.log("No providers found for request");
        return;
      }

      // Check if all INITIATED calls have completed (reached a final status)
      const finalStatuses = ["completed", "failed", "error", "timeout", "no_answer", "voicemail", "busy"];
      const calledProviders = providers.filter((p) => p.call_status);
      const completedProviders = providers.filter((p) =>
        p.call_status && finalStatuses.includes(p.call_status)
      );

      const allInitiatedCallsComplete = calledProviders.length > 0 &&
        completedProviders.length === calledProviders.length;

      console.log(
        `[Recommendations] Call progress: ${completedProviders.length}/${calledProviders.length} calls completed [retry ${retryCount}/${MAX_RETRIES}]`
      );

      if (!allInitiatedCallsComplete) {
        if (retryCount < MAX_RETRIES && calledProviders.length > 0) {
          console.log(`[Recommendations] Calls still in progress, retrying in 2s...`);
          setTimeout(() => {
            checkAndGenerateRecommendations(retryCount + 1);
          }, 2000);
        }
        return;
      }

      // Re-read request status from ref (may have changed during async operations)
      const latestRequest = requestRef.current;
      const latestStatus = latestRequest?.status;

      console.log(`[Recommendations] All calls complete. Current status: ${latestStatus}`);

      // 2025 BEST PRACTICE: Generate recommendations immediately when all calls complete
      // Don't wait for backend RECOMMENDED status - frontend generates UI from provider data
      // This fixes the bug where backend never sets RECOMMENDED when all providers are disqualified
      console.log("[Recommendations] Generating recommendations from completed calls");

        // Stale check before state updates
        if (fetchSequenceRef.current !== currentSequence) return;

        setRecommendationsLoading(true);

        // 2025 BEST PRACTICE: Professional concierge-quality recommendations
        // - Multi-objective scoring with weighted components
        // - Hard filter: exclude no_answer/voicemail/disqualified
        // - Personalized explanations with specific evidence

        // Helper: Build personalized reasoning from actual call data
        const buildReasoning = (provider: typeof completedProviders[0], data: any): string => {
          const parts: string[] = [];

          // 1. Lead with criteria match (most important to user)
          if (data.all_criteria_met) {
            parts.push("✓ Meets all your requirements");
          } else if (data.call_outcome === "positive") {
            parts.push("Positive conversation");
          }

          // 2. Availability specifics (actionable info)
          if (data.earliest_availability && data.earliest_availability !== "unknown") {
            parts.push(`Available: ${data.earliest_availability}`);
          } else if (data.availability === "available") {
            parts.push("Available now");
          }

          // 3. Trust signals: Rating + reviews (2025 UX: prominent trust signals)
          if (provider.rating && provider.rating >= 3.5) {
            const reviewText = provider.review_count ? ` (${provider.review_count} reviews)` : "";
            parts.push(`${provider.rating}★${reviewText}`);
          }

          // 4. Pricing transparency
          if (data.estimated_rate &&
              data.estimated_rate !== "unknown" &&
              data.estimated_rate !== "Quote upon request" &&
              data.estimated_rate !== "") {
            parts.push(`Quoted: ${data.estimated_rate}`);
          }

          // 5. AI-generated insight from actual conversation (call_summary)
          const summary = provider.call_summary as string | undefined;
          if (summary && summary.length > 10) {
            // Skip summaries that are about the USER's request (not provider info)
            const isUserFocused = summary.toLowerCase().includes("information gathered for") ||
                                   summary.toLowerCase().includes("looking for") ||
                                   summary.toLowerCase().includes("here's the summary");

            if (!isUserFocused) {
              // Extract first meaningful sentence for key insight
              const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 10);
              if (sentences[0]) {
                const insight = sentences[0].trim();
                // Avoid duplicating info already shown
                if (!insight.toLowerCase().includes("available") &&
                    !insight.toLowerCase().includes("rating")) {
                  parts.push(insight);
                }
              }
            }
          }

          return parts.length > 0 ? parts.join(" • ") : "Provider contacted successfully";
        };

        // Helper: Calculate professional multi-objective score (0-100)
        const calculateScore = (provider: typeof completedProviders[0], data: any): number => {
          let score = 0;

          // === CONVERSATION QUALITY (35 points max) ===
          // Did they actually answer and engage positively?
          if (data.call_outcome === "positive") {
            score += 20;
          } else if (data.call_outcome === "neutral") {
            score += 10;
          }
          // Gave specific availability info?
          if (data.earliest_availability && data.earliest_availability !== "unknown") {
            score += 8;
          }
          // Provided pricing info?
          if (data.estimated_rate &&
              data.estimated_rate !== "unknown" &&
              data.estimated_rate !== "Quote upon request") {
            score += 7;
          }

          // === SERVICE FIT (30 points max) ===
          // Meets ALL user requirements?
          if (data.all_criteria_met) {
            score += 20;
          }
          // Availability status
          if (data.availability === "available") {
            score += 7;
          } else if (data.availability === "callback_requested") {
            score += 3;
          }
          // Found dedicated person with all skills?
          if (data.single_person_found) {
            score += 3;
          }

          // === PROVIDER REPUTATION (25 points max) ===
          // Google rating (0-20 points based on 5-star scale)
          const rating = provider.rating || 0;
          if (rating >= 4.5) {
            score += 20;
          } else if (rating >= 4.0) {
            score += 16;
          } else if (rating >= 3.5) {
            score += 12;
          } else if (rating >= 3.0) {
            score += 8;
          } else if (rating > 0) {
            score += 4;
          }
          // Review volume (0-5 points) - more reviews = more trust
          const reviews = provider.review_count || 0;
          if (reviews >= 100) {
            score += 5;
          } else if (reviews >= 50) {
            score += 4;
          } else if (reviews >= 20) {
            score += 3;
          } else if (reviews >= 10) {
            score += 2;
          } else if (reviews > 0) {
            score += 1;
          }

          // === TRUST SIGNALS (10 points max) ===
          // AI recommended this provider?
          if (data.recommended) {
            score += 10;
          }

          return Math.min(Math.round(score), 100);
        };

        // DEBUG: Log what data we're actually receiving
        console.log("[DEBUG] Completed providers data:", completedProviders.map(p => ({
          name: p.name,
          call_status: p.call_status,
          call_result: p.call_result,
          call_summary: p.call_summary,
          rating: p.rating,
          review_count: p.review_count,
        })));

        const qualifiedProviders = completedProviders
          .filter((p) => {
            // FIX: call_result IS structuredData directly (not nested under analysis)
            const data = (p.call_result || {}) as any;

            // HARD FILTERS (2025 best practice: only recommend reachable, qualified providers)
            // 1. Must have completed call with result data
            if (p.call_status !== "completed" || !p.call_result) {
              return false;
            }
            // 2. Must have actually answered (not voicemail/no_answer)
            const callOutcome = data.call_outcome || "";
            if (callOutcome === "no_answer" || callOutcome === "voicemail" || callOutcome === "busy") {
              console.log(`[Filter] Excluding ${p.name}: ${callOutcome}`);
              return false;
            }
            // 3. Must not be explicitly disqualified
            if (data.disqualified) {
              console.log(`[Filter] Excluding ${p.name}: disqualified - ${data.disqualification_reason}`);
              return false;
            }

            return true;
          })
          .map((p) => {
            // FIX: call_result IS structuredData directly
            const structuredData = (p.call_result || {}) as any;
            const score = calculateScore(p, structuredData);

            return {
              providerId: p.id,
              providerName: p.name,
              phone: p.phone || "",
              rating: p.rating ?? 0,
              reviewCount: p.review_count ?? undefined,
              earliestAvailability: structuredData.earliest_availability || "Contact for availability",
              estimatedRate: structuredData.estimated_rate || "Quote upon request",
              score,
              reasoning: buildReasoning(p, structuredData),
              criteriaMatched: structuredData.all_criteria_met
                ? ["All criteria met"]
                : structuredData.call_outcome === "positive"
                  ? ["Positive response"]
                  : [],
              // Include flags for UI to display status
              isDisqualified: false, // Already filtered out
              disqualificationReason: undefined,
            };
          })
          .sort((a, b) => {
            // Sort by score descending (highest quality first)
            return b.score - a.score;
          })
          .slice(0, 3); // Top 3 providers (2025 UX: avoid decision paralysis)

        // Stale check before final state updates
        if (fetchSequenceRef.current !== currentSequence) return;

        // ALWAYS set recommendations - even if empty (2025 best practice)
        if (qualifiedProviders.length > 0) {
          // Build professional concierge-style overall recommendation
          const topProvider = qualifiedProviders[0]!; // Safe: length > 0
          const topScore = topProvider.score || 0;
          const topName = topProvider.providerName;
          let overallMessage = "";

          if (qualifiedProviders.length === 1) {
            overallMessage = `Based on our research and phone calls, we recommend **${topName}** (Score: ${topScore}/100). They were the only provider who answered and could meet your needs.`;
          } else {
            const scoreDiff = topScore - (qualifiedProviders[1]?.score || 0);
            if (scoreDiff >= 15) {
              overallMessage = `Based on our research and phone calls, we strongly recommend **${topName}** (Score: ${topScore}/100). They significantly outperformed other options in availability, service fit, and reputation.`;
            } else {
              overallMessage = `Based on our research and phone calls, we recommend **${topName}** (Score: ${topScore}/100) as your top choice. We've included ${qualifiedProviders.length - 1} alternative${qualifiedProviders.length > 2 ? "s" : ""} for comparison.`;
            }
          }

          setRecommendations({
            providers: qualifiedProviders,
            overallRecommendation: overallMessage,
          });
          console.log("[Recommendations] Displayed:", qualifiedProviders.length, "providers with scores:", qualifiedProviders.map(p => `${p.providerName}:${p.score}`).join(", "));
        } else {
          // Set empty recommendations with helpful explanation
          const noAnswerCount = completedProviders.filter(p => {
            const data = (p.call_result || {}) as any;
            return data.call_outcome === "no_answer" || data.call_outcome === "voicemail";
          }).length;

          let emptyMessage = "Unfortunately, we couldn't find a qualified provider. ";
          if (noAnswerCount > 0) {
            emptyMessage += `${noAnswerCount} provider${noAnswerCount > 1 ? "s" : ""} didn't answer our calls. `;
          }
          emptyMessage += "Please review the call logs below for details, or try expanding your search criteria.";

          setRecommendations({
            providers: [],
            overallRecommendation: emptyMessage,
          });
          console.log("[Recommendations] No qualified providers, showing empty state");
        }

        // Mark as checked AFTER setting recommendations
        setRecommendationsChecked(true);
        recommendationsCheckedRef.current = true;

        // Send notification to user if applicable
        if (latestRequest?.userPhone && qualifiedProviders.length > 0 && !notificationSent) {
          console.log("[Recommendations] Sending user notification");
          const notifyResult = await notifyUser({
            userPhone: latestRequest.userPhone,
            userName: latestRequest.directContactInfo?.name,
            serviceRequestId: id,
            preferredContact: latestRequest.preferredContact || "text",
            serviceNeeded: latestRequest.title,
            location: latestRequest.location,
            requestUrl: `${window.location.origin}/request/${id}`,
            providers: qualifiedProviders.slice(0, 3).map((p) => ({
              name: p.providerName,
              earliestAvailability: p.earliestAvailability || "Contact for availability",
            })),
          });

          if (notifyResult.success) {
            setNotificationSent(true);
          }
        }

        setRecommendationsLoading(false);
      // Removed else clause: no longer wait for RECOMMENDED status
      // Recommendations are generated immediately when all calls complete
    } catch (error) {
      console.error("[Recommendations] Error:", error);
      if (fetchSequenceRef.current === currentSequence) {
        setRecommendationsLoading(false);
      }
    }
  }, [id, recommendations, notificationSent]);

  // Fetch from database if not in localStorage
  useEffect(() => {
    if (!localRequest && !dbRequest && !loading) {
      // Only query Supabase if ID is a valid UUID
      // Direct Task IDs (task-xxx) are localStorage-only and not in the database
      if (!isValidUuid(id)) {
        setError("Request not found (session-only request may have expired)");
        return;
      }

      setLoading(true);
      const supabase = createClient();

      // Fetch service request with providers and interaction logs
      Promise.all([
        supabase
          .from("service_requests")
          .select("*")
          .eq("id", id)
          .single(),
        supabase
          .from("providers")
          .select("*")
          .eq("request_id", id),
        supabase
          .from("interaction_logs")
          .select("*")
          .eq("request_id", id)
          .order("timestamp", { ascending: true }),
      ]).then(([requestResult, providersResult, logsResult]) => {
        if (requestResult.error) {
          setError("Request not found");
          setLoading(false);
          return;
        }

        const data = requestResult.data;
        const providers = providersResult.data || [];
        const logs = logsResult.data || [];

        // Convert DB format to frontend format
        const converted: ServiceRequest = {
          id: data.id,
          type: data.type as RequestType,
          title: data.title,
          description: data.description,
          criteria: data.criteria,
          location: data.location || undefined,
          status: safeRequestStatus(data.status),
          createdAt: data.created_at,
          providersFound: providers.map((p) => ({
            id: p.id,
            name: p.name,
            phone: p.phone || "",
            rating: p.rating || 0,
            address: p.address || "",
            source: p.source || "User Input",
            // Call tracking (convert null to undefined, validate JSONB types)
            callStatus: p.call_status || undefined,
            callResult: (p.call_result && typeof p.call_result === "object" && !Array.isArray(p.call_result))
              ? (p.call_result as Provider['callResult'])
              : undefined,
            callTranscript: p.call_transcript || undefined,
            callSummary: p.call_summary || undefined,
            callDurationMinutes: p.call_duration_minutes || undefined,
            calledAt: p.called_at || undefined,
            // Research data (convert null to undefined, handle JSONB variations)
            reviewCount: p.review_count || undefined,
            distance: p.distance || undefined,
            distanceText: p.distance_text || undefined,
            hoursOfOperation: Array.isArray(p.hours_of_operation)
              ? p.hours_of_operation as string[]
              : Array.isArray((p.hours_of_operation as any)?.weekdayText)
                ? (p.hours_of_operation as any).weekdayText
                : undefined,
            isOpenNow: p.is_open_now || undefined,
            googleMapsUri: p.google_maps_uri || undefined,
            website: p.website || undefined,
            placeId: p.place_id || undefined,
            // Booking confirmation
            booking_confirmed: p.booking_confirmed || undefined,
            booking_date: p.booking_date || undefined,
            booking_time: p.booking_time || undefined,
            confirmation_number: p.confirmation_number || undefined,
          })),
          interactions: logs.map((log) => ({
            id: log.id,
            timestamp: log.timestamp,
            stepName: log.step_name,
            detail: log.detail,
            status: log.status as "success" | "warning" | "error" | "info",
            transcript: Array.isArray(log.transcript)
              ? (log.transcript as { speaker: string; text: string }[])
              : undefined,
            providerName: (log as any).provider_name || undefined,
            providerId: (log as any).provider_id || undefined,
          })),
          finalOutcome: data.final_outcome || undefined,
          directContactInfo: (data.direct_contact_info &&
            typeof data.direct_contact_info === "object" &&
            !Array.isArray(data.direct_contact_info) &&
            "name" in data.direct_contact_info &&
            "phone" in data.direct_contact_info)
            ? {
                name: String((data.direct_contact_info as any).name || ""),
                phone: String((data.direct_contact_info as any).phone || ""),
              }
            : undefined,
          userPhone: (data as any).user_phone || undefined,
          preferredContact: (data as any).preferred_contact as "phone" | "text" | undefined,
          notificationSentAt: (data as any).notification_sent_at || undefined,
        };
        setDbRequest(converted);
        // Also add to context so it persists during this session
        addRequest(converted);
        setLoading(false);
      });
    }
  }, [id, localRequest, dbRequest, loading, addRequest]);

  // Real-time subscription for live updates
  useEffect(() => {
    if (!id || !isValidUuid(id)) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`request-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_requests",
          filter: `id=eq.${id}`,
        },
        (payload) => {
          console.log("Real-time update:", payload);
          if (payload.eventType === "UPDATE" && payload.new) {
            const newStatus = payload.new.status as string;
            const prevStatus = requestRef.current?.status;

            console.log(`[Subscription] Status change: ${prevStatus} → ${newStatus}`);

            // 2025 best practice: Reset recommendations flag when status changes to RECOMMENDED
            // This allows re-fetching recommendations after backend generates them
            if (
              (newStatus === "RECOMMENDED" || newStatus === "COMPLETED") &&
              prevStatus !== newStatus &&
              !recommendations
            ) {
              console.log("[Subscription] Status changed to RECOMMENDED - resetting flag and fetching recommendations");
              setRecommendationsChecked(false);
              recommendationsCheckedRef.current = false;
              // Trigger recommendations fetch after state update
              setTimeout(() => checkAndGenerateRecommendations(), 100);
            }

            // Convert DB format to frontend format
            // IMPORTANT: Preserve existing providersFound and interactions
            // These are managed by their own real-time subscriptions
            setRealtimeRequest((prev) => {
              const existingProviders = prev?.providersFound || localRequest?.providersFound || dbRequest?.providersFound || [];
              const existingInteractions = prev?.interactions || localRequest?.interactions || dbRequest?.interactions || [];

              const converted: ServiceRequest = {
                id: payload.new.id,
                type: payload.new.type as RequestType,
                title: payload.new.title,
                description: payload.new.description,
                criteria: payload.new.criteria,
                location: payload.new.location || undefined,
                status: safeRequestStatus(payload.new.status),
                createdAt: payload.new.created_at,
                providersFound: existingProviders,
                interactions: existingInteractions,
                finalOutcome: payload.new.final_outcome || undefined,
                userPhone: payload.new.user_phone || undefined,
                preferredContact: payload.new.preferred_contact as "phone" | "text" | undefined,
                notificationSentAt: payload.new.notification_sent_at || undefined,
              };

              // Sync notificationSent if backend sent notification
              if (payload.new.notification_sent_at && !notificationSent) {
                console.log("[Realtime] Notification sent detected:", payload.new.notification_sent_at);
                setNotificationSent(true);
              }

              // Also update context for consistency
              addRequest(converted);

              return converted;
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "providers",
          filter: `request_id=eq.${id}`,
        },
        async (payload) => {
          console.log("Provider change received:", payload);

          // Cast payload.new to a record type for type safety
          const newData = payload.new as Record<string, unknown> | null;

          // Handle INSERT events (new providers added)
          if (payload.eventType === "INSERT" && newData) {
            console.log("Provider INSERT detected - refetching all providers");
            const supabase2 = createClient();
            const { data: providers } = await supabase2
              .from("providers")
              .select("*")
              .eq("request_id", id)
              .order("created_at", { ascending: false });

            if (providers && providers.length > 0) {
              setRealtimeRequest((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  providersFound: providers.map((p) => ({
                    id: p.id,
                    name: p.name,
                    phone: p.phone || "",
                    rating: p.rating || 0,
                    address: p.address || "",
                    source: p.source || "User Input",
                    // Call tracking (convert null to undefined, validate JSONB types)
                    callStatus: p.call_status || undefined,
                    callResult: (p.call_result && typeof p.call_result === "object" && !Array.isArray(p.call_result))
                      ? (p.call_result as Provider['callResult'])
                      : undefined,
                    callTranscript: p.call_transcript || undefined,
                    callSummary: p.call_summary || undefined,
                    callDurationMinutes: p.call_duration_minutes || undefined,
                    calledAt: p.called_at || undefined,
                    // Research data (convert null to undefined, handle JSONB variations)
                    reviewCount: p.review_count || undefined,
                    distance: p.distance || undefined,
                    distanceText: p.distance_text || undefined,
                    hoursOfOperation: Array.isArray(p.hours_of_operation)
                      ? p.hours_of_operation as string[]
                      : Array.isArray((p.hours_of_operation as any)?.weekdayText)
                        ? (p.hours_of_operation as any).weekdayText
                        : undefined,
                    isOpenNow: p.is_open_now || undefined,
                    googleMapsUri: p.google_maps_uri || undefined,
                    website: p.website || undefined,
                    placeId: p.place_id || undefined,
                    // Booking confirmation
                    booking_confirmed: p.booking_confirmed || undefined,
                    booking_date: p.booking_date || undefined,
                    booking_time: p.booking_time || undefined,
                    confirmation_number: p.confirmation_number || undefined,
                  })),
                };
              });
            }
            // After INSERT, check if we should generate recommendations
            checkAndGenerateRecommendations();
            return;
          }

          // Handle UPDATE events (call results saved)
          // This ensures call logs, summary, transcript are available in UI
          if (payload.eventType === "UPDATE" && newData) {
            // Check if booking was just confirmed - show toast notification
            if (newData.booking_confirmed === true) {
              toast.success("Appointment Confirmed!", {
                id: "booking-confirmed-toast",
                description: `${newData.name} - ${newData.booking_date || "Date TBD"} at ${newData.booking_time || "Time TBD"}`,
                duration: 10000,
              });
            }
          }
          if (payload.eventType === "UPDATE" && newData && newData.call_status) {
            // ALWAYS do full refetch for provider updates to avoid race conditions
            // When multiple providers complete rapidly, optimized updates can cause
            // state inconsistencies where only one provider's update is visible
            {
              const supabase2 = createClient();
              const { data: providers } = await supabase2
                .from("providers")
                .select("*")
                .eq("request_id", id)
                .order("created_at", { ascending: false });

              if (providers && providers.length > 0) {
                setRealtimeRequest((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    providersFound: providers.map((p) => ({
                      id: p.id,
                      name: p.name,
                      phone: p.phone || "",
                      rating: p.rating || 0,
                      address: p.address || "",
                      source: p.source || "User Input",
                      // Call tracking fields - essential for call logs tab
                      callStatus: p.call_status || undefined,
                      callResult: (p.call_result && typeof p.call_result === "object" && !Array.isArray(p.call_result))
                        ? (p.call_result as Provider['callResult'])
                        : undefined,
                      callTranscript: p.call_transcript || undefined,
                      callSummary: p.call_summary || undefined,
                      callDurationMinutes: p.call_duration_minutes || undefined,
                      calledAt: p.called_at || undefined,
                      // Research data
                      reviewCount: p.review_count || undefined,
                      distance: p.distance || undefined,
                      distanceText: p.distance_text || undefined,
                      hoursOfOperation: Array.isArray(p.hours_of_operation)
                        ? p.hours_of_operation as string[]
                        : Array.isArray((p.hours_of_operation as any)?.weekdayText)
                          ? (p.hours_of_operation as any).weekdayText
                          : undefined,
                      isOpenNow: p.is_open_now || undefined,
                      googleMapsUri: p.google_maps_uri || undefined,
                      website: p.website || undefined,
                      placeId: p.place_id || undefined,
                      // Booking confirmation
                      booking_confirmed: p.booking_confirmed || undefined,
                      booking_date: p.booking_date || undefined,
                      booking_time: p.booking_time || undefined,
                      confirmation_number: p.confirmation_number || undefined,
                    })),
                  };
                });
              }
            }

            // Also trigger recommendations check
            checkAndGenerateRecommendations();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "interaction_logs",
          filter: `request_id=eq.${id}`,
        },
        (payload) => {
          console.log("Interaction log added:", payload);
          // Refetch all data when new interaction log is added
          if (payload.new) {
            const supabase2 = createClient();
            Promise.all([
              supabase2
                .from("service_requests")
                .select("*")
                .eq("id", id)
                .single(),
              supabase2
                .from("providers")
                .select("*")
                .eq("request_id", id),
              supabase2
                .from("interaction_logs")
                .select("*")
                .eq("request_id", id)
                .order("timestamp", { ascending: true }),
            ]).then(([requestResult, providersResult, logsResult]) => {
              if (requestResult.data) {
                const data = requestResult.data;
                const providers = providersResult.data || [];
                const logs = logsResult.data || [];

                // Combine DB logs with any existing local logs (from real-time updates)
                // and deduplicate by log ID
                const existingLogs = realtimeRequest?.interactions || localRequest?.interactions || [];
                const allLogs = [...existingLogs, ...logs.map((log) => ({
                  id: log.id,
                  timestamp: log.timestamp,
                  stepName: log.step_name,
                  detail: log.detail,
                  status: log.status as "success" | "warning" | "error" | "info",
                  transcript: log.transcript as { speaker: string; text: string }[] | undefined,
                  providerName: (log as any).provider_name || undefined,
                  providerId: (log as any).provider_id || undefined,
                }))];

                // Deduplicate by ID, preferring newer entries (later in the array)
                const deduplicatedLogs = Array.from(
                  new Map(allLogs.map(log => [log.id || `${log.timestamp}-${log.stepName}`, log])).values()
                );

                const converted: ServiceRequest = {
                  id: data.id,
                  type: data.type as RequestType,
                  title: data.title,
                  description: data.description,
                  criteria: data.criteria,
                  location: data.location || undefined,
                  status: data.status as RequestStatus,
                  createdAt: data.created_at,
                  providersFound: providers.map((p) => ({
                    id: p.id,
                    name: p.name,
                    phone: p.phone || "",
                    rating: p.rating || 0,
                    address: p.address || "",
                    source: p.source || "User Input",
                    // Call tracking (convert null to undefined, validate JSONB types)
                    callStatus: p.call_status || undefined,
                    callResult: (p.call_result && typeof p.call_result === "object" && !Array.isArray(p.call_result))
                      ? (p.call_result as Provider['callResult'])
                      : undefined,
                    callTranscript: p.call_transcript || undefined,
                    callSummary: p.call_summary || undefined,
                    callDurationMinutes: p.call_duration_minutes || undefined,
                    calledAt: p.called_at || undefined,
                    // Research data (convert null to undefined, handle JSONB variations)
                    reviewCount: p.review_count || undefined,
                    distance: p.distance || undefined,
                    distanceText: p.distance_text || undefined,
                    hoursOfOperation: Array.isArray(p.hours_of_operation)
                      ? p.hours_of_operation as string[]
                      : Array.isArray((p.hours_of_operation as any)?.weekdayText)
                        ? (p.hours_of_operation as any).weekdayText
                        : undefined,
                    isOpenNow: p.is_open_now || undefined,
                    googleMapsUri: p.google_maps_uri || undefined,
                    website: p.website || undefined,
                    placeId: p.place_id || undefined,
                    // Booking confirmation
                    booking_confirmed: p.booking_confirmed || undefined,
                    booking_date: p.booking_date || undefined,
                    booking_time: p.booking_time || undefined,
                    confirmation_number: p.confirmation_number || undefined,
                  })),
                  interactions: deduplicatedLogs,
                  finalOutcome: data.final_outcome || undefined,
                  directContactInfo: (data.direct_contact_info &&
                    typeof data.direct_contact_info === "object" &&
                    !Array.isArray(data.direct_contact_info) &&
                    "name" in data.direct_contact_info &&
                    "phone" in data.direct_contact_info)
                    ? {
                        name: String((data.direct_contact_info as any).name || ""),
                        phone: String((data.direct_contact_info as any).phone || ""),
                      }
                    : undefined,
                };
                setRealtimeRequest(converted);
                addRequest(converted);
              }
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, addRequest, checkAndGenerateRecommendations, recommendations]);

  useEffect(() => {
    // Auto scroll to bottom when new logs arrive
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [request?.interactions.length]);

  // Check for recommendations when status changes to ANALYZING, RECOMMENDED, or COMPLETED
  // 2025 best practice: Also retry if checked but no recommendations yet
  useEffect(() => {
    if (
      request &&
      (request.status === RequestStatus.ANALYZING ||
        request.status === RequestStatus.RECOMMENDED ||
        request.status === RequestStatus.COMPLETED) &&
      !recommendationsLoading
    ) {
      // Allow retry if: not checked yet, OR checked but no recommendations
      const shouldCheck = !recommendationsChecked || (!recommendations && recommendationsChecked);
      if (shouldCheck) {
        console.log(
          `[useEffect] Status is ${request.status}, checking for recommendations...`
        );
        checkAndGenerateRecommendations();
      }
    }
  }, [request?.status, recommendationsChecked, recommendationsLoading, recommendations, checkAndGenerateRecommendations]);

  // Fallback: Poll for recommendations if subscription doesn't fire
  // This handles race conditions where JSONB updates don't trigger real-time subscriptions
  // 2025 best practice: Also retry if checked but no recommendations yet
  useEffect(() => {
    const shouldPoll = (
      (request?.status === RequestStatus.ANALYZING ||
        request?.status === RequestStatus.RECOMMENDED) &&
      !recommendationsLoading &&
      (!recommendationsChecked || !recommendations)
    );

    if (shouldPoll) {
      const pollTimer = setTimeout(() => {
        console.log("[Fallback] Polling for recommendations after 5s");
        checkAndGenerateRecommendations();
      }, 5000);
      return () => clearTimeout(pollTimer);
    }
  }, [request?.status, recommendationsChecked, recommendationsLoading, recommendations, checkAndGenerateRecommendations]);

  // Handler for provider selection
  const handleProviderSelect = (provider: {
    providerId: string;
    providerName: string;
    phone: string;
    rating: number;
    reviewCount?: number;
    earliestAvailability: string;
    estimatedRate: string;
    score: number;
    reasoning: string;
    criteriaMatched?: string[];
  }) => {
    setSelectedProvider({
      providerId: provider.providerId,
      providerName: provider.providerName,
      phone: provider.phone,
      earliestAvailability: provider.earliestAvailability,
    });
    setShowModal(true);
  };

  // Handler for confirming booking
  const handleConfirmBooking = async () => {
    if (!selectedProvider || !request) return;

    // Close modal immediately - don't wait for result
    setShowModal(false);

    // Show toast notification
    toast.loading("Scheduling your appointment...", {
      id: "booking-toast",
      description: `Calling ${selectedProvider.providerName}`,
    });

    try {
      // Fire-and-forget: Use new async endpoint
      const response = await fetch("/api/v1/bookings/schedule-async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceRequestId: id,
          providerId: selectedProvider.providerId,
          providerPhone: selectedProvider.phone,
          providerName: selectedProvider.providerName,
          serviceDescription: request.title,
          preferredDate: selectedProvider.earliestAvailability,
          customerName: request.directContactInfo?.name,
          customerPhone: request.userPhone,
          location: request.location,
        }),
      });

      const result = await response.json();

      if (response.status === 202 && result.success) {
        toast.success("Booking call started!", {
          id: "booking-toast",
          description: "You'll receive a notification when your appointment is confirmed.",
        });
      } else {
        throw new Error(result.error || "Failed to initiate booking");
      }
    } catch (error) {
      console.error("Error initiating booking:", error);
      toast.error("Failed to start booking call", {
        id: "booking-toast",
        description: error instanceof Error ? error.message : "Please try again",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading request...
      </div>
    );
  }

  if (error || !request) {
    return (
      <div className="text-center p-10 text-slate-400">
        {error || "Request not found"}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-10">
      <Link
        href="/"
        className="inline-flex items-center text-slate-500 hover:text-slate-300 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
      </Link>

      {/* Header Card */}
      <div className="bg-surface rounded-2xl border border-surface-highlight shadow-xl p-6 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <h1 className="text-2xl font-bold text-slate-100">{request.title || request.description || "Service Request"}</h1>
          <StatusBadge status={request.status} callProgress={callProgress} />
        </div>

        {/* LiveStatus Component */}
        <LiveStatus
          status={request.status}
          callProgress={callProgress}
          providersFound={request.providersFound?.length || 0}
          interactions={request.interactions || []}
          providers={request.providersFound}
          hasRecommendations={!!recommendations}
        />

        <p className="text-slate-400 mb-6">{request.description || "No description"}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          {request.location && (
            <div className="flex items-center gap-2 text-slate-400">
              <MapPin className="w-4 h-4 text-slate-500" />
              {request.location}
            </div>
          )}
          <div className="flex items-center gap-2 text-slate-400">
            <span className="font-semibold text-slate-300">Criteria:</span>{" "}
            {request.criteria || "None specified"}
          </div>
        </div>

        {request.selectedProvider && (
          <div className="mt-6 p-4 bg-primary-500/10 border border-primary-500/20 rounded-xl flex items-start gap-4">
            <div className="bg-primary-500/20 rounded-full p-2 text-primary-400">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-primary-300">
                Provider Selected & Booked
              </h3>
              <p className="text-primary-400/80 text-sm mt-1">
                {request.selectedProvider.name || "Provider"} has been secured.
                {request.selectedProvider.address &&
                  ` Located at ${request.selectedProvider.address}.`}
              </p>
            </div>
          </div>
        )}

        {/* Show booking confirmation details when available */}
        {(() => {
          const providers = request.providersFound || [];
          const bookedProvider = request.selectedProvider?.booking_confirmed
            ? request.selectedProvider
            : providers.find(p => p.booking_confirmed);

          if (!bookedProvider) return null;

          return (
            <div className="mt-6 bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
              <h3 className="text-emerald-400 font-bold flex items-center gap-2 mb-3">
                <CheckCircle className="w-5 h-5" />
                Appointment Confirmed!
              </h3>
              <div className="space-y-2 text-sm">
                {bookedProvider.booking_date && (
                  <p className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-300">Date:</span>
                    <span className="text-white font-medium">{bookedProvider.booking_date}</span>
                  </p>
                )}
                {bookedProvider.booking_time && (
                  <p className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-300">Time:</span>
                    <span className="text-white font-medium">{bookedProvider.booking_time}</span>
                  </p>
                )}
                {bookedProvider.confirmation_number && (
                  <p className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-300">Confirmation #:</span>
                    <span className="text-white font-medium font-mono">{bookedProvider.confirmation_number}</span>
                  </p>
                )}
              </div>
            </div>
          );
        })()}

        {/* Inline Booking Feedback (replaces native alert()) */}
        {bookingMessage && (
          <div
            className={`mt-6 p-4 rounded-xl flex items-start gap-4 ${
              bookingMessage.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/20"
                : "bg-red-500/10 border border-red-500/20"
            }`}
          >
            <div
              className={`rounded-full p-2 ${
                bookingMessage.type === "success"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {bookingMessage.type === "success" ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div className="flex-1">
              <h3
                className={`font-bold ${
                  bookingMessage.type === "success"
                    ? "text-emerald-300"
                    : "text-red-300"
                }`}
              >
                {bookingMessage.title}
              </h3>
              <p
                className={`text-sm mt-1 ${
                  bookingMessage.type === "success"
                    ? "text-emerald-400/80"
                    : "text-red-400/80"
                }`}
              >
                {bookingMessage.details}
              </p>
            </div>
            <button
              onClick={() => setBookingMessage(null)}
              className="text-slate-500 hover:text-slate-300 transition-colors"
              aria-label="Dismiss message"
            >
              <XCircle className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Timeline */}
        <div className="lg:col-span-2">
          <h3 className="text-lg font-bold text-slate-100 mb-4">
            Call Logs
          </h3>
          <div className="bg-abyss/30 p-6 rounded-2xl border border-surface-highlight min-h-[400px]">
            {(!request.interactions || request.interactions.length === 0) && (
              <div className="text-center py-10">
                {request.status === RequestStatus.FAILED ? (
                  <div className="text-red-400">
                    <svg className="w-12 h-12 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="font-medium">Call Failed</p>
                    <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto whitespace-pre-wrap break-words">
                      {request.finalOutcome || "Unable to complete provider calls. Please try again."}
                    </p>
                  </div>
                ) : request.status === RequestStatus.COMPLETED ? (
                  <div className="text-slate-500">
                    <p>No call logs available for this request.</p>
                  </div>
                ) : request.status === RequestStatus.PENDING ? (
                  <div className="text-slate-500">
                    <p>Waiting to start...</p>
                  </div>
                ) : request.providersFound && request.providersFound.length > 0 ? (
                  <div className="text-slate-400">
                    <div className="animate-pulse flex justify-center mb-3">
                      <Phone className="w-8 h-8 text-amber-400" />
                    </div>
                    <p className="text-amber-400 font-medium mb-2">Calling {request.providersFound.length} providers...</p>
                    <div className="text-sm text-slate-500 space-y-1">
                      {request.providersFound.slice(0, 5).map((p, i) => (
                        <p key={p.id || i}>{p.name}</p>
                      ))}
                      {request.providersFound.length > 5 && (
                        <p className="text-slate-600">+{request.providersFound.length - 5} more</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-500">
                    <div className="animate-pulse flex justify-center mb-3">
                      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <p>Initializing AI Agent...</p>
                  </div>
                )}
              </div>
            )}
            {/* Use ProviderCallSection for call logs with transcripts, LogItem for others */}
            {(request.interactions || []).map((log, i) => (
              Array.isArray(log.transcript) && log.transcript.length > 0 ? (
                <ProviderCallSection key={log.id || i} log={log} defaultExpanded={i === 0} />
              ) : (
                <LogItem key={log.id || i} log={log} index={i} />
              )
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-6">
          {request.providersFound && request.providersFound.length > 0 && (
            <div className="bg-surface rounded-xl border border-surface-highlight shadow-sm p-5">
              <h3 className="font-bold text-slate-200 mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" /> Candidates
              </h3>
              <div className="space-y-3">
                {request.providersFound.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setDetailPanelProvider(p)}
                    className={`text-sm p-3 rounded-lg border cursor-pointer transition-all hover:border-primary-500/50 hover:shadow-md ${request.selectedProvider?.id === p.id ? "bg-primary-500/10 border-primary-500/30 ring-1 ring-primary-500/30" : "bg-surface-highlight border-surface-highlight"}`}
                  >
                    <div className="font-medium text-slate-200">{p.name || "Unknown Provider"}</div>
                    <div className="text-slate-500 text-xs mt-1 flex items-center gap-2">
                      <span>{p.rating ? `${p.rating} ★` : "N/A"}</span>
                      {p.callStatus && (
                        <span className={`px-1.5 py-0.5 rounded text-xs ${
                          p.callStatus === "completed" ? "bg-green-500/20 text-green-400" :
                          p.callStatus === "failed" ? "bg-red-500/20 text-red-400" :
                          "bg-yellow-500/20 text-yellow-400"
                        }`}>
                          {p.callStatus}
                        </span>
                      )}
                    </div>
                    {p.distanceText && (
                      <div className="text-slate-500 text-xs mt-1">{p.distanceText}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {request.directContactInfo && (
            <div className="bg-surface rounded-xl border border-surface-highlight shadow-sm p-5">
              <h3 className="font-bold text-slate-200 mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400" /> Target Contact
              </h3>
              <div className="text-sm">
                <p className="font-medium text-slate-300">
                  {request.directContactInfo.name || "Unknown"}
                </p>
                <p className="text-slate-500">
                  {request.directContactInfo.phone || "No phone"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RecommendedProviders Section */}
      {(request.status === RequestStatus.ANALYZING ||
        request.status === RequestStatus.RECOMMENDED ||
        request.status === RequestStatus.COMPLETED) && (
        <div className="mt-8">
          {recommendationsLoading ? (
            <RecommendedProviders
              providers={[]}
              overallRecommendation=""
              onSelect={handleProviderSelect}
              loading={true}
            />
          ) : recommendations ? (
            <RecommendedProviders
              providers={recommendations.providers}
              overallRecommendation={recommendations.overallRecommendation}
              onSelect={handleProviderSelect}
            />
          ) : null}
        </div>
      )}

      {/* SelectionModal */}
      {showModal && selectedProvider && (
        <SelectionModal
          provider={selectedProvider}
          onConfirm={handleConfirmBooking}
          onCancel={() => setShowModal(false)}
          loading={bookingLoading}
        />
      )}

      {/* Provider Detail Panel - slide out when clicking a candidate card */}
      {detailPanelProvider && (
        <ProviderDetailPanel
          provider={detailPanelProvider}
          isOpen={!!detailPanelProvider}
          onClose={() => setDetailPanelProvider(null)}
          onSelect={(provider) => {
            // When selecting from detail panel, trigger the booking flow
            handleProviderSelect({
              providerId: provider.id,
              providerName: provider.name,
              phone: provider.phone || "",
              rating: provider.rating || 0,
              earliestAvailability: provider.callResult?.earliest_availability || "",
              estimatedRate: provider.callResult?.estimated_rate || "",
              score: 0,
              reasoning: "",
            });
            setDetailPanelProvider(null);
          }}
        />
      )}
    </div>
  );
}
