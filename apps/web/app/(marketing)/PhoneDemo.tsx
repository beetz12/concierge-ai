"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Clock, ShieldCheck } from "lucide-react";

/**
 * The interactive hero surface for the marketing landing page:
 *   - a phone-number input + consent checkbox + "Call me" button that POSTs to
 *     the public /api/v1/demo-call endpoint, and
 *   - the product-proof panel (Gate 1 "Review the plan" + Gate 2 live transcript
 *     and outcome) with a simulated, looping transcript.
 *
 * The demo NEVER fakes a placed call: the button reflects the real endpoint
 * response. When the endpoint is unavailable (flag off / no telephony) it shows
 * a graceful "warming up" state; the animated transcript is clearly a preview.
 */

type TranscriptLine = { who: "ai" | "them"; text: string };

const TRANSCRIPT: TranscriptLine[] = [
  {
    who: "ai",
    text:
      "Hi, this is the Concierge AI assistant — quick heads up, I record my calls. " +
      "I'm quoting a 50-gallon water-heater swap?",
  },
  { who: "them", text: "Sure — parts and labor, about twelve-forty installed." },
  { who: "ai", text: "Perfect. Earliest availability?" },
  { who: "them", text: "I've got Thursday at eight." },
];

type SubmitState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "dispatched" }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

const US_PHONE_E164 = /^\+1\d{10}$/;

/** Best-effort normalization of common US input formats to E.164 (+1XXXXXXXXXX). */
function toE164(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+") && US_PHONE_E164.test(raw.trim())) {
    return raw.trim();
  }
  return null;
}

export function PhoneDemo() {
  return (
    <div className="mx-auto w-full max-w-[440px]">
      <DemoForm />
    </div>
  );
}

function DemoForm() {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [submit, setSubmit] = useState<SubmitState>({ status: "idle" });

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const e164 = toE164(phone);
      if (!e164) {
        setSubmit({
          status: "error",
          message: "Enter a valid US phone number.",
        });
        return;
      }
      if (!consent) {
        setSubmit({
          status: "error",
          message: "Please agree to the one-time recorded demo call.",
        });
        return;
      }

      setSubmit({ status: "loading" });
      try {
        const res = await fetch("/api/v1/demo-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phoneNumber: e164, consent: true }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          message?: string;
        };

        if (res.status === 202 || data.status === "dispatched") {
          setSubmit({ status: "dispatched" });
          return;
        }
        if (data.status === "unavailable") {
          setSubmit({
            status: "unavailable",
            message:
              data.message ??
              "Live demo calls are switching on soon - we saved your number.",
          });
          return;
        }
        if (res.status === 429) {
          setSubmit({
            status: "error",
            message:
              data.message ??
              "This number already received a demo call recently.",
          });
          return;
        }
        setSubmit({
          status: "error",
          message: data.message ?? "Something went wrong. Please try again.",
        });
      } catch {
        setSubmit({
          status: "error",
          message: "Network error. Please try again.",
        });
      }
    },
    [phone, consent],
  );

  const busy = submit.status === "loading";
  const done =
    submit.status === "dispatched" || submit.status === "unavailable";

  return (
    <form onSubmit={onSubmit} className="text-left" noValidate>
      <label
        htmlFor="demo-phone"
        className="mb-2 block text-sm text-slate-400"
      >
        Hear it yourself — enter your number for a live demo call.
      </label>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input
          id="demo-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(864) 555-0132"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={busy || done}
          aria-label="Your phone number"
          className="flex-1 rounded-xl border border-surface-highlight bg-surface px-4 py-3.5 text-base tabular-nums text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || done}
          className="rounded-xl bg-primary-500 px-6 py-3.5 font-semibold text-primary-950 transition-colors hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {busy ? "Dialing…" : done ? "Requested" : "Call me →"}
        </button>
      </div>

      <label className="mt-3 flex items-start gap-2.5 text-xs leading-relaxed text-slate-400">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={busy || done}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-surface-highlight bg-surface accent-primary-500"
        />
        <span>
          I agree to receive a one-time automated demo call and to being
          recorded.
        </span>
      </label>

      <p
        className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-500"
        aria-live="polite"
      >
        {submit.status === "dispatched" ? (
          <span className="text-primary-300">
            Ringing you now — pick up and say hello. Recorded &amp; disclosed.
          </span>
        ) : submit.status === "unavailable" ? (
          <span className="text-amber-300">{submit.message}</span>
        ) : submit.status === "error" ? (
          <span className="text-rose-300">{submit.message}</span>
        ) : (
          <>
            <ShieldCheck className="h-3.5 w-3.5 text-slate-500" aria-hidden />
            <span>Free demo call · recorded &amp; disclosed · TCPA-aware</span>
          </>
        )}
      </p>
    </form>
  );
}

