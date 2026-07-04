# Legal Risk Assessment - AI Concierge Outbound Calling

**Date**: 2026-07-04
**Assessor**: AI legal-risk assistant, acting in a telecom/privacy attorney frame
**Matter**: Pre-launch compliance posture for a multi-tenant SaaS that places AI-voiced outbound calls (via Retell AI) on behalf of customers to US businesses and, at times, individuals and sole proprietors.
**Privileged**: Prepare/treat as attorney-client privileged work product once a licensed attorney adopts it.

> **CAVEAT (read first).** This is an internal risk assessment to structure the product and to scope an engagement with outside counsel. It is NOT legal advice and NOT a substitute for a licensed telecom/privacy attorney's sign-off. Statutory citations are provided for the attorney to verify against current text; several cited items are in active regulatory or litigation flux (noted inline). Do not place real outbound calls at scale in reliance on this memo alone.

---

## 1. Executive summary

The product's core defensive posture - disclose identity + AI + recording on every call, fail closed to the stricter rule on any uncertainty, evaluate consent tier per call purpose, suppress on opt-out within the statutory window, and generate no voiceprints - is **strong and above market** for a US-first launch. It is close to sufficient, with **one material gap the pack under-weights** (see Q1) and three items that genuinely require outside-counsel sign-off before dialing at scale (Q1, Q5, Q12).

**The single most important correction in this review:** the highest-leverage risk in Q1 is not the "solicitation" classification (the working assumption there is defensible). It is that an **AI-generated voice is an "artificial voice" under TCPA 47 U.S.C. 227(b)**, per the FCC's Feb 8, 2024 Declaratory Ruling (CG Docket No. 23-362). Section 227(b) consent applies to artificial-voice calls to **wireless numbers and residential lines regardless of whether the call is a solicitation**. "Disclosure + quiet hours" does not cure a 227(b) consent gap. Because sole proprietors and small contractors overwhelmingly answer on **cell phones**, a meaningful share of target calls sit under 227(b), not merely the DNC/solicitation regime the pack focuses on.

### Risk register (all 14 questions)

| ID | Question (short) | Category | Sev | Like | Score | Level |
|---|---|---|---|---|---|---|
| Q1 | Artificial-voice consent + is a buyer call a solicitation | Regulatory/TCPA | 5 | 4 | 20 | RED |
| Q5 | Deriving callee's physical state (recording + quiet hours) | Regulatory/Privacy | 4 | 2 | 8 | YELLOW |
| Q12 | Voiceprints / BIPA-CUBI-WA (no-voiceprint default) | Data Privacy/Biometric | 5 | 1 | 5 | YELLOW* |
| Q2 | TX SB 140 codified sections + private right | Regulatory | 3 | 3 | 9 | YELLOW |
| Q3 | Consent moots quiet hours? | Regulatory | 3 | 2 | 6 | YELLOW |
| Q4 | Internal DNC honoring deadline (30d vs 10bd) | Regulatory | 3 | 2 | 6 | YELLOW |
| Q6 | CA B.O.T. Act applies to voice? | Regulatory | 2 | 2 | 4 | GREEN |
| Q7 | UT AI Policy Act / CO AI Act status | Regulatory | 2 | 2 | 4 | GREEN |
| Q8 | FTC impersonation-rule extension | Regulatory | 3 | 2 | 6 | YELLOW |
| Q9 | A2P 10DLC ISV registration architecture | Regulatory/Ops | 3 | 3 | 9 | YELLOW |
| Q10 | One-to-one consent + revoke-all date | Regulatory | 3 | 3 | 9 | YELLOW |
| Q11 | Retell ToS pass-through obligations | Contract | 3 | 3 | 9 | YELLOW |
| Q13 | EU/GDPR geo-fencing | Data Privacy | 4 | 2 | 8 | YELLOW |
| Q14 | Line-type + reassigned-number resolution | Regulatory | 4 | 3 | 12 | ORANGE |

\*Q12 is GREEN-to-YELLOW **only while the no-voiceprint default holds**; any feature that generates a voiceprint flips it to RED (Critical x Likely) and is launch-blocking.

