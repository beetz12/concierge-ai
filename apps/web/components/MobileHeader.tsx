"use client";

import Link from "next/link";
import { Menu, Sparkles } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

export function MobileHeader() {
  const { setOpenMobile } = useSidebar();

  return (
    <header className="flex md:hidden items-center justify-between px-4 py-3 border-b border-surface-highlight bg-sidebar">
      <Link href="/" className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 font-bold text-primary-950 shadow-lg shadow-primary-500/30">
          <Sparkles className="h-4 w-4" />
        </div>
        <span className="text-base font-semibold tracking-tight text-slate-100">
          ConciergeAI
        </span>
      </Link>
      <button
        onClick={() => setOpenMobile(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-surface-highlight transition-colors"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>
    </header>
  );
}
