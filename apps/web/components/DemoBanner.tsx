"use client";

import { DEMO_MODE } from "@/lib/config/demo";
import { FlaskConical } from "lucide-react";

/**
 * Persistent banner shown at the top of the page when DEMO_MODE is active.
 * Informs users that this is a demo environment with simulated calls.
 */
export function DemoBanner() {
  if (!DEMO_MODE) return null;

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-center gap-2 text-amber-300 text-sm shrink-0">
      <FlaskConical className="w-4 h-4" />
      <span>
        <strong>Demo Mode</strong> — No live calls are being made. All provider
        conversations are AI-simulated.
      </span>
    </div>
  );
}
