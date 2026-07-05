import type { Metadata } from "next";
import {
  CounselFlag,
  LEGAL_CONTACT,
  LEGAL_ENTITY_NAME,
  LegalArticle,
  LegalList,
  LegalSection,
} from "../legal-shell";

/**
 * DRAFT — pending attorney review. Not yet in force.
 *
 * Public terms of service for the Concierge product. Static server
 * component; grounded in the actual product behavior (demo funnel, Stripe
 * membership, AI-voiced recorded calls — see docs/compliance/* and
 * docs/launch-readiness.md). The {$LEGAL_ENTITY_NAME} and
 * {$LEGAL_CONTACT_EMAIL} placeholders are substituted before launch.
 */

export const metadata: Metadata = {
  title: "Terms of Service — Concierge",
  description:
    "Draft terms of service for the Concierge AI calling assistant. Pending attorney review.",
};

export default function TermsOfServicePage() {
  return (
    <LegalArticle title="Terms of Service">
      <LegalSection title="Agreement">
        <p>
          These terms are an agreement between you and {LEGAL_ENTITY_NAME}{" "}
          (&quot;Concierge&quot;, &quot;we&quot;, &quot;us&quot;). By using
          the Concierge website, the free demo call, or a paid membership, you
          accept them. If you do not agree, do not use the service.
        </p>
      </LegalSection>

      <LegalSection title="What the service is">
        <p>
          Concierge is an AI assistant that places real phone calls on your
          behalf. You describe the task (for example: screen contractors, ask
          about availability and rates, chase a refund, follow up on a
          dispute), approve the call plan, and the AI places the call and
          returns the recording, transcript, and outcome. Calls are made by an{" "}
          <strong className="text-slate-300">AI-generated voice</strong>, and
          every call discloses at the start that it is an automated call and
          that it may be recorded.
        </p>
      </LegalSection>

      <LegalSection title="Free demo call">
        <LegalList
          items={[
            <>
              <strong className="text-slate-300">
                One free demo call per phone number, ever.
              </strong>{" "}
              The lifetime limit is enforced by keeping a record of numbers
              that have received a demo.
            </>,
            <>
              The demo calls{" "}
              <strong className="text-slate-300">
                only the number you verify you own
              </strong>{" "}
              via the SMS code we text to it. You may not request a demo call
              to someone else&apos;s number.
            </>,
            <>
              <strong className="text-slate-300">US numbers only</strong>{" "}
              (E.164 +1). We may decline, rate-limit, or end any demo call at
              our discretion, including for suspected abuse.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Membership and billing">
        <p>
          Paid memberships are billed as subscriptions through Stripe on the
          plan you select at checkout. Plans renew automatically at the end of
          each billing period until cancelled. You can cancel at any time;
          cancellation takes effect at the end of the current billing period,
          and you keep access until then. Prices and plan limits (such as
          included calls) are shown at checkout and may change with notice
          before your next renewal.
        </p>
        <CounselFlag>
          Confirm refund policy, trial mechanics, price-change notice period,
          and any auto-renewal disclosure requirements (e.g., California ARL)
          for the launch jurisdictions.
        </CounselFlag>
      </LegalSection>

      <LegalSection title="Acceptable use">
        <p>
          You direct the calls, so you are responsible for what you ask the
          service to do. You must not use Concierge to:
        </p>
        <LegalList
          items={[
            <>harass, threaten, defraud, or deceive anyone;</>,
            <>
              place unlawful calls — including calls that would violate
              telemarketing, robocall, or do-not-call laws (such as the TCPA)
              or any recording-consent law;
            </>,
            <>
              call third parties without proper authorization — you may only
              direct calls you have a legitimate, lawful basis to make, and
              you may not represent a business or person you are not
              authorized to represent;
            </>,
            <>
              contact emergency services, or attempt to bypass the
              service&apos;s safety, disclosure, or rate-limiting controls.
            </>,
          ]}
        />
        <p>
          We may suspend or terminate accounts, refuse individual calls, and
          add numbers to our internal do-not-call list at our discretion to
          prevent abuse. Recipients who ask not to be called again are
          suppressed from future calls.
        </p>
      </LegalSection>

      <LegalSection title="Call recording and AI disclosure">
        <p>
          Calls placed through the service{" "}
          <strong className="text-slate-300">may be recorded</strong> and
          transcribed so you receive a verifiable record of the outcome. Every
          call opens with a disclosure that the caller is an automated AI
          assistant and that the call may be recorded. Recordings and
          transcripts are stored privately and made available to the account
          that requested the call. Our handling of this data is described in
          the{" "}
          <a
            href="/legal/privacy"
            className="text-primary-300 underline decoration-primary-500/40 underline-offset-2 hover:text-primary-200"
          >
            Privacy Policy
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="Disclaimers">
        <p>
          The service is provided &quot;as is&quot; and &quot;as
          available&quot;. We do not guarantee any particular call outcome —
          that a business will answer, quote a price, honor a refund, or book
          an appointment — and AI-generated conversation can contain errors.
          Verify important details (prices, appointment times, commitments)
          from the recording and transcript before relying on them. To the
          maximum extent permitted by law, we disclaim all warranties, express
          or implied, including merchantability, fitness for a particular
          purpose, and non-infringement.
        </p>
      </LegalSection>

      <LegalSection title="Limitation of liability">
        <p>
          To the maximum extent permitted by law, {LEGAL_ENTITY_NAME} will not
          be liable for indirect, incidental, special, consequential, or
          punitive damages, or lost profits, arising from your use of the
          service. Our total liability for any claim is capped at the greater
          of the amount you paid us in the twelve months before the claim or
          one hundred US dollars.
        </p>
        <CounselFlag>
          Confirm the liability cap amount and carve-outs (gross negligence,
          willful misconduct, statutory claims that cannot be capped).
        </CounselFlag>
      </LegalSection>

      <LegalSection title="Indemnification">
        <p>
          You will indemnify {LEGAL_ENTITY_NAME} against claims arising from
          your misuse of the service, including calls you direct in violation
          of the acceptable-use rules above or of applicable law.
        </p>
      </LegalSection>

      <LegalSection title="Governing law and disputes">
        <CounselFlag>
          Governing law, venue, arbitration clause (and class-action waiver,
          if any), and small-claims carve-out to be determined by counsel
          before these terms take force.
        </CounselFlag>
      </LegalSection>

      <LegalSection title="Changes and contact">
        <p>
          We may update these terms; material changes will be posted on this
          page with an updated version, and continued use after the effective
          date constitutes acceptance. Questions: contact {LEGAL_ENTITY_NAME}{" "}
          at {LEGAL_CONTACT}. This draft has no effective date — it takes
          force only after attorney review.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
