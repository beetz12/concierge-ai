# Per-State Policy Matrix

One row per US state + DC (51 rows). This is the lookup table the compliance
policy engine (Slice 6) evaluates at dial time, keyed on the CALLED party's
state (derived from the destination number / provided address). Not legal advice.

## How to read this table

- **Recording-consent mode** -- `one-party` (a participant may record) or
  `all-party` (every participant must consent). The called party's state law
  governs a recorded outbound call. Because several all-party states carry FELONY
  liability (CA, FL, MD, PA) and Massachusetts bars ANY secret recording, the
  product default is a universal audible "this call is recorded" disclosure at the
  top of EVERY call (satisfies one-party states, satisfies notice-based all-party
  states such as WA per RCW 9.73.030(3), and is the strongest available posture in
  MA). See `regulatory-survey.md` section 4 and `product-requirements.md` R-12.
- **`treat all-party (disputed)`** -- statute and case law conflict; the engine
  fails closed and treats the state as all-party. Reason in the notes.
- **Bot/AI-disclosure** -- state-specific requirement to disclose AI/bot use.
  Where "none (federal only)", the federal caller-identity rule 47 CFR 64.1200(b)
  still requires the message to open with the responsible entity's identity, and
  the FCC's FCC 24-17 ruling makes every AI voice an "artificial voice" subject to
  the federal consent + identification stack. The product discloses AI on every
  call regardless (fail-safe); this column flags where it is independently
  MANDATED by state law.
- **Mini-TCPA notes** -- state telephone-solicitation statutes stricter than or
  additional to the federal TCPA (consent tier, caps, private right of action).
- **Quiet-hour delta** -- deviation from the federal 8:00 a.m.-9:00 p.m.
  called-party-local-time window (47 CFR 64.1200(c)(1)). "federal 8a-9p" = no
  state delta found.

## The matrix

