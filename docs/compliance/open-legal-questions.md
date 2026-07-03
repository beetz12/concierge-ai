# Open Legal Questions for a Telecom Attorney

This pack is engineering-grade research, not legal advice. The items below are the
unresolved questions a licensed telecom/privacy attorney must answer before launch.
Each carries our current WORKING ASSUMPTION (the fail-safe default the product uses
until counsel rules otherwise), why it matters, and the cost of a wrong answer.
These map to the `[legal]`-tagged requirements in `product-requirements.md` and to
UNVERIFIED flags in `regulatory-survey.md`. Slice 9 (production hardening) treats this
list as a launch checklist.

---

**Q1. Is a buyer-side verification call ("what is your availability / rate?") a
"telephone solicitation" / "telephonic sales call"?**
Working assumption: NO for the pure informational case (it does not encourage a
purchase FROM the called business; the caller is a prospective buyer), so it is
`prior_express` tier, not `prior_express_written`. But we FAIL SAFE and still apply
quiet hours, recording disclosure, and AI disclosure. Why it matters: the answer
determines the consent tier (R-3), whether most mini-TCPAs (FL/OK/MD/CT) apply at
all, and DNC-registry reach. A wrong "it's not a solicitation" answer exposes every
such call to PEWC and mini-TCPA liability ($500-$1,500/call). This is the single
highest-leverage classification question for the whole product.

**Q2. What are the exact codified sections and private-right-of-action mechanics of
Texas SB 140 (2025) as enacted?**
Working assumption: it extends "telephone solicitation" (Bus. & Com. Code ch. 302)
to texts/images with a DTPA private right of action, effective Sep 1, 2025. Cross-
references UNVERIFIED. Why it matters: Texas is a high-volume state; misciting the
consent standard risks systematic non-compliance for TX numbers.

**Q3. Does obtaining consent remove a call from the "telephone solicitation"
definition and therefore from the 8 a.m.-9 p.m. quiet-hours window (47 CFR
64.1200(c)(1))?**
Working assumption: NO -- we enforce quiet hours on all solicitation calls regardless
of consent. District courts have split. Why it matters: if counsel says consent does
moot quiet hours, we can widen dispatch windows; if we wrongly assume it does, we
incur per-call quiet-hours violations. We keep the strict default.

**Q4. Is the internal-DNC opt-out honoring deadline 30 days or 10 business days under
the current 47 CFR 64.1200(d)(3)?**
Working assumption: 30 days is the operative FCC figure; some secondary sources cite
10 business days from an older version. We build to the STRICTER effective deadline
(honor ASAP, cap at whichever counsel confirms is current). Why it matters: a missed
statutory suppression deadline is a per-violation DNC claim under 227(c)(5).

**Q5. How do we reliably derive the called party's STATE (for recording-consent and
quiet-hours) when number portability and VoIP mean the area code is not the physical
location?**
Working assumption: derive `target_state` from the best available signal (provided
service address > billing/lead address > number geolocation) and FAIL SAFE to
all-party + wireless when uncertain (R-6). Why it matters: recording-consent and
quiet hours are keyed on the callee's actual location; an area-code-only heuristic
can silently place an all-party-state resident into a one-party path (felony exposure
in CA/FL/MD/PA). Counsel should confirm the defensible standard for "reasonable"
state determination.

**Q6. Does the California B.O.T. Act (Cal. Bus. & Prof. Code 17940-17943) apply to AI
VOICE phone calls, or only to online text/chat bots?**
Working assumption: uncertain/contested; we rely on AB 2905 (Pub. Util. Code 2874) as
the on-point voice authority and disclose AI on every call anyway, which satisfies
both. Why it matters: scope affects whether the B.O.T. Act's separate disclosure duty
attaches to voice; our universal-disclosure posture makes this low-risk in practice
but counsel should confirm.

**Q7. What is the CURRENT enacted text and effective date of the Utah AI Policy Act
(post-2025 amendments) and the Colorado AI Act (post-2026 repeal/replace)?**
Working assumption: UT requires reactive disclosure on request + proactive in
regulated occupations (eff. May 1, 2024, narrowed 2025); CO requires proactive
consumer AI disclosure with an UNSETTLED date (repealed/replaced by a 2026 act,
~Jan 2027). We disclose AI on every call, satisfying both regardless. Why it matters:
if we operate in a UT "regulated occupation" context we owe proactive disclosure; the
CO trigger date affects when proactive consumer disclosure becomes mandatory (already
covered by our default).

