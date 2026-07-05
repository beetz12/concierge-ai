# Launch-Readiness Compliance Audit

Status: **compliance analysis + verified local walkthrough evidence**.
Sections 1-5 own the compliance analysis; sections 7-10 record what was
actually verified against a running local stack on 2026-07-05 (commands and
trimmed responses inline), what is stubbed, and what still gates go-live.
Grounded in the in-repo compliance corpus:

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
- *Implementation status (updated 2026-07-05):* the OTP + persistence slice
  has landed. The landing page now uses `/api/v1/demo-funnel/*`
  (`apps/api/src/routes/demo-funnel.ts`): SMS OTP (hashed codes, 10-min
  expiry, 5 attempts), durable DB-counted send limits, and the `demo_calls`
  lifetime gate (UNIQUE(phone_e164), migration
  `20260705000000_demo_funnel.sql`) with consent timestamp/IP/disclosure
  version recorded. Verified end to end against a running local stack -
  see section 7. The older `/api/v1/demo-call` route (consent checkbox +
  in-memory limits only) still exists behind its own `DEMO_CALL_ENABLED`
  flag but is no longer used by the landing page; keep that flag off in
  production and prefer removing the route in a cleanup slice.

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

Statuses filled 2026-07-05. Legend: **[x] verified locally** (evidence in
section 7 - this proves the code path works, NOT that production is
configured), **[ ] open** (needs production credentials, external accounts,
or counsel - cannot be verified from a local walkthrough).

### 6.1 Attorney review
- [ ] OPEN - Legal pages (`/legal/privacy`, `/legal/terms`) reviewed;
      placeholders (`{$LEGAL_ENTITY_NAME}`, `{$LEGAL_CONTACT_EMAIL}`,
      governing law, arbitration, CCPA/state notices, children) resolved;
      DRAFT banners removed only on counsel sign-off. (Local walkthrough
      confirms both pages render with the DRAFT banner - section 7.5.)
- [ ] OPEN - Open legal questions Q1, Q5, Q12, Q14 answered in writing
      (launch gate per attorney-review.md section 4).

### 6.2 Stripe
- [ ] OPEN - Live-mode keys configured; test keys absent from prod env.
- [ ] OPEN - Live prices/products created and referenced by ID.
- [ ] OPEN - Webhook endpoint + signing secret verified in live mode.
- Note: the local walkthrough ran with no Stripe at all; DEMO_MODE reports
  a synthetic `demo_active` subscription (section 7.4).

### 6.3 Twilio SMS
- [ ] OPEN - A2P 10DLC brand + OTP campaign (or toll-free verification)
      approved.
- [ ] OPEN - STOP/HELP behavior verified against the live sender.
- Note: OTP SMS was SIMULATED locally (code surfaced in server logs, no
  network) - section 7.3 step b.

### 6.4 Retell / telephony
- [ ] OPEN - `RETELL_NUMBER_PURCHASE_ENABLED` decision + account funding in
      place. (Left unset locally: number onboarding returned a simulated
      number, `status: "simulated"` - section 7.4.)
- [ ] OPEN - STIR/SHAKEN attestation level verified on provisioned numbers.
- [ ] OPEN - Recording + AI disclosure verified in the live call opener.
      (The disclosure text is baked into every scenario script -
      `apps/api/src/services/demo-funnel/scenarios.ts` - but no real call
      has been placed to hear it.)

### 6.5 Production environment
- [ ] OPEN - All required env vars set (API + web); no dev fallbacks
      active. Must include `OTP_HASH_SECRET` (the funnel fails closed
      without it outside DEMO_MODE - verified in code review, not
      production).
- [ ] OPEN - `DEMO_MODE=false`; Supabase prod project + RLS verified;
      migrations `20260705000000_demo_funnel.sql` and
      `20260705010000_membership.sql` applied.
- [ ] OPEN - `call-artifacts` bucket private in prod.

### 6.6 Enable flags
- [x] VERIFIED LOCALLY - `DEMO_FUNNEL_ENABLED=true` gates the new funnel;
      OTP + `demo_calls` persistence are implemented and the lifetime
      limit held under test (section 7.3 step e). Production enablement
      still requires Twilio (6.3) + `OTP_HASH_SECRET` (6.5).
- [ ] OPEN - keep the legacy `DEMO_CALL_ENABLED` flag OFF in production;
      the landing page no longer uses `/api/v1/demo-call` (route logged
      `enabled: false` in the walkthrough boot).
