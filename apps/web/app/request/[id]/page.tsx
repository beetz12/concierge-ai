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

  // Use realtime data if available, otherwise local request, otherwise DB request
  const request = realtimeRequest || localRequest || dbRequest;

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
  const checkAndGenerateRecommendations = useCallback(async (retryCount = 0) => {
    const MAX_RETRIES = 5; // 5 retries * 2 seconds = 10 seconds max wait

    // Only check once and only for valid UUIDs
    if (recommendationsChecked || !id || !isValidUuid(id) || !request) {
      return;
    }

    try {
      const supabase = createClient();

      // Fetch all providers for this request with their call results
      const { data: providers, error } = await supabase
        .from("providers")
        .select("*")
        .eq("request_id", id);

      if (error) {
        console.error("Error fetching providers:", error);
        return;
      }

      if (!providers || providers.length === 0) {
        console.log("No providers found for request");
        return;
      }

      // Check if all INITIATED calls have completed (reached a final status)
      // In test mode, not all providers are called - only those with test phones
      // So we check: of the providers that were called, are all finished?
      const finalStatuses = ["completed", "failed", "error", "timeout", "no_answer", "voicemail", "busy"];
      const calledProviders = providers.filter((p) => p.call_status);
      const completedProviders = providers.filter((p) =>
        p.call_status && finalStatuses.includes(p.call_status)
      );

      // All initiated calls are done when:
      // 1. At least one provider was called (calledProviders.length > 0)
      // 2. All called providers have reached a final status
      const allInitiatedCallsComplete = calledProviders.length > 0 &&
        completedProviders.length === calledProviders.length;

      console.log(
        `Call progress: ${completedProviders.length}/${calledProviders.length} calls completed (${providers.length} total providers) [retry ${retryCount}/${MAX_RETRIES}]`
      );

      if (!allInitiatedCallsComplete) {
        if (calledProviders.length === 0) {
          console.log("No calls initiated yet, waiting...");
        } else {
          console.log(`${calledProviders.length - completedProviders.length} call(s) still in progress, waiting...`);
        }

        // Retry logic: if calls are in progress and we haven't exhausted retries, schedule another check
        if (retryCount < MAX_RETRIES && calledProviders.length > 0) {
          console.log(`[Recommendations] Scheduling retry ${retryCount + 1}/${MAX_RETRIES} in 2 seconds...`);
          setTimeout(() => {
            checkAndGenerateRecommendations(retryCount + 1);
          }, 2000);
        } else if (retryCount >= MAX_RETRIES) {
          console.warn("[Recommendations] Max retries reached - some calls may not have completed");
        }
        return;
      }

      // Mark as checked to prevent duplicate fetches
      setRecommendationsChecked(true);
      setRecommendationsLoading(true);

      // Wait for backend to generate recommendations (status RECOMMENDED)
      // Backend automatically generates recommendations when calls complete
      if (request.status === RequestStatus.RECOMMENDED || request.status === RequestStatus.COMPLETED) {
        console.log("Request status is RECOMMENDED/COMPLETED - displaying recommendations from database");

        // Build recommendations from provider call results that backend already analyzed
        const qualifiedProviders = completedProviders
          .filter((p) => {
            const callResult = p.call_result as any;
            const structuredData = callResult?.analysis?.structuredData || {};

            // Filter out disqualified, unavailable, and failed calls (same logic as backend)
            return (
              !structuredData.disqualified &&
              structuredData.availability !== "unavailable" &&
              p.call_status === "completed"
            );
          })
          .map((p) => {
            const callResult = p.call_result as any;
            const structuredData = callResult?.analysis?.structuredData || {};

            return {
              providerId: p.id,
              providerName: p.name,
              phone: p.phone || "",
              rating: p.rating ?? 0,
              reviewCount: p.review_count ?? undefined,
              earliestAvailability: structuredData.earliest_availability || "Not specified",
              estimatedRate: structuredData.estimated_rate || "Not specified",
              score: 85, // Default score - backend AI scoring would be in call_result
              reasoning: callResult?.analysis?.summary || "Provider meets criteria and is available",
              criteriaMatched: structuredData.all_criteria_met ? ["All criteria met"] : [],
            };
          })
          .slice(0, 3); // Top 3 providers

        if (qualifiedProviders && qualifiedProviders.length > 0) {
          setRecommendations({
            providers: qualifiedProviders,
            overallRecommendation: `Based on the calls, we recommend ${qualifiedProviders[0]?.providerName || "the first provider"} as the top choice.`,
          });

          console.log("Recommendations displayed from database:", qualifiedProviders.length);

          // Send notification to user if we have their phone number
          if (request.userPhone && qualifiedProviders.length > 0 && !notificationSent) {
            console.log("Sending notification to user:", request.userPhone);

            const notifyResult = await notifyUser({
              userPhone: request.userPhone,
              userName: request.directContactInfo?.name,
              serviceRequestId: id,
              preferredContact: request.preferredContact || "text",
              serviceNeeded: request.title,
              location: request.location,
              requestUrl: `${window.location.origin}/request/${id}`,
              providers: qualifiedProviders.slice(0, 3).map((p) => ({
                name: p.providerName,
                earliestAvailability: p.earliestAvailability || "Contact for availability",
              })),
            });

            if (notifyResult.success) {
              console.log("User notification sent successfully:", notifyResult.data?.method);
              setNotificationSent(true);
            } else {
              console.error("Failed to send user notification:", notifyResult.error);
            }
          }
        } else {
          console.log("No qualified providers found after filtering");
        }
      } else {
        // Status is still ANALYZING - backend is still generating recommendations
        // Retry to check again after backend updates status to RECOMMENDED
        if (retryCount < MAX_RETRIES) {
          console.log(`[Recommendations] Status not yet RECOMMENDED (current: ${request.status}), retrying in 2 seconds...`);
          setTimeout(() => {
            checkAndGenerateRecommendations(retryCount + 1);
          }, 2000);
        } else {
          console.warn("[Recommendations] Max retries reached - backend may still be processing");
        }
      }
    } catch (error) {
      console.error("Error fetching recommendations:", error);
    } finally {
      setRecommendationsLoading(false);
    }
  }, [id, request, recommendationsChecked, notificationSent]);

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
            // Convert DB format to frontend format
            const converted: ServiceRequest = {
              id: payload.new.id,
              type: payload.new.type as RequestType,
              title: payload.new.title,
              description: payload.new.description,
              criteria: payload.new.criteria,
              location: payload.new.location || undefined,
              status: safeRequestStatus(payload.new.status),
              createdAt: payload.new.created_at,
              providersFound: [],
              interactions: [],
              finalOutcome: payload.new.final_outcome || undefined,
            };
            setRealtimeRequest(converted);
            // Also update context for consistency
            addRequest(converted);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "providers",
          filter: `request_id=eq.${id}`,
        },
        async (payload) => {
          console.log("Provider update received:", payload);

          // Refetch provider data when call results are saved
          // This ensures call logs, summary, transcript are available in UI
          if (payload.new && payload.new.call_status) {
            const updatedProvider = payload.new;

            // Check if we can use the optimized path (simple field updates only)
            // Use full refetch for complex JSONB updates or when call_result changes
            const needsFullRefetch =
              typeof updatedProvider.call_result === 'object' &&
              updatedProvider.call_result !== null;

            if (!needsFullRefetch) {
              // Optimized path: update only the changed provider using payload.new
              setRealtimeRequest((prev) => {
                if (!prev) return prev;

                const updatedProviders = prev.providersFound.map(p => {
                  if (p.id !== updatedProvider.id) return p;

                  // Merge the update with existing provider data
                  return {
                    ...p,
                    callStatus: updatedProvider.call_status || undefined,
                    callTranscript: updatedProvider.call_transcript || p.callTranscript,
                    callSummary: updatedProvider.call_summary || p.callSummary,
                    callDurationMinutes: updatedProvider.call_duration_minutes || p.callDurationMinutes,
                    calledAt: updatedProvider.called_at || p.calledAt,
                    // Keep existing callResult unless explicitly updated
                    callResult: p.callResult,
                  };
                });

                return { ...prev, providersFound: updatedProviders };
              });
            } else {
              // Fallback: full refetch for complex updates (JSONB call_result changes)
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
  }, [id, addRequest, checkAndGenerateRecommendations]);

  useEffect(() => {
    // Auto scroll to bottom when new logs arrive
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [request?.interactions.length]);

  // Check for recommendations when status changes to ANALYZING, RECOMMENDED, or COMPLETED
  useEffect(() => {
    if (
      request &&
      (request.status === RequestStatus.ANALYZING ||
        request.status === RequestStatus.RECOMMENDED ||
        request.status === RequestStatus.COMPLETED) &&
      !recommendationsChecked &&
      !recommendationsLoading
    ) {
      console.log(
        `Request status is ${request.status}, checking for recommendations...`
      );
      checkAndGenerateRecommendations();
    }
  }, [request?.status, recommendationsChecked, recommendationsLoading, checkAndGenerateRecommendations]);

  // Fallback: Poll for recommendations if subscription doesn't fire
  // This handles race conditions where JSONB updates don't trigger real-time subscriptions
  useEffect(() => {
    if (
      (request?.status === RequestStatus.ANALYZING ||
        request?.status === RequestStatus.RECOMMENDED) &&
      !recommendationsChecked &&
      !recommendationsLoading
    ) {
      const pollTimer = setTimeout(() => {
        console.log("[Recommendations] Fallback poll triggered after 5s");
        checkAndGenerateRecommendations();
      }, 5000);
      return () => clearTimeout(pollTimer);
    }
  }, [request?.status, recommendationsChecked, recommendationsLoading, checkAndGenerateRecommendations]);

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

    setBookingLoading(true);
    try {
      console.log("Initiating booking call for:", selectedProvider);

      // Use scheduleBooking from bookingService (uses Kestra when KESTRA_ENABLED=true)
      const result = await scheduleBooking({
        serviceRequestId: id,
        providerId: selectedProvider.providerId,
        providerPhone: selectedProvider.phone,
        providerName: selectedProvider.providerName,
        serviceDescription: request.title,
        preferredDate: selectedProvider.earliestAvailability,
        customerName: request.directContactInfo?.name,
        customerPhone: request.userPhone,
        location: request.location,
      });

      console.log("Booking call result:", result);

      if (!result.success) {
        throw new Error(result.error || "Failed to book appointment");
      }

      // Check booking status from response
      const bookingStatus = result.data?.bookingStatus || "unknown";
      const bookingInitiated = result.data?.bookingInitiated;

      if (bookingInitiated && bookingStatus === "confirmed") {
        // Success - show inline confirmation
        setBookingMessage({
          type: "success",
          title: "Appointment Confirmed!",
          details: `Provider: ${selectedProvider.providerName} • Method: ${result.data?.method || "direct"}`,
        });

        // Close modal
        setShowModal(false);

        // Real-time subscription will handle updating the UI with the new status
      } else if (bookingInitiated) {
        // Booking call made but not confirmed yet
        setBookingMessage({
          type: "success",
          title: "Booking Call Initiated",
          details: `Status: ${bookingStatus}. The provider will contact you to confirm.`,
        });
        setShowModal(false);
      } else {
        // Booking failed
        setBookingMessage({
          type: "error",
          title: "Booking Unsuccessful",
          details: `Status: ${bookingStatus}. Please try again or contact the provider directly.`,
        });
        setShowModal(false);
      }
    } catch (error) {
      console.error("Error booking provider:", error);
      // Show inline error (no alert())
      setBookingMessage({
        type: "error",
        title: "Failed to Book Appointment",
        details: error instanceof Error ? error.message : "Unknown error occurred",
      });
      setShowModal(false);
    } finally {
      setBookingLoading(false);
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
          <h1 className="text-2xl font-bold text-slate-100">{request.title || "Untitled Request"}</h1>
          <StatusBadge status={request.status} callProgress={callProgress} />
        </div>

        {/* LiveStatus Component */}
        <LiveStatus
          status={request.status}
          callProgress={callProgress}
          providersFound={request.providersFound?.length || 0}
          interactions={request.interactions || []}
          providers={request.providersFound}
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
