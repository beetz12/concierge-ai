# Launch-Readiness Compliance Audit

Status: **audit skeleton + compliance analysis**. A later slice appends
verified evidence (screenshots, dashboard states, config dumps) to each
section; this document owns the compliance analysis. Grounded in the in-repo
compliance corpus:

- `docs/compliance/attorney-review.md` (risk register, Q1-Q14 deep dives)
- `docs/compliance/regulatory-survey.md` (primary-source survey)
- `docs/compliance/policy-matrix.md` (per-state lookup table)
- `docs/compliance/product-requirements.md` (R-1 .. R-28)
- `docs/compliance/open-legal-questions.md` (counsel checklist)

Not legal advice. ASCII-only typography. Last analysis pass: 2026-07-04.

---

## 1. Demo funnel compliance posture

The public marketing funnel lets a logged-out visitor request a single AI
demo call to their own phone.

**Why the design is compliant under TCPA 227(b).** The FCC's Feb 8, 2024
Declaratory Ruling (FCC 24-17, CG Docket 23-362) makes an AI-generated voice
an "artificial voice" under 47 U.S.C. 227(b), so an AI-voiced call to a
wireless number requires **prior express consent** regardless of B2B status
or DNC registration. The demo funnel satisfies 227(b) by construction:

- **The visitor requests the call themselves** to a number they supply -
  this is the paradigm case of prior express consent for a one-time,
  non-telemarketing informational call.
- **Number ownership is proven via SMS OTP** before dialing: the visitor
  must enter a code texted to the target number, closing the "consent given
  by someone other than the subscriber" gap that defeats consent claims in
  litigation.
- **The consent event is persisted** in a `demo_calls` table: timestamp,
  requesting IP, and the disclosure version the visitor accepted. This is
  the evidentiary record a 227(b) defense needs (mirrors R-2/R-24
  consent-proof requirements).
- **The call opener discloses AI + recording** in the first utterance
  (R-12): identity, "this is an automated AI assistant", "this call may be
  recorded". This satisfies the federal caller-identification stack, the
  state AI-disclosure mandates (CA AB 2905, UT SB 149, CO), and the
  all-party recording-notice posture in one move.
- **Quiet hours are largely moot**: the call is user-initiated and placed
  immediately after the request, so the callee (the requester) is by
  definition awake and expecting it. The federal 8am-9pm window applies to
  solicitations; the demo is a requested informational call.

**Residual risks (stated honestly):**

- *Verification-code interception / shared devices.* OTP proves control of
  the number at that moment, not identity. Someone with temporary access to
  another person's phone could pass OTP. Risk is low (one 20-second demo
  call, no personal data collected on the call) but nonzero.
- *Recorded consent vs. disclosure drift.* The persisted `disclosure_version`
  must actually change whenever the on-page consent language changes,
  or the evidence record loses value. Treat the disclosure text as
  versioned config, not copy.
- *Quiet hours are moot only while the call is immediate.* If a queue/retry
  path ever delays the demo call (e.g., "we saved your number" follow-ups),
  the call is no longer user-initiated-immediate and time-of-day gating must
  apply. No automated redial without a fresh request.
- *Consent scope is one call.* The demo consent covers exactly one AI call.
  Any reuse of the number (marketing SMS, follow-up call) is outside the
  consent scope and would need its own basis.
- *Current implementation gap:* the demo route today
  (`apps/api/src/routes/demo-call.ts`) enforces consent-checkbox + E.164 +
  per-IP/per-number in-memory rate limits, but the SMS OTP step and the
  `demo_calls` persistence (hashed OTP, timestamp/IP/disclosure-version,
  lifetime limit) are delivered by a parallel slice. **Do not enable the
  live demo flag in production until OTP + persistence are merged** - the
  in-memory 24h number lock is not the lifetime limit and does not survive
  restarts.

## 2. OTP SMS (Twilio)

- **Registration before production volume.** Unregistered 10DLC traffic is
  filtered/surcharged by US carriers. Before opening the funnel to real
  volume, complete either **A2P 10DLC brand + campaign registration** (use
  case: two-factor authentication / OTP) or **toll-free verification** for
  the sending number with Twilio. OTP campaigns are low-friction to approve
  but approval is not instant - schedule it ahead of launch (see
  attorney-review Q9 for the multi-tenant ISV architecture question; the
  funnel's own OTP sender is a single first-party campaign and is the easy
  case).