| Code | State | Recording-consent mode | Recording statute | Bot/AI-disclosure | Mini-TCPA notes | Quiet-hour delta |
|------|-------|------------------------|-------------------|-------------------|-----------------|------------------|
| AL | Alabama | one-party | Ala. Code 13A-11-30 | none (federal only) | none notable | federal 8a-9p |
| AK | Alaska | one-party | Alaska Stat. 42.20.310 | none (federal only) | none notable | federal 8a-9p |
| AZ | Arizona | one-party | Ariz. Rev. Stat. 13-3005 / 13-3012 | none (federal only) | none notable | federal 8a-9p |
| AR | Arkansas | one-party | Ark. Code 5-60-120 | none (federal only) | none notable | federal 8a-9p |
| CA | California | all-party | Cal. Penal Code 632; 632.7 (cellular) | YES -- AB 2905 (Cal. Pub. Util. Code 2874, eff. 1/1/2025): disclose AI/artificial voice at call start; B.O.T. Act (Cal. Bus. & Prof. Code 17940-17943): disclose bot in sales/vote context | ADAD rules Cal. Bus. & Prof. Code 17590; Pub. Util. Code 2871-2876 | federal 8a-9p |
| CO | Colorado | one-party | Colo. Rev. Stat. 18-9-303 | YES (UNSETTLED DATE) -- CO AI Act, Colo. Rev. Stat. 6-1-1701 et seq. (SB 24-205), proactive consumer AI-interaction disclosure; effective date in flux (repealed/replaced by 2026 act, ~Jan 2027). Confirm live posture. | none notable | federal 8a-9p |
| CT | Connecticut | treat all-party (disputed) | Conn. Gen. Stat. 52-570d (civil telephonic, all-party); 53a-189 (criminal, one-party) | none (federal only) | PA 23-98 amending Conn. Gen. Stat. 42-288a (eff. 10/1/2023): prior express written consent; penalties up to $20,000/violation (CUTPA) | federal 8a-9p |
| DE | Delaware | treat all-party (disputed) | 11 Del. C. 1335 (privacy, all-party) vs. 11 Del. C. 2402 (wiretap, one-party) | none (federal only) | none notable | federal 8a-9p |
| FL | Florida | all-party | Fla. Stat. 934.03 | none (federal only) | FTSA, Fla. Stat. 501.059 (SB 1120 / HB 761): prior express written consent for automated sales calls/texts; $500-$1,500 PRA; SMS STOP + 15-day cure | 8a-8p (STRICTER) -- Fla. Stat. 501.059(8)(b) |
| GA | Georgia | one-party | Ga. Code 16-11-62 | none (federal only) | none notable | federal 8a-9p |
| HI | Hawaii | one-party | Haw. Rev. Stat. 803-42 | none (federal only) | none notable | federal 8a-9p |
| ID | Idaho | one-party | Idaho Code 18-6702 | none (federal only) | none notable | federal 8a-9p |
| IL | Illinois | all-party | 720 ILCS 5/14-2 | none (federal only) | none notable (BIPA voiceprint risk -- see survey s.11) | federal 8a-9p |
| IN | Indiana | one-party | Ind. Code 35-33.5-1-5 | none (federal only) | none notable | federal 8a-9p |
| IA | Iowa | one-party | Iowa Code 808B.2 | none (federal only) | none notable | federal 8a-9p |
| KS | Kansas | one-party | Kan. Stat. 21-6101 | none (federal only) | none notable | federal 8a-9p |
| KY | Kentucky | one-party | Ky. Rev. Stat. 526.010 | none (federal only) | none notable | federal 8a-9p |
| LA | Louisiana | one-party | La. Rev. Stat. 15:1303 | none (federal only) | none notable | federal 8a-9p |
| ME | Maine | one-party | Me. Rev. Stat. tit. 15, 709-712 | none (federal only) | none notable | federal 8a-9p |
| MD | Maryland | all-party | Md. Code, Cts. & Jud. Proc. 10-402 | none (federal only) | Stop the Spam Calls Act (SB 90, Md. Code Com. Law 14-3201, eff. 1/1/2024): prior express written consent; max 3 calls / 24 hrs; MD CPA PRA | federal 8a-9p |
| MA | Massachusetts | all-party (strictest) | Mass. Gen. Laws ch. 272, 99 | none (federal only) | none notable | federal 8a-9p |
| MI | Michigan | treat all-party (disputed) | Mich. Comp. Laws 750.539c (statute all-party; Sullivan v. Gray participant gloss = one-party) | none (federal only) | none notable | federal 8a-9p |
| MN | Minnesota | one-party | Minn. Stat. 626A.02 | none (federal only) | none notable | federal 8a-9p |
| MS | Mississippi | one-party | Miss. Code 41-29-531 | none (federal only) | none notable | federal 8a-9p |
| MO | Missouri | one-party | Mo. Rev. Stat. 542.402 | none (federal only) | none notable | federal 8a-9p |
| MT | Montana | all-party (notice-based) | Mont. Code Ann. 45-8-213 | none (federal only) | none notable | federal 8a-9p |
| NE | Nebraska | one-party | Neb. Rev. Stat. 86-290 | none (federal only) | none notable | federal 8a-9p |
| NV | Nevada | treat all-party (disputed) | Nev. Rev. Stat. 200.620 (Lane v. Allstate construes all-party for phone) | none (federal only) | none notable | federal 8a-9p |
| NH | New Hampshire | all-party | N.H. Rev. Stat. 570-A:2 | none (federal only) | none notable | federal 8a-9p |
| NJ | New Jersey | one-party | N.J. Stat. 2A:156A-4 | none (federal only) | none notable | federal 8a-9p |
| NM | New Mexico | one-party | N.M. Stat. 30-12-1 | none (federal only) | none notable | federal 8a-9p |
| NY | New York | one-party | N.Y. Penal Law 250.00 / 250.05 | none (federal only) | GBL 399-p (ADAD): prerecorded messages need prior express agreement + interactive opt-out; GBL 399-z statewide DNC | federal 8a-9p |
| NC | North Carolina | one-party | N.C. Gen. Stat. 15A-287 | none (federal only) | none notable | federal 8a-9p |
| ND | North Dakota | one-party | N.D. Cent. Code 12.1-15-02 | none (federal only) | none notable | federal 8a-9p |
| OH | Ohio | one-party | Ohio Rev. Code 2933.52 | none (federal only) | none notable | federal 8a-9p |
| OK | Oklahoma | one-party | Okla. Stat. tit. 13, 176.4 | none (federal only) | OTSA, Okla. Stat. tit. 15, 775C.1 (eff. 11/1/2022): prior express written consent for automated sales calls/texts ("selection OR dialing"); $500 PRA | federal 8a-9p |
| OR | Oregon | one-party (phone) | Or. Rev. Stat. 165.540(1)(a) | none (federal only) | none notable (in-person recording is all-party notice -- N/A to phone) | federal 8a-9p |
| PA | Pennsylvania | all-party | 18 Pa. Cons. Stat. 5703; 5704(4) | none (federal only) | none notable | federal 8a-9p |
| RI | Rhode Island | one-party | R.I. Gen. Laws 11-35-21 | none (federal only) | none notable | federal 8a-9p |
| SC | South Carolina | one-party | S.C. Code 17-30-30 | none (federal only) | none notable | federal 8a-9p |
| SD | South Dakota | one-party | S.D. Codified Laws 23A-35A-20 | none (federal only) | none notable | federal 8a-9p |
| TN | Tennessee | one-party | Tenn. Code 39-13-601 | none (federal only) | none notable | federal 8a-9p |
| TX | Texas | one-party | Tex. Penal Code 16.02 | none (federal only) | SB 140 (2025, eff. 9/1/2025) amending Bus. & Com. Code ch. 302: extends "telephone solicitation" to texts/images; PRA via DTPA | federal 8a-9p |
| UT | Utah | one-party | Utah Code 77-23a-4 | YES -- Utah AI Policy Act (SB 149; Utah Code 13-2-12 and Title 13, ch. 72, eff. 5/1/2024): disclose generative-AI use on request; proactive disclosure at start in regulated occupations | none notable | federal 8a-9p |
| VT | Vermont | one-party (no statute) | none (federal 18 U.S.C. 2511 default; State v. Geraw) | none (federal only) | none notable | federal 8a-9p |
| VA | Virginia | one-party | Va. Code 19.2-62 | none (federal only) | none notable | federal 8a-9p |
| WA | Washington | all-party (notice) | Wash. Rev. Code 9.73.030 | none (federal only) | RCW 80.36.400: FLAT BAN on ADAD (recorded-message) commercial-solicitation calls regardless of consent; CEMA RCW 19.190 bars unsolicited commercial SMS; $500/violation via CPA | federal 8a-9p |
| WV | West Virginia | one-party | W. Va. Code 62-1D-3 | none (federal only) | none notable | federal 8a-9p |
| WI | Wisconsin | one-party | Wis. Stat. 968.31 | none (federal only) | none notable | federal 8a-9p |
| WY | Wyoming | one-party | Wyo. Stat. 7-3-702 | none (federal only) | none notable | federal 8a-9p |
| DC | District of Columbia | one-party | D.C. Code 23-542 | none (federal only) | none notable | federal 8a-9p |

