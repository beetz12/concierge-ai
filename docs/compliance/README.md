# Compliance Design Pack: AI Outbound Calling and SMS SaaS

Status: engineering-grade research pack (Slice 2 of the concierge-ai SaaS build).
NOT legal advice. Every regulatory claim is cited to a primary source. The pack
ends with a list of questions that a licensed telecom attorney must answer before
launch (see `open-legal-questions.md`).

## Why this pack exists

concierge-ai is becoming a multi-tenant SaaS where customers dispatch AI-voiced,
recorded phone calls (Retell AI) and A2P SMS (Twilio) to US businesses -- and,
occasionally, to individuals and sole proprietors -- to run errands, screen
providers, and manage dispute-resolution campaigns. Placing synthetic-voice,
recorded calls on behalf of third-party tenants sits on top of a dense stack of
federal and state law: the TCPA, the FCC's 2024 ruling that AI voices are
"artificial," 50+ state recording-consent and mini-TCPA regimes, do-not-call and
caller-ID-authentication rules, SMS carrier registration, and biometric/privacy
law for stored recordings.

The product must be compliant BY DESIGN. This pack is the shared source of truth
that the tenancy schema, the compliance policy engine, and the disclosure prompt
layer all build from, so those slices do not each re-derive the law.

## The five documents

| File | What it contains |
| --- | --- |
| `README.md` | This overview and the consumption map below. |
| `regulatory-survey.md` | Narrative survey of every governing regime (TCPA, FCC AI-voice ruling, state mini-TCPAs, bot/AI-disclosure laws, recording consent, DNC, STIR/SHAKEN, TSR, SMS/10DLC, vendor obligations, recording data handling). Each claim cited. |
| `policy-matrix.md` | One row per US state + DC (51 rows): recording-consent mode, bot/AI-disclosure requirement, mini-TCPA notes, quiet-hour deltas. Every all-party state cites a statute. |
| `product-requirements.md` | Numbered, implementable requirements, each tagged `[schema]`, `[engine]`, `[prompt]`, `[ops]`, or `[legal]` for the owning slice. |
| `open-legal-questions.md` | Enumerated questions for a telecom attorney, each with our current working assumption. |

## How the other slices consume this pack

- **Slice 4 (playbooks + prompt generation with AI disclosure)** reads the
  `[prompt]` requirements in `product-requirements.md` and the disclosure-opener
  rules in `regulatory-survey.md`. Every generated call script must open with a
  compliant identity + AI + recording disclosure; every campaign playbook must
  respect the task-type constraints defined here.
- **Slice 5 (multi-tenancy, auth, billing)** reads the `[schema]` requirements:
  the consent/authorization record, the suppression-list schema, the audit-log
  requirements, and the tenant-onboarding attestations. These become database
  tables and onboarding gates.
- **Slice 6 (compliance policy engine wired into dispatch)** reads the `[engine]`
  requirements and `policy-matrix.md`: it implements the per-call policy
  evaluation (tenant, target number, task type, callee local time -> allow/deny
  + required disclosure lines + recording mode) that gates every dispatch.
- **Slice 9 (production hardening / readiness audit)** uses `open-legal-questions.md`
  as the pre-launch checklist that must be resolved with counsel.

## Ground rules used throughout

- **B2B is the primary case, but it is not a free pass.** This product mostly
  calls businesses, which materially reduces (but does not eliminate) TCPA and
  DNC exposure. It does NOT waive call-recording-consent law or AI/bot-disclosure
  law, and a "business" number that is actually a personal cell re-exposes the
  full consumer regime. The pack treats the B2B/consumer line honestly rather
  than as a loophole.
- **Fail safe / fail closed.** Where the law is unsettled, the product default is
  the stricter rule (e.g., treat a call as all-party-consent recording and
  disclose AI use) until counsel says otherwise.
- **Cite or defer.** Any claim that cannot be grounded in a primary or
  authoritative source is moved to `open-legal-questions.md` and marked, not
  asserted in the survey or matrix.
- **US-only at launch.** International (GDPR-first) exposure is noted and deferred
  to the open-questions list.
- **ASCII-only typography** in all pack documents.