/**
 * The product-proof surface: Gate 1 plan review on the left, Gate 2 live
 * transcript + outcome on the right. Rendered below the hero copy.
 */
export function ProductProof() {
  return (
    <div className="mx-auto mt-10 w-full max-w-4xl overflow-hidden rounded-2xl border border-surface-highlight bg-gradient-to-b from-surface-elevated to-surface shadow-2xl">
      <div className="flex items-center gap-2 border-b border-surface-highlight px-4 py-3">
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full bg-surface-highlight"
        />
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full bg-surface-highlight"
        />
        <span
          aria-hidden
          className="h-2.5 w-2.5 rounded-full bg-surface-highlight"
        />
        <span className="ml-2 text-xs text-slate-400">
          Dispatch · New call
        </span>
        <span className="ml-auto rounded-full border border-primary-500/30 bg-primary-500/10 px-2.5 py-1 text-[11px] font-semibold text-primary-300">
          ● Compliance: pass
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2">
        <GateOne />
        <GateTwo />
      </div>
    </div>
  );
}

function GateOne() {
  return (
    <div className="p-5 text-left">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
        Gate 1 — Review the plan
      </p>
      <dl className="space-y-2.5 text-sm text-slate-300">
        <Field label="Call" value="Precision Plumbing, (864) 555-0132" />
        <Field
          label="Objective"
          value="Quote a 50-gal water-heater swap; earliest availability"
        />
        <Field label="May share" value="Greenville 29609 · flexible weekday AM" />
      </dl>

      <div className="mt-4 space-y-2">
        <GateChip icon={<Clock className="h-3.5 w-3.5" aria-hidden />}>
          <b className="text-slate-100">Quiet-hours OK</b>{" "}
          <span className="text-slate-400">· 2:41pm callee-local</span>
        </GateChip>
        <GateChip icon={<Mic className="h-3.5 w-3.5" aria-hidden />}>
          <b className="text-slate-100">Recording disclosed</b>{" "}
          <span className="text-slate-400">· all-party safe</span>
        </GateChip>
      </div>

      <div className="mt-4 w-full rounded-xl bg-primary-500 px-4 py-2.5 text-center text-sm font-semibold text-primary-950">
        Approve &amp; dispatch →
      </div>
    </div>
  );
}

function GateTwo() {
  return (
    <div className="border-t border-surface-highlight p-5 text-left md:border-l md:border-t-0">
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
        Gate 2 — Live call
      </p>
      <LiveTranscript />
      <div className="mt-3 rounded-xl border border-primary-500/25 bg-primary-500/[0.07] px-3.5 py-3 text-xs text-primary-200">
        <b className="text-primary-100">Outcome:</b> Quoted $1,240 installed ·
        earliest Thu 8am · recording + transcript saved to the case.
      </div>
    </div>
  );
}

function LiveTranscript() {
  const [visible, setVisible] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setVisible(TRANSCRIPT.length);
      return;
    }

    let cancelled = false;
    const run = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      setVisible(0);
      TRANSCRIPT.forEach((_, i) => {
        timers.current.push(
          setTimeout(() => {
            if (!cancelled) setVisible(i + 1);
          }, 1000 * (i + 1)),
        );
      });
      // Loop the preview so the surface always feels live.
      timers.current.push(
        setTimeout(run, 1000 * (TRANSCRIPT.length + 3)),
      );
    };
    run();

    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, []);

  return (
    <div
      className="flex min-h-[150px] flex-col gap-2"
      role="log"
      aria-label="Example live call transcript"
    >
      {TRANSCRIPT.slice(0, visible).map((line, i) => (
        <div
          key={i}
          className={
            line.who === "ai"
              ? "max-w-[90%] animate-fadeIn self-start rounded-xl rounded-bl-sm border border-primary-500/25 bg-primary-500/10 px-3 py-2 text-[13px] leading-snug text-primary-100"
              : "max-w-[90%] animate-fadeIn self-end rounded-xl rounded-br-sm border border-surface-highlight bg-surface px-3 py-2 text-[13px] leading-snug text-slate-300"
          }
        >
          {line.text}
        </div>
      ))}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="inline font-semibold text-slate-100">{label}:</dt>{" "}
      <dd className="inline text-slate-300">{value}</dd>
    </div>
  );
}

function GateChip({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-surface-highlight bg-abyss px-3 py-2.5">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary-500/15 text-primary-300">
        {icon}
      </span>
      <span className="text-xs">{children}</span>
    </div>
  );
}