## All-party recording states (engine fails closed to these = 13)

Firm (8, statute on point): **CA** (Penal 632/632.7), **FL** (934.03), **IL** (720
ILCS 5/14-2), **MD** (Cts & Jud Proc 10-402), **MA** (ch. 272 s.99 -- strictest, no
secret recording at all), **MT** (45-8-213), **NH** (570-A:2), **PA** (18 Pa.C.S.
5703/5704), **WA** (RCW 9.73.030).

Treat-as-all-party (disputed, engine fails closed): **CT** (52-570d civil
telephonic all-party), **NV** (Lane v. Allstate construes 200.620 all-party for
phone), **DE** (11 Del. C. 1335 vs 2402 conflict), **MI** (750.539c facially
all-party; Sullivan v. Gray participant gloss).

Not all-party for phone despite appearing on some "two-party" lists: **OR**
(one-party for telephone under 165.540(1)(a); all-party only for in-person).

## State-mandated AI/bot disclosure (independent of the federal default)

- **CA** -- AB 2905 / Cal. Pub. Util. Code 2874 (eff. 1/1/2025): artificial-voice
  disclosure at start of an ADAD call. B.O.T. Act (Cal. Bus. & Prof. Code 17941):
  disclose bot in commercial/vote-influencing context.
- **UT** -- Utah AI Policy Act (Utah Code 13-2-12; Title 13 ch. 72, eff. 5/1/2024):
  reactive disclosure on request; proactive in regulated occupations.