- **Message content.** Keep the OTP message minimal and compliant:
  identify the sender, state the purpose, no marketing content. Suggested
  body: `"{$LEGAL_ENTITY_NAME} Concierge: your verification code is 123456.
  It expires in 10 minutes. Msg&data rates may apply."` One code per
  request; codes stored server-side only as hashes; short expiry.
- **STOP handling.** Twilio auto-handles STOP/UNSTOP/HELP on US long codes
  and toll-free, but the application must also treat a STOP as: no further
  OTP sends to that number, and therefore no demo-call verification path.
  Surface a clear UI error ("this number has opted out of texts") rather
  than silently failing. Do not attempt voice fallback for OTP delivery to
  an opted-out number.

## 3. Member outbound calling (the harder exposure)

The demo funnel is self-consented and low-risk. The real 227(b) exposure is
**members directing AI calls to third parties** (contractors, businesses,
occasionally individuals and sole proprietors who answer on cell phones).
Per attorney-review.md this is the product's single largest risk (Q1, RED,
score 20): "disclosure + quiet hours" does not cure a missing 227(b)
consent basis for an artificial-voice call to a wireless number.

**What the compliance engine already covers** (implemented in
`apps/api/src/services/compliance/` + migration
`20260703110000_compliance_suppression_authorizations_audit_log.sql`):

- Pure per-call policy evaluation (`evaluate(context) -> decision`, R-5)
  with a stamped `POLICY_VERSION` on every decision.
- Two-gate human approval: dispatch requires `userApproved` against a
  hashed call plan (`call_authorizations`, R-1).
- Suppression list (platform-wide + per-tenant) checked pre-dial
  (`suppression_entries`, R-9/R-10), with opt-out reasons and >= 5-year
  internal-DNC retention.
- Quiet-hours gating on callee-local time with the FL 8pm delta (R-7);
  Washington ADAD hard block (R-8); fail-closed state rules for the
  disputed all-party states (R-6, `state-rules.ts` mirrors
  policy-matrix.md).
- Static task-type taxonomy (R-27): buyer-side task types map to
  non-solicitation / prior-express; `unknown` fails safe to solicitation +
  PEWC.
- Ordered disclosure block (identity + AI + recording) computed by the
  engine and rendered by the prompt layer (R-12).
- Append-only `dispatch_audit_log` for allows AND denies with
  machine-readable reasons (R-24/R-25).
- Per-tenant kill switch.

**What gates scaled dialing (open counsel items, from
open-legal-questions.md):**

- **Q1 - 227(b) artificial-voice consent + solicitation line.** The
  build-blocker: a line-type-aware consent gate (no AI-voiced call to a
  wireless/residential number without a documented lawful basis), plus a
  counsel opinion on whether any 227(b) exemption fits the buyer-side use
  case and on the tenant-supplied consent model.
- **Q5 - callee state derivation.** Counsel to bless the waterfall
  (service address > billing address > number geolocation, fail closed to
  all-party + wireless) as a "reasonable" determination standard, and
  whether spoken notice + continued participation suffices in CA/PA.
- **Q12 - no-voiceprint boundary.** Confirm in writing that Retell and any
  STT/diarization vendor persist no speaker templates; any future
  voiceprint feature is launch-blocking (BIPA).
- **Q14 - line-type resolution + reassigned numbers.** Carrier/LRN dip with
  fail-safe-to-wireless; confirm whether volume requires the FCC Reassigned
  Numbers Database for the safe harbor. Build together with Q1 - it is the
  technical predicate for the consent gate.

**Interim posture until Q1/Q14 land:** restrict member dialing to known
business landlines or numbers with documented prior express consent, under
the existing fail-closed defaults (attorney-review.md section 4).

## 4. Per-member dedicated numbers

- **Spam-reputation rationale.** A shared outbound number pools every
  member's calling behavior into one reputation. One abusive or high-volume
  member gets the shared number labeled "Spam Likely", degrading answer
  rates for everyone. Dedicated per-member numbers isolate reputational
  blast radius, make per-member volume look organic to carrier analytics,
  and let a burned number be quarantined without platform-wide impact.
- **STIR/SHAKEN attestation via Retell.** Calls originate from
  Retell-provisioned numbers, signed by Retell's originating carrier.
  Verify (ops item): attestation level on Retell-purchased numbers is
  A-level (direct customer + right-to-use known), and the origination path
  is in the Robocall Mitigation Database (R-16). C-level attestation
  invites analytics blocking.