**Launch gate:** Q1 (add a 227(b) artificial-voice consent gate) is a build-blocker; Q5, Q12, and Q14 need outside-counsel confirmation of the "reasonable reliance" standards; the rest are mitigate-and-monitor.

---

## 2. Priority question deep dives

### Q1 - Artificial-voice consent, and buyer-side solicitation classification

**Risk description.** Placing AI-voiced outbound calls without the consent the TCPA requires for the specific target line type and call purpose.

**Analysis - two distinct rules, only one of which the pack foregrounds:**

1. **Solicitation / DNC track (227(c); 47 CFR 64.1200(f)(15)).** A "telephone solicitation" is a call "for the purpose of encouraging the purchase or rental of, or investment in, property, goods, or services." A prospective **buyer** calling a contractor to ask availability/rate is not encouraging a purchase *from* the called party. **The working assumption is defensible**: pure buyer-side informational calls are generally not telephone solicitations, so residential-DNC (227(c)) and most mini-TCPA solicitation rules do not attach, and the consent tier is not prior-express-written (PEWC). Caveat: the moment the call pivots to pitching the caller's own services (e.g., "would you like to hire us"), it can become a solicitation - keep the agent's objective strictly buyer-side, which the product's playbooks already do.

2. **Artificial/prerecorded-voice track (227(b)) - the larger, under-weighted risk.** Independent of solicitation status, 227(b)(1) restricts calls using an "artificial or prerecorded voice" to (A)(iii) **any wireless number** and (B) **residential lines**. The **FCC Declaratory Ruling of Feb 8, 2024 (CG Docket 23-362)** holds that **AI-generated voices are "artificial voice"** within 227(b). Consequence: an AI-voiced call to a **cell phone** needs **prior express consent** (and PEWC if it is also a solicitation) regardless of B2B status - there is no blanket business-to-business carve-out for the artificial-voice restriction to wireless numbers. Business *landlines* are largely outside 227(b)(1)(B)'s "residential line" scope, but small-contractor and sole-proprietor targets predominantly answer on cells.

**Is the working assumption defensible?** On solicitation - yes. On the whole picture - **incomplete and the exposure it leaves is the product's single largest.** "Disclose + quiet hours + record-notice" is good practice but does **not** substitute for 227(b) consent on artificial-voice calls to wireless/residential numbers.

**Residual risk / exposure.** 227(b) is $500 per violation, trebled to $1,500 for willful/knowing, with an uncapped private right of action and a robust plaintiff's bar - the classic class-action driver. At scale this is existential.

**Severity 5 (Critical) x Likelihood 4 (Likely, given AI-voice to cells) = 20 (RED).**

**Recommendation.**
- Add a **line-type + consent gate** to dispatch: for any target resolved as wireless or residential, an AI-voiced call requires a documented lawful basis (prior express consent, an established-business-relationship/exemption analysis, or a recognized exemption). Where none exists, route to a **non-artificial-voice path** (live human, or do not auto-dial) or suppress. This composes with Q14 (line-type resolution) - build them together.
- Have outside counsel opine on (a) whether any 227(b) exemption (e.g., the limited non-telemarketing exemptions) fits the buyer-side use case, and (b) the sufficiency of the on-behalf-of consent model tenants supply.
- Keep the agent objective strictly buyer-side to preserve the non-solicitation position.

---

### Q5 - Deriving the called party's physical state

**Risk description.** Applying the wrong recording-consent regime (one-party vs all-party) or the wrong quiet-hours window because area code no longer reliably indicates the callee's physical location (number portability, VoIP).

**Analysis.** Recording-consent and quiet-hours obligations key to the callee's actual location, not the area code. State wiretap statutes (e.g., Cal. Penal Code 632; Fla. Stat. 934.03; 18 Pa. C.S. 5703; 720 ILCS 5/14-2) turn on where the recorded party is; choice-of-law authority (e.g., *Kearney v. Salomon Smith Barney*, 39 Cal. 4th 95 (2006)) applies the stricter state's law when a resident of an all-party state is recorded, even by a caller in a one-party state. There is **no bright-line "reasonable determination" safe harbor** for state derivation.