- [ ] OPEN - Member outbound dialing restricted per the interim posture
      until Q1 consent gate ships.

### 6.7 Monitoring
- [ ] OPEN - Abuse/volume alerting live (section 5 table).
- [ ] OPEN - Number-reputation monitoring live (section 4).
- [ ] OPEN - Audit-log dashboards for deny reasons and policy version.

---

## 7. What was built and verified (2026-07-05 local walkthrough)

Everything below was executed against a running local stack, safe by
construction: `DEMO_MODE=true`, `CALL_BACKEND=mock`,
`DEMO_FUNNEL_ENABLED=true`, `RETELL_NUMBER_PURCHASE_ENABLED` unset. No real
SMS was sent, no real call was placed, no phone number was purchased, no
remote database was written (in-memory stores). Branch
`goal/launch-verification`, base commit `8704ca2`.

Stack: API `pnpm --filter api dev` with the env above on **port 8010**
(8000 was occupied by an unrelated local server), web `pnpm --filter web
dev` on port 3000 with `NEXT_PUBLIC_DEMO_MODE=true` and
`NEXT_PUBLIC_API_URL=http://localhost:8010` so the `/api/*` rewrite hit the
walkthrough API.

### 7.1 Quality gates

All four ran green before the walkthrough and again after the fixes in 7.2
(final run post-fix):

| Gate | Result |
| --- | --- |
| `pnpm check-types` | pass (4 packages) |
| `pnpm lint` | pass, `--max-warnings 0` |
| `pnpm --filter api test` | 373 tests, 373 pass, 0 fail |
| `pnpm build` | pass (api tsc + web next build) |

### 7.2 Integration bugs found and fixed

The stack would not boot with the documented demo env. Two fixes, both
verified by the successful walkthrough below and by the gates re-run:

1. `apps/api/src/config/call-runtime.ts` - boot threw
   `Missing required call runtime configuration: LIVEKIT_URL, ...` even in
   DEMO_MODE. Fixed: demo mode now boots with `configured: false` instead
   of refusing to start; outside demo mode missing provider config is
   still fatal.
2. `apps/api/src/services/vapi/provider-calling.service.ts` - route
   registration eagerly constructed `DirectVapiClient`, whose constructor
   throws without `VAPI_API_KEY`/`VAPI_PHONE_NUMBER_ID`, crashing boot in
   VAPI-less environments. Fixed: the client is now constructed lazily on
   first use; real call paths fail exactly as before, boot does not.

### 7.3 Demo funnel journey (HTTP against the running API)

a. **Scenario catalog** - curated list plus the disabled "custom" upsell
   tile; server-side call scripts are not exposed:

```
$ curl http://localhost:8010/api/v1/demo-funnel/scenarios          # HTTP 200
{"scenarios":[{"id":"refund-request","label":"Ask for a refund",...,
  "requiresMembership":false,"enabled":true}, ... 5 more enabled ...,
 {"id":"custom","label":"Your own scenario",...,
  "requiresMembership":true,"enabled":false}]}
```

b. **OTP send** (+15555550199; mock backend scripts the outcome by last
   digit - 9 = completed). The SMS is simulated in DEMO_MODE; the code is
   surfaced only in server logs:

```
$ curl -X POST .../otp/send -d '{"phoneNumber":"+15555550199"}'    # HTTP 200
{"status":"sent","simulated":true}

api.log: event: "demo_funnel_otp_simulated"  to: "+15555550199"  code: "316965"
```

c. **OTP verify** - wrong code decrements attempts; right code returns the
   signed verification token (the ONLY carrier of the dial target):

```
$ curl -X POST .../otp/verify -d '{...,"code":"000000"}'           # HTTP 400
{"statusCode":400,...,"status":"invalid","attemptsRemaining":4,
 "message":"Incorrect code."}

$ curl -X POST .../otp/verify -d '{...,"code":"316965"}'           # HTTP 200
{"status":"verified","verificationToken":"eyJhbGciOiJIUzI1NiJ9..."}
```

d. **Dispatch + status polling** - 202 with a mock call id; first poll
   in-progress, second poll terminal:

```
$ curl -X POST .../call -d '{"verificationToken":"...","scenarioId":"refund-request"}'
                                                                    # HTTP 202
{"status":"dispatched","callId":"mock-925df6db-6715-4374-ba65-b3c0ac3ae1ef"}

$ curl ".../call/mock-925d.../status?token=..."                    # HTTP 200
{"state":"in_progress","completed":false,"disposition":null,"summary":null}
$ curl ".../call/mock-925d.../status?token=..."                    # HTTP 200
{"state":"completed","completed":true,"disposition":"completed",
 "summary":"Objective completed. Every must-ask question was answered."}
```

