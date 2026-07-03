# Regulatory Survey: AI Outbound Calling and SMS as a Multi-Tenant US SaaS

Engineering-grade research, not legal advice. Every substantive claim carries an
inline citation to a primary or authoritative source. Items that could not be
verified from a primary source are marked UNVERIFIED and carried to
`open-legal-questions.md`. ASCII-only typography.

Product under analysis: a multi-tenant SaaS where customers dispatch AI-voiced,
recorded phone calls (Retell AI) and A2P SMS (Twilio) to US businesses and,
occasionally, to individuals and sole proprietors, to run errands, screen
providers, and manage dispute-resolution campaigns.

---

## 0. Threshold rule: an AI-generated voice IS an "artificial voice" (read first)

This single rule reframes everything below. On Feb 8, 2024 the FCC released a
Declaratory Ruling holding that calls using AI technologies to generate human
voices (including voice cloning) are an "artificial or prerecorded voice" under
the TCPA. In re Implications of Artificial Intelligence Technologies on Protecting
Consumers from Unwanted Robocalls and Robotexts, FCC 24-17, CG Docket No. 23-362,
adopted Feb 2, 2024, released Feb 8, 2024, effective on release.

- FCC 24-17 ruling text: https://docs.fcc.gov/public/attachments/FCC-24-17A1.pdf
- FCC summary: https://www.fcc.gov/document/fcc-confirms-tcpa-applies-ai-technologies-generate-human-voices

Consequence: every synthetic-voice call this product places is a regulated
artificial-voice call. There is no "it's AI, not a recording" escape hatch. The
full artificial-voice stack attaches -- consent (per call purpose), the caller
identification rules, quiet hours for solicitations, and opt-out handling -- and
this attaches regardless of do-not-call-registry status and regardless of the
B2B/consumer line. The prudent product posture is to disclose AI use and record
consent on every call.

---

## 1. Federal TCPA (47 U.S.C. 227)

The TCPA is codified at 47 U.S.C. 227. Primary text:
https://www.law.cornell.edu/uscode/text/47/227 and (govinfo)
https://www.govinfo.gov/link/uscode/47/227 . FCC-compiled rules:
https://www.fcc.gov/sites/default/files/tcpa-rules.pdf .

**The two operative prongs (both in the disjunctive -- "ATDS OR artificial voice"):**
- Wireless -- 47 U.S.C. 227(b)(1)(A)(iii): unlawful to call any number assigned to
  a cellular service using an ATDS OR an artificial/prerecorded voice without
  prior express consent. There is NO business-use carve-out for wireless numbers.
- Residential -- 47 U.S.C. 227(b)(1)(B): unlawful to initiate a call to a
  residential line using an artificial/prerecorded voice without prior express
  consent, subject to narrow FCC exemptions.

