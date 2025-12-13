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
import { Phone, User, MessageSquare, PhoneCall, AlertCircle } from "lucide-react";
import { SegmentedControl } from "@repo/ui/segmented-control";
import { usePhoneValidation } from "@/lib/hooks/usePhoneValidation";
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
// Note: Test phone substitution is handled by backend (ADMIN_TEST_NUMBER in backend .env)
const LIVE_CALL_ENABLED =
  process.env.NEXT_PUBLIC_LIVE_CALL_ENABLED === "true";

export default function DirectTask() {
  const router = useRouter();
  const { addRequest, updateRequest } = useAppContext();

  const [formData, setFormData] = useState({
    clientName: "",
    name: "",
    task: "",
    preferredContact: "text" as "phone" | "text",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Phone validation for provider's phone number
  const phoneValidation = usePhoneValidation();

  // Phone validation for user's contact number
  const userPhoneValidation = usePhoneValidation();

  // Form validity check - all fields required and both phones must be valid
  const isFormValid =
    formData.clientName.trim() !== "" &&
    formData.name.trim() !== "" &&
    formData.task.trim() !== "" &&
    phoneValidation.isValid &&
    userPhoneValidation.isValid;

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
        direct_contact_info: {
          name: formData.name,
          phone: phoneValidation.normalized || phoneValidation.value,
          preferred_contact: formData.preferredContact,
          user_phone: userPhoneValidation.normalized,
        },
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
        directContactInfo: { name: formData.name, phone: phoneValidation.normalized || phoneValidation.value },
      };

      addRequest(newRequest);
      router.push(`/request/${newRequest.id}`);

      // Run Direct Process (pass normalized phone from validation)
      runDirectTask(newRequest.id, formData, phoneValidation.normalized, newRequest);
    } catch (error) {
      console.error("Failed to create request:", error);
      setIsSubmitting(false);
    }
  };

  const runDirectTask = async (
    reqId: string,
    data: typeof formData,
    phone: string,
    request: ServiceRequest,
  ) => {
    try {
      let log: InteractionLog;

      if (LIVE_CALL_ENABLED) {
        // Real VAPI calls - requires valid phone number
        // Phone is already normalized and validated by usePhoneValidation hook
        // Note: Test mode substitution is handled by backend if ADMIN_TEST_NUMBER is set
        const phoneToCall = phone;

        if (!isValidE164Phone(phoneToCall)) {
          console.warn(
            `[Direct] Invalid phone number: ${phoneToCall}`,
          );
          log = {
            timestamp: new Date().toISOString(),
            stepName: `Calling ${data.name}`,
            detail: `Invalid phone number format: ${phoneToCall}`,
            status: "error" as const,
          };
        } else {
          console.log(
            `[Direct] Calling ${data.name} at ${phoneToCall} via VAPI...`,
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
              <Phone className={`absolute left-3 top-3.5 w-5 h-5 ${phoneValidation.error ? "text-red-400" : "text-slate-500"}`} />
              <input
                type="tel"
                required
                placeholder="(555) 123-4567"
                className={`w-full pl-10 pr-4 py-3 rounded-xl border outline-none transition-all bg-abyss text-slate-100 placeholder-slate-600 ${
                  phoneValidation.error
                    ? "border-red-500 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                    : "border-surface-highlight focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                }`}
                value={phoneValidation.value}
                onChange={phoneValidation.onChange}
                onBlur={phoneValidation.onBlur}
              />
            </div>
            {phoneValidation.error && (
              <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {phoneValidation.error}
              </p>
            )}
            {!phoneValidation.error && phoneValidation.value && phoneValidation.isValid && (
              <p className="text-xs text-emerald-400 mt-1.5">
                Valid: {phoneValidation.normalized}
              </p>
            )}
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

        {/* Preferred Contact Method */}
        <div className="space-y-4">
          <label className="block text-sm font-medium text-slate-300">
            How should we notify you of the result?
          </label>
          <SegmentedControl
            options={[
              { value: "text", label: "Text (SMS)", icon: <MessageSquare className="w-5 h-5" /> },
              { value: "phone", label: "Phone Call", icon: <PhoneCall className="w-5 h-5" /> },
            ]}
            value={formData.preferredContact}
            onChange={(value) => setFormData({...formData, preferredContact: value})}
            name="preferredContact"
            aria-label="Preferred contact method"
          />

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

        <button
          type="submit"
          disabled={isSubmitting || !isFormValid}
          className="w-full py-4 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl shadow-lg shadow-primary-500/20 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isSubmitting ? "Initiating Call..." : "Execute Task"}
        </button>
      </form>
    </div>
  );
}