e. **Lifetime limit** - the same number gets an honest `already_used` with
   NO new SMS, and a repeat dispatch (still-valid token) hits the
   `demo_calls` UNIQUE(phone_e164) gate:

```
$ curl -X POST .../otp/send -d '{"phoneNumber":"+15555550199"}'    # HTTP 200
{"status":"already_used"}

$ curl -X POST .../call -d '{...same token, different scenario...}' # HTTP 409
{"statusCode":409,"error":"Conflict","status":"already_used",
 "message":"This number has already received its demo call."}
```

f. **Send rate limit** - a second number (+15555550287) allowed 3 sends in
   the hour window, then 429 with retry-after:

```
sends 1-3:                                                          # HTTP 200
{"status":"sent","simulated":true}
send 4:                                             # HTTP 429, retry-after: 3600
{"statusCode":429,"error":"Too Many Requests",
 "message":"Too many verification codes sent to this number. Try later.",
 "retryAfter":3600}
```

### 7.4 Membership journey (DEMO_MODE auth bypass, org demo-org-000)

```
$ curl http://localhost:8010/api/v1/members/me                     # HTTP 200
{"org":{"id":"demo-org-000","name":"Demo Organization"},
 "subscription":{"status":"demo_active","plan":"demo"},
 "dedicatedNumber":null,
 "settings":{"callerIdentity":null,"voicemailPolicy":"hang_up",...}}

$ curl -X POST .../members/onboarding/number -d '{"areaCode":"864"}' # HTTP 200
{"number":{"id":"76689677-...","phoneE164":"+18645554233",
 "status":"simulated","areaCode":"864",...},
 "simulated":true,"alreadyProvisioned":false}      <- NO real purchase

$ curl -X PUT .../members/settings -d '{"callerIdentity":"...",
    "voicemailPolicy":"leave_message","transferNumber":"+18645550100"}'
                                                                    # HTTP 200
$ curl .../members/settings                                        # HTTP 200
  -> identical body: round-trip persisted

$ curl ".../members/calls?limit=5"                                 # HTTP 200
{"calls":[],"nextCursor":null}                     <- empty history, no dispatches yet

$ curl .../members/me                                              # HTTP 200
  -> now shows dedicatedNumber + the saved settings
```

### 7.5 Web pages (Next.js dev server, port 3000)

| Page | Result |
| --- | --- |
| `GET /` | 200; SSR HTML contains the funnel shell ("Loading the demo..." initial state). The scenario tiles hydrate client-side from `/api/v1/demo-funnel/scenarios`; the rewrite proxy was verified separately: `GET http://localhost:3000/api/v1/demo-funnel/scenarios` returned the catalog. |
| `GET /legal/privacy` | 200; contains "DRAFT - pending attorney review. Not yet in force." and version `draft-2026-07-04`. |
| `GET /legal/terms` | 200; same DRAFT banner and version. |
| `GET /onboarding` | 200; renders the member onboarding page ("dedicated number" copy present). |
| `GET /dashboard` | 200; renders with the "Demo Mode" banner. |

### 7.6 Playwright e2e

The repo's Playwright infra (`playwright.config.ts`, headless Chromium,
self-booting test servers on 8180/3180, no external credentials) runs
locally, so a UI happy-path spec for the demo funnel was ADDED:
`apps/web/e2e/demo-funnel.spec.ts`. It mocks the `/api/v1/demo-funnel/*`
responses with `page.route` (same pattern as the other web-demo specs) and
drives the real UI through scenario pick (including the locked members
tile), phone entry, simulated-SMS notice, OTP entry, the calling pane, and
the completed done-pane CTA, asserting the dispatch request body carries
exactly `{ verificationToken, scenarioId }`.

Result: full suite `pnpm test:e2e` = **9 passed** (3 web-demo specs
including the new demo-funnel spec at 7.7s, plus all 6 @dispatch specs
that drive the real API in DEMO_MODE with the mock backend).

Limitation stated honestly: the e2e spec verifies the UI flow against
mocked API responses; the API behavior itself is verified by the HTTP
walkthrough above and by `apps/api/src/routes/demo-funnel.test.ts` (part
of the 373-test API suite). No spec drives UI + real API end-to-end,
because the OTP code only surfaces in API logs, which the browser test
cannot read cleanly.

