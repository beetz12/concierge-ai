"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppContext } from "@/lib/providers/AppProvider";
import {
  InteractionLog,
  RequestStatus,
  RequestType,
  ServiceRequest,
} from "@/lib/types";
import { Phone, User, MessageSquare, PhoneCall } from "lucide-react";
import {
  simulateCall,
  analyzeDirectTask,
} from "@/lib/services/geminiService";
import {
  callProviderLive,
  callResponseToInteractionLog,
  normalizePhoneNumber,
  isValidE164Phone,
} from "@/lib/services/providerCallingService";
import {
  createServiceRequest,
  updateServiceRequest,
  addInteractionLog,
} from "@/lib/actions/service-requests";

// Environment toggle for live VAPI calls vs simulated calls
const LIVE_CALL_ENABLED =
  process.env.NEXT_PUBLIC_LIVE_CALL_ENABLED === "true";

// Admin test mode: Array of test phone numbers for testing
// For direct tasks, uses the first test phone in the array
const ADMIN_TEST_PHONES_RAW = process.env.NEXT_PUBLIC_ADMIN_TEST_PHONES;
const ADMIN_TEST_PHONES = ADMIN_TEST_PHONES_RAW
  ? ADMIN_TEST_PHONES_RAW.split(",").map((p) => p.trim()).filter(Boolean)
  : [];

// Backward compatibility: single test number (deprecated)
const ADMIN_TEST_NUMBER_LEGACY = process.env.NEXT_PUBLIC_ADMIN_TEST_NUMBER;
if (ADMIN_TEST_NUMBER_LEGACY && ADMIN_TEST_PHONES.length === 0) {
  ADMIN_TEST_PHONES.push(ADMIN_TEST_NUMBER_LEGACY);
}

const isAdminTestMode = ADMIN_TEST_PHONES.length > 0;
// For direct tasks, use the first test phone
const ADMIN_TEST_NUMBER = ADMIN_TEST_PHONES[0] || null;

