import {
  Phone,
  ReceiptText,
  ShieldAlert,
  Headphones,
  FileText,
  ListChecks,
  Mic,
  CheckCircle2,
  Clock,
  Layers,
} from "lucide-react";
import { PhoneDemo, ProductProof } from "./PhoneDemo";

/**
 * Direction C — "Proof": a product-forward marketing landing for the AI
 * Concierge. Harmonized to the app's Abyssal-Mint (teal) tokens. Reflects the
 * v1 product truth ONLY: an AI that places real, consented, recorded phone
 * calls on the user's behalf to screen contractors, chase refunds, negotiate
 * bills, and resolve disputes — with a two-gate approval before every dial.
 */
export default function MarketingLanding() {
  return (
    <>
      <Hero />
      <TrustStrip />
      <HowItWorks />
      <Features />
      <FinalCta />
    </>
  );
}

function Hero() {
  return (
    <section
      id="product"
      className="relative overflow-hidden px-5 pb-16 pt-14 text-center sm:px-8 sm:pb-20 sm:pt-20"
    >
      {/* Soft teal glow, matching the app's abyss ground. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-20%] mx-auto h-[520px] max-w-4xl bg-[radial-gradient(60%_60%_at_50%_0%,rgba(20,184,166,0.18),transparent_60%)]"
      />
      <div className="relative mx-auto max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary-500/30 bg-primary-500/10 px-3.5 py-1.5 text-[13px] font-semibold text-primary-300">
          <span aria-hidden className="text-primary-400">
            ●
          </span>
          Dispatch a call in 60 seconds
        </span>

        <h1 className="mx-auto mt-5 max-w-[16ch] text-balance text-4xl font-bold leading-[1.05] tracking-tight text-slate-50 sm:text-6xl">
          Dispatch a call. Get the outcome.
        </h1>

        <p className="mx-auto mt-5 max-w-[56ch] text-lg leading-relaxed text-slate-400">
          Describe the job, approve the plan, and watch the AI make the call
          live — with a transcript, recording, and result you can trust, every
          single time.
        </p>

        <div className="mt-8">
          <PhoneDemo />
        </div>
      </div>

      {/* Product hero video: muted autoplay, loops, captions burned in. */}
      <div className="relative mx-auto mt-12 w-full max-w-4xl">
        <video
          className="w-full rounded-2xl border border-surface-highlight shadow-2xl"
          controls
          playsInline
          preload="metadata"
          poster="/hero/concierge-hero-poster.jpg"
          aria-label="AI Concierge demo: describe a call, approve the plan, and the AI dials the contractor live and returns the outcome."
        >
          <source src="/hero/concierge-hero.webm" type="video/webm" />
          <source src="/hero/concierge-hero.mp4" type="video/mp4" />
        </video>
      </div>

      <ProductProof />
    </section>
  );
}

const TRUST_ITEMS = [
  { icon: Mic, label: "Recorded & disclosed" },
  { icon: CheckCircle2, label: "You approve every call" },
  { icon: Clock, label: "TCPA-aware quiet hours & consent" },
  { icon: Layers, label: "Concurrent calling" },
] as const;

function TrustStrip() {
  return (
    <section
      aria-label="Trust and compliance"
      className="border-y border-surface-highlight/60 bg-surface/40"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-surface-highlight/40 sm:grid-cols-4">
        {TRUST_ITEMS.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-2.5 bg-abyss px-4 py-5 sm:px-6"
          >
            <Icon
              className="h-4 w-4 shrink-0 text-primary-400"
              aria-hidden
            />
            <span className="text-sm text-slate-300">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const STEPS = [
  {
    n: "01",
    title: "Describe the task",
    body: '"Call three plumbers, get a quote for a water-heater swap, and find the earliest availability."',
  },
  {
    n: "02",
    title: "Review & approve the plan",
    body: "See who we'll call, what we'll ask, and what we may share. Nothing dials until you approve — that's Gate 2.",
  },
  {
    n: "03",
    title: "AI dials, you get the outcome",
    body: "The AI places the call live. You get the recording, full transcript, and a clean result on the case.",
  },
] as const;

function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24"
    >
      <div className="max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
          How it works
        </h2>
        <p className="mt-3 text-lg text-slate-400">
          Three steps from a task in your head to an outcome you can act on.
        </p>
      </div>

      <ol className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
        {STEPS.map((step) => (
          <li
            key={step.n}
            className="rounded-2xl border border-surface-highlight bg-surface/50 p-6"
          >
            <span className="text-sm font-bold tracking-[0.12em] text-primary-400">
              {step.n}
            </span>
            <h3 className="mt-3 text-lg font-semibold text-slate-100">
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const FEATURES = [
  {
    icon: Phone,
    title: "Contractor screening",
    body: "Vet plumbers, electricians, and pros — availability, rates, licensing — before you commit a dime.",
  },
  {
    icon: ReceiptText,
    title: "Refund & billing disputes",
    body: "Chase refunds and challenge wrong charges. The AI holds the line so you don't have to.",
  },
  {
    icon: ShieldAlert,
    title: "Warranty & complaints",
    body: "Escalate broken products and unresolved issues with a persistent, on-message caller.",
  },
  {
    icon: Headphones,
    title: "Live call supervision",
    body: "Listen in as the call happens and barge in to take over the moment you want to.",
  },
  {
    icon: FileText,
    title: "Recording + transcript + outcome",
    body: "Every call returns a recording, a full transcript, and a structured result — nothing lost.",
  },
  {
    icon: ListChecks,
    title: "Case timelines",
    body: "Group calls into a case and watch the timeline build as each dispute moves toward resolution.",
  },
] as const;

function Features() {
  return (
    <section
      aria-label="Capabilities"
      className="border-t border-surface-highlight/60 bg-surface/30"
    >
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
            Real calls. Real outcomes.
          </h2>
          <p className="mt-3 text-lg text-slate-400">
            The work you dread on the phone, handled end to end.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-surface-highlight bg-abyss p-6 transition-colors hover:border-primary-500/30"
            >
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-500/15 text-primary-300">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold text-slate-100">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section id="pricing" className="px-5 py-16 sm:px-8 sm:py-24">
      <div className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-primary-500/25 bg-gradient-to-br from-surface-elevated to-surface px-6 py-12 text-center sm:px-12 sm:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-64 max-w-2xl bg-[radial-gradient(60%_60%_at_50%_0%,rgba(20,184,166,0.16),transparent_60%)]"
        />
        <div className="relative">
          <h2 className="mx-auto max-w-[18ch] text-balance text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
            Hand off your next hard phone call.
          </h2>
          <p className="mx-auto mt-4 max-w-[48ch] text-lg text-slate-400">
            Start free. Approve the plan, dispatch the call, and get the
            recording, transcript, and outcome back.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="/register"
              className="w-full rounded-xl bg-primary-500 px-7 py-3.5 font-semibold text-primary-950 transition-colors hover:bg-primary-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 sm:w-auto"
            >
              Start free →
            </a>
            <a
              href="/login"
              className="w-full rounded-xl border border-surface-highlight px-7 py-3.5 font-semibold text-slate-200 transition-colors hover:border-primary-500/40 hover:text-slate-50 sm:w-auto"
            >
              Sign in
            </a>
          </div>
          <p className="mt-6 text-xs text-slate-400">
            Every call recorded &amp; disclosed · You approve every call ·
            TCPA-aware
          </p>
        </div>
      </div>
    </section>
  );
}
