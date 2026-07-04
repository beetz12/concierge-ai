import Link from "next/link";

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
    <div className="min-h-svh overflow-y-auto bg-abyss text-slate-100">
      <MarketingNav />
      <main>{children}</main>
      <MarketingFooter />
    </div>
  );
}

function MarketingNav() {
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
          <a href="#product" className="transition-colors hover:text-slate-100">
            Product
          </a>
          <a href="#pricing" className="transition-colors hover:text-slate-100">
            Pricing
          </a>
          <a
            href="#how-it-works"
            className="transition-colors hover:text-slate-100"
          >
            How it works
          </a>
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
        </div>
      </nav>
    </header>
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
          <span className="text-sm text-slate-500">
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
        </div>

        <p className="text-xs text-slate-600">
          &copy; {new Date().getFullYear()} Concierge. All calls recorded &amp;
          disclosed.
        </p>
      </div>
    </footer>
  );
}
