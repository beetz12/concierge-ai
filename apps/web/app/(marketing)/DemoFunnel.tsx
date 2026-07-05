"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Lock,
  PhoneCall,
  PhoneMissed,
  ShieldCheck,
  Sparkles,
  Voicemail,
} from "lucide-react";

/**
 * The self-serve demo funnel for the marketing landing page.
 *
 * Staged flow against /api/v1/demo-funnel/*:
 *   1. scenario — pick a curated scenario (the "custom" tile is a disabled
 *      membership upsell with an accessible tooltip).
 *   2. phone    — US number + privacy disclosure; "Text me a code" doubles
 *      as SMS consent.
 *   3. otp      — 6-digit code, attemptsRemaining feedback, 30s resend timer.
 *   4. calling  — the AI dials the verified number; poll status every ~3s.
 *   5. done     — disposition-appropriate copy + conversion CTA. A repeat
 *      visitor (localStorage convenience flag; the SERVER enforces the
 *      one-call-per-number rule) lands here directly.
 *
 * When the API reports `{ status: "unavailable" }` (feature flag off) the
 * funnel renders a graceful "warming up" state instead.
 */

const DONE_KEY = "concierge_demo_done";
const RESEND_COOLDOWN_SECONDS = 30;
const POLL_INTERVAL_MS = 3000;
const FALLBACK_UNAVAILABLE =
  "Live demo calls are switching on soon — check back shortly.";

const US_PHONE_E164 = /^\+1\d{10}$/;

/** Best-effort normalization of common US input formats to E.164 (+1XXXXXXXXXX). */
export function toE164(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && US_PHONE_E164.test(raw.trim())) {
    return raw.trim();
  }
  return null;
}

/** Pretty-print an E.164 US number as (XXX) XXX-XXXX for display. */
function formatUsPhone(e164: string): string {
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

interface DemoScenario {
  id: string;
  label: string;
  description: string;
  requiresMembership: boolean;
  enabled: boolean;
}

type DoneKind =
  | "completed"
  | "voicemail"
  | "no_answer"
  | "failed"
  | "already_used"
  | "returning"
  | "unknown";

type Step =
  | { id: "loading" }
  | { id: "unavailable"; message: string }
  | { id: "scenario" }
  | { id: "phone" }
  | { id: "otp" }
  | { id: "calling"; callId: string }
  | { id: "done"; kind: DoneKind };

type ApiData = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

async function postJson(
  path: string,
  body: unknown,
): Promise<{ res: Response; data: ApiData }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as ApiData;
  return { res, data };
}

/** Human wait hint for a 429 response carrying `retryAfter` seconds. */
function rateLimitMessage(data: ApiData): string {
  const base = str(data.message) ?? "Too many requests.";
  const retry = typeof data.retryAfter === "number" ? data.retryAfter : null;
  if (!retry) return base;
  if (retry < 90) return `${base} Try again in about ${retry}s.`;
  const mins = Math.ceil(retry / 60);
  return `${base} Try again in about ${mins} minute${mins === 1 ? "" : "s"}.`;
}

/** Map a terminal call state + disposition to done-step copy. */
function kindFromOutcome(
  state: string | null,
  disposition: string | null,
): DoneKind {
  const d = (disposition ?? "").toLowerCase();
  if (d.includes("voicemail")) return "voicemail";
  if (d.includes("no_answer") || d.includes("no-answer") || d.includes("busy")) {
    return "no_answer";
  }
  if (state === "completed") return "completed";
  return "failed";
}

const setDoneFlag = () => {
  try {
    window.localStorage.setItem(DONE_KEY, "1");
  } catch {
    // Private browsing / storage denied — the server still enforces the limit.
  }
};