**Q8. What is the finalization status of the FTC's proposal to extend the
Impersonation Rule (16 CFR Part 461) to individuals and to add "means and
instrumentalities" liability for platforms?**
Working assumption: proposed, not confirmed final as of this research; we
pre-emptively build provenance/authorization checks (R-13, R-20) so the platform
cannot be used to impersonate. Why it matters: if finalized, a platform that "knows or
has reason to know" its tool is used to impersonate could face DIRECT liability -- our
on-behalf-of attestation and provenance checks are the mitigating controls, and
counsel should confirm they are sufficient.

**Q9. What is the correct Twilio A2P 10DLC registration architecture for a
multi-tenant ISV (register each tenant as its own brand/campaign, or use a
secondary/ISV path)?**
Working assumption: register each tenant as a brand/campaign and gate sending until
approved (R-18); exact ISV path UNVERIFIED. Why it matters: wrong registration
architecture means carrier filtering, surcharges, and blocked deliverability, and can
put unvetted tenant traffic under our brand's trust score. Confirm with Twilio and
counsel.

**Q10. What is the current enforceability of the FCC one-to-one consent rule (FCC
23-49), and the current compliance date for the "revoke-all" company-wide portion of
the revocation rule (FCC 24-24, waiver DA 25-312 to Apr 11, 2026)?**
Working assumption: treat prior-express-written-consent-per-seller as the stable
requirement regardless of the one-to-one rule's litigation status; build cross-campaign
opt-out propagation now and confirm the live "revoke-all" date at build. Why it
matters: consent-sourcing model and the scope of a single opt-out both depend on the
live posture, which has been in flux.

**Q11. What do Retell AI's Terms of Service ACTUALLY require of us regarding consent,
AI disclosure, recording consent, calling windows, DNC, indemnification, and consent-
record retention?**
Working assumption (direction confirmed, exact wording UNVERIFIED): the customer is
solely responsible for telecom-law compliance; Retell does not obtain consent for us;
we must configure agents to disclose identity/purpose and AI nature, disclose
recording and obtain required consent, respect 8 a.m.-9 p.m. and DNC, and indemnify
Retell. Why it matters: these clauses define our residual liability and what we must
pass through to tenants (R-21). Read the live ToS before signing and before drafting
our tenant AUP.

**Q12. Will the product ever generate voiceprints / reusable voice embeddings /
speaker-ID templates from call recordings?**
Working assumption: NO by default (R-26) -- storing raw recordings alone is "audio
personal data" (lower risk); generating voiceprints triggers Illinois BIPA's private
right of action ($1,000-$5,000/violation), Texas CUBI, and WA RCW 19.375. Why it
matters: this is the single most consequential biometric-exposure decision. If any
future feature (voice authentication, speaker diarization that persists a speaker
model) needs voiceprints, it is a LAUNCH-BLOCKING change requiring written consent,
published retention schedules, and no-sale controls. Counsel must approve any move
away from the no-voiceprint default.

**Q13. What is our EU/GDPR exposure, and can we contractually and technically fence
EU data out of the US-first launch?**
Working assumption: US-only at launch; EU/GDPR deferred. Do not process EU residents'
voice without an Art. 6 basis (and Art. 9 explicit consent if voiceprinting); sign
Retell's DPA/SCCs before any EU traffic. Why it matters: inadvertently processing EU
personal (or special-category biometric) data without a lawful basis is a separate,
significant regulatory regime. Counsel should confirm the geo-fencing approach is
adequate.

**Q14. What is the defensible standard for resolving a called number's LINE TYPE
(wireless vs landline) and for the reassigned-number risk, and must we consult the
FCC Reassigned Numbers Database?**
Working assumption: resolve line type via a carrier/LRN dip and FAIL SAFE to wireless
on uncertainty (R-28); scrub high-volume campaign numbers against the FCC Reassigned
Numbers Database (reassigned.us) before relying on stored consent, treating a
reassignment hit as invalidating consent. Why it matters: wireless has no B2B
carve-out, so misclassifying a wireless number as a landline drops it into a
lower-consent path (227(b) exposure); and consent obtained from a prior subscriber
does not bind a new one after reassignment. The TCPA safe harbor for reassigned
numbers turns on using the official database -- counsel should confirm whether our
volume and use case require it and what a "reasonable reliance" defense needs.

---

## Cross-cutting note for counsel

The product's core defensive posture is: (1) disclose identity + AI + recording on
EVERY call; (2) fail closed to the stricter rule on any uncertainty (wireless +
all-party + PEWC); (3) evaluate consent tier by call purpose per call; (4) suppress on
any opt-out within the statutory window and retain the audit/consent trail separately
from content; (5) do not generate voiceprints. We ask counsel to confirm this posture
is sufficient for a launch that mostly calls US businesses but will sometimes reach
individuals and sole proprietors, and to prioritize Q1, Q5, and Q12 as the
highest-leverage items.
