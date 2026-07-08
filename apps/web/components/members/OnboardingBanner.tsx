"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PhoneMissed } from "lucide-react";
import { getMemberMe } from "@/lib/services/memberService";

/**
 * Dashboard nudge shown while the org has no dedicated outbound number yet.
 * Silent on load errors: the dashboard must never break because of this.
 */
export function OnboardingBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let mounted = true;
    getMemberMe()
      .then((me) => {
        if (mounted) setShow(!me.dedicatedNumber);
      })
      .catch(() => {
        if (mounted) setShow(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!show) return null;

  return (
    <div className="bg-primary-500/10 border border-primary-500/30 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary-500/15 flex items-center justify-center shrink-0">
          <PhoneMissed className="w-5 h-5 text-primary-400" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-100">
            Get your dedicated calling number
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Your calls will go out from a number that belongs to your
            organization only - finish onboarding to set it up.
          </p>
        </div>
      </div>
      <Link
        href="/onboarding"
        className="shrink-0 px-4 py-2 bg-primary-600 text-white text-sm font-semibold rounded-lg hover:bg-primary-500 transition-colors text-center"
      >
        Finish onboarding
      </Link>
    </div>
  );
}
