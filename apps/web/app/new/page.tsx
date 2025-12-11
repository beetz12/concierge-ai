"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/lib/providers/AppProvider";
import { RequestStatus, RequestType, ServiceRequest } from "@/lib/types";
import { Search, MapPin, AlertCircle, Sparkles, User, Phone, MessageSquare, PhoneCall } from "lucide-react";
import {
  simulateCall,
  analyzeResearchPrompt,
} from "@/lib/services/geminiService";
import { searchProviders as searchProvidersWorkflow } from "@/lib/services/workflowService";
import {
  callResponseToInteractionLog,
  normalizePhoneNumber,
  isValidE164Phone,
} from "@/lib/services/providerCallingService";
import { usePhoneValidation } from "@/lib/hooks/usePhoneValidation";

// Environment toggle for live VAPI calls vs simulated calls
const LIVE_CALL_ENABLED =
  process.env.NEXT_PUBLIC_LIVE_CALL_ENABLED === "true";

// Admin test mode: Array of test phone numbers for concurrent testing
// Format: comma-separated E.164 numbers (e.g., "+13105551234,+13105555678,+13105559012")
// When set, only calls providers up to the count of test phones available
const ADMIN_TEST_PHONES_RAW = process.env.NEXT_PUBLIC_ADMIN_TEST_PHONES;
const ADMIN_TEST_PHONES = ADMIN_TEST_PHONES_RAW
  ? ADMIN_TEST_PHONES_RAW.split(",").map((p) => p.trim()).filter(Boolean)
  : [];

// Backward compatibility: single test number (deprecated, use ADMIN_TEST_PHONES instead)
// Note: Also handles comma-separated values in legacy variable for compatibility
const ADMIN_TEST_NUMBER_LEGACY = process.env.NEXT_PUBLIC_ADMIN_TEST_NUMBER;
if (ADMIN_TEST_NUMBER_LEGACY && ADMIN_TEST_PHONES.length === 0) {
  // Split by comma in case legacy variable contains multiple numbers
  const legacyNumbers = ADMIN_TEST_NUMBER_LEGACY.split(",").map((p) => p.trim()).filter(Boolean);
  ADMIN_TEST_PHONES.push(...legacyNumbers);
}

const isAdminTestMode = ADMIN_TEST_PHONES.length > 0;
import {
  createServiceRequest,
  updateServiceRequest,
  addProviders,
} from "@/lib/actions/service-requests";

