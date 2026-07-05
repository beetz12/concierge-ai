import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";

/**
 * Public marketing layout — full-bleed, no authenticated app shell.
 *
 * The root <body> is `overflow-hidden`, so the marketing surface provides its
 * OWN scroll container (`min-h-svh overflow-y-auto`). No AppSidebar, no
 * SplashScreen, no org onboarding — a logged-out visitor lands straight here.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-svh overflow-y-auto bg-abyss text-slate-100">
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}

function MarketingFooter() {
  return (
    <footer className="border-t border-surface-highlight/60 bg-abyss">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-2.5 text-slate-300">
          <span
            aria-hidden
            className="grid h-5 w-5 place-items-center rounded bg-gradient-to-br from-primary-400 to-primary-600 text-xs font-bold text-primary-950"
          >
            ◑
          </span>
          <span className="text-sm font-medium">Concierge</span>
          <span className="text-sm text-slate-400">
            AI that makes your calls
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-400">
          <a href="#product" className="transition-colors hover:text-slate-200">
            Product
          </a>
          <a
            href="#how-it-works"
            className="transition-colors hover:text-slate-200"
          >
            How it works
          </a>
          <Link href="/login" className="transition-colors hover:text-slate-200">
            Sign in
          </Link>
          <Link
            href="/register"
            className="transition-colors hover:text-slate-200"
          >
            Start free
          </Link>
          <Link
            href="/legal/privacy"
            className="transition-colors hover:text-slate-200"
          >
            Privacy
          </Link>
          <Link
            href="/legal/terms"
            className="transition-colors hover:text-slate-200"
          >
            Terms
          </Link>
        </div>

        <p className="text-xs text-slate-400">
          &copy; {new Date().getFullYear()} Concierge. All calls recorded &amp;
          disclosed.
        </p>
      </div>
    </footer>
  );
}
