"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DENY_REASON_COPY,
  DispatchApiError,
  dispatchCall,
  formatWindowMinute,
  generateDispatchPlan,
  getCaseSummary,
  normalizeUsPhone,
  runPreflight,
  type DispatchDeny,
  type DispatchPlanResponse,
  type PreflightResponse,
  type VoicemailPolicy,
} from "@/lib/services/dispatchService";

/**
 * Two-gate dispatch flow (slice 8).
 *
 * Gate 1: generate and review the plan (objective, verbatim disclosure line,
 * must-ask list, shareable context, pre-authorizations, voicemail policy),
 * then run the compliance preflight.
 * Gate 2: a distinct "Approve and dispatch" action, enabled only after the
 * preflight allows, which POSTs the dispatch with userApproved: true.
 */

const VOICEMAIL_OPTIONS: Array<{ value: VoicemailPolicy; label: string }> = [
  { value: "hang_up", label: "Hang up (no message)" },
  { value: "leave_message", label: "Leave a callback message" },
  { value: "retry_later", label: "Hang up and retry later" },
];

interface DispatchFlowProps {
  caseId?: string;
}

export function DispatchFlow({ caseId }: DispatchFlowProps) {
  const router = useRouter();

  const [clientName, setClientName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [callbackNumber, setCallbackNumber] = useState("");
  const [task, setTask] = useState("");
  const [voicemailPolicy, setVoicemailPolicy] =
    useState<VoicemailPolicy>("hang_up");

  const [plan, setPlan] = useState<DispatchPlanResponse | null>(null);
  const [planStale, setPlanStale] = useState(false);
  const [mustAsk, setMustAsk] = useState<string[]>([]);
  const [newQuestion, setNewQuestion] = useState("");
  const [contextText, setContextText] = useState("");
  const [grantedKeys, setGrantedKeys] = useState<string[]>([]);

  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [dispatchDeny, setDispatchDeny] = useState<DispatchDeny | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"plan" | "preflight" | "dispatch" | null>(
    null,
  );
  const [caseTitle, setCaseTitle] = useState<string | null>(null);

  const lastPlannedTask = useRef<string>("");

  // Case-linked entry: prefill the target from the case counterparty.
  useEffect(() => {
    if (!caseId) return;
    let active = true;
    getCaseSummary(caseId)
      .then((found) => {
        if (!active) return;
        setCaseTitle(found.title);
        setContactName((current) => current || found.counterparty_name || "");
        setPhone((current) => current || found.counterparty_phone || "");
      })
      .catch(() => {
        if (active) setError("Case lookup failed - check the case link.");
      });
    return () => {
      active = false;
    };
  }, [caseId]);

  const invalidateForEdit = () => {
    setPlanStale(true);
    setPreflight(null);
    setDispatchDeny(null);
  };

  const regeneratePlan = useCallback(
    async (granted: string[]) => {
      if (!task.trim() || !contactName.trim()) {
        setError("Add the contact name and the task first.");
        return;
      }
      setBusy("plan");
      setError(null);
      setDispatchDeny(null);
      try {
        const nextPlan = await generateDispatchPlan({
          taskDescription: task,
          contactName,
          contactPhone: normalizeUsPhone(phone),
          clientName: clientName || undefined,
          grantedPreAuthorizations: granted,
          caseId,
        });
        setPlan(nextPlan);
        setMustAsk(nextPlan.mustAsk);
        setContextText((current) => current || nextPlan.caseContext || "");
        setPlanStale(false);
        lastPlannedTask.current = task;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Plan generation failed.");
      } finally {
        setBusy(null);
      }
    },
    [task, contactName, phone, clientName, caseId],
  );

  const handleGeneratePlan = () => {
    setPreflight(null);
    void regeneratePlan(grantedKeys);
  };

  // Editing the task regenerates the plan (on blur, once a plan exists).
  const handleTaskBlur = () => {
    if (plan && task.trim() && task !== lastPlannedTask.current) {
      setPreflight(null);
      void regeneratePlan(grantedKeys);
    }
  };

  const togglePreAuth = (key: string) => {
    const next = grantedKeys.includes(key)
      ? grantedKeys.filter((k) => k !== key)
      : [...grantedKeys, key];
    setGrantedKeys(next);
    // Granting changes the plan (prompt content), not the policy result, so
    // the preflight outcome stays valid while the plan re-renders.
    void regeneratePlan(next);
  };

  const handlePreflight = async () => {
    if (!plan) return;
    setBusy("preflight");
    setError(null);
    setDispatchDeny(null);
    try {
      const result = await runPreflight({
        phoneNumber: normalizeUsPhone(phone),
        taskType: plan.taskAnalysis.taskType,
        contactName,
        clientName: clientName || undefined,
        callbackNumber: callbackNumber
          ? normalizeUsPhone(callbackNumber)
          : undefined,
      });
      setPreflight(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preflight failed.");
    } finally {
      setBusy(null);
    }
  };

  const handleApproveDispatch = async () => {
    if (!plan || !preflight?.allow) return;
    setBusy("dispatch");
    setError(null);
    setDispatchDeny(null);
    try {
      const granted = (plan.generatedPrompt.preAuthorizations ?? [])
        .filter((auth) => grantedKeys.includes(auth.key))
        .map((auth) => ({ key: auth.key, value: auth.description }));
      const result = await dispatchCall({
        contactName,
        phoneNumber: normalizeUsPhone(phone),
        objective: plan.taskAnalysis.intent,
        context: contextText,
        mustAsk,
        clientName: clientName || undefined,
        callbackNumber: callbackNumber
          ? normalizeUsPhone(callbackNumber)
          : undefined,
        voicemailPolicy,
        taskType: plan.taskAnalysis.taskType,
        userApproved: true,
        grantedPreAuthorizations: granted,
        caseId,
      });
      if ("callId" in result) {
        router.push(`/dispatch/${result.callId}`);
        return;
      }
      setError("Unexpected response from dispatch.");
    } catch (err) {
      if (err instanceof DispatchApiError && err.deny) {
        setDispatchDeny(err.deny);
      } else {
        setError(err instanceof Error ? err.message : "Dispatch failed.");
      }
    } finally {
      setBusy(null);
    }
  };

  const preAuths = plan?.generatedPrompt.preAuthorizations ?? [];
  const approveEnabled =
    !!plan && !planStale && !!preflight?.allow && busy === null;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Dispatch a call"
        description="Review the plan, pass the compliance preflight, then approve. Two gates, no surprises."
      />

      {caseId && (
        <div
          data-testid="dispatch-case-link"
          className="bg-primary-500/10 border border-primary-500/30 rounded-xl px-4 py-3 text-sm text-slate-200"
        >
          Linked to case:{" "}
          <Link
            href={`/cases/${caseId}`}
            className="text-primary-400 underline underline-offset-2"
          >
            {caseTitle ?? caseId}
          </Link>{" "}
          - the call attaches to this case timeline automatically.
        </div>
      )}

      {/* Task input */}
      <div className="bg-surface p-6 rounded-2xl border border-surface-highlight shadow-xl space-y-4">
        <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
          1. Describe the task
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dispatch-client-name">Your name</Label>
            <Input
              id="dispatch-client-name"
              data-testid="dispatch-client-name"
              placeholder="e.g. Jordan Lee"
              value={clientName}
              onChange={(e) => {
                setClientName(e.target.value);
                invalidateForEdit();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dispatch-contact-name">Who to call</Label>
            <Input
              id="dispatch-contact-name"
              data-testid="dispatch-contact-name"
              placeholder="e.g. Acme Appliances"
              value={contactName}
              onChange={(e) => {
                setContactName(e.target.value);
                invalidateForEdit();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dispatch-phone">Target phone number</Label>
            <Input
              id="dispatch-phone"
              data-testid="dispatch-phone"
              type="tel"
              placeholder="(864) 555-0101"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                invalidateForEdit();
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dispatch-callback">Callback number (optional)</Label>
            <Input
              id="dispatch-callback"
              data-testid="dispatch-callback"
              type="tel"
              placeholder="(864) 555-0199"
              value={callbackNumber}
              onChange={(e) => {
                setCallbackNumber(e.target.value);
                invalidateForEdit();
              }}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="dispatch-task">What should the agent accomplish?</Label>
          <Textarea
            id="dispatch-task"
            data-testid="dispatch-task"
            rows={3}
            placeholder="e.g. Request a refund for the broken dryer delivered on June 20."
            value={task}
            onChange={(e) => {
              setTask(e.target.value);
              invalidateForEdit();
            }}
            onBlur={handleTaskBlur}
          />
        </div>
        <button
          type="button"
          data-testid="dispatch-generate-plan"
          onClick={handleGeneratePlan}
          disabled={busy !== null || !task.trim() || !contactName.trim()}
          className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy === "plan"
            ? "Generating plan..."
            : plan
              ? "Regenerate plan"
              : "Generate plan"}
        </button>
      </div>

      {/* Gate 1: plan review */}
      {plan && (
        <div
          data-testid="dispatch-plan"
          className="bg-surface p-6 rounded-2xl border border-surface-highlight shadow-xl space-y-5"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              2. Review the plan (Gate 1)
            </h2>
            {planStale && (
              <span className="text-xs text-amber-400">
                Inputs changed - regenerate the plan before dispatching.
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Objective
              </span>
              <p data-testid="plan-objective" className="text-slate-200">
                {plan.taskAnalysis.intent}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Task type: {plan.taskAnalysis.taskType} - difficulty:{" "}
                {plan.taskAnalysis.difficulty} - playbook:{" "}
                {plan.playbookId ?? "core only"}
              </p>
            </div>
            <div>
              <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Target
              </span>
              <p data-testid="dispatch-target" className="text-slate-200">
                {contactName} - {normalizeUsPhone(phone)}
              </p>
              {caseId && (
                <p className="text-xs text-slate-500 mt-1">
                  Case-linked dispatch: outcome attaches to the case timeline.
                </p>
              )}
            </div>
          </div>

          <div>
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              Opening disclosure (said verbatim)
            </span>
            <blockquote
              data-testid="disclosure-line"
              className="border-l-4 border-primary-500 pl-4 py-2 text-slate-200 text-sm bg-surface-highlight/40 rounded-r-lg"
            >
              {plan.generatedPrompt.disclosureLine}
            </blockquote>
          </div>

          <div>
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Must-ask before hanging up
            </span>
            <ul className="space-y-1">
              {mustAsk.map((question, index) => (
                <li
                  key={`${question}-${index}`}
                  data-testid="must-ask-item"
                  className="flex items-center gap-2 text-sm text-slate-200"
                >
                  <span className="text-primary-400 font-bold">{index + 1}.</span>
                  <span className="flex-1">{question}</span>
                  <button
                    type="button"
                    aria-label={`Remove question ${index + 1}`}
                    onClick={() =>
                      setMustAsk(mustAsk.filter((_, i) => i !== index))
                    }
                    className="text-xs text-slate-500 hover:text-red-400"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 mt-2">
              <Input
                data-testid="must-ask-new"
                placeholder="Add another must-ask question"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
              />
              <button
                type="button"
                data-testid="must-ask-add"
                onClick={() => {
                  if (newQuestion.trim()) {
                    setMustAsk([...mustAsk, newQuestion.trim()]);
                    setNewQuestion("");
                  }
                }}
                className="px-4 py-2 text-sm bg-surface-highlight hover:bg-surface-highlight/70 text-slate-200 rounded-xl"
              >
                Add
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dispatch-context">
              Shareable context (the agent may reveal this)
            </Label>
            <Textarea
              id="dispatch-context"
              data-testid="dispatch-context"
              rows={4}
              placeholder="Facts the agent may share on the call."
              value={contextText}
              onChange={(e) => setContextText(e.target.value)}
            />
          </div>

          <div>
            <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              Pre-authorizations (all OFF until you grant them)
            </span>
            {preAuths.length === 0 ? (
              <p className="text-sm text-slate-500">
                None apply to this playbook. The agent cannot commit to
                anything beyond the objective.
              </p>
            ) : (
              <ul className="space-y-2">
                {preAuths.map((auth) => (
                  <li key={auth.key} className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id={`preauth-${auth.key}`}
                      data-testid={`preauth-${auth.key}`}
                      checked={grantedKeys.includes(auth.key)}
                      onChange={() => togglePreAuth(auth.key)}
                      className="mt-1 h-4 w-4 accent-primary-500"
                    />
                    <label
                      htmlFor={`preauth-${auth.key}`}
                      className="text-sm text-slate-200 cursor-pointer"
                    >
                      <span className="font-semibold">{auth.key}</span>
                      <span className="block text-slate-400">
                        {auth.description}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-2 max-w-sm">
            <Label htmlFor="voicemail-policy">If voicemail answers</Label>
            <select
              id="voicemail-policy"
              data-testid="voicemail-policy"
              value={voicemailPolicy}
              onChange={(e) =>
                setVoicemailPolicy(e.target.value as VoicemailPolicy)
              }
              className="w-full bg-surface-highlight border border-surface-highlight rounded-xl px-3 py-2 text-sm text-slate-200"
            >
              {VOICEMAIL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* Compliance preflight */}
          <div className="border-t border-surface-highlight pt-4 space-y-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                data-testid="run-preflight"
                onClick={handlePreflight}
                disabled={busy !== null || planStale}
                className="px-5 py-2.5 bg-surface-highlight hover:bg-surface-highlight/70 text-slate-100 font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy === "preflight"
                  ? "Running preflight..."
                  : "Run compliance preflight"}
              </button>
              <span className="text-xs text-slate-500">
                Runs the policy engine without dialing anything.
              </span>
            </div>

            {preflight && (
              <div
                data-testid="preflight-result"
                className={
                  preflight.allow
                    ? "bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 space-y-2"
                    : "bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-2"
                }
              >
                {preflight.allow ? (
                  <p
                    data-testid="preflight-allow"
                    className="text-sm font-bold text-emerald-300"
                  >
                    Preflight passed - dispatch is allowed.
                  </p>
                ) : (
                  <div data-testid="preflight-deny" className="space-y-1">
                    <p className="text-sm font-bold text-red-300">
                      Preflight denied - dispatch is blocked.
                    </p>
                    <ul className="space-y-1">
                      {preflight.reasons.map((reason) => (
                        <li
                          key={reason}
                          data-testid="deny-reason"
                          className="text-sm text-red-200"
                        >
                          {DENY_REASON_COPY[reason] ?? reason}
                        </li>
                      ))}
                    </ul>
                    {preflight.reasons.includes("quiet_hours") && (
                      <p
                        data-testid="quiet-hours-window"
                        className="text-sm text-red-200"
                      >
                        Next allowed window:{" "}
                        {formatWindowMinute(preflight.quietHoursWindow.startMinute)}{" "}
                        to{" "}
                        {formatWindowMinute(preflight.quietHoursWindow.endMinute)}{" "}
                        at the destination.
                      </p>
                    )}
                  </div>
                )}
                <div className="text-xs text-slate-400 space-y-1">
                  <p data-testid="recording-mode">
                    Recording mode: {preflight.recordingMode.replace(/_/g, " ")}
                  </p>
                  <p data-testid="redial-status">
                    Redial guard:{" "}
                    {preflight.redialBlocked
                      ? "blocked - this number was called in the last 24 hours"
                      : "clear"}
                  </p>
                  <p>
                    Calling window:{" "}
                    {formatWindowMinute(preflight.quietHoursWindow.startMinute)}{" "}
                    to {formatWindowMinute(preflight.quietHoursWindow.endMinute)}{" "}
                    callee local time - policy {preflight.policyVersion}
                  </p>
                </div>
                {preflight.disclosureLines.length > 0 && (
                  <div>
                    <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Required disclosures (opened in this order)
                    </span>
                    <ol className="list-decimal list-inside space-y-0.5">
                      {preflight.disclosureLines.map((line) => (
                        <li
                          key={line}
                          data-testid="preflight-disclosure"
                          className="text-xs text-slate-300"
                        >
                          {line}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Gate 2 */}
          <div className="border-t border-surface-highlight pt-4 space-y-3">
            <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
              3. Approve and dispatch (Gate 2)
            </h2>
            <button
              type="button"
              data-testid="approve-dispatch"
              onClick={handleApproveDispatch}
              disabled={!approveEnabled}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === "dispatch" ? "Dispatching..." : "Approve and dispatch"}
            </button>
            {!preflight?.allow && (
              <p className="text-xs text-slate-500">
                Blocked until the compliance preflight allows this call.
              </p>
            )}

            {dispatchDeny && (
              <div
                data-testid="dispatch-deny"
                className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-1"
              >
                <p className="text-sm font-bold text-red-300">
                  Dispatch denied by policy.
                </p>
                <ul className="space-y-1">
                  {dispatchDeny.reasons.map((reason) => (
                    <li
                      key={reason}
                      data-testid="deny-reason"
                      className="text-sm text-red-200"
                    >
                      {DENY_REASON_COPY[reason] ?? reason}
                    </li>
                  ))}
                </ul>
                {dispatchDeny.reasons.includes("quiet_hours") &&
                  dispatchDeny.quietHoursWindow && (
                    <p
                      data-testid="quiet-hours-window"
                      className="text-sm text-red-200"
                    >
                      Next allowed window:{" "}
                      {formatWindowMinute(dispatchDeny.quietHoursWindow.startMinute)}{" "}
                      to{" "}
                      {formatWindowMinute(dispatchDeny.quietHoursWindow.endMinute)}{" "}
                      at the destination.
                    </p>
                  )}
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div
          data-testid="dispatch-error"
          className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-200"
        >
          {error}
        </div>
      )}
    </div>
  );
}