**ATDS after Facebook v. Duguid, 592 U.S. 395 (2021)**
(https://www.law.cornell.edu/supremecourt/text/19-511): an ATDS must use a random
or sequential number generator; dialing from a curated customer list is not an
ATDS. This narrowing does NOT help an AI-voice product, because the
artificial-voice prong is independent of the ATDS prong -- a synthetic-voice call
from a customer-supplied list still triggers the full artificial-voice consent
regime.

**Consent tiers** (47 CFR 64.1200,
https://www.law.cornell.edu/cfr/text/47/64.1200 ; eCFR
https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-L/section-64.1200):
- Prior express consent (PEC) -- required for informational/transactional
  artificial-voice calls.
- Prior express WRITTEN consent (PEWC) -- required when the call includes or
  introduces an advertisement or constitutes telemarketing (47 CFR
  64.1200(a)(2)-(3); PEWC defined at 64.1200(f)(9)). Electronic signatures under
  E-SIGN qualify.
- Engineering consequence: the consent tier is a function of CALL PURPOSE, set per
  call, not per tenant. A pure appointment/verification call is informational
  (PEC); any pitch/upsell is telemarketing (PEWC).

**Quiet hours -- 47 CFR 64.1200(c)(1):** no telephone SOLICITATION to a
residential subscriber before 8 a.m. or after 9 p.m. at the CALLED party's local
time. The scheduler must resolve local time from the destination number, not the
platform timezone. Whether consent removes a call from "solicitation" (and thus
from quiet hours) is CONTESTED; districts have split. Safe default: enforce
8 a.m.-9 p.m. on all solicitation calls regardless of consent.

**Caller identification -- 47 CFR 64.1200(b):** every artificial/prerecorded
message must (b)(1) state at the START the identity of the responsible business,
(b)(2) state during/after the call a call-back number that can be used to make a
do-not-call request, and (b)(3) for telemarketing, provide an automated interactive
opt-out. These are per-tenant, per-call-type template fields the prompt layer must
inject.

**Revocation -- FCC 24-24** (Report and Order, released Feb 16, 2024, CG Docket
02-278 & 21-402), codified at 47 CFR 64.1200(a)(10)-(12):
https://docs.fcc.gov/public/attachments/FCC-24-24A1.pdf . A called party may revoke
consent by ANY reasonable means; keywords "stop, quit, end, revoke, opt out,
cancel, unsubscribe" are per se reasonable; revocation must be honored no later
than 10 business days. The company-wide "revoke-all" prong was subject to a waiver
delaying it to Apr 11, 2026 (DA 25-312,
https://docs.fcc.gov/public/attachments/DA-25-312A1.pdf) -- re-verify current
posture at build (see open questions Q10).

**Damages / private right of action -- 47 U.S.C. 227(b)(3):** $500 per violation,
trebled to $1,500 for willful/knowing; separate DNC private right of action under
227(c)(5). Statutory damages accrue per call, so automated volume creates linear,
class-action-scale exposure. Willfulness requires only intent to make the call,
not intent to break the law.

**B2B vs residential/wireless, and the sole-proprietor gray zone.** Calls to a
genuine business LANDLINE carry materially lower federal exposure (the residential
prohibition and the national DNC registry protect "residential subscribers," not
business lines). But WIRELESS numbers have NO business carve-out, and a "business"
contact increasingly answers on a cell. The Ninth Circuit in Chennette v.
Porch.com, Inc., 50 F.4th 1217 (9th Cir. 2022), held mixed-use cell numbers
(business-advertised but also personal) are presumptively residential for DNC
standing. Engineering consequence: you cannot reliably distinguish a sole
proprietor's business cell from a personal cell at dial time -- treat all wireless
numbers as residential-equivalent for consent, quiet hours, and DNC.
Federal Register context on exempted calls:
https://www.federalregister.gov/documents/2021/02/25/2021-01190/limits-on-exempted-calls-under-the-telephone-consumer-protection-act-of-1991 .

---

## 2. State mini-TCPAs (stricter than federal)

Most mini-TCPAs turn on a "telephonic sales call" / "telephone solicitation"
trigger -- i.e., a call that pitches or induces a purchase. A buyer-side call that
only verifies availability or rates is arguably outside the solicitation
definition, but this is a fact-specific line worth counsel review (see open
questions Q1). The AI-voice-disclosure laws in section 3 are content-neutral and
should be assumed to apply to all outbound AI calls.

- **Florida -- FTSA, Fla. Stat. 501.059** (SB 1120, 2021; narrowed by HB 761,
  2023): https://www.flsenate.gov/Laws/Statutes/2023/501.059 . Prior express
  written consent for automated sales calls/texts; the 2023 amendment changed
  "selection OR dialing" to "selection AND dialing" and limited it to UNSOLICITED
  calls. Stricter quiet hours 8 a.m.-8 p.m. called-party-local. SMS requires a
  STOP reply then a 15-day cure window. Damages $500 / $1,500. Most-litigated
  mini-TCPA. HB 761 enrolled text:
  https://www.flsenate.gov/Session/Bill/2023/761/BillText/er/PDF .
- **Oklahoma -- OTSA, Okla. Stat. tit. 15, 775C.1** (eff. Nov 1, 2022):
  https://oksenate.gov/sites/default/files/2022-05/os15.pdf . FTSA-style prior
  express written consent, but kept the broader "selection OR dialing" language,
  so arguably reaches click-to-dial; $500 PRA, no fee-shifting.
- **Washington -- RCW 80.36.400** (ADAD):
  https://app.leg.wa.gov/rcw/default.aspx?cite=80.36.400 . FLAT PROHIBITION (not a
  consent regime) on using an automatic dialing-and-announcing device for
  commercial solicitation to WA customers; per se Consumer Protection Act
  violation, presumed $500/recipient. A recorded AI pitch call to WA is barred
  regardless of consent. SMS: CEMA RCW 19.190 bars unsolicited commercial texts:
  https://app.leg.wa.gov/rcw/default.aspx?cite=19.190 .
- **Maryland -- Stop the Spam Calls Act, SB 90 (Md. Code Com. Law 14-3201)** (eff.
  Jan 1, 2024): https://mgaleg.maryland.gov/2023RS/Chapters_noln/CH_413_sb0090e.pdf
  . Prior express written consent; max 3 calls per 24 hrs to a number; MD Consumer
  Protection Act private right of action.
- **Connecticut -- PA 23-98 amending Conn. Gen. Stat. 42-288a** (eff. Oct 1, 2023):
  https://www.cga.ct.gov/current/pub/chap_743m.htm . Prior express written consent;
  broadened covered technologies (texts/media); CUTPA penalties up to
  $20,000/violation.
- **Texas -- SB 140 (2025), amending Bus. & Com. Code ch. 302** (eff. Sep 1, 2025):
  https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=SB140 .
  Extends "telephone solicitation" to texts/images; private right of action via
  the Texas DTPA. Exact codified cross-references UNVERIFIED (open questions Q2).
- **New York -- GBL 399-p** (ADAD/prerecorded):
  https://www.nysenate.gov/legislation/laws/GBS/399-P . Prerecorded messages
  require a prior express agreement and an interactive opt-out; GBL 399-z is the
  state DNC registry: https://www.nysenate.gov/legislation/laws/GBS/399-Z .
- **California -- ADAD rules, Cal. Bus. & Prof. Code 17590 et seq.** and Pub. Util.
  Code 2871-2876 (see section 3 for AB 2905).

Per-state deltas are tabulated in `policy-matrix.md`.

---

## 3. Bot and AI-disclosure laws

- **California B.O.T. Act -- Cal. Bus. & Prof. Code 17940-17943** (SB 1001, eff.
  Jul 1, 2019):
  https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=201720180SB1001
  . Unlawful to use a bot to communicate with a Californian with intent to mislead
  about its artificial identity to incentivize a sale or influence a vote; safe
  harbor is clear, conspicuous disclosure that it is a bot. Applicability to VOICE
  calls (vs web chat) is contested/UNVERIFIED -- AB 2905 is the safer voice
  authority (open questions Q6).
- **California AB 2905 -- Cal. Pub. Util. Code 2874** (eff. Jan 1, 2025):
  https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202320240AB2905
  . An ADAD call must disclose at the start if the prerecorded message uses an
  "artificial voice" (a voice generated or significantly altered using AI). This
  is the most directly on-point AI-voice-disclosure law and hits essentially every
  AI voice call to California.
- **Utah AI Policy Act -- Utah Code 13-2-12 and Title 13, ch. 72** (SB 149, eff.
  May 1, 2024): https://le.utah.gov/~2024/bills/static/SB0149.html . Reactive
  disclosure: if a person asks whether they are dealing with AI, you must clearly
  disclose. Proactive disclosure at the start for regulated occupations. 2025
  amendments narrowed the general duty -- confirm current text (open questions Q7).
- **Colorado AI Act -- Colo. Rev. Stat. 6-1-1701 et seq.** (SB 24-205):
  https://leg.colorado.gov/bills/sb24-205 . Proactive "you are interacting with an
  AI system" disclosure for consumer-facing AI. EFFECTIVE DATE UNSETTLED --
  repealed/replaced by a 2026 act with a ~Jan 2027 date; do not hard-code (open
  questions Q7).

Product posture: disclose AI on every call in every state (fail-safe). These
mandates are then satisfied by construction.

---

## 4. Call-recording consent

**Federal baseline -- 18 U.S.C. 2511(2)(d)** (Wiretap Act / ECPA):
https://www.law.cornell.edu/uscode/text/18/2511 . One-party consent federally; the
only carve-out is recording for a criminal or tortious purpose. States may impose
stricter all-party rules, and for an outbound call the CALLED party's state law
governs.

**All-party-consent states the engine must fail closed to (13):** CA (Cal. Penal
Code 632/632.7), FL (Fla. Stat. 934.03), IL (720 ILCS 5/14-2), MD (Md. Cts. & Jud.
Proc. 10-402), MA (Mass. Gen. Laws ch. 272, 99 -- strictest, bars any secret
recording), MT (Mont. Code Ann. 45-8-213), NH (N.H. Rev. Stat. 570-A:2), PA (18 Pa.
Cons. Stat. 5703/5704), WA (Wash. Rev. Code 9.73.030), plus four disputed states
treated as all-party out of caution: CT (Conn. Gen. Stat. 52-570d civil telephonic),
NV (Nev. Rev. Stat. 200.620, construed all-party in Lane v. Allstate, 114 Nev.
1176 (1998)), DE (11 Del. C. 1335 vs 2402 conflict), MI (Mich. Comp. Laws 750.539c
facially all-party; Sullivan v. Gray participant gloss).

**Do not mis-classify Oregon:** ORS 165.540(1)(a) is one-party for TELEPHONE
recording; all-party notice applies only to in-person. Vermont has no wiretap
statute (federal one-party governs). Full 51-row breakdown with statute cites in
`policy-matrix.md`.

Primary sources: CA Penal Code 632
(https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=PEN&division=&title=15.&part=1.&chapter=1.5.&article=),
IL 720 ILCS 5/14-2
(http://www.ilga.gov/legislation/ilcs/fulltext.asp?DocName=072000050K14-2),
PA 18 Pa.C.S. ch. 57
(https://www.palegis.us/statutes/consolidated/view-statute?txtType=HTM&ttl=18&div=0&chpt=57),
WA RCW 9.73.030 (https://app.leg.wa.gov/rcw/default.aspx?cite=9.73.030),
OR ORS 165.540 (https://oregon.public.law/statutes/ors_165.540),
DE 11 Del. C. 2402 (https://delcode.delaware.gov/title11/c024/sc01/),
NV Lane v. Allstate
(https://law.justia.com/cases/nevada/supreme-court/1998/25670-1.html),
RCFP 50-state guide (https://www.rcfp.org/reporters-recording-sections/summary/).

**Design rule.** Play an audible "this call is being recorded" disclosure at the
top of EVERY call. This satisfies all one-party states, satisfies notice-based
all-party states (WA expressly accepts a recorded announcement under RCW
9.73.030(3); CT and PA notice provisions similarly), and gives the strongest
available posture in Massachusetts (which bars secret recording -- disclosure makes
it not secret). Combined with the AI disclosure and identity disclosure, this is
one compliant opener (see `product-requirements.md` R-12 and the prompt slice).

---

## 5. Do-not-call rules

**National DNC registry -- 47 CFR 64.1200(c)(2)**
(https://www.law.cornell.edu/cfr/text/47/64.1200) and **16 CFR 310.4(b)(1)(iii)**
(https://www.law.cornell.edu/cfr/text/16/310.4). The registry protects RESIDENTIAL
subscribers from "telephone solicitations" (defined 47 CFR 64.1200(f)(15)). Honest
B2B position: calls to a business are generally not covered, because the registry
is residential-only and a non-sales B2B call is not a solicitation. Two caveats
that erode this: (a) a "business" number that is really a personal cell can carry
residential/wireless protection (data-hygiene risk, case-by-case); and (b) being
off the registry does NOT exempt you from 227(b) artificial-voice consent, from
state recording-consent law, or from the internal-DNC duty below.

**Internal / company-specific DNC -- 47 CFR 64.1200(d)** (broader than the
registry): a written DNC policy available on demand (d)(1); personnel training
(d)(2); record and honor opt-out requests within a reasonable time not to exceed 30
days -- some older sources cite 10 business days, treat 30 days as operative and
re-verify against live eCFR (open questions Q4) -- (d)(3); and 5-year retention of
internal DNC requests (d)(6). FTC parallel: 16 CFR 310.4(b)(1)(iii)(A). This is
triggered by ANY opt-out and applies to cell numbers, so the AI agent must
recognize and honor "put me on your do-not-call list" / "stop calling me"
utterances in real time.

**Litigator scrubs** are an industry best practice (scrubbing dial lists against
databases of known serial TCPA plaintiffs) -- NOT a legal requirement and NOT a
safe harbor. Optional pre-dial filter stage alongside the mandatory national-DNC
scrub and mandatory internal-DNC suppression.

---

## 6. Caller-ID authentication, CNAM, and spam labeling

**STIR/SHAKEN** -- the TRACED Act (Pub. L. 116-105, 2019,
https://www.fcc.gov/TRACEDAct), FCC First Report and Order FCC 20-42
(https://docs.fcc.gov/public/attachments/FCC-20-42A1.pdf), codified at 47 CFR Part
64 Subpart HH, 64.6300-64.6308
(https://www.ecfr.gov/current/title-47/chapter-I/subchapter-B/part-64/subpart-HH ;
64.6301 https://www.law.cornell.edu/cfr/text/47/64.6301). Attestation levels: A
(full -- provider verified the customer's right to the number), B (partial), C
(gateway -- unauthenticated source; correlates with blocking/"Spam Likely"). A SaaS
that is not itself the number-holding carrier generally cannot self-sign at
A-level; it obtains attestation THROUGH its originating carrier, ideally A-level on
verified/customer-owned DIDs and/or via delegate certificates, and must ensure the
origination path is listed in the Robocall Mitigation Database (64.6305).

**Truth in Caller ID -- 47 U.S.C. 227(e)**
(https://www.law.cornell.edu/uscode/text/47/227) and 47 CFR 64.1604: unlawful to
transmit misleading/inaccurate caller ID WITH INTENT to defraud, cause harm, or
wrongfully obtain value; forfeiture up to $10,000/violation. Displaying a
consenting business customer's accurate call-back number is lawful substitution;
the violation is intent-based spoofing, not substitution per se. FCC spoofing
overview: https://www.fcc.gov/consumers/guides/spoofing .

**CNAM / RCD and spam-label remediation.** CNAM is resolved by the terminating
carrier via a database dip; Rich Call Data (RCD)/branded calling lets the
originator assert name/logo. Three analytics engines label numbers -- Hiya (AT&T),
TNS (Verizon), First Orion (T-Mobile). Register numbers across all three for free
via the Free Caller Registry (https://www.freecallerregistry.com/); dispute
erroneous labels via the USTelecom Industry Traceback Group contacts
(https://ustelecom.org/the-industry-traceback-group-itg/call-labeling-and-blocking-points-of-contact/).
Labeling is reputation-driven (accurate identity + A-attestation + low complaint
rate + managed velocity are the levers); it is remediation/prevention, not a legal
safe harbor.

---

## 7. FTC Telemarketing Sales Rule (TSR) -- 16 CFR Part 310

Full rule: https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-310 ;
FTC hub: https://www.ftc.gov/legal-library/browse/rules/telemarketing-sales-rule .
Prerecorded-call rule 16 CFR 310.4(b)(1)(v): outbound prerecorded-message sales
calls need a prior signed written agreement and an interactive opt-out at the start
(https://www.law.cornell.edu/cfr/text/16/310.4). B2B exemption 16 CFR 310.6(b)(7)
(https://www.law.cornell.edu/cfr/text/16/310.6): most genuine B2B telemarketing is
exempt from the TSR EXCEPT (i) the anti-fraud/misrepresentation prohibitions
(310.3(a)(2), (a)(4), (c)) always apply, and (ii) calls to sell nondurable office
or cleaning supplies to businesses are NOT exempt. Critical non-conflation: the TSR
B2B exemption is an FTC-side relief only -- the TCPA (FCC) has no such B2B
exemption, so a B2B AI-voice call exempt under the TSR can still be regulated under
227(b) and 64.1200(d).

---

## 8. FTC Impersonation Rule -- 16 CFR Part 461

Final rule (eff. Apr 1, 2024):
https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-461 ; FTC page
https://www.ftc.gov/legal-library/browse/rules/impersonation-government-businesses-rule
; Federal Register
https://www.federalregister.gov/documents/2024/03/01/2024-04335/trade-regulation-rule-on-impersonation-of-government-and-businesses
. Prohibits materially, falsely posing as or misrepresenting affiliation with a
government or business entity in commerce. Squarely relevant: the product speaks in
a synthetic voice on behalf of a business, so the agent must not misrepresent which
entity it represents. The FTC's Feb 2024 supplemental NPRM would extend protection
to impersonation of INDIVIDUALS and address AI-enabled impersonation, including a
"means and instrumentalities" theory that could reach a PLATFORM that knows or has
reason to know its tool is used to impersonate
(https://www.ftc.gov/news-events/news/press-releases/2024/02/ftc-proposes-new-protections-combat-ai-impersonation-individuals).
Finalization status UNVERIFIED (open questions Q8). Load-bearing controls: verify
which business a tenant is authorized to call "on behalf of," and disclose identity
per 64.1200(b).

---

## 9. SMS: A2P 10DLC, CTIA, and TCPA-for-text

**A2P 10DLC / The Campaign Registry (TCR).** Application-to-person SMS over US long
codes must be tied to a registered Brand and Campaign; carriers pull from TCR to
deliver, throttle, or block, and a Trust Score sets throughput. Unregistered
traffic is surcharged and filtered/blocked. Twilio docs (authoritative for the
customer obligation): https://www.twilio.com/docs/messaging/compliance/a2p-10dlc ,
campaign approval requirements
https://help.twilio.com/articles/11847054539547-A2P-10DLC-Campaign-Approval-Requirements
; TCR https://www.thecampaignregistry.com/ . For a multi-tenant model, register
each tenant as a brand/campaign (ISV path -- exact path UNVERIFIED, confirm with
Twilio; open questions Q9) and gate sending until approved.

**CTIA Messaging Principles and Best Practices** (current May 23, 2023 edition;
carrier-enforced, not law):
https://www.ctia.org/the-wireless-industry/industry-commitments/messaging-interoperability-sms-mms
; PDF
https://api.ctia.org/wp-content/uploads/2023/05/230523-CTIA-Messaging-Principles-and-Best-Practices-FINAL.pdf
. Opt-in before messaging; sender identification; SHAFT content restrictions (Sex,
Hate, Alcohol, Firearms, Tobacco -- with age-gating for age-restricted-but-legal
content); STOP/HELP handling with one permitted confirmation; consent tiers
(conversational / informational / promotional, the last requiring the highest bar).

**TCPA-for-SMS.** The FCC treats texts as "calls" under 47 U.S.C. 227 -- autodialed
or prerecorded marketing texts need prior express written consent
(https://www.fcc.gov/consumers/guides/stop-unwanted-robocalls-and-texts). The FCC
one-to-one consent rule (Second Report and Order FCC 23-49,
https://docs.fcc.gov/public/attachments/FCC-23-49A1.pdf) required written consent
per single seller; its current enforceability as of mid-2026 is UNVERIFIED
(litigation/effective-date turbulence -- open questions Q10). Revocation under FCC
24-24 must be honored in any reasonable manner, so STOP handling must accept
free-form opt-outs, not only keywords.

---

## 10. Vendor layer: Twilio and Retell pass-through duties

Both vendors contractually push nearly all consent, registration, disclosure, and
recording duties onto the customer; a multi-tenant SaaS must in turn flow them
through to tenants and act as the enforcement/gating point.

**Twilio** -- Messaging Policy (https://www.twilio.com/en-us/legal/messaging-policy)
and Acceptable Use Policy (https://www.twilio.com/en-us/legal/aup): obtain prior
express consent per sender/subject before messaging; RETAIN proof of consent at
least until the recipient withdraws it (a hard, per-tenant retention obligation);
include "Reply STOP to unsubscribe" and honor STOP/equivalents; complete A2P 10DLC
registration and truthful KYC/brand data via Trust Hub; no SHAFT/illegal content.
US messaging compliance guide:
https://pages.twilio.com/rs/294-TKB-300/images/Guide%20to%20US%20Messaging%20Compliance.pdf .

**Retell AI** -- ToS (https://www.retellai.com/legal/terms-of-service), Privacy
Policy (https://www.retellai.com/legal/privacy-policy), Compliance docs
(https://docs.retellai.com/general/compliance). Confirmed: Retell offers a HIPAA BAA
(self-serve), a GDPR DPA/SCCs, SOC 2 Type 1/2, per-agent data retention configurable
from 1 day to 2 years, and per-agent PII controls (store all / exclude PII / basic
attributes) with signed recording URLs. Direction confirmed but EXACT ToS wording
UNVERIFIED: the customer is solely responsible for telecom-law compliance; Retell
does not obtain consent on the customer's behalf; the customer must configure agents
to disclose identity/purpose and AI nature where required, disclose recording and
obtain any required consent, respect the 8 a.m.-9 p.m. window and DNC, and
indemnifies Retell for TCPA-type claims (open questions Q11). Practical rule: sign
the BAA if any PHI, sign the DPA/SCCs before any EU data, set per-agent retention to
the minimum needed, and prefer the exclude-PII option.

---

## 11. Recording data handling, biometrics, and privacy

**The architectural lever.** Storing a raw call recording is regulated as audio
personal data (lower risk). The moment you extract a VOICEPRINT / voice embedding /
reusable speaker model, you cross into biometric-identifier territory and trigger
the strict statutes below -- most importantly BIPA's private right of action. Not
generating voiceprints sharply reduces biometric exposure; this is the single most
important compliance-relevant design decision (open questions Q12).

- **Illinois BIPA -- 740 ILCS 14** (biggest risk):
  https://www.ilga.gov/Legislation/ILCS/Articles?ActID=3004&ChapterID=57&Print=True
  . "Voiceprint" is a biometric identifier (s.10). Section 15(b) requires written
  notice of purpose/duration and a written release BEFORE collection; 15(a) requires
  a published retention/destruction schedule (destroy when purpose satisfied or
  within 3 years of last interaction); 15(c) bars profiting from biometric data.
  Section 20 provides a PRIVATE right of action: $1,000 (negligent) or $5,000
  (intentional/reckless) per violation plus fees. (Aug 2, 2024 amendment SB 2979
  limits accrual but not per-plaintiff exposure.)
- **Texas CUBI -- Tex. Bus. & Com. Code 503.001** (AG-enforced, up to $25,000/
  violation): https://statutes.capitol.texas.gov/docs/bc/htm/bc.503.htm . Voiceprint
  is a biometric identifier; notice + consent before capture for a commercial
  purpose; timely destruction.
- **Washington biometric -- RCW 19.375** (AG-enforced):
  https://app.leg.wa.gov/RCW/default.aspx?cite=19.375&full=true . Notice + consent
  before enrolling a biometric identifier (capture + convert to a template + store
  for matching) for a commercial purpose.
- **California CCPA/CPRA -- Cal. Civ. Code 1798.140 et seq.**:
  https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.140.
  Audio recordings are personal information (1798.140(v)(1)(H)); voiceprints are
  biometric information (1798.140(c)) and, when used to uniquely identify, sensitive
  personal information (1798.140(ae)). Provide notice at collection; honor
  know/delete/correct/limit-SPI requests; minimize. Enforced by CPPA/AG (no
  general consumer private right of action outside breach). CCPA statute PDF:
  https://cppa.ca.gov/regulations/pdf/ccpa_statute.pdf .
- **GDPR (EU) -- deferred.** A voice recording of an identifiable person is personal
  data (Art. 4(1)); it becomes special-category biometric data (Art. 9) only when
  processed to uniquely identify a person (https://gdpr-info.eu/art-9-gdpr/). Mark
  as a deferred/open item for a US-first launch; do not process EU voice without an
  Art. 6 basis (and Art. 9 explicit consent if voiceprinting), and sign Retell's
  DPA/SCCs first (open questions Q13).

**Retention-minimization.** Set the shortest retention meeting operational and
legal-hold needs (Retell allows 1 day to 2 years -- default low). Publish a
retention schedule (BIPA requires one if voiceprinting). Keep the CONSENT record
even after purging the recording -- consent proof (Twilio requires it) and content
data are separate lifecycles.

---

## 12. Exposure ranking (engineering summary)

1. **TCPA artificial-voice consent (227(b) + FCC 24-17)** -- applies to every AI
   call to a wireless/residential line regardless of B2B framing; $500/$1,500 per
   call, class-action scale. Highest structural risk.
2. **Illinois BIPA voiceprints** -- $1,000/$5,000 per violation with a private right
   of action, IF you generate voiceprints. Avoidable by design.
3. **State recording-consent (all-party states, felony in CA/FL/MD/PA)** -- mitigated
   to near-zero by a universal top-of-call recording disclosure.
4. **A2P 10DLC registration + provable SMS opt-in** -- carrier-enforced fees/filtering;
   blocks deliverability if unregistered.
5. **State mini-TCPAs (FL/OK/WA/MD/CT/TX/NY)** -- stricter consent, tighter quiet
   hours (FL), and a flat ADAD ban (WA).
6. **AI-disclosure mandates (CA AB 2905, UT, CO)** -- satisfied by disclosing AI on
   every call.
7. **Caller-ID authentication / spam labeling** -- deliverability + Truth in Caller
   ID (227(e)) intent-based liability.
8. **FTC TSR / Impersonation Rule** -- anti-fraud provisions always apply; watch the
   proposed AI "means and instrumentalities" platform-liability theory.

See `product-requirements.md` for the implementable controls and `policy-matrix.md`
for the per-state lookup.
