import type { Metadata } from "next";
import { Suspense } from "react";
import { PricingPlans } from "./PricingPlans";

export const metadata: Metadata = {
  title: "Pricing - Concierge",
  description:
    "Start a Concierge membership: a dedicated outbound number plus AI phone calls with recordings, transcripts, and outcomes.",
};

/**
 * Public pricing page (marketing shell). The interactive plan cards live in
 * PricingPlans (client) so checkout can attach the Supabase bearer token.
 */
export default function PricingPage() {
  return (
    <section className="px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-balance text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
            Membership pricing
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-slate-400">
            Every plan includes a dedicated outbound number for your
            organization - calls come from your own number, not a shared pool,
            so your caller reputation stays yours.
          </p>
        </div>

        <Suspense fallback={null}>
          <PricingPlans />
        </Suspense>

        <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-slate-500">
          Prices shown are introductory placeholders - final pricing is
          confirmed on the secure Stripe checkout page. Every call recorded
          &amp; disclosed. You approve every call. TCPA-aware.
        </p>
      </div>
    </section>
  );
}
