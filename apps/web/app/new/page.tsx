"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/lib/providers/AppProvider";
import { RequestStatus, RequestType, ServiceRequest } from "@/lib/types";
import {
  Search,
  MapPin,
  AlertCircle,
  Sparkles,
  User,
  Phone,
  MessageSquare,
  PhoneCall,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SegmentedControl } from "@repo/ui/segmented-control";
import {
  AddressAutocomplete,
  type AddressComponents,
} from "@repo/ui/address-autocomplete";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
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
// Note: Test phone substitution is handled by backend (ADMIN_TEST_NUMBER in backend .env)
const LIVE_CALL_ENABLED = process.env.NEXT_PUBLIC_LIVE_CALL_ENABLED === "true";

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
    location: "", // City/state for backward compatibility
    clientAddress: {
      formatted: "",
      street: "",
      city: "",
      state: "",
      zip: "",
    } as AddressComponents,
    criteria: "",
    urgency: "within_2_days" as
      | "immediate"
      | "within_24_hours"
      | "within_2_days"
      | "flexible",
    minRating: 4.5,
    preferredContact: "text" as "phone" | "text",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCriteriaInput, setShowCriteriaInput] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Phone validation for user's contact number
  const userPhoneValidation = usePhoneValidation();

  // Form validation - all required fields must be filled
  // Check clientAddress.formatted for actual address selection (not just the derived location)
  const isFormValid =
    formData.clientName.trim() !== "" &&
    formData.title.trim() !== "" &&
    formData.clientAddress.formatted.trim() !== "" &&
    formData.description.trim() !== "" &&
    userPhoneValidation.isValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Create request in database first to get proper UUID
      // CRITICAL: Save user_phone and preferred_contact to dedicated columns
      // (not inside direct_contact_info JSONB) so notification triggers work
      const dbRequest = await createServiceRequest({
        type: "RESEARCH_AND_BOOK",
        title: formData.title,
        description: formData.description,
        location: formData.location,
        criteria: formData.criteria,
        status: "SEARCHING",
        user_phone: userPhoneValidation.normalized,
        preferred_contact: formData.preferredContact,
        direct_contact_info: {
          user_name: formData.clientName,
          phone: userPhoneValidation.normalized,
        },
      });

      const newRequest: ServiceRequest = {
        id: dbRequest.id,
        type: RequestType.RESEARCH_AND_BOOK,
        title: formData.title,
        description: formData.description,
        location: formData.location,
        clientAddress: formData.clientAddress.formatted, // Full street address for booking
        criteria: formData.criteria,
        status: RequestStatus.SEARCHING,
        createdAt: dbRequest.created_at,
        providersFound: [],
        interactions: [],
        userPhone: userPhoneValidation.normalized,
        preferredContact: formData.preferredContact,
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
      extras?: Partial<ServiceRequest>
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
          `[Concierge] Persisted ${dbProviders.length} providers to database with UUIDs`
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
        console.error(
          "[Concierge] Failed to persist providers to database:",
          dbErr
        );
        // Database persistence is critical - without UUIDs, call results can't be saved
        // and real-time subscriptions won't work. Fail with clear error.
        await updateStatus("FAILED", {
          finalOutcome:
            "Database error: Unable to save provider information. Please try again.",
        });
        await updateServiceRequest(reqId, {
          status: "FAILED",
          final_outcome: "Database error during provider persistence",
        });
        return;
      }

      const searchLog = {
        timestamp: new Date().toISOString(),
        stepName: "Market Research",
        detail: `Found ${providers.length} providers in your area. ${workflowResult.reasoning || ""}`,
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

      // 2. Call Loop - Backend handles test mode (ADMIN_TEST_NUMBER in backend .env)
      await updateStatus("CALLING");
      const callLogs = [];

      // All providers are sent to backend - test phone substitution happens server-side
      const providersToCall = providers;

      console.log(
        `[Concierge] Starting calls to ${providersToCall.length} providers`
      );

      // Generate context-aware prompts with Gemini
      console.log(
        "[Concierge] Generating context-aware prompts with Gemini..."
      );
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
          clientAddress: data.clientAddress?.formatted, // Full street address for VAPI
        });
        if (researchPrompt) {
          console.log(
            `[Concierge] Generated ${researchPrompt.serviceCategory} prompts for ${data.title}`
          );
        }
      } catch (error) {
        console.error(
          "[Concierge] Failed to generate prompts, using defaults:",
          error
        );
      }

      if (LIVE_CALL_ENABLED) {
        // BATCH CALLING: Call all providers concurrently via batch endpoint
        // Build provider list - backend handles test phone substitution
        const batchProviders: Array<{
          name: string;
          phone: string;
          id: string;
        }> = [];

        for (const provider of providersToCall) {
          if (!provider.phone) {
            console.warn(
              `[Concierge] Skipping ${provider.name}: no phone number`
            );
            callLogs.push({
              timestamp: new Date().toISOString(),
              stepName: `Calling ${provider.name}`,
              detail: `Skipped: No phone number available`,
              status: "warning" as const,
            });
            continue;
          }

          // Normalize phone to E.164 format
          const phoneToCall = normalizePhoneNumber(provider.phone);

          if (!isValidE164Phone(phoneToCall)) {
            console.warn(
              `[Concierge] Skipping ${provider.name}: invalid phone ${provider.phone} -> ${phoneToCall}`
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
          console.log(
            `[Concierge] Starting BATCH call to ${batchProviders.length} providers via /api/v1/providers/batch-call-async...`
          );
          console.log(
            `[Concierge] Providers: ${batchProviders.map((p) => `${p.name} @ ${p.phone}`).join(", ")}`
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
            clientAddress: data.clientAddress.formatted, // Full street address for VAPI
            urgency: data.urgency,
            preferredContact: formData.preferredContact,
            userPhone: userPhoneValidation.normalized,
            serviceRequestId: reqId,
            maxConcurrent: 5,
            customPrompt: researchPrompt
              ? {
                  systemPrompt: researchPrompt.systemPrompt,
                  firstMessage: researchPrompt.firstMessage,
                  closingScript:
                    "Thank you so much for your time. Have a wonderful day!",
                }
              : undefined,
          };

          // Start batch calls asynchronously - returns 202 immediately
          fetch("/api/v1/providers/batch-call-async", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(batchRequestBody),
          })
            .then(async (response) => {
              if (response.status === 202) {
                const result = await response.json();
                console.log(
                  `[Concierge] Calls accepted (execution: ${result.data?.executionId}). Providers queued:`,
                  result.data?.providersQueued
                );
              } else {
                // API error - update local state immediately (backend may also update via DB)
                const errorText = await response.text();
                console.error(
                  `[Concierge] Failed to start async calls: ${response.status} - ${errorText}`
                );
                updateRequest(reqId, {
                  status: RequestStatus.FAILED,
                  finalOutcome: `Failed to initiate calls: ${response.status} - ${errorText}`,
                });
                // Also try to update database status
                updateServiceRequest(reqId, {
                  status: "FAILED",
                  final_outcome: `API error: ${response.status}`,
                }).catch(console.error);
              }
            })
            .catch((error) => {
              // Network error - update status to show failure
              console.error("[Concierge] Network error starting calls:", error);
              updateRequest(reqId, {
                status: RequestStatus.FAILED,
                finalOutcome: `Network error initiating calls: ${error.message || "Connection failed"}`,
              });
              // Also try to update database status
              updateServiceRequest(reqId, {
                status: "FAILED",
                final_outcome: "Network error",
              }).catch(console.error);
            });

          // Add immediate feedback log - calls are now in progress
          const inProgressLog = {
            timestamp: new Date().toISOString(),
            stepName: "Calling Providers",
            detail: `Initiated ${batchProviders.length} concurrent call${batchProviders.length > 1 ? "s" : ""}. Results will appear below as each call completes via real-time updates.`,
            status: "info" as const,
          };
          callLogs.push(inProgressLog);
          console.log(
            `[Concierge] Batch call initiated for ${batchProviders.length} providers - UI will update via real-time subscriptions`
          );
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
            false
          );
          callLogs.push(log);
          updateRequest(reqId, {
            interactions: [searchLog, ...callLogs],
          });
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      // With fire-and-forget batch calling, we don't wait for call results here
      // The request/[id]/page.tsx handles call completion via real-time subscriptions
      // and triggers recommendations when all calls are done

      // Only check for immediate validation errors (skipped providers, invalid phones)
      const immediateErrors = callLogs.filter(
        (log) => log.status === "error" && !log.stepName.includes("Calling")
      );

      if (
        immediateErrors.length > 0 &&
        callLogs.length === immediateErrors.length
      ) {
        // All logs are errors (e.g., all providers had invalid phones)
        const outcome = `Could not initiate any calls:\n${immediateErrors.map((e) => `- ${e.detail}`).join("\n")}`;
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
      console.log(
        `[Concierge] Calls initiated, transitioning to ANALYZING. Real-time will handle results.`
      );

      // 3. Transition to ANALYZING - recommendations will be generated
      // when all calls complete (handled by real-time in request/[id]/page.tsx)
      await updateStatus("ANALYZING");

      // Update interactions with current logs
      updateRequest(reqId, {
        interactions: [searchLog, ...callLogs],
      });

      console.log(
        `[Concierge] Request ${reqId} now in ANALYZING state. Waiting for calls to complete via real-time.`
      );
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
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="New Research Request"
        description="Tell us what you need. We'll research local providers, call them to verify details, and book the best one."
      />

        <form
          onSubmit={handleSubmit}
          className="bg-surface p-8 rounded-2xl border border-surface-highlight shadow-xl space-y-6"
        >
          <div className="space-y-2">
            <Label htmlFor="clientName">Your Name</Label>
            <div className="relative">
              <User className="absolute left-3 top-3.5 w-5 h-5 text-slate-500 z-10 pointer-events-none" />
              <Input
                id="clientName"
                type="text"
                required
                placeholder="e.g. John Smith"
                className="pl-10"
                value={formData.clientName}
                onChange={(e) =>
                  setFormData({ ...formData, clientName: e.target.value })
                }
              />
            </div>
            <p className="text-xs text-slate-500">
              The AI will introduce itself as your personal assistant
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serviceTitle">What service do you need?</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3.5 w-5 h-5 text-slate-500 z-10 pointer-events-none" />
              <Input
                id="serviceTitle"
                type="text"
                required
                placeholder="e.g. Emergency Plumber, Dog Walker, Dentist"
                className="pl-10"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="serviceAddress">
              What is your service address?
            </Label>
            <div className="relative flex items-center">
              <MapPin className="absolute left-3 w-5 h-5 text-slate-500 z-10 pointer-events-none" />
              <AddressAutocomplete
                value={formData.clientAddress.formatted}
                onChange={(address) => {
                  // Derive location for backward compatibility
                  // Fall back to formatted address if city/state not available
                  const cityState = [address.city, address.state]
                    .filter(Boolean)
                    .join(", ");
                  const location = cityState || address.formatted;
                  setFormData({
                    ...formData,
                    location,
                    clientAddress: address,
                  });
                }}
                placeholder="Start typing your address..."
                className="w-full h-10 pl-10 px-3 py-2 rounded-lg border border-surface-highlight focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30 outline-none transition-all bg-abyss text-sm text-slate-100"
                required
              />
            </div>
            <p className="text-xs text-slate-500">
              Select from suggestions for accurate address
            </p>
          </div>

          <div className="space-y-2">
            <Label>How Urgent?</Label>
            <Select
              value={formData.urgency}
              onValueChange={(value) =>
                setFormData({
                  ...formData,
                  urgency: value as typeof formData.urgency,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select urgency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="immediate">Immediate (ASAP)</SelectItem>
                <SelectItem value="within_24_hours">Within 24 hours</SelectItem>
                <SelectItem value="within_2_days">Within 2 days</SelectItem>
                <SelectItem value="flexible">Flexible timing</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label>Minimum Rating: {formData.minRating.toFixed(1)} stars</Label>
            <Slider
              min={0}
              max={5}
              step={0.5}
              value={[formData.minRating]}
              onValueChange={(value) =>
                setFormData({ ...formData, minRating: value[0] ?? 4.5 })
              }
            />
            <p className="text-xs text-slate-500">
              Providers below this rating will be filtered out
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Detailed Description</Label>
            <Textarea
              id="description"
              required
              rows={4}
              placeholder="Describe the issue in detail. e.g. I have a leaking toilet in the master bathroom that needs fixing ASAP."
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
            />
          </div>

          {/* Preferred Contact Method */}
          <div className="space-y-4">
            <Label>How should we notify you of recommendations?</Label>
            <br />
            <SegmentedControl
              className="mt-2"
              options={[
                {
                  value: "text",
                  label: "Text (SMS)",
                  icon: <MessageSquare className="w-5 h-5" />,
                },
                {
                  value: "phone",
                  label: "Phone Call",
                  icon: <PhoneCall className="w-5 h-5" />,
                },
              ]}
              value={formData.preferredContact}
              onChange={(value) =>
                setFormData({ ...formData, preferredContact: value })
              }
              name="preferredContact"
              aria-label="Preferred contact method"
            />

            {/* Phone Number Input */}
            <div className="relative">
              <Phone
                className={`absolute left-3 top-3.5 w-5 h-5 z-10 pointer-events-none ${userPhoneValidation.error && userPhoneValidation.isTouched ? "text-red-400" : "text-slate-500"}`}
              />
              <Input
                type="tel"
                placeholder="Your phone number for notifications"
                value={userPhoneValidation.value}
                onChange={userPhoneValidation.onChange}
                onBlur={userPhoneValidation.onBlur}
                className={`pl-10 ${
                  userPhoneValidation.error && userPhoneValidation.isTouched
                    ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
                    : ""
                }`}
              />
              {userPhoneValidation.error && userPhoneValidation.isTouched && (
                <p className="text-red-400 text-sm mt-1">
                  {userPhoneValidation.error}
                </p>
              )}
              {userPhoneValidation.isValid &&
                userPhoneValidation.normalized && (
                  <p className="text-emerald-400 text-sm mt-1">
                    Valid: {userPhoneValidation.normalized}
                  </p>
                )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="criteriaSwitch">Additional Criteria</Label>
              <Switch
                id="criteriaSwitch"
                checked={showCriteriaInput}
                onCheckedChange={setShowCriteriaInput}
              />
            </div>
            <p className="text-xs text-slate-500">
              Add specific requirements for the AI to ask providers about (e.g.,
              licensing, availability, pricing)
            </p>
            {showCriteriaInput && (
              <>
                <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex items-start gap-3 text-sm text-blue-300">
                  <AlertCircle className="w-5 h-5 shrink-0 text-blue-400" />
                  <p>
                    The AI will use these criteria when interviewing providers.
                    Be specific about availability, pricing, or qualifications.
                  </p>
                </div>
                <Input
                  type="text"
                  placeholder="e.g. licensed, accepts new patients, background check required"
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
