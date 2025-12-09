"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/lib/providers/AppProvider";
import { RequestStatus, RequestType, ServiceRequest } from "@/lib/types";
import { Search, MapPin, AlertCircle, Sparkles } from "lucide-react";
import {
  simulateCall,
  selectBestProvider,
  scheduleAppointment,
} from "@/lib/services/geminiService";
import { searchProviders as searchProvidersWorkflow } from "@/lib/services/workflowService";
import {
  callProviderLive,
  callResponseToInteractionLog,
  normalizePhoneNumber,
  isValidE164Phone,
} from "@/lib/services/providerCallingService";

// Environment toggle for live VAPI calls vs simulated calls
const LIVE_CALL_ENABLED =
  process.env.NEXT_PUBLIC_LIVE_CALL_ENABLED === "true";

// Admin test mode: when set, only call first provider using this test number
const ADMIN_TEST_NUMBER = process.env.NEXT_PUBLIC_ADMIN_TEST_NUMBER;
const isAdminTestMode = !!ADMIN_TEST_NUMBER;
import {
  createServiceRequest,
  updateServiceRequest,
} from "@/lib/actions/service-requests";

export default function NewRequest() {
  const router = useRouter();
  const { addRequest, updateRequest } = useAppContext();

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    location: "",
    criteria: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        serviceRequestId: reqId,
      });

      // Map workflow result to match existing format
      const providers = workflowResult.providers.map((p) => ({
        id: p.id,
        name: p.name,
        phone: p.phone,
        rating: p.rating,
        address: p.address,
        reason: p.reason || "",
      }));

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

      console.log(
        `[Concierge] Starting calls to ${providers.length} providers (LIVE_CALL_ENABLED=${LIVE_CALL_ENABLED}, ADMIN_TEST_MODE=${isAdminTestMode})`,
      );

      if (isAdminTestMode) {
        console.log(
          `[Concierge] ADMIN TEST MODE: Will call only first provider using test number ${ADMIN_TEST_NUMBER}`,
        );
      }

      for (const [providerIndex, provider] of providers.entries()) {
        let log;

        if (LIVE_CALL_ENABLED) {
          // Real VAPI calls - requires valid phone number
          if (!provider.phone) {
            console.warn(`[Concierge] Skipping ${provider.name}: no phone number`);
            log = {
              timestamp: new Date().toISOString(),
              stepName: `Calling ${provider.name}`,
              detail: `Skipped: No phone number available`,
              status: "warning" as const,
            };
          } else {
            // Normalize phone to E.164 format
            // In admin test mode, override with the test number
            const phoneToCall = isAdminTestMode
              ? normalizePhoneNumber(ADMIN_TEST_NUMBER!)
              : normalizePhoneNumber(provider.phone);

            if (!isValidE164Phone(phoneToCall)) {
              console.warn(
                `[Concierge] Skipping ${provider.name}: invalid phone ${isAdminTestMode ? ADMIN_TEST_NUMBER : provider.phone} -> ${phoneToCall}`,
              );
              log = {
                timestamp: new Date().toISOString(),
                stepName: `Calling ${provider.name}`,
                detail: `Skipped: Invalid phone number format`,
                status: "warning" as const,
              };
            } else {
              const testModeLabel = isAdminTestMode ? " (TEST MODE)" : "";
              console.log(
                `[Concierge] Calling ${provider.name} at ${phoneToCall} via VAPI...${testModeLabel}`,
              );

              // Make real VAPI call
              const response = await callProviderLive({
                providerName: provider.name,
                providerPhone: phoneToCall,
                serviceNeeded: data.title,
                userCriteria: data.criteria,
                location: data.location,
                urgency: "within_2_days",
                serviceRequestId: reqId,
                providerId: provider.id,
              });

              // Convert response to InteractionLog format
              log = callResponseToInteractionLog(provider.name, response);

              console.log(
                `[Concierge] Call to ${provider.name} completed: ${log.status}`,
              );
            }
          }
        } else {
          // Simulated calls via Gemini (existing behavior)
          log = await simulateCall(
            provider.name,
            `${data.description}. Criteria: ${data.criteria}`,
            false,
          );
        }

        callLogs.push(log);
        updateRequest(reqId, {
          interactions: [searchLog, ...callLogs],
        });

        // Admin test mode: stop after first provider call
        if (isAdminTestMode && providerIndex === 0) {
          console.log(
            "[Concierge] ADMIN TEST MODE: Stopping after first provider call",
          );
          break;
        }

        // Small delay between calls
        await new Promise((r) => setTimeout(r, LIVE_CALL_ENABLED ? 2000 : 1000));
      }

      // 3. Analyze
      await updateStatus("ANALYZING");
      const analysis = await selectBestProvider(
        data.title,
        callLogs,
        providers,
      );

      const finalLogs = [
        ...callLogs,
        {
          timestamp: new Date().toISOString(),
          stepName: "Analysis & Selection",
          detail: analysis.reasoning,
          status: analysis.selectedId ? "success" : "warning",
        } as any,
      ];

      updateRequest(reqId, { interactions: [searchLog, ...finalLogs] });

      if (analysis.selectedId) {
        // 4. Schedule
        const provider = providers.find((p) => p.id === analysis.selectedId);
        if (provider) {
          updateRequest(reqId, { selectedProvider: provider });
          const bookingLog = await scheduleAppointment(
            provider.name,
            data.description,
          );
          const outcome = `Booked with ${provider.name}. ${analysis.reasoning}`;
          updateRequest(reqId, {
            status: RequestStatus.COMPLETED,
            interactions: [searchLog, ...finalLogs, bookingLog],
            finalOutcome: outcome,
          });
          // Update DB with final status and outcome
          await updateServiceRequest(reqId, {
            status: "COMPLETED",
            final_outcome: outcome,
          });
        }
      } else {
        const outcome =
          "Could not find a suitable provider matching all criteria.";
        await updateStatus("FAILED", { finalOutcome: outcome });
        await updateServiceRequest(reqId, { final_outcome: outcome });
      }
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

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Specific Criteria (Important)
          </label>
          <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl mb-3 flex items-start gap-3 text-sm text-blue-300">
            <AlertCircle className="w-5 h-5 shrink-0 text-blue-400" />
            <p>
              The AI will use these criteria when interviewing providers. Be
              specific about rating, availability, or price.
            </p>
          </div>
          <input
            type="text"
            required
            placeholder="e.g. 4.7+ stars, available within 2 days, licensed"
            className="w-full px-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all bg-abyss text-slate-100 placeholder-slate-600"
            value={formData.criteria}
            onChange={(e) =>
              setFormData({ ...formData, criteria: e.target.value })
            }
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
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
