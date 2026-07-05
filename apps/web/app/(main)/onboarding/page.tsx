"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  PartyPopper,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { CallSettingsForm } from "@/components/members/CallSettingsForm";
import { NumberStatusBadge } from "@/components/members/DedicatedNumberCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  formatUsPhone,
  getMemberMe,
  MemberApiError,
  provisionDedicatedNumber,
  type DedicatedNumber,
  type MemberMeResponse,
} from "@/lib/services/memberService";

const STEPS = [
  { n: 1, label: "Dedicated number" },
  { n: 2, label: "Call settings" },
  { n: 3, label: "Done" },
] as const;

export default function OnboardingPage() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <PageHeader
        title="Member onboarding"
        description="Set up your dedicated number and calling preferences."
      />
      <Suspense fallback={<OnboardingSkeleton />}>
        <OnboardingWizard />
      </Suspense>
    </div>
  );
}

function OnboardingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-10 w-full max-w-md bg-slate-700/50 rounded" />
      <div className="bg-surface rounded-2xl border border-surface-highlight p-6 space-y-4">
        <div className="h-6 w-48 bg-slate-700/50 rounded" />
        <div className="h-4 w-full bg-slate-700/50 rounded" />
        <div className="h-4 w-3/4 bg-slate-700/50 rounded" />
        <div className="h-10 w-40 bg-slate-700/50 rounded-lg" />
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-4" aria-label="Onboarding progress">
      {STEPS.map((step, index) => {
        const done = current > step.n;
        const active = current === step.n;
        return (
          <li key={step.n} className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold border",
                  done &&
                    "bg-primary-600 border-primary-500 text-white",
                  active &&
                    "border-primary-500 bg-primary-500/15 text-primary-300",
                  !done &&
                    !active &&
                    "border-surface-highlight bg-surface text-slate-500",
                )}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : step.n}
              </span>
              <span
                className={cn(
                  "text-sm font-medium hidden sm:inline",
                  active ? "text-slate-100" : "text-slate-500",
                )}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "h-px w-6 sm:w-10",
                  done ? "bg-primary-500/60" : "bg-surface-highlight",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function OnboardingWizard() {
  const searchParams = useSearchParams();
  const welcome = searchParams.get("welcome") === "1";

  const [me, setMe] = useState<MemberMeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState(1);
  const [number, setNumber] = useState<DedicatedNumber | null>(null);
  const [simulated, setSimulated] = useState(false);
  const [alreadyProvisioned, setAlreadyProvisioned] = useState(false);

  const [areaCode, setAreaCode] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [provisionError, setProvisionError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);

  useEffect(() => {
    let mounted = true;
    getMemberMe()
      .then((response) => {
        if (!mounted) return;
        setMe(response);
        // Progress is derived from server state, never localStorage: an org
        // that already has a number starts at step 2.
        if (response.dedicatedNumber) {
          setNumber(response.dedicatedNumber);
          setSimulated(response.dedicatedNumber.status === "simulated");
          setStep(2);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setLoadError(
          err instanceof MemberApiError
            ? err.message
            : "Could not load your membership. Please refresh the page.",
        );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleProvision = async () => {
    setProvisionError(null);
    setPaywall(false);
    const trimmed = areaCode.trim();
    if (trimmed && !/^\d{3}$/.test(trimmed)) {
      setProvisionError("Area code must be exactly 3 digits, e.g. 864.");
      return;
    }
    setProvisioning(true);
    try {
      const result = await provisionDedicatedNumber(trimmed || undefined);
      setNumber(result.number);
      setSimulated(result.simulated);
      setAlreadyProvisioned(result.alreadyProvisioned);
      if (result.alreadyProvisioned) {
        // Nothing new to review: skip straight to call settings.
        setStep(2);
      }
    } catch (err) {
      if (err instanceof MemberApiError) {
        if (err.subscriptionRequired) {
          setPaywall(true);
        } else if (err.status === 503) {
          setProvisionError(
            "Number provisioning is not configured in this environment. Try again once telephony is set up.",
          );
        } else {
          setProvisionError(
            `Could not provision a number${err.code ? ` (${err.code})` : ""}. Please try again.`,
          );
        }
      } else {
        setProvisionError("Could not provision a number. Please try again.");
      }
    } finally {
      setProvisioning(false);
    }
  };

  if (loading) return <OnboardingSkeleton />;

  if (loadError) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center">
        <p className="text-red-400 font-medium">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {welcome && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl px-5 py-4 flex items-center gap-3">
          <PartyPopper className="w-5 h-5 text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-300">
            Welcome aboard! Your membership is being activated - let&apos;s get
            you set up. If checkout just finished, activation can take a few
            seconds.
          </p>
        </div>
      )}

      <Stepper current={step} />

      {step === 1 && (
        <section className="bg-surface rounded-2xl border border-surface-highlight shadow-xl p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-500/15 flex items-center justify-center shrink-0">
              <Phone className="w-6 h-6 text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">
                Get your dedicated number
              </h2>
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                Every call the AI places for you goes out from a number that
                belongs to your organization only - never a shared pool.
                Businesses see one consistent caller ID, callbacks reach you,
                and your number&apos;s reputation and deliverability stay
                protected from other people&apos;s calls.
              </p>
            </div>
          </div>

          {!number && !paywall && (
            <>
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="area-code">Preferred area code (optional)</Label>
                <Input
                  id="area-code"
                  data-testid="area-code"
                  inputMode="numeric"
                  maxLength={3}
                  placeholder="e.g. 864"
                  value={areaCode}
                  onChange={(e) =>
                    setAreaCode(e.target.value.replace(/\D/g, "").slice(0, 3))
                  }
                />
                <p className="text-xs text-slate-500">
                  We try to match it; otherwise you get the closest available.
                </p>
              </div>

              {provisionError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-sm text-red-400">
                  {provisionError}
                </div>
              )}

              <button
                type="button"
                data-testid="provision-number"
                onClick={handleProvision}
                disabled={provisioning}
                className="px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {provisioning ? "Getting your number..." : "Get my number"}
              </button>
            </>
          )}

          {paywall && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-amber-300 font-semibold">
                <CreditCard className="w-5 h-5" /> Membership required
              </div>
              <p className="text-sm text-slate-300">
                A dedicated number is a member feature. Start a membership to
                provision yours - it takes under a minute.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/pricing"
                  className="px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-500 transition-colors text-center"
                >
                  View plans &amp; start membership
                </Link>
                <button
                  type="button"
                  onClick={handleProvision}
                  disabled={provisioning}
                  className="px-4 py-2 bg-surface-highlight text-slate-200 text-sm font-semibold rounded-lg hover:bg-surface-highlight/70 transition-colors disabled:opacity-50"
                >
                  {provisioning
                    ? "Checking..."
                    : "I already subscribed - try again"}
                </button>
              </div>
            </div>
          )}

          {number && (
            <div className="space-y-4">
              <div className="bg-abyss border border-primary-500/30 rounded-xl p-5 text-center space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Your dedicated number
                </p>
                <p
                  data-testid="dedicated-number"
                  className="text-3xl font-bold tracking-tight text-slate-50"
                >
                  {formatUsPhone(number.phoneE164)}
                </p>
                <div className="flex justify-center">
                  <NumberStatusBadge status={number.status} />
                </div>
                {simulated && (
                  <p className="text-xs text-amber-400/80">
                    Sandbox number: no real phone line was purchased in this
                    environment.
                  </p>
                )}
                {alreadyProvisioned && (
                  <p className="text-xs text-slate-400">
                    This organization already had a number, so we kept it.
                  </p>
                )}
              </div>
              <button
                type="button"
                data-testid="continue-to-settings"
                onClick={() => setStep(2)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 text-white font-bold rounded-xl transition-all"
              >
                Continue to call settings <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </section>
      )}

      {step === 2 && (
        <section className="bg-surface rounded-2xl border border-surface-highlight shadow-xl p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-500/15 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100">Call settings</h2>
              <p className="text-sm text-slate-400 mt-1">
                How the AI introduces itself, what happens on voicemail, and
                where to hand off if a human is requested. You can change these
                anytime in Settings.
              </p>
            </div>
          </div>

          {number && (
            <p className="text-sm text-slate-400">
              Calling from{" "}
              <span className="font-semibold text-slate-200">
                {formatUsPhone(number.phoneE164)}
              </span>{" "}
              <NumberStatusBadge status={number.status} />
            </p>
          )}

          {me && (
            <CallSettingsForm
              initial={me.settings}
              submitLabel="Save & continue"
              onSaved={() => setStep(3)}
            />
          )}
        </section>
      )}

      {step === 3 && (
        <section className="bg-surface rounded-2xl border border-surface-highlight shadow-xl p-8 text-center space-y-4">
          <div className="mx-auto w-14 h-14 bg-emerald-500/15 rounded-full flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-100">
            You&apos;re all set
          </h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            Your dedicated number is ready and your call settings are saved.
            Dispatch your first call whenever you like.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
            <Link
              href="/dashboard"
              data-testid="go-to-dashboard"
              className="px-5 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-500 transition-colors"
            >
              Go to dashboard
            </Link>
            <Link
              href="/calls"
              className="px-5 py-2.5 bg-surface-highlight text-slate-200 font-semibold rounded-xl hover:bg-surface-highlight/70 transition-colors"
            >
              View call history
            </Link>
            <Link
              href="/settings"
              className="px-5 py-2.5 bg-surface-highlight text-slate-200 font-semibold rounded-xl hover:bg-surface-highlight/70 transition-colors"
            >
              Manage settings
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
