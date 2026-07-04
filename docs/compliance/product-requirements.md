# Product Requirements: Compliance-by-Design

Numbered, implementable requirements derived from `regulatory-survey.md` and
`policy-matrix.md`. Each is tagged with its owning layer so the downstream slices
can consume them without re-researching:

- `[schema]` -> Slice 5 (multi-tenancy, auth, billing): database tables/fields.
- `[engine]` -> Slice 6 (compliance policy engine): the per-call allow/deny logic.
- `[prompt]` -> Slice 4 (playbooks + prompt generation): call-script language.
- `[ops]` -> platform operations / number provisioning / vendor setup.
- `[legal]` -> requires attorney sign-off before launch (see `open-legal-questions.md`).

Not legal advice. Where a requirement rests on an unsettled question it also carries
`[legal]` and points at the relevant open question.

---

## A. Consent and authorization records

**R-1 `[schema]` Authorization record (tenant authorizes a campaign/call).**
Persist an immutable authorization row capturing: `tenant_id`, `authorizing_user_id`,
`authorized_at` (UTC), `channel` (`voice` | `sms`), `task_type`, `on_behalf_of_entity`
(the business the call represents), `plan_hash` (hash of the exact approved
call/campaign plan text), `target_scope` (numbers/segments authorized), and
`approval_method` (`ui_click` | `esign` | `api`). This is the "who approved what,
when" spine that R-24 audit logging and the two-gate dispatch UX (Slice 8) hang off.