- **Number-reputation monitoring (ops item).** Register outbound numbers
  with the Free Caller Registry (Hiya/TNS/First Orion), keep CNAM/branded
  display accurate to the represented entity (R-17), monitor for spam
  labeling per number, and rotate/remediate via USTelecom ITG when flagged.
  Track per-number health as an operational metric, not a one-time setup.

## 5. Data retention, deletion, and abuse monitoring

**Retention/deletion story (target, reflected in the legal pages):**

- Demo phone number (bare E.164): kept indefinitely solely to enforce the
  one-demo-per-number lifetime limit.
- OTP codes: hashed at rest, short expiry; verification metadata
  (timestamp, IP, disclosure version) kept as consent evidence.
- Recordings/transcripts: private Supabase bucket (`call-artifacts`),
  retained until a verified deletion request; deletion purges content but
  not the consent/audit spine (R-22/R-23 separate lifecycles).
- Consent, authorization, and dispatch-audit records: retained per
  statutory floors (internal DNC >= 5 years, 47 CFR 64.1200(d)(6); consent
  proof at least until revocation).
- Stripe holds card data; the app stores subscription state only.
- localStorage: UI convenience only; no server-side significance.

**Current state vs needed:**

| Control | Current | Needed for launch |
| --- | --- | --- |
| Rate limits (demo) | In-memory token buckets (per-IP burst, per-number 24h) in `demo-call.ts` | Durable lifetime limit backed by `demo_calls` (parallel slice); keep IP buckets as burst control |
| Audit log | `dispatch_audit_log` table + policy-version stamping implemented | Wire ALL dispatch paths through it (legacy VAPI research flow included); deny-reason surfacing in UI |
| Suppression | `suppression_entries` + pre-dial check implemented | Opt-out intake from live transcripts (voice "stop calling me" -> suppression write) verified end-to-end |
| Deletion requests | Manual (contact channel) | Documented runbook: locate by number/account, purge bucket objects + rows, preserve consent spine, respond within statutory window |
| Alerting | None dedicated | Alerts on: demo-call volume spikes, repeated denied dispatches per org, spam-label detection, OTP failure-rate anomalies |
| Recording storage | Private `call-artifacts` bucket (service-role only) | Confirm bucket policy in prod + retention/purge job |

## 6. Go-live checklist

Section headers only - a later slice appends verified evidence and flips
statuses. All items default to **[ ] not verified**.

### 6.1 Attorney review
- [ ] Legal pages (`/legal/privacy`, `/legal/terms`) reviewed; placeholders
      (`{$LEGAL_ENTITY_NAME}`, `{$LEGAL_CONTACT_EMAIL}`, governing law,
      arbitration, CCPA/state notices, children) resolved; DRAFT banners
      removed only on counsel sign-off.
- [ ] Open legal questions Q1, Q5, Q12, Q14 answered in writing (launch
      gate per attorney-review.md section 4).

### 6.2 Stripe
- [ ] Live-mode keys configured; test keys absent from prod env.
- [ ] Live prices/products created and referenced by ID.
- [ ] Webhook endpoint + signing secret verified in live mode.

### 6.3 Twilio SMS
- [ ] A2P 10DLC brand + OTP campaign (or toll-free verification) approved.
- [ ] STOP/HELP behavior verified against the live sender.

### 6.4 Retell / telephony
- [ ] `RETELL_NUMBER_PURCHASE_ENABLED` decision + account funding in place.
- [ ] STIR/SHAKEN attestation level verified on provisioned numbers.
- [ ] Recording + AI disclosure verified in the live call opener.

### 6.5 Production environment
- [ ] All required env vars set (API + web); no dev fallbacks active.
- [ ] `DEMO_MODE=false`; Supabase prod project + RLS verified.
- [ ] `call-artifacts` bucket private in prod.

### 6.6 Enable flags
- [ ] `DEMO_CALL_ENABLED` on only after OTP + `demo_calls` persistence are
      live.
- [ ] Member outbound dialing restricted per the interim posture until Q1
      consent gate ships.

### 6.7 Monitoring
- [ ] Abuse/volume alerting live (section 5 table).
- [ ] Number-reputation monitoring live (section 4).
- [ ] Audit-log dashboards for deny reasons and policy version.