export default function NewRequest() {
  const router = useRouter();
  const { addRequest, updateRequest } = useAppContext();

  const [formData, setFormData] = useState({
    clientName: "",
    title: "",
    description: "",
    location: "",
    criteria: "",
    urgency: "within_2_days" as "immediate" | "within_24_hours" | "within_2_days" | "flexible",
    minRating: 4.5,
    preferredContact: "text" as "phone" | "text",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCriteriaInput, setShowCriteriaInput] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Phone validation for user's contact number
  const userPhoneValidation = usePhoneValidation();

  // Form validation - all required fields must be filled
  const isFormValid =
    formData.clientName.trim() !== "" &&
    formData.title.trim() !== "" &&
    formData.location.trim() !== "" &&
    formData.description.trim() !== "" &&
    userPhoneValidation.isValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Create request in database first to get proper UUID
      const dbRequest = await createServiceRequest({
        type: "RESEARCH_AND_BOOK",
        title: formData.title,
        description: formData.description,
        location: formData.location,
        criteria: formData.criteria,
        status: "SEARCHING",
        direct_contact_info: {
          preferred_contact: formData.preferredContact,
          user_phone: userPhoneValidation.normalized,
        },
      });

      const newRequest: ServiceRequest = {
        id: dbRequest.id,
        type: RequestType.RESEARCH_AND_BOOK,
        title: formData.title,
        description: formData.description,
        location: formData.location,
        criteria: formData.criteria,
        status: RequestStatus.SEARCHING,
        createdAt: dbRequest.created_at,
        providersFound: [],
        interactions: [],
      };

      addRequest(newRequest);
      router.push(`/request/${newRequest.id}`);

      // Start background process
      runConciergeProcess(newRequest.id, formData);
    } catch (error) {
      console.error("Failed to create request:", error);
      setSubmitError(
        error instanceof Error
          ? error.message
          : "Failed to create request. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  const runConciergeProcess = async (reqId: string, data: typeof formData) => {
    // Helper to update both localStorage and database
    const updateStatus = async (
      status: "SEARCHING" | "CALLING" | "ANALYZING" | "COMPLETED" | "FAILED",
      extras?: Partial<ServiceRequest>,
    ) => {
      updateRequest(reqId, { status: status as RequestStatus, ...extras });
      try {
        await updateServiceRequest(reqId, { status });
      } catch (err) {
        console.error("Failed to update DB status:", err);
      }
    };

    try {
      // 1. Search using Workflow API (with Kestra/Direct Gemini fallback)
      const workflowResult = await searchProvidersWorkflow({
        service: data.title,
        location: data.location,
        minRating: data.minRating,
        serviceRequestId: reqId,
      });

      // CRITICAL: Insert providers into database with proper UUIDs
      // This enables call results to be persisted and real-time subscriptions to work
      const providerInserts = workflowResult.providers.map((p) => ({
        request_id: reqId,
        name: p.name,
        phone: p.phone || null,
        rating: p.rating || null,
        address: p.address || null,
        source: "Google Maps" as const,
        // Store Google Place ID and other research data
        place_id: p.placeId || p.id || null,
        review_count: p.reviewCount || null,
        distance: p.distance || null,
        distance_text: p.distanceText || null,
        hours_of_operation: p.hoursOfOperation || null,
        is_open_now: p.isOpenNow ?? null,
        google_maps_uri: p.googleMapsUri || null,
        website: p.website || null,
        international_phone: p.internationalPhone || null,
      }));

      let providers: Array<{
        id: string;
        name: string;
        phone?: string;
        rating?: number;
        address?: string;
        reason: string;
        placeId?: string;
      }> = [];

      try {
        // Insert into database - returns records with generated UUIDs
        const dbProviders = await addProviders(providerInserts);
        console.log(
          `[Concierge] Persisted ${dbProviders.length} providers to database with UUIDs`,
        );

        // Map database records to local format, using database UUIDs as IDs
        providers = dbProviders.map((dbp, idx) => ({
          id: dbp.id, // This is the database UUID - critical for VAPI call persistence
          name: dbp.name,
          phone: dbp.phone || undefined,
          rating: dbp.rating || undefined,
          address: dbp.address || undefined,
          reason: workflowResult.providers[idx]?.reason || "",
          placeId: dbp.place_id || undefined, // Keep original Place ID for reference
        }));
      } catch (dbErr) {
        console.error("[Concierge] Failed to persist providers to database:", dbErr);
        // Fallback to original IDs if database insert fails (less ideal but keeps flow working)
        providers = workflowResult.providers.map((p) => ({
          id: p.id,
          name: p.name,
          phone: p.phone,
          rating: p.rating,
          address: p.address,
          reason: p.reason || "",
          placeId: p.placeId || p.id,
        }));
      }

      const searchLog = {
        timestamp: new Date().toISOString(),
        stepName: "Market Research",
        detail: `Found ${providers.length} providers using ${workflowResult.method === "kestra" ? "Kestra workflow" : "Direct Gemini"}. ${workflowResult.reasoning || ""}`,
        status: workflowResult.status === "success" ? "success" : "error",
      } as any;

      updateRequest(reqId, {
        providersFound: providers,
        interactions: [searchLog],
      });

      if (providers.length === 0) {
        await updateStatus("FAILED", {
          finalOutcome: "No providers found in your area.",
        });
        await updateServiceRequest(reqId, {
          final_outcome: "No providers found in your area.",
        });
        return;
      }

      // 2. Call Loop - Uses real VAPI when LIVE_CALL_ENABLED=true
      await updateStatus("CALLING");
      const callLogs = [];

      // In test mode, limit providers to the number of test phones available
      const providersToCall = isAdminTestMode
        ? providers.slice(0, ADMIN_TEST_PHONES.length)
        : providers;

      console.log(
        `[Concierge] Starting calls to ${providersToCall.length} providers (LIVE_CALL_ENABLED=${LIVE_CALL_ENABLED}, ADMIN_TEST_MODE=${isAdminTestMode})`,
      );

      if (isAdminTestMode) {
        console.log(
          `[Concierge] ADMIN TEST MODE: Will call ${ADMIN_TEST_PHONES.length} provider(s) using test phones: ${ADMIN_TEST_PHONES.join(", ")}`,
        );
        console.log(
          `[Concierge] Phone mapping: ${providersToCall.map((p, i) => `${p.name} → ${ADMIN_TEST_PHONES[i]}`).join(", ")}`,
        );
      }

      // Generate context-aware prompts with Gemini
      console.log('[Concierge] Generating context-aware prompts with Gemini...');
      let researchPrompt = null;
      try {
        researchPrompt = await analyzeResearchPrompt({
          serviceType: data.title,
          problemDescription: data.description,
          userCriteria: data.criteria,
          location: data.location,
          urgency: data.urgency,
          providerName: providers[0]?.name || "the provider",
          clientName: data.clientName,
        });
        if (researchPrompt) {
          console.log(`[Concierge] Generated ${researchPrompt.serviceCategory} prompts for ${data.title}`);
        }
      } catch (error) {
        console.error('[Concierge] Failed to generate prompts, using defaults:', error);
      }

      if (LIVE_CALL_ENABLED) {
        // BATCH CALLING: Call all providers concurrently via batch endpoint
        // Build provider list with phone numbers (applying test mode substitution)
        const batchProviders: Array<{
          name: string;
          phone: string;
          id: string;
          originalPhone?: string;
        }> = [];

        for (const [providerIndex, provider] of providersToCall.entries()) {
          if (!provider.phone) {
            console.warn(`[Concierge] Skipping ${provider.name}: no phone number`);
            callLogs.push({
              timestamp: new Date().toISOString(),
              stepName: `Calling ${provider.name}`,
              detail: `Skipped: No phone number available`,
              status: "warning" as const,
            });
            continue;
          }

          // Normalize phone to E.164 format
          // In admin test mode, use test phone at same index (1:1 mapping)
          const phoneToCall = isAdminTestMode
            ? normalizePhoneNumber(ADMIN_TEST_PHONES[providerIndex]!)
            : normalizePhoneNumber(provider.phone);

          if (!isValidE164Phone(phoneToCall)) {
            console.warn(
              `[Concierge] Skipping ${provider.name}: invalid phone ${isAdminTestMode ? ADMIN_TEST_PHONES[providerIndex] : provider.phone} -> ${phoneToCall}`,
            );
            callLogs.push({
              timestamp: new Date().toISOString(),
              stepName: `Calling ${provider.name}`,
              detail: `Skipped: Invalid phone number format`,
              status: "warning" as const,
            });
            continue;
          }

          batchProviders.push({
            name: provider.name,
            phone: phoneToCall,
            id: provider.id,
            originalPhone: provider.phone,
          });
        }

        // Update UI with any skipped providers before starting batch call
        if (callLogs.length > 0) {
          updateRequest(reqId, {
            interactions: [searchLog, ...callLogs],
          });
        }

        // Make batch call if we have valid providers
        if (batchProviders.length > 0) {
          const testModeLabel = isAdminTestMode ? " (TEST MODE)" : "";
          console.log(
            `[Concierge] Starting BATCH call to ${batchProviders.length} providers via /api/v1/providers/batch-call...${testModeLabel}`,
          );
          console.log(
            `[Concierge] Providers: ${batchProviders.map(p => `${p.name} @ ${p.phone}`).join(", ")}`,
          );

          // FIRE-AND-FORGET: Start batch call without waiting for completion
          // Real-time subscriptions in request/[id]/page.tsx will update UI as calls complete
          const batchRequestBody = {
            providers: batchProviders.map((p) => ({
              name: p.name,
              phone: p.phone,
              id: p.id,
            })),
            serviceNeeded: data.title,
            userCriteria: data.criteria,
            problemDescription: data.description,
            clientName: data.clientName,
            location: data.location,
            urgency: data.urgency,
            serviceRequestId: reqId,
            maxConcurrent: 5,
            customPrompt: researchPrompt
              ? {
                  systemPrompt: researchPrompt.systemPrompt,
                  firstMessage: researchPrompt.firstMessage,
                  closingScript: "Thank you so much for your time. Have a wonderful day!",
                }
              : undefined,
          };

          // Fire the batch call - don't await, let it run in background
          fetch("/api/v1/providers/batch-call", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(batchRequestBody),
          })
            .then(async (response) => {
              if (!response.ok) {
                const errorText = await response.text();
                console.error(`[Concierge] Batch call returned error: ${response.status} - ${errorText}`);
              } else {
                const result = await response.json();
                console.log(`[Concierge] Batch call completed successfully. Stats:`, result.data?.stats);
              }
            })
            .catch((error) => {
              // Only log to console - don't update UI since real-time handles that
              console.error("[Concierge] Batch call network error (calls may still be running):", error);
            });

          // Add immediate feedback log - calls are now in progress
          const inProgressLog = {
            timestamp: new Date().toISOString(),
            stepName: "Calling Providers",
            detail: `Initiated ${batchProviders.length} concurrent call${batchProviders.length > 1 ? 's' : ''}. Results will appear below as each call completes via real-time updates.`,
            status: "info" as const,
          };
          callLogs.push(inProgressLog);
          console.log(`[Concierge] Batch call initiated for ${batchProviders.length} providers - UI will update via real-time subscriptions`);
        }

        // Update UI with all call results
        updateRequest(reqId, {
          interactions: [searchLog, ...callLogs],
        });
      } else {
        // Simulated calls via Gemini (existing behavior) - sequential
        for (const provider of providersToCall) {
          const log = await simulateCall(
            provider.name,
            `${data.description}. Criteria: ${data.criteria}`,
            false,
          );
          callLogs.push(log);
          updateRequest(reqId, {
            interactions: [searchLog, ...callLogs],
          });
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      // Log skipped providers in test mode (if any were skipped due to test phone limits)
      if (isAdminTestMode && providers.length > ADMIN_TEST_PHONES.length) {
        const skippedProviders = providers.slice(ADMIN_TEST_PHONES.length);
        console.log(
          `[Concierge] TEST MODE: Skipped ${skippedProviders.length} provider(s) due to test phone limit (${ADMIN_TEST_PHONES.length} test phones available)`
        );

        // Create info logs for each skipped provider
        for (const skipped of skippedProviders) {
          const skipLog = {
            timestamp: new Date().toISOString(),
            stepName: `Skipped ${skipped.name}`,
            detail: `Provider not called due to test mode limit (${ADMIN_TEST_PHONES.length} test phone${ADMIN_TEST_PHONES.length === 1 ? '' : 's'} available)`,
            status: "info" as const,
          };
          callLogs.push(skipLog);
          console.log(
            `[Concierge] - ${skipped.name} (Rating: ${skipped.rating || 'N/A'}) - Skipped`
          );
        }

        // Update UI with skip logs
        updateRequest(reqId, {
          interactions: [searchLog, ...callLogs],
        });
      }

      // With fire-and-forget batch calling, we don't wait for call results here
      // The request/[id]/page.tsx handles call completion via real-time subscriptions
      // and triggers recommendations when all calls are done

      // Only check for immediate validation errors (skipped providers, invalid phones)
      const immediateErrors = callLogs.filter((log) =>
        log.status === "error" && !log.stepName.includes("Calling")
      );

      if (immediateErrors.length > 0 && callLogs.length === immediateErrors.length) {
        // All logs are errors (e.g., all providers had invalid phones)
        const outcome = `Could not initiate any calls:\n${immediateErrors.map(e => `- ${e.detail}`).join('\n')}`;
        console.log(`[Concierge] Request failed - no valid providers to call`);

        updateRequest(reqId, {
          status: RequestStatus.FAILED,
          interactions: [searchLog, ...callLogs],
          finalOutcome: outcome,
        });
        await updateServiceRequest(reqId, {
          status: "FAILED",
          final_outcome: outcome,
        });
        return;
      }

      // Calls are now running in background
      // Transition to ANALYZING - real-time subscriptions will update as calls complete
      console.log(`[Concierge] Calls initiated, transitioning to ANALYZING. Real-time will handle results.`);

      // 3. Transition to ANALYZING - recommendations will be generated
      // when all calls complete (handled by real-time in request/[id]/page.tsx)
      await updateStatus("ANALYZING");

      // Update interactions with current logs
      updateRequest(reqId, {
        interactions: [searchLog, ...callLogs],
      });

      console.log(`[Concierge] Request ${reqId} now in ANALYZING state. Waiting for calls to complete via real-time.`);
      // The request/[id]/page.tsx checkAndGenerateRecommendations() will:
      // 1. Detect when all initiated calls have completed
      // 2. Call the /api/v1/providers/recommend endpoint
      // 3. Update the UI with recommendations
    } catch (e) {
      console.error(e);
      const outcome =
        e instanceof Error ? e.message : "An unexpected error occurred";
      updateRequest(reqId, {
        status: RequestStatus.FAILED,
        finalOutcome: outcome,
      });
      try {
        await updateServiceRequest(reqId, {
          status: "FAILED",
          final_outcome: outcome,
        });
      } catch (dbErr) {
        console.error("Failed to update DB on error:", dbErr);
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-100 flex items-center gap-3">
          <Sparkles className="text-primary-400" />
          New Research Request
        </h1>
        <p className="text-slate-400 mt-2">
          Tell us what you need. We&apos;ll research local providers, call them
          to verify details, and book the best one.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-surface p-8 rounded-2xl border border-surface-highlight shadow-xl space-y-6"
      >
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Your Name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
            <input
              type="text"
              required
              placeholder="e.g. John Smith"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all bg-abyss text-slate-100 placeholder-slate-600"
              value={formData.clientName}
              onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1">The AI will introduce itself as your personal assistant</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            What service do you need?
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
            <input
              type="text"
              required
              placeholder="e.g. Emergency Plumber, Dog Walker, Dentist"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all bg-abyss text-slate-100 placeholder-slate-600"
              value={formData.title}
              onChange={(e) =>
                setFormData({ ...formData, title: e.target.value })
              }
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Where are you located?
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
            <input
              type="text"
              required
              placeholder="e.g. Greenville, SC or Zip Code"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all bg-abyss text-slate-100 placeholder-slate-600"
              value={formData.location}
              onChange={(e) =>
                setFormData({ ...formData, location: e.target.value })
              }
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            How Urgent?
          </label>
          <select
            value={formData.urgency}
            onChange={(e) => setFormData({ ...formData, urgency: e.target.value as typeof formData.urgency })}
            className="w-full px-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all bg-abyss text-slate-100"
          >
            <option value="immediate">Immediate (ASAP)</option>
            <option value="within_24_hours">Within 24 hours</option>
            <option value="within_2_days">Within 2 days</option>
            <option value="flexible">Flexible timing</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Minimum Rating: {formData.minRating.toFixed(1)} stars
          </label>
          <input
            type="range"
            min="0"
            max="5"
            step="0.5"
            value={formData.minRating}
            onChange={(e) => setFormData({ ...formData, minRating: parseFloat(e.target.value) })}
            className="w-full h-2 bg-surface-highlight rounded-lg appearance-none cursor-pointer accent-primary-500"
          />
          <p className="text-xs text-slate-500 mt-1">Providers below this rating will be filtered out</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Detailed Description
          </label>
          <textarea
            required
            rows={4}
            placeholder="Describe the issue in detail. e.g. I have a leaking toilet in the master bathroom that needs fixing ASAP."
            className="w-full px-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all resize-none bg-abyss text-slate-100 placeholder-slate-600"
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
          />
        </div>

        {/* Preferred Contact Method */}
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-300">
            How should we notify you of recommendations?
          </label>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="preferredContact"
                value="text"
                checked={formData.preferredContact === "text"}
                onChange={(e) => setFormData({...formData, preferredContact: e.target.value as "phone" | "text"})}
                className="w-4 h-4 text-primary-600 border-slate-600 focus:ring-primary-500 bg-abyss"
              />
              <MessageSquare className="w-4 h-4 text-slate-400 group-hover:text-primary-400 transition-colors" />
              <span className="text-slate-200 group-hover:text-slate-100 transition-colors">Text Message (SMS)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="preferredContact"
                value="phone"
                checked={formData.preferredContact === "phone"}
                onChange={(e) => setFormData({...formData, preferredContact: e.target.value as "phone" | "text"})}
                className="w-4 h-4 text-primary-600 border-slate-600 focus:ring-primary-500 bg-abyss"
              />
              <PhoneCall className="w-4 h-4 text-slate-400 group-hover:text-primary-400 transition-colors" />
              <span className="text-slate-200 group-hover:text-slate-100 transition-colors">Phone Call</span>
            </label>
          </div>

          {/* Phone Number Input */}
          <div className="relative">
            <Phone className={`absolute left-3 top-3.5 w-5 h-5 ${userPhoneValidation.error && userPhoneValidation.isTouched ? 'text-red-400' : 'text-slate-500'}`} />
            <input
              type="tel"
              placeholder="Your phone number for notifications"
              value={userPhoneValidation.value}
              onChange={userPhoneValidation.onChange}
              onBlur={userPhoneValidation.onBlur}
              className={`w-full pl-10 pr-4 py-3 rounded-xl border ${
                userPhoneValidation.error && userPhoneValidation.isTouched
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                  : 'border-surface-highlight focus:border-primary-500 focus:ring-primary-500/20'
              } focus:ring-2 outline-none transition-all bg-abyss text-slate-100 placeholder-slate-600`}
            />
            {userPhoneValidation.error && userPhoneValidation.isTouched && (
              <p className="text-red-400 text-sm mt-1">{userPhoneValidation.error}</p>
            )}
            {userPhoneValidation.isValid && userPhoneValidation.normalized && (
              <p className="text-emerald-400 text-sm mt-1">Valid: {userPhoneValidation.normalized}</p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-semibold text-slate-300">
              Additional Criteria
            </label>
            <button
              type="button"
              onClick={() => setShowCriteriaInput(!showCriteriaInput)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                showCriteriaInput ? "bg-primary-600" : "bg-slate-700"
              }`}
              role="switch"
              aria-checked={showCriteriaInput}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showCriteriaInput ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Add specific requirements for the AI to ask providers about (e.g., licensing, availability, pricing)
          </p>
          {showCriteriaInput && (
            <>
              <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl mb-3 flex items-start gap-3 text-sm text-blue-300">
                <AlertCircle className="w-5 h-5 shrink-0 text-blue-400" />
                <p>
                  The AI will use these criteria when interviewing providers. Be
                  specific about availability, pricing, or qualifications.
                </p>
              </div>
              <input
                type="text"
                placeholder="e.g. licensed, accepts new patients, background check required"
                className="w-full px-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all bg-abyss text-slate-100 placeholder-slate-600"
                value={formData.criteria}
                onChange={(e) =>
                  setFormData({ ...formData, criteria: e.target.value })
                }
              />
            </>
          )}
        </div>

        {/* Error Message */}
        {submitError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Request Failed</p>
              <p className="text-sm text-red-400/80 mt-1">{submitError}</p>
            </div>
            <button
              type="button"
              onClick={() => setSubmitError(null)}
              className="text-red-400/60 hover:text-red-400 transition-colors"
            >
              ×
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !isFormValid}
          className="w-full py-4 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl shadow-lg shadow-primary-500/20 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <>Processing...</>
          ) : (
            <>
              Start Research & Booking <Sparkles className="w-5 h-5" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}