export function DemoFunnel() {
  const [step, setStep] = useState<Step>({ id: "loading" });
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [simulatedSms, setSimulatedSms] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);

  const goUnavailable = useCallback((message: unknown) => {
    setStep({ id: "unavailable", message: str(message) ?? FALLBACK_UNAVAILABLE });
  }, []);

  const markDone = useCallback((kind: DoneKind) => {
    setDoneFlag();
    setStep({ id: "done", kind });
  }, []);

  // Mount: returning visitors go straight to the done/CTA state (convenience
  // only — the server is the enforcement); otherwise load the scenario catalog.
  useEffect(() => {
    let done = false;
    try {
      done = window.localStorage.getItem(DONE_KEY) === "1";
    } catch {
      // Storage unavailable — fall through to the live funnel.
    }
    if (done) {
      setStep({ id: "done", kind: "returning" });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v1/demo-funnel/scenarios");
        const data = (await res.json().catch(() => ({}))) as ApiData;
        if (cancelled) return;
        if (data.status === "unavailable" || !res.ok) {
          goUnavailable(data.message);
          return;
        }
        const list = Array.isArray(data.scenarios)
          ? (data.scenarios as DemoScenario[])
          : [];
        if (list.length === 0) {
          goUnavailable(null);
          return;
        }
        setScenarios(list);
        setStep({ id: "scenario" });
      } catch {
        if (!cancelled) goUnavailable(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [goUnavailable]);

  // Resend cooldown ticker.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /** Send (or resend) the OTP. Returns true when a code was sent. */
  const sendCode = useCallback(
    async (e164: string): Promise<boolean> => {
      const { res, data } = await postJson("/api/v1/demo-funnel/otp/send", {
        phoneNumber: e164,
      });
      if (data.status === "unavailable") {
        goUnavailable(data.message);
        return false;
      }
      if (data.status === "already_used") {
        markDone("already_used");
        return false;
      }
      if (res.status === 429) {
        toast.error(rateLimitMessage(data));
        return false;
      }
      if (!res.ok || data.status !== "sent") {
        toast.error(
          str(data.message) ?? "Could not send the verification code. Try again.",
        );
        return false;
      }
      setSimulatedSms(data.simulated === true);
      return true;
    },
    [goUnavailable, markDone],
  );

  /** Dispatch the demo call once the number is verified. */
  const dispatchCall = useCallback(
    async (verificationToken: string): Promise<void> => {
      if (!scenarioId) return;
      const { res, data } = await postJson("/api/v1/demo-funnel/call", {
        verificationToken,
        scenarioId,
      });
      if (data.status === "unavailable") {
        goUnavailable(data.message);
        return;
      }
      if (res.status === 409 || data.status === "already_used") {
        markDone("already_used");
        return;
      }
      if (res.status === 401) {
        setToken(null);
        setOtpInput("");
        setOtpError("Your verification expired — request a new code below.");
        return;
      }
      if (res.status === 202 && typeof data.callId === "string") {
        // The server has burned this number's one demo call — remember that
        // locally so a revisit lands on the done state.
        setDoneFlag();
        setStep({ id: "calling", callId: data.callId });
        return;
      }
      toast.error(
        str(data.message) ?? "Could not start the demo call. Try again shortly.",
      );
    },
    [scenarioId, goUnavailable, markDone],
  );

  const onPhoneSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy) return;
      const e164 = toE164(phoneInput);
      if (!e164) {
        setPhoneError("Enter a valid US phone number.");
        return;
      }
      setPhoneError(null);
      setBusy(true);
      try {
        if (await sendCode(e164)) {
          setPhoneE164(e164);
          setOtpInput("");
          setOtpError(null);
          setToken(null);
          setCooldown(RESEND_COOLDOWN_SECONDS);
          setStep({ id: "otp" });
        }
      } catch {
        toast.error("Network error. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [busy, phoneInput, sendCode],
  );

  const onOtpSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy || !phoneE164) return;

      // Already verified but a previous dispatch failed — just retry the call.
      if (token) {
        setBusy(true);
        try {
          await dispatchCall(token);
        } catch {
          toast.error("Network error. Please try again.");
        } finally {
          setBusy(false);
        }
        return;
      }

      const code = otpInput.trim();
      if (!/^\d{6}$/.test(code)) {
        setOtpError("Enter the 6-digit code from the text message.");
        return;
      }
      setBusy(true);
      setOtpError(null);
      try {
        const { res, data } = await postJson("/api/v1/demo-funnel/otp/verify", {
          phoneNumber: phoneE164,
          code,
        });
        if (data.status === "unavailable") {
          goUnavailable(data.message);
          return;
        }
        if (
          data.status === "verified" &&
          typeof data.verificationToken === "string"
        ) {
          setToken(data.verificationToken);
          await dispatchCall(data.verificationToken);
          return;
        }
        if (res.status === 410 || data.status === "expired") {
          setOtpInput("");
          setOtpError("This code has expired — request a new one below.");
          return;
        }
        if (data.status === "locked") {
          setOtpInput("");
          setOtpError(
            "Too many incorrect attempts. Request a new verification code.",
          );
          return;
        }
        if (data.status === "invalid") {
          const remaining =
            typeof data.attemptsRemaining === "number"
              ? data.attemptsRemaining
              : null;
          setOtpError(
            remaining !== null
              ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
              : "Incorrect code.",
          );
          return;
        }
        setOtpError(str(data.message) ?? "Verification failed. Try again.");
      } catch {
        toast.error("Network error. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [busy, phoneE164, token, otpInput, dispatchCall, goUnavailable],
  );

  const onResend = useCallback(async () => {
    if (!phoneE164 || cooldown > 0 || resending || busy) return;
    setResending(true);
    try {
      if (await sendCode(phoneE164)) {
        setCooldown(RESEND_COOLDOWN_SECONDS);
        setOtpInput("");
        setOtpError(null);
        toast.success("New code sent.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setResending(false);
    }
  }, [phoneE164, cooldown, resending, busy, sendCode]);

  // Poll call status every ~3s while on the calling step.
  const activeCallId = step.id === "calling" ? step.callId : null;
  useEffect(() => {
    if (!activeCallId) return;
    if (!token) {
      markDone("unknown");
      return;
    }
    let cancelled = false;
    let failures = 0;
    const finish = (kind: DoneKind) => {
      if (!cancelled) markDone(kind);
    };
    const tick = async () => {
      try {
        const res = await fetch(
          `/api/v1/demo-funnel/call/${encodeURIComponent(activeCallId)}/status?token=${encodeURIComponent(token)}`,
        );
        const data = (await res.json().catch(() => ({}))) as ApiData;
        if (cancelled) return;
        if (
          data.status === "unavailable" ||
          res.status === 401 ||
          res.status === 403 ||
          res.status === 404
        ) {
          finish("unknown");
          return;
        }
        if (!res.ok) {
          if (++failures >= 4) finish("unknown");
          return;
        }
        failures = 0;
        const state = str(data.state);
        const disposition = str(data.disposition);
        if (
          data.completed === true ||
          state === "completed" ||
          state === "failed" ||
          state === "cancelled"
        ) {
          finish(kindFromOutcome(state, disposition));
        }
      } catch {
        if (!cancelled && ++failures >= 4) finish("unknown");
      }
    };
    void tick();
    const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeCallId, token, markDone]);

  const selectedScenario = scenarios.find((s) => s.id === scenarioId) ?? null;
  const formStepIndex =
    step.id === "scenario" ? 0 : step.id === "phone" ? 1 : step.id === "otp" ? 2 : null;

  return (
    <Tooltip.Provider delayDuration={150}>
      <div className="rounded-2xl border border-surface-highlight bg-surface/60 p-5 text-left shadow-2xl sm:p-6">
        {formStepIndex !== null && (
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Try it — free demo call
            </p>
            <div
              className="flex items-center gap-1.5"
              role="img"
              aria-label={`Step ${formStepIndex + 1} of 3`}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  aria-hidden
                  className={
                    i <= formStepIndex
                      ? "h-1.5 w-5 rounded-full bg-primary-500 transition-colors"
                      : "h-1.5 w-5 rounded-full bg-surface-highlight transition-colors"
                  }
                />
              ))}
            </div>
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {step.id === "loading" && (
              <div className="flex items-center justify-center gap-2.5 py-8 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading the demo…
              </div>
            )}

            {step.id === "unavailable" && (
              <UnavailablePane message={step.message} />
            )}

            {step.id === "scenario" && (
              <ScenarioPane
                scenarios={scenarios}
                selectedId={scenarioId}
                onSelect={setScenarioId}
                onContinue={() => setStep({ id: "phone" })}
              />
            )}

            {step.id === "phone" && (
              <PhonePane
                scenarioLabel={selectedScenario?.label ?? null}
                value={phoneInput}
                onChange={(v) => {
                  setPhoneInput(v);
                  if (phoneError) setPhoneError(null);
                }}
                error={phoneError}
                busy={busy}
                onSubmit={onPhoneSubmit}
                onBack={() => setStep({ id: "scenario" })}
              />
            )}

            {step.id === "otp" && phoneE164 && (
              <OtpPane
                phoneE164={phoneE164}
                value={otpInput}
                onChange={(v) => {
                  setOtpInput(v);
                  if (otpError) setOtpError(null);
                }}
                error={otpError}
                busy={busy}
                verified={token !== null}
                simulatedSms={simulatedSms}
                cooldown={cooldown}
                resending={resending}
                onSubmit={onOtpSubmit}
                onResend={onResend}
                onChangeNumber={() => {
                  setToken(null);
                  setOtpInput("");
                  setOtpError(null);
                  setStep({ id: "phone" });
                }}
              />
            )}

            {step.id === "calling" && phoneE164 && (
              <CallingPane
                phoneE164={phoneE164}
                scenarioLabel={selectedScenario?.label ?? null}
              />
            )}

            {step.id === "done" && <DonePane kind={step.kind} />}
          </motion.div>
        </AnimatePresence>

        {formStepIndex !== null && (
          <p className="mt-4 flex items-center gap-1.5 border-t border-surface-highlight/60 pt-3 text-xs text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>Free demo call · recorded &amp; disclosed · TCPA-aware</span>
          </p>
        )}
      </div>
    </Tooltip.Provider>
  );
}

function UnavailablePane({ message }: { message: string }) {
  return (
    <div>
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/5 px-4 py-3.5">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-amber-200">
            Live demo calls are warming up
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-300/90">
            {message}
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Don&apos;t want to wait?{" "}
        <a
          href="/register"
          className="font-semibold text-primary-300 underline underline-offset-2 hover:text-primary-200"
        >
          Get your own AI concierge →
        </a>
      </p>
    </div>
  );
}

function ScenarioPane({
  scenarios,
  selectedId,
  onSelect,
  onContinue,
}: {
  scenarios: DemoScenario[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onContinue: () => void;
}) {
  return (
    <div>
      <h3 className="text-base font-semibold text-slate-100">
        What should the AI call you about?
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Pick a scenario — your AI concierge calls your phone and role-plays it
        live, so you hear exactly how it sounds.
      </p>

      <div
        className="mt-3 flex flex-col gap-2"
        aria-label="Demo call scenarios"
      >
        {scenarios.map((scenario) => {
          const locked = scenario.requiresMembership || !scenario.enabled;
          if (locked) {
            return (
              <Tooltip.Root key={scenario.id}>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    aria-disabled="true"
                    aria-describedby={`scenario-${scenario.id}-locked`}
                    onClick={(e) => e.preventDefault()}
                    className="w-full cursor-not-allowed rounded-xl border border-surface-highlight/60 bg-abyss/60 px-4 py-3 text-left opacity-70"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                      <Lock
                        className="h-3.5 w-3.5 shrink-0 text-slate-400"
                        aria-hidden
                      />
                      {scenario.label}
                      <span className="ml-auto shrink-0 rounded-full border border-primary-500/30 bg-primary-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-300">
                        Members
                      </span>
                    </span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                      {scenario.description}
                    </span>
                    <span id={`scenario-${scenario.id}-locked`} className="sr-only">
                      Custom scenarios require a paid membership.
                    </span>
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="top"
                    sideOffset={6}
                    className="z-50 max-w-[260px] rounded-lg border border-surface-highlight bg-surface-elevated px-3 py-2 text-xs leading-relaxed text-slate-200 shadow-xl"
                  >
                    Custom scenarios require a paid membership.
                    <Tooltip.Arrow className="fill-surface-elevated" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            );
          }

          const selected = scenario.id === selectedId;
          return (
            <button
              key={scenario.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(scenario.id)}
              className={
                selected
                  ? "w-full rounded-xl border border-primary-500/60 bg-primary-500/10 px-4 py-3 text-left ring-1 ring-primary-500/40 transition-colors"
                  : "w-full rounded-xl border border-surface-highlight bg-abyss px-4 py-3 text-left transition-colors hover:border-primary-500/30"
              }
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                {scenario.label}
                {selected && (
                  <CheckCircle2
                    className="ml-auto h-4 w-4 shrink-0 text-primary-400"
                    aria-hidden
                  />
                )}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-400">
                {scenario.description}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!selectedId}
        onClick={onContinue}
        className="mt-4 w-full rounded-xl bg-primary-500 px-6 py-3.5 font-semibold text-primary-950 transition-colors hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selectedId ? "Continue →" : "Pick a scenario to continue"}
      </button>
    </div>
  );
}

function PhonePane({
  scenarioLabel,
  value,
  onChange,
  error,
  busy,
  onSubmit,
  onBack,
}: {
  scenarioLabel: string | null;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onBack: () => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <h3 className="text-base font-semibold text-slate-100">
        Where should the AI call you?
      </h3>
      {scenarioLabel && (
        <p className="mt-1 text-xs text-slate-400">
          Scenario:{" "}
          <span className="font-semibold text-slate-300">{scenarioLabel}</span>{" "}
          ·{" "}
          <button
            type="button"
            onClick={onBack}
            className="text-primary-300 underline underline-offset-2 hover:text-primary-200"
          >
            Change
          </button>
        </p>
      )}

      <label htmlFor="demo-funnel-phone" className="sr-only">
        Your US phone number
      </label>
      <input
        id="demo-funnel-phone"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="(864) 555-0132"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={busy}
        className="mt-3 w-full rounded-xl border border-surface-highlight bg-surface px-4 py-3.5 text-base tabular-nums text-slate-100 outline-none transition-colors placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
      />

      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        We&apos;ll text a one-time code to this number, then place a single AI
        demo call to it. We don&apos;t sell your personal information and
        it&apos;s kept safe.{" "}
        <Link
          href="/legal/privacy"
          className="text-primary-300 underline underline-offset-2 hover:text-primary-200"
        >
          Privacy policy
        </Link>
      </p>

      {error && (
        <p className="mt-2 text-xs text-rose-300" aria-live="polite">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-6 py-3.5 font-semibold text-primary-950 transition-colors hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {busy ? "Sending…" : "Text me a code"}
      </button>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
        By continuing you agree to receive one verification code by SMS. Msg
        &amp; data rates may apply.
      </p>
    </form>
  );
}

function OtpPane({
  phoneE164,
  value,
  onChange,
  error,
  busy,
  verified,
  simulatedSms,
  cooldown,
  resending,
  onSubmit,
  onResend,
  onChangeNumber,
}: {
  phoneE164: string;
  value: string;
  onChange: (v: string) => void;
  error: string | null;
  busy: boolean;
  verified: boolean;
  simulatedSms: boolean;
  cooldown: number;
  resending: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onResend: () => void;
  onChangeNumber: () => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <h3 className="text-base font-semibold text-slate-100">
        Enter your code
      </h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        We texted a 6-digit code to{" "}
        <span className="font-semibold text-slate-300">
          {formatUsPhone(phoneE164)}
        </span>
        .
      </p>
      {simulatedSms && (
        <p className="mt-1.5 text-[11px] text-amber-300/90">
          Demo environment: the SMS was simulated, not actually sent.
        </p>
      )}

      {verified ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl border border-primary-500/25 bg-primary-500/[0.07] px-3.5 py-3 text-xs text-primary-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Number verified — ready to place your demo call.
        </p>
      ) : (
        <>
          <label htmlFor="demo-funnel-otp" className="sr-only">
            6-digit verification code
          </label>
          <input
            id="demo-funnel-otp"
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="••••••"
            value={value}
            onChange={(e) =>
              onChange(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            disabled={busy}
            className="mt-3 w-full rounded-xl border border-surface-highlight bg-surface px-4 py-3.5 text-center text-2xl tabular-nums tracking-[0.5em] text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
          />
        </>
      )}

      {error && (
        <p className="mt-2 text-xs text-rose-300" aria-live="polite">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || (!verified && value.length !== 6)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 px-6 py-3.5 font-semibold text-primary-950 transition-colors hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {busy
          ? verified
            ? "Dialing…"
            : "Verifying…"
          : verified
            ? "Start my demo call"
            : "Verify & call me"}
      </button>

      <div className="mt-3 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={onResend}
          disabled={cooldown > 0 || resending || busy || verified}
          className="text-primary-300 transition-colors hover:text-primary-200 disabled:cursor-not-allowed disabled:text-slate-500"
        >
          {resending
            ? "Sending…"
            : cooldown > 0
              ? `Resend code in ${cooldown}s`
              : "Resend code"}
        </button>
        <button
          type="button"
          onClick={onChangeNumber}
          disabled={busy}
          className="text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-60"
        >
          Use a different number
        </button>
      </div>
    </form>
  );
}

function CallingPane({
  phoneE164,
  scenarioLabel,
}: {
  phoneE164: string;
  scenarioLabel: string | null;
}) {
  return (
    <div className="py-2 text-center">
      <div className="relative mx-auto grid h-16 w-16 place-items-center">
        <span
          aria-hidden
          className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-500/20"
        />
        <span className="relative grid h-14 w-14 place-items-center rounded-full border border-primary-500/30 bg-primary-500/15 text-primary-300">
          <PhoneCall className="h-6 w-6" aria-hidden />
        </span>
      </div>
      <h3 className="mt-4 text-balance text-lg font-semibold leading-snug text-slate-100">
        Answer your phone — your AI concierge is calling{" "}
        <span className="whitespace-nowrap tabular-nums">
          {formatUsPhone(phoneE164)}
        </span>
      </h3>
      <p className="mt-2 text-xs leading-relaxed text-slate-400">
        {scenarioLabel ? (
          <>
            Scenario:{" "}
            <span className="font-semibold text-slate-300">{scenarioLabel}</span>
            .{" "}
          </>
        ) : null}
        The call opens with a recorded-line disclosure and lasts about 90
        seconds.
      </p>
      <p
        className="mt-4 inline-flex items-center gap-2 text-xs text-slate-400"
        aria-live="polite"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Checking call status…
      </p>
    </div>
  );
}

const DONE_COPY: Record<
  DoneKind,
  { title: string; body: string; icon: React.ComponentType<{ className?: string }> }
> = {
  completed: {
    title: "That was your AI concierge.",
    body: "You just took a real AI-placed call — disclosed, recorded, and done in about a minute. Now imagine it calling contractors, billing departments, and restaurants for you.",
    icon: CheckCircle2,
  },
  voicemail: {
    title: "We reached your voicemail.",
    body: "The demo call landed in voicemail, so the concierge hung up — that was your one free demo trying to reach you. The full product retries and reports back.",
    icon: Voicemail,
  },
  no_answer: {
    title: "We couldn't reach you.",
    body: "Your demo call went unanswered — each number gets one. The full concierge retries at smart times and always reports the outcome back to you.",
    icon: PhoneMissed,
  },
  failed: {
    title: "The call couldn't be completed.",
    body: "Something went wrong on the line. The full product handles retries automatically and always tells you exactly what happened.",
    icon: PhoneMissed,
  },
  already_used: {
    title: "You've already used your free demo",
    body: "Each phone number gets one free demo call. A membership unlocks unlimited calls — including custom scenarios you script yourself.",
    icon: Sparkles,
  },
  returning: {
    title: "You've already tried the demo.",
    body: "Each number gets one free demo call — ready for the real thing? Your own concierge makes unlimited calls on your behalf.",
    icon: Sparkles,
  },
  unknown: {
    title: "Your demo call is on its way.",
    body: "We lost the live status feed, but if your phone rang, that was your concierge. Each number gets one free demo call.",
    icon: PhoneCall,
  },
};

function DonePane({ kind }: { kind: DoneKind }) {
  const copy = DONE_COPY[kind];
  const Icon = copy.icon;
  return (
    <div className="py-1 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-full border border-primary-500/30 bg-primary-500/15 text-primary-300">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <h3 className="mt-3 text-balance text-lg font-semibold leading-snug text-slate-100">
        {copy.title}
      </h3>
      <p className="mx-auto mt-2 max-w-[42ch] text-xs leading-relaxed text-slate-400">
        {copy.body}
      </p>
      <a
        href="/register"
        className="mt-5 block w-full rounded-xl bg-primary-500 px-6 py-3.5 text-center font-semibold text-primary-950 transition-colors hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
      >
        Get your own AI concierge →
      </a>
      <p className="mt-3 text-[11px] text-slate-500">
        Free to start · every call recorded &amp; disclosed · you approve every
        call
      </p>
    </div>
  );
}