**The mitigant that de-risks this.** The product's posture is to **announce recording on every call and fail closed to all-party**. That universal all-party disclosure largely **moots the recording-consent side of Q5**: if every callee hears a recording notice and an opportunity to object, the one-vs-all-party derivation error stops being outcome-determinative for recording liability. State derivation still matters for (a) **quiet hours** (correct local time) and (b) **which mini-TCPA** attaches - lower-stakes, and the area-code-with-fail-safe-plus-buffer approach is reasonable for time-of-day.

**Is the working assumption defensible?** Yes. The waterfall (service address > billing/lead address > number geolocation) with fail-safe to all-party + wireless is a sound "reasonable reliance" design, and the universal disclosure is the real protection.

**Residual risk / exposure.** All-party-consent violations can be criminal (felony/misdemeanor) in CA/FL/MD/PA plus civil statutory damages; but the universal-disclosure design makes materialization **Unlikely (2)**. Severity remains **High (4)** because the downside is criminal. **4 x 2 = 8 (YELLOW).**

**Recommendation.** Keep universal recording disclosure as a hard invariant (do not let any path skip it). Document the state-derivation waterfall and the fail-safe. Ask counsel to bless (a) the waterfall as "reasonable," and (b) whether a spoken pre-recording announcement plus continued participation is sufficient consent in the all-party states you will touch, or whether an affirmative "yes" capture is advisable for CA/PA.

---

### Q12 - Voiceprints / biometric exposure

**Risk description.** Generating biometric identifiers (voiceprints, reusable speaker embeddings, speaker-ID templates) from call audio, triggering biometric-privacy statutes.

**Analysis.** The controlling risk is **Illinois BIPA (740 ILCS 14)**: a private right of action with **$1,000 (negligent) / $5,000 (intentional or reckless)** per violation, and - after *Cothron v. White Castle*, 2023 IL 128004 - **per-capture accrual**, which makes aggregate exposure enormous. A "voiceprint" is a BIPA biometric identifier when it is a voice template used to identify a person. **Texas CUBI (Bus. & Com. Code 503.001)** adds AG enforcement at up to $25,000 per violation (no private right); **Washington RCW 19.375** is similar. Critically, **storing raw call recordings alone is generally not a biometric identifier** - it is audio personal data at a lower risk tier. The line is crossed when the system **derives a voice template** for identification.

**Is the working assumption defensible?** Yes, and it is the correct launch posture. "No voiceprints by default" keeps the product out of the private-right-of-action zone. This is the most consequential single biometric decision and the pack rightly prioritizes it.

**Residual risk / exposure.** While the no-voiceprint default holds: **Severity 5 (Critical) x Likelihood 1 (Remote) = 5 (YELLOW, effectively GREEN in practice).** If any feature (voice authentication, persistent speaker diarization that stores a speaker model, fraud voice-matching) generates or retains a voiceprint, it flips to **Critical x Likely = RED and is launch-blocking**.

**Recommendation.**
- Make "no voiceprint / no persistent speaker embedding" an **architectural guardrail**, not just a policy, and add a startup/CI assertion or documented control that the STT/diarization vendors (including Retell and any downstream models) do **not** persist speaker templates.
- Any future voiceprint feature is a hard gate: BIPA-compliant written release + published retention/destruction schedule + no-sale controls + counsel sign-off before collection.
- Confirm with the vendor in writing that transient diarization does not create a retained biometric template.

---

## 3. Remaining questions (mitigate and monitor)

