"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import {
  DENY_REASON_COPY,
  DispatchApiError,
  attachCallToCase,
  dispatchCall,
  getCallArtifacts,
  getCallStatus,
  listCases,
  terminalLabel,
  type CallArtifactsResponse,
  type CallStatusResponse,
  type CaseSummary,
} from "@/lib/services/dispatchService";

/**
 * Live status + artifacts view for a dispatched call (slice 8).
 *
 * Polls the normalized status until a terminal state (completed, voicemail,
 * no answer, error), then renders artifacts: recording player, transcript,
 * structured outcome with must-ask answers, and cost/duration. Includes the
 * retry affordance (offering an SMS channel switch when the redial guard
 * blocks) and one-click attach-to-case.
 */

const POLL_INTERVAL_MS = 1200;

const TERMINAL_HINTS: Record<string, string> = {
  Completed: "The call finished and every gate was honored.",
  Voicemail: "Voicemail answered. Review the message that was left below.",
  "No answer": "Nobody picked up. Retry later or switch channels.",
  Error: "The call could not be completed. Retry or switch channels.",
  Cancelled: "The call was cancelled before completion.",
};

interface DispatchLiveViewProps {
  callId: string;
}

export function DispatchLiveView({ callId }: DispatchLiveViewProps) {
  const [status, setStatus] = useState<CallStatusResponse | null>(null);
  const [artifacts, setArtifacts] = useState<CallArtifactsResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [retryBusy, setRetryBusy] = useState(false);
  const [redialBlocked, setRedialBlocked] = useState(false);
  const [smsSent, setSmsSent] = useState<string | null>(null);
  const [retriedCallId, setRetriedCallId] = useState<string | null>(null);

  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [selectedCase, setSelectedCase] = useState("");
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachedCaseId, setAttachedCaseId] = useState<string | null>(null);

  // Poll status until terminal.
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const next = await getCallStatus(callId);
        if (!active) return;
        setStatus(next);
        setAttachedCaseId((current) => current ?? next.caseId);
        if (!next.completed) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (!active) return;
        if (err instanceof DispatchApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError(err instanceof Error ? err.message : "Status poll failed.");
          timer = setTimeout(poll, POLL_INTERVAL_MS * 2);
        }
      }
    };

    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [callId]);

  // Fetch artifacts once terminal (voicemail/completed carry recordings;
  // failed calls still return the structured outcome).
  useEffect(() => {
    if (!status?.completed || artifacts) return;
    let active = true;
    getCallArtifacts(callId)
      .then((next) => {
        if (active) setArtifacts(next);
      })
      .catch(() => {
        if (active) setError("Artifacts are not available for this call.");
      });
    return () => {
      active = false;
    };
  }, [status?.completed, artifacts, callId]);

  // Case selector for attach-to-case (only when not already attached).
  useEffect(() => {
    if (attachedCaseId) return;
    let active = true;
    listCases()
      .then((rows) => {
        if (active) setCases(rows);
      })
      .catch(() => {
        /* Case list is optional; attach stays hidden without it. */
      });
    return () => {
      active = false;
    };
  }, [attachedCaseId]);

  const buildRetryBody = useCallback(
    (channel: "voice" | "sms") => {
      const plan = status?.plan;
      if (!plan) return null;
      return {
        contactName: plan.contactName,
        phoneNumber: plan.phoneNumber,
        objective: plan.objective,
        context: plan.context,
        mustAsk: plan.mustAsk,
        clientName: plan.clientName,
        callbackNumber: plan.callbackNumber ?? undefined,
        voicemailPolicy: plan.voicemailPolicy,
        taskType: plan.taskType,
        userApproved: true as const,
        grantedPreAuthorizations: plan.grantedPreAuthorizations,
        caseId: status?.caseId ?? undefined,
        channel,
      };
    },
    [status],
  );

  const handleRetry = async () => {
    const body = buildRetryBody("voice");
    if (!body) return;
    setRetryBusy(true);
    setError(null);
    try {
      const result = await dispatchCall(body);
      if ("callId" in result) {
        setRetriedCallId(result.callId);
      }
    } catch (err) {
      if (
        err instanceof DispatchApiError &&
        err.deny?.reasons.includes("redial_blocked")
      ) {
        setRedialBlocked(true);
      } else {
        setError(err instanceof Error ? err.message : "Retry failed.");
      }
    } finally {
      setRetryBusy(false);
    }
  };

  const handleSmsSwitch = async () => {
    const body = buildRetryBody("sms");
    if (!body) return;
    setRetryBusy(true);
    setError(null);
    try {
      const result = await dispatchCall({
        ...body,
        smsBody: `Message from ${body.clientName ?? "a client"}: ${body.objective}`,
      });
      if ("messageId" in result) {
        setSmsSent(result.messageId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "SMS send failed.");
    } finally {
      setRetryBusy(false);
    }
  };

  const handleAttach = async () => {
    if (!selectedCase) return;
    setAttachBusy(true);
    setError(null);
    try {
      await attachCallToCase(callId, selectedCase);
      setAttachedCaseId(selectedCase);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Attach failed.");
    } finally {
      setAttachBusy(false);
    }
  };

  if (notFound) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <PageHeader
          title="Call not found"
          description="This call id is unknown. It may belong to a previous server session."
        />
        <Link
          href="/dispatch"
          className="text-primary-400 underline underline-offset-2 text-sm"
        >
          Start a new dispatch
        </Link>
      </div>
    );
  }

  const label = status ? terminalLabel(status) : null;
  const outcome = artifacts?.structuredOutcome ?? null;
  const showRetry =
    !!label && label !== "Completed" && label !== "Cancelled" && !retriedCallId;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        title="Live call status"
        description="This view updates itself. Artifacts appear when the call ends."
      />

      {/* Status */}
      <div className="bg-surface p-6 rounded-2xl border border-surface-highlight shadow-xl space-y-3">
        <div className="flex items-center gap-3">
          <span
            data-testid="call-state"
            className="px-3 py-1 rounded-full text-xs font-bold bg-surface-highlight text-slate-200 uppercase tracking-wider"
          >
            {status ? status.state.replace(/_/g, " ") : "loading"}
          </span>
          {!status?.completed && (
            <span className="text-xs text-slate-500 animate-pulse">
              Polling for updates...
            </span>
          )}
        </div>

        {label && (
          <div
            data-testid="call-terminal-state"
            className={
              label === "Completed" || label === "Voicemail"
                ? "bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4"
                : "bg-red-500/10 border border-red-500/30 rounded-xl p-4"
            }
          >
            <p className="text-sm font-bold text-slate-100">{label}</p>
            <p className="text-sm text-slate-300 mt-1">
              {status?.summary ?? TERMINAL_HINTS[label]}
            </p>
          </div>
        )}

        {status?.plan && (
          <p className="text-xs text-slate-500">
            {status.plan.contactName} - {status.plan.phoneNumber} - objective:{" "}
            {status.plan.objective}
          </p>
        )}

        {/* Retry + SMS switch */}
        {showRetry && (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              data-testid="retry-call"
              onClick={handleRetry}
              disabled={retryBusy || redialBlocked}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {retryBusy ? "Working..." : "Retry call (same approved plan)"}
            </button>
            {redialBlocked && !smsSent && (
              <div
                data-testid="redial-blocked-notice"
                className="flex items-center gap-3 text-sm text-amber-200"
              >
                <span>{DENY_REASON_COPY.redial_blocked}</span>
                <button
                  type="button"
                  data-testid="switch-to-sms"
                  onClick={handleSmsSwitch}
                  disabled={retryBusy}
                  className="px-4 py-2 bg-surface-highlight hover:bg-surface-highlight/70 text-slate-100 text-sm font-bold rounded-xl disabled:opacity-50"
                >
                  Send an SMS instead
                </button>
              </div>
            )}
          </div>
        )}
        {smsSent && (
          <p data-testid="sms-sent" className="text-sm text-emerald-300">
            SMS sent (message id {smsSent}). The number stays protected by the
            redial guard.
          </p>
        )}
        {retriedCallId && (
          <p className="text-sm text-emerald-300">
            Retry dispatched.{" "}
            <Link
              href={`/dispatch/${retriedCallId}`}
              className="underline underline-offset-2"
            >
              Follow the new call
            </Link>
            .
          </p>
        )}
      </div>

      {/* Artifacts */}
      {artifacts && (
        <div
          data-testid="call-artifacts"
          className="bg-surface p-6 rounded-2xl border border-surface-highlight shadow-xl space-y-5"
        >
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
            Call artifacts
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Disposition
              </span>
              <span data-testid="artifact-disposition" className="text-slate-200">
                {outcome?.disposition ?? "unknown"}
              </span>
            </div>
            <div>
              <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Cost
              </span>
              <span data-testid="artifact-cost" className="text-slate-200">
                {outcome?.costUsd != null
                  ? `$${outcome.costUsd.toFixed(2)}`
                  : "n/a"}
              </span>
            </div>
            <div>
              <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Duration
              </span>
              <span data-testid="artifact-duration" className="text-slate-200">
                {outcome?.durationSeconds != null
                  ? `${Math.floor(outcome.durationSeconds / 60)}m ${outcome.durationSeconds % 60}s`
                  : "n/a"}
              </span>
            </div>
            <div>
              <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                Summary
              </span>
              <span className="text-slate-200">{outcome?.summary ?? "-"}</span>
            </div>
          </div>

          {artifacts.recordingRef && (
            <div>
              <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Recording
              </span>
              <audio
                data-testid="artifact-audio"
                controls
                src={artifacts.recordingRef}
                className="w-full"
              />
            </div>
          )}

          {(outcome?.mustAskAnswers?.length ?? 0) > 0 && (
            <div>
              <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Must-ask answers
              </span>
              <ul className="space-y-2">
                {outcome?.mustAskAnswers?.map((item) => (
                  <li
                    key={item.question}
                    data-testid="outcome-answer"
                    className="text-sm bg-surface-highlight/40 rounded-lg px-3 py-2"
                  >
                    <span className="block text-slate-400">{item.question}</span>
                    <span className="text-slate-100">{item.answer}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {artifacts.transcript && (
            <div>
              <span className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Transcript
              </span>
              <pre
                data-testid="artifact-transcript"
                className="text-xs text-slate-300 bg-surface-highlight/40 rounded-lg p-4 whitespace-pre-wrap max-h-80 overflow-y-auto"
              >
                {artifacts.transcript}
              </pre>
            </div>
          )}

          {/* Attach to case */}
          <div className="border-t border-surface-highlight pt-4 space-y-3">
            {attachedCaseId ? (
              <p className="text-sm text-emerald-300">
                Attached to case.{" "}
                <Link
                  href={`/cases/${attachedCaseId}`}
                  data-testid="attached-case-link"
                  className="underline underline-offset-2"
                >
                  View the case timeline
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <select
                  data-testid="attach-case-select"
                  value={selectedCase}
                  onChange={(e) => setSelectedCase(e.target.value)}
                  className="bg-surface-highlight border border-surface-highlight rounded-xl px-3 py-2 text-sm text-slate-200 min-w-56"
                >
                  <option value="">Select a case to attach this call</option>
                  {cases.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.title}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid="attach-case-button"
                  onClick={handleAttach}
                  disabled={!selectedCase || attachBusy}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {attachBusy ? "Attaching..." : "Attach to case"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-200">
          {error}
        </div>
      )}
    </div>
  );
}
