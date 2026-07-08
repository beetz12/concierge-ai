import type { ReactNode } from "react";

/**
 * DRAFT — pending attorney review. Not yet in force.
 *
 * Shared shell for the public legal pages (/legal/privacy, /legal/terms).
 * Styled to the marketing surface's Abyssal-Mint tokens (abyss / surface /
 * primary-*). Every legal page renders <DraftBanner /> until counsel signs
 * off; see docs/compliance/open-legal-questions.md for the gating items.
 *
 * The literal placeholder {$LEGAL_ENTITY_NAME} is intentional — it is
 * substituted when the operating entity is formed/confirmed. Do not replace
 * it with a real name without counsel review.
 */

/** Literal placeholder for the operating legal entity. Substituted pre-launch. */
export const LEGAL_ENTITY_NAME = "{$LEGAL_ENTITY_NAME}";

/** Literal placeholder for the privacy/legal contact channel. */
export const LEGAL_CONTACT = "{$LEGAL_CONTACT_EMAIL}";

/** Stamped on each page and recorded with demo-call consent events. */
export const LEGAL_DRAFT_VERSION = "draft-2026-07-04";

export function DraftBanner() {
  return (
    <div
      role="status"
      className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-300"
    >
      DRAFT — pending attorney review. Not yet in force.
    </div>
  );
}

export function LegalArticle({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <article className="mx-auto max-w-3xl px-5 pb-20 pt-12 sm:px-8">
      <DraftBanner />
      <h1 className="mt-8 text-3xl font-bold tracking-tight text-slate-50 sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 text-sm text-slate-400">
        Version {LEGAL_DRAFT_VERSION} · Effective date: not yet in force
      </p>
      <div className="mt-8 space-y-10">{children}</div>
    </article>
  );
}

export function LegalSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-100">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-400">
        {children}
      </div>
    </section>
  );
}

/** Inline callout for items that require counsel sign-off before launch. */
export function CounselFlag({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-surface-highlight bg-surface/50 px-3.5 py-2.5 text-sm text-slate-400">
      <span className="font-semibold text-amber-300">[COUNSEL REVIEW] </span>
      {children}
    </p>
  );
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