export default function DirectTask() {
  const router = useRouter();
  const { addRequest, updateRequest } = useAppContext();

  const [formData, setFormData] = useState({
    clientName: "",
    name: "",
    phone: "",
    task: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Create request in database first to get proper UUID
      const dbRequest = await createServiceRequest({
        type: "DIRECT_TASK",
        title: `Call ${formData.name}`,
        description: formData.task,
        criteria: "Complete the user's objective",
        status: "CALLING",
      });

      const newRequest: ServiceRequest = {
        id: dbRequest.id,
        type: RequestType.DIRECT_TASK,
        title: `Call ${formData.name}`,
        description: formData.task,
        criteria: "Complete the user's objective",
        status: RequestStatus.CALLING,
        createdAt: dbRequest.created_at,
        providersFound: [],
        interactions: [],
        directContactInfo: { name: formData.name, phone: formData.phone },
      };

      addRequest(newRequest);
      router.push(`/request/${newRequest.id}`);

      // Run Direct Process
      runDirectTask(newRequest.id, formData, newRequest);
    } catch (error) {
      console.error("Failed to create request:", error);
      setIsSubmitting(false);
    }
  };

  const runDirectTask = async (
    reqId: string,
    data: typeof formData,
    request: ServiceRequest,
  ) => {
    try {
      let log: InteractionLog;

      if (LIVE_CALL_ENABLED) {
        // Real VAPI calls - requires valid phone number
        // In admin test mode, override with the test number
        const phoneToCall = isAdminTestMode
          ? normalizePhoneNumber(ADMIN_TEST_NUMBER!)
          : normalizePhoneNumber(data.phone);

        if (!isValidE164Phone(phoneToCall)) {
          console.warn(
            `[Direct] Invalid phone number: ${isAdminTestMode ? ADMIN_TEST_NUMBER : data.phone} -> ${phoneToCall}`,
          );
          log = {
            timestamp: new Date().toISOString(),
            stepName: `Calling ${data.name}`,
            detail: `Invalid phone number format: ${data.phone}`,
            status: "error" as const,
          };
        } else {
          const testModeLabel = isAdminTestMode ? " (TEST MODE)" : "";
          console.log(
            `[Direct] Calling ${data.name} at ${phoneToCall} via VAPI...${testModeLabel}`,
          );

          // Analyze task with Gemini to generate dynamic prompt
          console.log(`[Direct] Analyzing task with Gemini...`);
          const taskAnalysis = await analyzeDirectTask(
            data.task,
            data.name,
            phoneToCall,
          );

          if (taskAnalysis) {
            console.log(
              `[Direct] Task analyzed: ${taskAnalysis.taskAnalysis.taskType} (${taskAnalysis.taskAnalysis.difficulty})`,
            );
          } else {
            console.log(
              `[Direct] Task analysis failed, using default prompt`,
            );
          }

          // Make real VAPI call with dynamic prompt (if available)
          const response = await callProviderLive({
            providerName: data.name,
            providerPhone: phoneToCall,
            serviceNeeded: "Direct Task",
            userCriteria: data.task,
            clientName: data.clientName,
            location: "User Direct Request",
            urgency: "immediate",
            serviceRequestId: reqId,
            customPrompt: taskAnalysis?.generatedPrompt,
          });

          // Convert response to InteractionLog format
          log = callResponseToInteractionLog(data.name, response);

          // Save interaction log to database for real-time display
          try {
            await addInteractionLog({
              request_id: reqId,
              step_name: log.stepName,
              detail: log.detail,
              status: log.status,
              transcript: log.transcript,
            });
            console.log(`[Direct] Saved interaction log to database`);
          } catch (dbErr) {
            console.error("[Direct] Failed to save interaction log:", dbErr);
          }

          console.log(
            `[Direct] Call to ${data.name} completed: ${log.status}`,
          );
        }
      } else {
        // Simulated calls via Gemini (existing behavior)
        log = await simulateCall(data.name, data.task, true);
      }

      if (log.status === "success") {
        const outcome = "Call completed successfully.";
        updateRequest(reqId, {
          status: RequestStatus.COMPLETED,
          interactions: [log],
          finalOutcome: outcome,
        });
        // Update database
        await updateServiceRequest(reqId, {
          status: "COMPLETED",
          final_outcome: outcome,
        });
      } else {
        const outcome = "Call did not result in a positive outcome.";
        updateRequest(reqId, {
          status: RequestStatus.FAILED,
          interactions: [log],
          finalOutcome: outcome,
        });
        // Update database
        await updateServiceRequest(reqId, {
          status: "FAILED",
          final_outcome: outcome,
        });
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
          <PhoneCall className="text-primary-400" />
          Direct Task
        </h1>
        <p className="text-slate-400 mt-2">
          Give us a contact and a mission. The AI will make the call for you.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-surface p-8 rounded-2xl border border-surface-highlight shadow-xl space-y-6"
      >
        <div className="mb-6">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Contact Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
              <input
                type="text"
                required
                placeholder="e.g. Dr. Smith"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all bg-abyss text-slate-100 placeholder-slate-600"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
              <input
                type="tel"
                required
                placeholder="(555) 123-4567"
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all bg-abyss text-slate-100 placeholder-slate-600"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            What should the AI do?
          </label>
          <div className="relative">
            <MessageSquare className="absolute left-3 top-3.5 w-5 h-5 text-slate-500" />
            <textarea
              required
              rows={4}
              placeholder="e.g. Call to reschedule my appointment to next Tuesday afternoon."
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all resize-none bg-abyss text-slate-100 placeholder-slate-600"
              value={formData.task}
              onChange={(e) =>
                setFormData({ ...formData, task: e.target.value })
              }
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-4 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl shadow-lg shadow-primary-500/20 transition-all transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? "Initiating Call..." : "Execute Task"}
        </button>
      </form>
    </div>
  );
}
