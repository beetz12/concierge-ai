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
 * Public privacy policy for the Concierge marketing site + product. Static
 * server component; content is grounded in the actual data flows (see
 * docs/compliance/* and docs/launch-readiness.md). The {$LEGAL_ENTITY_NAME}
 * and {$LEGAL_CONTACT_EMAIL} placeholders are substituted before launch.
 */

export const metadata: Metadata = {
  title: "Privacy Policy — Concierge",
  description:
    "Draft privacy policy for the Concierge AI calling assistant. Pending attorney review.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalArticle title="Privacy Policy">
      <LegalSection title="Who we are">
        <p>
          The Concierge service (&quot;Concierge&quot;, &quot;we&quot;,
          &quot;us&quot;) is operated by {LEGAL_ENTITY_NAME}. Concierge is an
          AI assistant that places real, recorded phone calls on your behalf —
          for example to screen contractors, chase refunds, or resolve
          disputes. This policy explains, in plain language, what personal
          information we collect, why, who processes it, and the choices you
          have.
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <LegalList
          items={[
            <>
              <strong className="text-slate-300">Phone number.</strong> The
              number you give us to receive a demo call, and the numbers you
              ask us to call as a member. Numbers are validated as US E.164
              (+1) and stored in our database (Supabase/Postgres).
            </>,
            <>
              <strong className="text-slate-300">
                OTP verification metadata.
              </strong>{" "}
              When you verify a phone number by SMS code, we store the
              verification event: a one-way hash of the code (never the code
              itself), the timestamp, the requesting IP address, and the
              version of the consent disclosure you accepted.
            </>,
            <>
              <strong className="text-slate-300">
                Call recordings and transcripts.
              </strong>{" "}
              Calls placed through Concierge may be recorded and transcribed.
              Recordings and transcripts are stored in a private, access-
              controlled storage bucket (they are never publicly accessible).
            </>,
            <>
              <strong className="text-slate-300">
                Account and billing data.
              </strong>{" "}
              If you create an account: your email, name, and subscription
              status. Payments are handled by Stripe — card numbers go
              directly to Stripe and{" "}
              <strong className="text-slate-300">
                we never store your card number
              </strong>
              .
            </>,
            <>
              <strong className="text-slate-300">Request details.</strong> The
              task descriptions, addresses, and context you provide so the AI
              can make the call you asked for.
            </>,
          ]}
        />
        <p>
          Your browser&apos;s localStorage is used for UI convenience only
          (e.g., remembering in-progress requests on your device). It stays in
          your browser and is not a server-side record of you.
        </p>
      </LegalSection>

      <LegalSection title="Why we use it">
        <LegalList
          items={[
            <>To place and complete the calls you request.</>,
            <>
              Fraud and abuse prevention — verifying that a number belongs to
              you before we call it, rate-limiting, and enforcing the
              one-demo-call-per-number rule.
            </>,
            <>Billing and account administration for members.</>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Who processes your data">
        <p>
          We use a small set of service providers (processors) to run the
          service. Each receives only what its function requires:
        </p>
        <LegalList
          items={[
            <>
              <strong className="text-slate-300">Twilio</strong> — sends the
              SMS verification code to your number.
            </>,
            <>
              <strong className="text-slate-300">Retell</strong> — the AI
              voice-calling platform that places calls (alternate call
              backends: LiveKit, VAPI). Calls routed through these providers
              may be recorded.
            </>,
            <>
              <strong className="text-slate-300">Stripe</strong> — payment
              processing for memberships. Stripe holds your card details; we
              do not.
            </>,
            <>
              <strong className="text-slate-300">Supabase</strong> — our
              database and private file storage (including the private bucket
              holding call recordings and transcripts).
            </>,
            <>
              <strong className="text-slate-300">Google</strong> — Google
              Places and Gemini APIs power provider research (e.g., finding
              and vetting local businesses for your request).
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="We do not sell your personal information">
        <p>
          We do not sell your personal information, and we do not share it
          with third parties for their own marketing. Data goes to the
          processors above solely so they can provide their service to us.
        </p>
      </LegalSection>

      <LegalSection title="Demo call consent">
        <p>
          The free demo works like this: you request a one-time call from our
          AI assistant to a phone number, and you prove the number is yours by
          entering a code we text to it. By requesting the demo you agree
          that:
        </p>
        <LegalList
          items={[
            <>
              the call is made by an{" "}
              <strong className="text-slate-300">AI-generated voice</strong>{" "}
              (and the call says so at the start);
            </>,
            <>
              the call{" "}
              <strong className="text-slate-300">may be recorded</strong> (and
              the call says so at the start);
            </>,
            <>
              it is a single call to the number you verified — we do not use
              your number for marketing calls or add you to any calling list.
            </>,
          ]}
        />
        <p>
          We keep a record of your consent (timestamp, IP address, and the
          disclosure version you accepted) as evidence that you asked for the
          call.
        </p>
      </LegalSection>

      <LegalSection title="SMS verification (OTP) consent">
        <p>
          When you ask to verify a number, you consent to receive{" "}
          <strong className="text-slate-300">
            one verification code per request
          </strong>{" "}
          by SMS at that number. These are verification messages, not
          marketing. Message and data rates may apply. Reply STOP to opt out
          of further verification texts; if you opt out, we cannot verify that
          number and cannot call it.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <LegalList
          items={[
            <>
              <strong className="text-slate-300">Demo phone number:</strong>{" "}
              retained indefinitely, solely to enforce the one-free-demo-call-
              per-number lifetime limit. It is not used for anything else.
            </>,
            <>
              <strong className="text-slate-300">OTP codes:</strong> stored
              only as one-way hashes; codes expire shortly after issuance.
            </>,
            <>
              <strong className="text-slate-300">
                Recordings and transcripts:
              </strong>{" "}
              retained until you ask us to delete them (see below).
            </>,
            <>
              <strong className="text-slate-300">
                Consent and audit records:
              </strong>{" "}
              retained as needed to demonstrate legal compliance (for example,
              do-not-call and consent-proof retention periods required by
              telecom regulation), independently of the content they refer to.
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="Deletion and contact">
        <p>
          To request deletion of your data (including call recordings and
          transcripts), or to ask any privacy question, contact{" "}
          {LEGAL_ENTITY_NAME} at {LEGAL_CONTACT}. We will verify the request
          and respond within the timeframe required by applicable law. Note
          that deleting content does not delete the minimal consent/audit
          records we must keep, and the demo-limit record of your number (a
          bare E.164 number) is retained to enforce the lifetime demo limit.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          The service is not directed to children and we do not knowingly
          collect personal information from children.
        </p>
        <CounselFlag>
          Confirm the age threshold and COPPA posture, and add the required
          statement for the launch jurisdictions.
        </CounselFlag>
      </LegalSection>

      <LegalSection title="California and other state privacy notices">
        <CounselFlag>
          Add the CCPA/CPRA notice at collection, categories table,
          rights-request mechanics (know/delete/correct/opt-out), and
          equivalent notices for other state privacy laws (VA/CO/CT/UT etc.)
          before launch. The &quot;we do not sell&quot; statement above
          reflects actual practice and should anchor the CCPA
          &quot;sale/share&quot; disclosures.
        </CounselFlag>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          We will post any changes on this page and update the version above.
          Material changes will be flagged prominently. This draft has no
          effective date — it takes force only after attorney review.
        </p>
      </LegalSection>
    </LegalArticle>
  );
}