- **CO** -- CO AI Act (Colo. Rev. Stat. 6-1-1701 et seq.): proactive consumer AI
  disclosure; EFFECTIVE DATE UNSETTLED (see `open-legal-questions.md` Q7).

Product posture: disclose AI on EVERY call in every state (fail-safe), so these
mandates are satisfied by construction; this list flags where non-disclosure is
independently unlawful.

## Primary-source citations (matrix)

Recording-consent baseline and per-state statutes are drawn from the federal
Wiretap Act 18 U.S.C. 2511(2)(d) (https://www.law.cornell.edu/uscode/text/18/2511)
and the state codes cited in each row. Selected primary sources:

- CA Penal Code 632: https://leginfo.legislature.ca.gov/faces/codes_displayText.xhtml?lawCode=PEN&division=&title=15.&part=1.&chapter=1.5.&article=
- FL Stat. 934.03 and FTSA 501.059: https://www.flsenate.gov/Laws/Statutes/2023/501.059
- IL 720 ILCS 5/14-2: http://www.ilga.gov/legislation/ilcs/fulltext.asp?DocName=072000050K14-2
- PA 18 Pa.C.S. Ch. 57: https://www.palegis.us/statutes/consolidated/view-statute?txtType=HTM&ttl=18&div=0&chpt=57
- WA RCW 9.73.030: https://app.leg.wa.gov/rcw/default.aspx?cite=9.73.030 ; RCW 80.36.400: https://app.leg.wa.gov/rcw/default.aspx?cite=80.36.400
- OR ORS 165.540: https://oregon.public.law/statutes/ors_165.540
- DE 11 Del. C. 2402: https://delcode.delaware.gov/title11/c024/sc01/
- NV Lane v. Allstate: https://law.justia.com/cases/nevada/supreme-court/1998/25670-1.html
- OK OTSA (Okla. Stat. tit. 15): https://oksenate.gov/sites/default/files/2022-05/os15.pdf
- MD SB 90 (Ch. 413): https://mgaleg.maryland.gov/2023RS/Chapters_noln/CH_413_sb0090e.pdf
- CT 42-288a (Ch. 743m): https://www.cga.ct.gov/current/pub/chap_743m.htm
- NY GBL 399-p: https://www.nysenate.gov/legislation/laws/GBS/399-P
- TX SB 140 (89R): https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=SB140
- CA AB 2905 (Pub. Util. Code 2874): https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202320240AB2905
- UT SB 149 (AI Policy Act): https://le.utah.gov/~2024/bills/static/SB0149.html
- CO SB 24-205: https://leg.colorado.gov/bills/sb24-205
- Federal quiet hours 47 CFR 64.1200(c)(1): https://www.law.cornell.edu/cfr/text/47/64.1200
- RCFP 50-state recording guide: https://www.rcfp.org/reporters-recording-sections/summary/

For the full narrative and additional citations, see `regulatory-survey.md`.
