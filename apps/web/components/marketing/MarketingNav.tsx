"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const SECTION_LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#how-it-works", label: "How it works" },
] as const;

/**
 * Public marketing top nav. Extracted to a client component so it can hold the
 * mobile-menu toggle state. Desktop layout (>=md) is unchanged; on <md a
 * hamburger button exposes the section links plus Sign in / Start free.
 */
export function MarketingNav() {
  const [open, setOpen] = useState(false);

  // Close the mobile menu on Escape.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-surface-highlight/60 bg-abyss/80 backdrop-blur-md">
      <nav
        className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8"
        aria-label="Primary"
      >
        <Link
          href="/"
          className="flex items-center gap-2.5 font-semibold tracking-tight"
        >
          <span
            aria-hidden
            className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-primary-400 to-primary-600 text-sm font-bold text-primary-950"
          >
            ◑
          </span>
          <span className="text-[17px]">Concierge</span>
        </Link>

        <div className="hidden items-center gap-7 text-sm text-slate-400 md:flex">
          {SECTION_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-slate-100"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2.5 text-sm">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-slate-300 transition-colors hover:text-slate-100 sm:inline-block"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-primary-500 px-4 py-2 font-semibold text-primary-950 transition-colors hover:bg-primary-400"
          >
            Start free
          </Link>
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            aria-expanded={open}
            aria-controls="marketing-mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 transition-colors hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 md:hidden"
          >
            {open ? (
              <X className="h-5 w-5" aria-hidden />
            ) : (
              <Menu className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>
      </nav>

      {open && (
        <div
          id="marketing-mobile-menu"
          className="border-t border-surface-highlight/60 bg-abyss/95 px-5 py-3 md:hidden"
        >
          <ul className="flex flex-col gap-1 text-sm">
            {SECTION_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-slate-300 transition-colors hover:bg-surface hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-slate-300 transition-colors hover:bg-surface hover:text-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              >
                Sign in
              </Link>
            </li>
            <li>
              <Link
                href="/register"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 font-semibold text-primary-300 transition-colors hover:bg-surface hover:text-primary-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500"
              >
                Start free
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