- **Q14 - Line-type + reassigned numbers (ORANGE, 12).** Elevated because it is the technical predicate for the Q1 227(b) gate. Resolve line type via a carrier/LRN dip, fail safe to wireless on uncertainty, and scrub campaign numbers against the FCC Reassigned Numbers Database (reassigned.us); treat a reassignment hit as invalidating stored consent. Counsel to confirm whether your volume/use case needs the database for the safe harbor. **Build with Q1.**
- **Q2 - TX SB 140 (YELLOW, 9).** High-volume state; confirm the enacted codified sections (Bus. & Com. Code ch. 302) and the DTPA private-right mechanics before relying on any TX consent standard.
- **Q3 - Consent vs quiet hours (YELLOW, 6).** District courts split. Keep the strict 8am-9pm-callee-local default; only widen windows if counsel confirms consent moots quiet hours in your target states.
- **Q4 - Internal DNC deadline (YELLOW, 6).** Build to the stricter effective 47 CFR 64.1200(d)(3) deadline (honor opt-outs promptly; cap at whatever counsel confirms is current).
- **Q6 - CA B.O.T. Act (GREEN, 4).** Universal AI disclosure plus reliance on AB 2905 (Pub. Util. Code 2874) covers the voice case regardless of B.O.T. Act scope.
- **Q7 - UT/CO AI acts (GREEN, 4).** Universal AI disclosure satisfies both; monitor the CO effective date.
- **Q8 - FTC impersonation rule (YELLOW, 6).** Keep provenance/on-behalf-of attestation controls; monitor finalization of the 16 CFR Part 461 extension and "means and instrumentalities" liability.
- **Q9 - A2P 10DLC ISV architecture (YELLOW, 9).** Register each tenant as its own brand/campaign and gate sending until approved; confirm the ISV path with Twilio to protect the platform trust score.
- **Q10 - One-to-one consent / revoke-all (YELLOW, 9).** Treat PEWC-per-seller as the stable requirement; build cross-campaign opt-out propagation now; confirm the live "revoke-all" compliance date at build.
- **Q11 - Retell ToS pass-through (YELLOW, 9, Contract).** Read the live ToS before signing; expect customer-sole-responsibility + indemnification; mirror those duties into a tenant AUP so residual liability is passed through.
- **Q13 - EU/GDPR (YELLOW, 8).** Keep US-only at launch; technically and contractually fence out EU data; sign Retell's DPA/SCCs before any EU traffic.

---

## 4. Verdict on the defensive posture

The five-part posture (universal identity + AI + recording disclosure; fail-closed to stricter rule; per-call consent-tier evaluation; opt-out suppression within the statutory window; no voiceprints) is **sufficient for a US-first launch subject to one build change and three counsel sign-offs**:

1. **Build (blocker): add the Q1/Q14 artificial-voice consent + line-type gate.** No AI-voiced call to a wireless/residential number without a documented lawful basis; otherwise route to a non-artificial path or suppress. This is the gap that "disclosure + quiet hours" does not close.
2. **Counsel sign-off before scale:** Q1 (227(b) exemption/consent-model opinion), Q5 (reasonable-reliance state-derivation and all-party consent-capture standard), Q12 (confirm the no-voiceprint boundary and vendor non-persistence).
3. **Contract:** Q11 - read the live Retell ToS and mirror obligations into the tenant AUP before onboarding paying tenants.

With item 1 built and items 2-3 confirmed, the residual posture is defensible and market-leading. Until then, restrict live dialing to (a) known business landlines, or (b) numbers with documented prior express consent, under the strict fail-closed defaults already implemented.

---

## 5. Recommended outside-counsel engagement

Engage a **telecom (TCPA/TSR) + privacy (biometric/BIPA)** specialist - this is unsettled, high-exposure, multi-jurisdiction law (a "strongly recommended engagement" trigger under the framework). Scope the engagement to: the Q1 227(b) opinion and consent model, the Q5 reasonable-reliance standard, the Q12 no-voiceprint boundary, the Retell ToS pass-through (Q11), and the A2P 10DLC ISV architecture (Q9). Ask for a written opinion on items 1-3 above as the gating deliverable before scaled dialing.

### Next steps
1. Build the Q1/Q14 artificial-voice + line-type consent gate - Engineering - before any scaled dialing.
2. Retain telecom+privacy outside counsel; deliver this memo + the compliance pack as the brief - Owner - near-term.
3. Obtain written sign-off on Q1, Q5, Q12 - Outside counsel - launch gate.
4. Read live Retell ToS; draft tenant AUP mirroring pass-through duties - Owner + counsel - before first paying tenant.