**R-2 `[schema]` Recipient-consent record (the called/messaged party's consent).**
Separate from R-1. Capture `recipient_number` (E.164), `consent_tier`
(`none` | `prior_express` | `prior_express_written`), `consent_source`
(free text + evidence URL/file), `consent_obtained_at`, `consent_scope`
(subject matter), `obtained_by_tenant_id`, and `revoked_at` (nullable). Twilio
requires proof of SMS consent retained at least until revocation; keep this record
even after content is purged (R-22). Cite: TCPA 47 U.S.C. 227(b); 47 CFR
64.1200(f)(9); Twilio Messaging Policy.

**R-3 `[engine]` Consent tier is a function of call PURPOSE, evaluated per call.**
Informational/transactional calls require `prior_express`; any call that includes
or introduces an advertisement or constitutes telemarketing requires
`prior_express_written` (47 CFR 64.1200(a)(2)-(3)). The engine looks up `task_type`
in the STATIC taxonomy (R-27) to get `{is_solicitation, default_consent_tier}`,
then denies if the recipient-consent record (R-2) does not meet or exceed the
required tier. This is a fixed table lookup, NOT a runtime NLP classifier.
`[legal]` for the buyer-side-verification-vs-solicitation line (open question Q1).

**R-4 `[engine][prompt]` Revocation intake, cross-channel, honored <= 10 business
days.** The voice agent must recognize opt-out utterances ("stop calling me", "put
me on your do-not-call list", "remove me") and DTMF opt-out; SMS must honor STOP and
free-form revocation. On any opt-out, write to the suppression list (R-9) and set
`revoked_at`. Cite: FCC 24-24, 47 CFR 64.1200(a)(10)-(12). Re-verify the "revoke-all"
company-wide propagation date (open question Q10).

---

## B. Per-call policy evaluation (the engine contract)

**R-27 `[engine][schema]` `task_type` taxonomy (the engine's load-bearing lookup).**
`task_type` is a fixed enum, NOT free text and NOT a runtime classifier. The engine,
the schema (R-1 stores it, R-24 logs it), and the prompt layer all share this exact
set. Each value maps to `{is_solicitation, default_consent_tier}`. "Solicitation" is
TCPA-sense: does the call encourage the CALLED party to purchase/rent/invest? This
product is buyer-SIDE by default -- it calls a business to buy/verify/resolve on the
tenant's behalf, which does NOT solicit the callee -- so the default types are
non-solicitation / `prior_express`. Any type that pitches or sells TO the callee is a
solicitation / `prior_express_written` and is `[legal]` -> Q1.

| `task_type` | Purpose | `is_solicitation` | `default_consent_tier` |
| --- | --- | --- | --- |
| `availability_inquiry` | Ask a provider about availability | false | `prior_express` |
| `rate_inquiry` | Ask a provider about pricing/rates | false | `prior_express` |
| `rate_negotiation` | Negotiate price on the tenant's behalf | false | `prior_express` |
| `appointment_booking` | Book/confirm an appointment | false | `prior_express` |
| `general_inquiry` | Ask a business a factual question (hours, service scope) | false | `prior_express` |
| `complaint` | Raise a service complaint on the tenant's behalf | false | `prior_express` |
| `dispute_followup` | Dispute-resolution campaign step | false | `prior_express` |
| `outbound_sales` | Pitch/sell the tenant's goods/services TO the callee | true `[legal]` Q1 | `prior_express_written` |
| `promotional_notice` | Advertise/promote to the callee | true `[legal]` Q1 | `prior_express_written` |
| `unknown` | Unclassified | true (fail safe) | `prior_express_written` |

Rules: (a) new task types MUST declare both fields before use; (b) `unknown` and any
borderline type fail safe to solicitation + PEWC until counsel classifies it (Q1);
(c) the engine never infers `is_solicitation` at runtime -- it reads this table.

**R-5 `[engine]` Policy evaluation function signature.** Slice 6 exposes
`evaluate(call_context) -> policy_decision`.

Inputs (`call_context`): `tenant_id`, `on_behalf_of_entity`, `target_number` (E.164),
`target_line_type` (`wireless` | `landline` | `unknown`, resolved per R-28),
`target_state` (derived from number/address per Q5), `task_type` (R-27), `channel`,
`requested_at` (UTC), the resolved `callee_local_time`, and the two declared side
inputs the engine reads: `recipient_consent_tier` (from the R-2 consent record;
`none` if absent) and `suppression_hit` (from R-9/R-10; bool). Declaring these as
inputs keeps `evaluate()` a pure function rather than one with hidden lookups.

Outputs (`policy_decision`): `allow` (bool), `deny_reasons[]`, `required_disclosures[]`
(ordered disclosure lines the prompt layer MUST include -- identity, AI, recording,
opt-out), `recording_mode` (`all_party_disclosed` | `one_party_disclosed` |
`prohibited`), `consent_tier_required` (from R-27), `quiet_hours_window` (local), and
`suppression_checked` (bool).

**R-6 `[engine]` Fail closed / fail safe.** On unknown state, unknown line type, or
missing data, apply the STRICTER rule (treat as wireless + all-party recording +
disclose AI). A disputed all-party state (CT/NV/DE/MI) evaluates to all-party. Cite:
`policy-matrix.md`.

**R-7 `[engine]` Quiet-hours gate on callee-local time.** Deny solicitation calls
outside 8:00 a.m.-9:00 p.m. at the called party's local time (47 CFR 64.1200(c)(1));
apply the Florida 8:00 a.m.-8:00 p.m. delta for FL numbers (Fla. Stat. 501.059(8)(b));
per matrix. Local time is resolved from the destination number/address, never the
platform timezone. Default: enforce on all solicitation calls regardless of consent
(the "consent moots quiet hours" theory is contested -- open question Q3). The SAME
window applies to A2P SMS solicitations (texts are "calls" under the TCPA), with the
FL 8pm delta; the `channel = sms` path uses the same quiet-hours gate.

**R-8 `[engine]` Washington ADAD hard block.** If `channel = voice` and the call is a
commercial solicitation delivered by recorded/AI voice and `target_state = WA`, deny
regardless of consent (RCW 80.36.400 is a flat prohibition). Same for unsolicited
commercial SMS to WA (RCW 19.190). `[legal]` on the solicitation classification.

**R-28 `[engine][ops]` Line-type resolution and reassigned-number scrub.** Resolve
`target_line_type` via a carrier/LRN lookup (LERG/LRN dip) at or before dispatch;
FAIL SAFE to `wireless` on `unknown` (R-6), because wireless has no B2B carve-out and
is the higher-exposure classification. Because prior consent can be defeated when a
number is reassigned to a new subscriber, scrub high-volume campaign numbers against
the FCC Reassigned Numbers Database (https://www.reassigned.us/) before relying on a
stored consent record; a reassignment hit invalidates `recipient_consent_tier` for
that number. The exact "reasonable" line-type/state determination standard is
`[legal]` -> Q5/Q14.

---

## C. Suppression / do-not-call

**R-9 `[schema]` Suppression list.** Table with `number` (E.164), `scope`
(`platform` | `tenant`), `tenant_id` (nullable for platform-wide), `reason`
(`recipient_optout` | `internal_dnc` | `litigator_scrub` | `national_dnc` |
`manual`), `added_at`, `source_call_id` (nullable), and `expires_at` (nullable;
internal-DNC entries retained >= 5 years per 47 CFR 64.1200(d)(6)). Both platform-wide
AND per-tenant suppression are required.

**R-10 `[engine]` Mandatory pre-dial suppression check.** Every dispatch checks the
target against: (1) platform + tenant suppression list (R-9); (2) national DNC
registry for residential solicitations; and (3) optionally a litigator-scrub
provider. National-DNC scrub is required for residential solicitations; internal
suppression is always required. Cite: 47 CFR 64.1200(c)(2), (d); 16 CFR
310.4(b)(1)(iii).

**R-11 `[ops]` Written internal DNC policy artifact.** Maintain a written internal
do-not-call policy, producible on demand, and train/inform anyone operating outbound
campaigns (47 CFR 64.1200(d)(1)-(2)). For a SaaS, this is a published policy doc plus
tenant-onboarding acknowledgement (R-19).

---

## D. Disclosure opener (prompt layer)

**R-12 `[prompt]` Universal compliant opener.** Every AI voice call opens, in the
first utterance, with an ordered disclosure block:
1. Identity -- the responsible business/entity name (the tenant's `on_behalf_of_entity`)
   and, for telemarketing, a call-back number (47 CFR 64.1200(b)(1)-(2)).
2. AI disclosure -- state that the caller is an AI/automated assistant (satisfies CA
   AB 2905 Pub. Util. Code 2874, UT SB 149, CO SB 24-205 by construction; fail-safe
   in all states).
3. Recording disclosure -- "this call is being recorded" (satisfies one-party states,
   notice-based all-party states, and is the strongest posture in MA; RCW 9.73.030(3)).
4. For telemarketing, an interactive opt-out instruction (47 CFR 64.1200(b)(3)).

The exact required lines come from `policy_decision.required_disclosures` (R-5), so
the prompt layer renders what the engine computed rather than hard-coding per state.

**R-13 `[prompt]` No misrepresentation of identity.** The agent must not claim to be
a government agency or a business the tenant is not authorized to represent
(FTC Impersonation Rule, 16 CFR Part 461). The `on_behalf_of_entity` must match an
authorization record (R-1) and a provenance check (R-20).

**R-14 `[prompt]` SMS body requirements.** Every SMS campaign includes sender
identification, opt-out language ("Reply STOP to unsubscribe"), and HELP handling;
no SHAFT content; age-gate age-restricted content (CTIA Messaging Principles, May
2023). Marketing texts require prior express written consent (R-3).

---

## E. Number provisioning and caller identity

**R-15 `[ops]` Local presence + verified DIDs.** Provision DIDs the tenant is
authorized to present; prefer local-presence numbers matched to the campaign region.
Do not present a number the tenant does not own/control in a way that misleads
(227(e) is intent-based; accurate substitution of the tenant's real business number
is lawful).

**R-16 `[ops]` STIR/SHAKEN A-level attestation.** Route through an originating carrier
that signs calls at A-level on verified DIDs (or via delegate certificates), and
ensure the origination path is in the Robocall Mitigation Database (47 CFR 64.6305).
C-level origination invites blocking. Cite: FCC 20-42; 47 CFR 64.6300-64.6308.

**R-17 `[ops]` CNAM/RCD accuracy + spam-label monitoring.** Register outbound numbers
with accurate CNAM/branded-calling display matching `on_behalf_of_entity`; register
across Hiya/TNS/First Orion via the Free Caller Registry; monitor for "Spam Likely"
labeling and dispute via USTelecom ITG contacts.

**R-18 `[schema]` A2P 10DLC registration state per tenant.** Track `brand_id`,
`campaign_id`, `registration_status` (`unregistered` | `pending` | `approved` |
`rejected`), `trust_score`, and `throughput_limit`. Block SMS dispatch for a tenant
whose campaign is not `approved` (Twilio A2P 10DLC; TCR). ISV registration path
UNVERIFIED -- confirm with Twilio (open question Q9).

---

## F. Tenant onboarding attestations

**R-19 `[schema][ops]` Onboarding attestation record.** Before a tenant can dispatch,
capture signed attestations: (a) it has a lawful basis/consent to contact its targets;
(b) it will use the platform only for authorized entities it represents; (c) it
acknowledges the internal DNC policy (R-11); (d) it accepts the pass-through of
Twilio and Retell terms (R-21); (e) truthful KYC/business-identity data for A2P and
STIR/SHAKEN. Store `attestation_version`, `signed_by`, `signed_at`, `kyc_status`.

**R-20 `[engine]` On-behalf-of provenance check.** At dispatch, verify
`on_behalf_of_entity` is covered by an authorization record (R-1) and the tenant's
attested authority (R-19). Deny if the tenant tries to place calls representing an
entity it has not attested authority for (mitigates the FTC "means and
instrumentalities" platform-liability risk; open question Q8).

---

## G. Vendor terms pass-through

**R-21 `[legal][ops]` Flow vendor obligations to tenants.** The SaaS ToS/AUP must
pass through, at minimum: consent capture + proof retention, A2P 10DLC registration
and truthful KYC, STOP/opt-out honoring, no SHAFT/illegal content, recording
disclosure/consent, calling-window and DNC compliance, and indemnification for
tenant misuse. The platform is the enforcement/gating point, not merely a conduit.
Cite: Twilio Messaging Policy/AUP; Retell ToS. Exact Retell clauses UNVERIFIED
(open question Q11). Sign Retell BAA (if PHI) and DPA/SCCs (before EU data).

---

## H. Audit logging

**R-24 `[schema]` Immutable per-call/message audit log.** For every dispatch, persist:
`call_id`, `tenant_id`, `on_behalf_of_entity`, `target_number` (hashed at rest as
needed), `target_state`, `task_type`, `policy_decision` (full R-5 output),
`consent_record_ref` (R-2), `disclosures_rendered[]` (what the agent actually said,
from the transcript), `recording_mode_used`, `suppression_check_result`,
`dispatched_at`, and `outcome`. This log is the evidentiary record that a specific
call was policy-evaluated, disclosed, and consented -- the artifact that defends a
TCPA/recording claim. Append-only; retained per R-23.

**R-25 `[engine]` Deny is logged with reasons.** A denied dispatch writes an audit row
with `allow=false` and `deny_reasons[]` so tenants see WHY (e.g., "quiet hours: 21:14
local", "WA ADAD block", "no written consent for marketing").

---

## I. Data retention and biometrics

**R-22 `[schema][ops]` Retention defaults, minimized.** Default per-agent recording/
transcript retention to the low end (Retell supports 1 day-2 years); make it a
tenant-configurable policy with a platform maximum. Auto-purge recordings/transcripts
on schedule and on valid deletion requests (CCPA delete). Prefer Retell's exclude-PII
storage mode where feasible. Cite: Cal. Civ. Code 1798.140; Retell compliance docs.

**R-23 `[schema]` Separate consent-proof lifecycle.** Retain the consent/authorization
records (R-1, R-2) and audit log (R-24) independently of content data; keep internal
DNC entries >= 5 years (47 CFR 64.1200(d)(6)) and consent proof at least until
revocation (Twilio). Purging a recording must not purge its consent/audit trail.

**R-26 `[engine][legal] Voiceprint avoidance is the default.** Do NOT extract
voiceprints / reusable voice embeddings / speaker-ID templates from recordings by
default. Generating them triggers BIPA (740 ILCS 14, private right of action,
$1,000-$5,000/violation), Texas CUBI, and WA RCW 19.375. If a feature ever requires
voiceprints, gate it behind: written notice + release before collection (BIPA
15(b)), a published retention/destruction schedule (BIPA 15(a)), no-sale controls
(15(c)), and per-state consent. Treat "do we ever voiceprint" as a launch-blocking
decision (open question Q12).

---

## Requirement-to-slice index

| Slice | Consumes |
| --- | --- |
| Slice 4 (playbooks/prompt) | R-4, R-12, R-13, R-14, R-27 (shared enum) |
| Slice 5 (tenancy/schema/billing) | R-1, R-2, R-9, R-18, R-19, R-22, R-23, R-24, R-27 |
| Slice 6 (policy engine) | R-3, R-5, R-6, R-7, R-8, R-10, R-20, R-25, R-26, R-27, R-28 |
| Slice 8 (dispatch UX) | R-1 (two-gate approval), R-25 (deny reasons surfaced) |
| Slice 9 (hardening/readiness) | open-legal-questions.md checklist; all `[legal]` items |
| Ops / provisioning | R-11, R-15, R-16, R-17, R-18, R-19, R-21, R-22, R-28 |
| Attorney sign-off (`[legal]`) | R-3, R-8, R-21, R-26, R-27, R-28 + all open questions |