## 8. What is stubbed or simulated

Between local demo and production, these behaviors are NOT real:

- **OTP SMS is simulated** in DEMO_MODE (and whenever Twilio is not
  configured): the code is logged server-side, nothing is texted
  (`apps/api/src/services/demo-funnel/sms.ts`). Production needs Twilio +
  A2P/toll-free registration (6.3).
- **Demo calls use the mock backend** locally (`CALL_BACKEND=mock`):
  deterministic in-memory transitions, outcome scripted by the dialed
  number's last digit, canned transcript/recording. Production dials via
  the configured CallBackend (livekit/retell/vapi).
- **Number purchase is simulated**: `RETELL_NUMBER_PURCHASE_ENABLED`
  unset means onboarding provisions a deterministic fake number with
  `status: "simulated"` and spends nothing.
- **Stripe is absent locally**: DEMO_MODE reports a synthetic
  `demo_active` subscription; production requires live keys, price IDs,
  and the billing webhook (6.2).
- **Persistence is in-memory** in DEMO_MODE (demo funnel store, membership
  store, auth bypass as `demo-org-000`). Production uses Supabase with the
  two new migrations applied.
- **The legacy `/api/v1/demo-call` endpoint still exists** behind
  `DEMO_CALL_ENABLED` (default off) but the landing page no longer calls
  it; removal is a cleanup slice.

## 9. Remaining go-live checklist (plain language)

In rough order of lead time:

1. **Attorney review** of `/legal/privacy` and `/legal/terms` (resolve
   entity-name/contact placeholders, remove DRAFT banners on sign-off) and
   written answers to open legal questions Q1, Q5, Q12, Q14
   (docs/compliance/open-legal-questions.md). Q1/Q14 gate member outbound
   dialing at scale.
2. **Twilio A2P 10DLC brand + OTP campaign registration** (or toll-free
   verification) for the OTP sender - carrier approval takes days-weeks;
   start early. Then verify STOP/HELP handling live.
3. **Stripe live mode**: live keys, live products/prices referenced by ID,
   webhook + signing secret verified.
4. **Retell number purchasing**: fund the account, set
   `RETELL_NUMBER_PURCHASE_ENABLED=true` deliberately, verify STIR/SHAKEN
   attestation and the recorded-line + AI disclosure on a real call.
5. **Production environment variables** (API + web): everything in
   `apps/api/.env.example` that applies, notably `OTP_HASH_SECRET`
   (funnel fails closed without it), `DEMO_FUNNEL_ENABLED=true` (the
   go-switch), `RETELL_NUMBER_PURCHASE_ENABLED`, `DEMO_MODE=false`, plus
   Supabase prod with migrations `20260705000000_demo_funnel.sql` and
   `20260705010000_membership.sql` applied and the `call-artifacts`
   bucket private.
6. **Abuse monitoring/alerting**: demo-call volume spikes, OTP
   failure-rate anomalies, repeated denied dispatches per org, spam-label
   detection on outbound numbers (sections 4 and 5).

## 10. Known risks

- **Walkthrough ran in DEMO_MODE with in-memory stores.** The Supabase
  store implementations (`SupabaseDemoFunnelStore`, membership store) are
  covered by unit tests with mocked clients but have NOT been exercised
  against a real Postgres in this walkthrough; the UNIQUE-constraint
  lifetime gate is enforced by the database in production and only by the
  in-memory equivalent here.
- **The OTP-code path to a real phone is untested end-to-end** (simulated
  SMS locally). First production smoke test should be a real number owned
  by the team.
- **Boot-time config regressions are easy to reintroduce**: two eager
  constructions crashed demo boot (7.2). There is no test that boots the
  API with the bare demo env; consider a CI smoke job that starts the API
  with `DEMO_MODE=true CALL_BACKEND=mock` and curls `/health`.
- **Rate limits are per-number/per-IP only.** A botnet with many numbers
  and IPs can still burn SMS spend once Twilio is real; the lifetime
  demo-call limit caps call spend but OTP sends cost money before any
  call. Alerting (9.6) is the mitigation until a global send budget
  exists.
- **`NEXT_PUBLIC_API_URL` must be set correctly per environment** - the
  walkthrough needed it because the API ran on a non-default port; the
  same knob misconfigured in production silently points the web rewrite at
  the wrong backend.
- **Legal pages are drafts.** Launching the funnel while `/legal/*` still
  shows DRAFT banners undermines the consent/disclosure story the TCPA
  posture relies on (sections 1 and 6.1).
