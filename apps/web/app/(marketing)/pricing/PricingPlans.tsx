"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/providers/AuthProvider";
import {
  createCheckoutSession,
  MemberApiError,
  type PlanId,
} from "@/lib/services/memberService";

interface Plan {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  tagline: string;
  features: string[];
  highlight: boolean;
}

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: "$29",
    period: "/mo",
    tagline: "For the occasional hard phone call.",
    features: [
      "Dedicated outbound number for your org",
      "AI calls with recording, transcript & outcome",
      "Caller identity & voicemail preferences",
      "Call history with structured results",
    ],
    highlight: false,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$99",
    period: "/mo",
    tagline: "For heavy callers, disputes, and screening runs.",
    features: [
      "Everything in Starter",
      "Higher monthly call volume",
      "Concurrent calling for screening runs",
      "Live call supervision & warm transfer",
    ],
    highlight: true,
  },
];

type Notice = { tone: "warn" | "error"; text: string };

export function PricingPlans() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading } = useAuth();
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [notice, setNotice] = useState<Notice | null>(() =>
    searchParams.get("checkout") === "cancelled"
      ? {
          tone: "warn",
          text: "Checkout was cancelled - no charge was made. Start again whenever you are ready.",
        }
      : null,
  );

  const startMembership = async (plan: PlanId) => {
    setNotice(null);
    if (!isAuthenticated) {
      router.push(`/login?redirectTo=${encodeURIComponent("/pricing")}`);
      return;
    }
    setBusy(plan);
    try {
      const origin = window.location.origin;
      const session = await createCheckoutSession({
        plan,
        successUrl: `${origin}/onboarding?welcome=1`,
        cancelUrl: `${origin}/pricing?checkout=cancelled`,
      });
      if (session.url) {
        window.location.assign(session.url);
        return;
      }
      setNotice({
        tone: "error",
        text: "Stripe did not return a checkout link. Please try again.",
      });
    } catch (err) {
      if (err instanceof MemberApiError) {
        if (err.status === 503) {
          setNotice({
            tone: "warn",
            text: "Billing is not configured in this environment - checkout is unavailable.",
          });
        } else if (err.status === 402) {
          setNotice({ tone: "warn", text: err.message });
        } else if (err.status === 401 || err.status === 403) {
          setNotice({
            tone: "warn",
            text: "Sign in with an organization to start a membership.",
          });
        } else {
          setNotice({ tone: "error", text: err.message });
        }
      } else {
        setNotice({
          tone: "error",
          text: "Could not start checkout. Please try again.",
        });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-12">
      {notice && (
        <div
          role="status"
          className={cn(
            "mx-auto mb-8 flex max-w-2xl items-start gap-3 rounded-xl border px-4 py-3 text-sm",
            notice.tone === "warn"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
              : "border-red-500/30 bg-red-500/10 text-red-400",
          )}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{notice.text}</span>
        </div>
      )}

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "relative flex flex-col rounded-2xl border bg-surface/50 p-7",
              plan.highlight
                ? "border-primary-500/40 shadow-xl shadow-primary-500/10"
                : "border-surface-highlight",
            )}
          >
            {plan.highlight && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary-500 px-3 py-1 text-xs font-bold text-primary-950">
                Most popular
              </span>
            )}
            <h2 className="text-lg font-semibold text-slate-100">
              {plan.name}
            </h2>
            <p className="mt-1 text-sm text-slate-400">{plan.tagline}</p>
            <p className="mt-4">
              <span className="text-4xl font-bold tracking-tight text-slate-50">
                {plan.price}
              </span>
              <span className="text-sm text-slate-400">{plan.period}</span>
            </p>
            <ul className="mt-6 flex-1 space-y-3">
              {plan.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2.5 text-sm text-slate-300"
                >
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary-400"
                    aria-hidden
                  />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              type="button"
              data-testid={`start-membership-${plan.id}`}
              onClick={() => startMembership(plan.id)}
              disabled={busy !== null || isLoading}
              className={cn(
                "mt-8 w-full rounded-xl px-5 py-3 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                plan.highlight
                  ? "bg-primary-500 text-primary-950 hover:bg-primary-400"
                  : "border border-surface-highlight text-slate-200 hover:border-primary-500/40 hover:text-slate-50",
              )}
            >
              {busy === plan.id ? "Opening checkout..." : "Start membership"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
