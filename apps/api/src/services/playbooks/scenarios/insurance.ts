/**
 * Scenario playbook: insurance calls (routine) - FNOL, claim status,
 * coverage verification, policy changes, premium increases.
 * Adversarial settlement negotiation lives in the disputes playbook.
 * Ported from call-business references/playbook-insurance.md.
 * ASCII-only; customer specifics templated.
 */

import { PlaybookSchema, type Playbook } from "../schema.js";

export const INSURANCE_PLAYBOOK: Playbook = {
  id: "insurance",
  title: "Insurance Calls (routine: FNOL, status, coverage, policy changes)",
  scenarios: [
    "first notice of loss (FNOL)",
    "claim status check",
    "coverage / benefits verification (VOB)",
    "policy changes and binders",
    "premium increase review",
  ],

  preCallChecklist: [
    "Authorization precondition (the call dead-ends without it) - confirm ONE of: an authorization / authorized-rep form already on file (\"There's an authorization on file dated [X] - can you confirm you see it?\"); the customer grants verbal consent that the rep notes on the file; or the call is purely general (quotes, plan info) - no gate applies.",
    "Treat filing the authorized-rep form at each insurer as one-time onboarding.",
    "FNOL packet: policy number, insured's details; exact date/time/location of loss; FACTUAL description; police or fire report number; other party's insurance (auto); photo inventory; mitigation steps taken; current contact info.",
  ],

  callSkeleton: [
    "Documentation ritual at the START of the call, not the end - reps disconnect: \"Before we start, may I have your name and a reference number for this call?\"",
    "State the purpose in one sentence and work the relevant battery (FNOL / status / VOB / policy change / premium).",
    "FNOL: facts-only narration under the hard rules (see tactics).",
    "Close with read-back: \"To confirm: reference [number], spoke with [name], [commitment] by [date]. Correct?\" A benefits answer without a reference number is worthless in a later dispute; the reference number forces retrieval of the recorded call and anchors appeals.",
  ],

  questionBattery: [
    {
      name: "FNOL exit battery",
      notes: "Don't leave FNOL without all three artifacts.",
      questions: [
        "What's the claim number?",
        "Who is the adjuster, and what's their direct contact?",
        "What happens next and by what date? How long do we have to submit estimates or proof of loss?",
      ],
    },
    {
      name: "Claim-status pin-down battery",
      notes: "Defeats \"it's processing\".",
      questions: [
        "What stage exactly is the file in right now?",
        "What specifically is outstanding - what documents or approvals are missing?",
        "Who owns the next action - your team, a vendor, or us? Name and direct contact?",
        "What DATE will it move? What can we send today to unblock it?",
        "If that date passes, does it auto-escalate - to whom?",
      ],
    },
    {
      name: "Coverage verification (VOB) battery",
      notes: "Run in order before procedures or repairs.",
      questions: [
        "Can I have the eligibility/benefits department?",
        "Is the policy active - what are the effective and termination dates?",
        "What's the deductible total and met, the copay, the coinsurance, and the out-of-pocket max total and met?",
        "Is [provider, name + NPI] in-network for THIS plan?",
        "Is prior authorization required for CPT [codes]?",
        "What's the coverage for those codes?",
        "Any visit limits, exclusions, or step therapy?",
        "May I have a reference number? I understand quotes aren't a guarantee of payment - please note on the file that we were told [X] today.",
      ],
    },
    {
      name: "Prior-auth status battery",
      questions: [
        "What's the authorization number?",
        "What dates of service does it cover, and when does it expire?",
        "If pended - what exactly is it pending on?",
      ],
    },
    {
      name: "Policy change / binder battery",
      questions: [
        "What is the exact effective date AND time? Is it bound as of this call?",
        "Can you email the updated declarations or endorsement today?",
        "What's the confirmation number? Is there a prorated premium adjustment?",
        "For a new car or home closing: please issue a binder effective [date/time] - what's the binder number and expiration, can you send the document now, and does it show the lienholder as required?",
      ],
    },
    {
      name: "Premium increase battery",
      notes: "Filed rates are NOT negotiable - discounts and re-rates are.",
      questions: [
        "Walk me through exactly which rating factors changed - base rate, lost discount, surcharge, territory, vehicle? Which discounts were on the prior term but not the renewal?",
        "Run a full discount review - bundling, multi-car, telematics, low-mileage, pay-in-full/autopay, paperless, good-student, defensive-driving. And quote the premium at $1,000 and $2,500 deductibles. (Quotes only - any deductible or coverage CHANGE is the customer's decision, not the agent's.)",
        "We have [carrier] at $X for the same limits - is there a re-rate or retention review before we move the policy? Please note the file that we called about the increase. (Only with a REAL competing quote - never bluffed.)",
      ],
    },
  ],

  preAuthorizations: [
    {
      key: "verbal_consent_on_file",
      description:
        "Reference the customer's verbal consent / authorization form when the insurer challenges third-party status.",
      requiresExplicitGrant: true,
    },
    {
      key: "cite_competing_quote",
      description:
        "Cite a real competing quote in a retention review. The quote must actually exist - never bluffed.",
      requiresExplicitGrant: true,
    },
  ],

  disqualifiers: [],

  tactics: [
    {
      name: "Facts-only FNOL narration",
      guidance:
        "Never apologize or admit fault. Never speculate on speed, distance, cause. Never characterize injuries (\"everyone's fine\" on day 1 is used against later claims): \"The policyholder is still being evaluated; we're not characterizing injuries at this time.\" \"The police report will speak to that.\"",
    },
    {
      name: "Recorded statement: decline on this call",
      guidance:
        "\"We won't be providing a recorded statement today. We're happy to schedule that separately.\" No obligation to the other party's insurer, ever; the customer's own insurer's statement can be scheduled and prepared. The consent ask may come mid-call - \"mind if I record while we go through what happened?\" counts. The agent NEVER gives a recorded statement on the customer's behalf - decline, log, hand off.",
    },
    {
      name: "Soft clock invocation",
      when: "Claim drifting; verify the state first - a wrong state citation destroys credibility.",
      guidance:
        "\"When is the decision due under the state claim-handling timelines? If it exceeds 30 days, will we receive the written delay explanation?\" Employer health plans run on ERISA clocks instead: pre-service decisions 15-30 days, urgent 72 hours, appeals 30/60 days - \"It was submitted [date]; what date does your system show as the decision deadline?\"",
    },
    {
      name: "No binding decisions on the call",
      guidance:
        "Reps offer in-line traps: \"want to file your appeal right now?\", quick settlement offers, \"let's just take your statement now.\" Standard response: \"We're not making any elections on this call. What's the deadline for that decision, and where do we send it? Please note the file that we'll respond by [date].\" All elections, appeals, settlements, signatures, and coverage changes route back to the customer.",
    },
  ],

  antiPatterns: [
    "Apologizing, admitting fault, or characterizing injuries during FNOL.",
    "Giving a recorded statement on the customer's behalf.",
    "Making elections, appeals, settlements, or coverage changes on the call.",
    "Bluffing a competing quote.",
  ],

  successCriteria: [
    "Rep name + reference number captured at the START of the call.",
    "FNOL: claim number, adjuster name + direct contact, and the next step with its date.",
    "Status: stage, blockers, owner, move date, and the auto-escalation trigger pinned down.",
    "VOB: the full battery answered with a reference number and the told-us-today note on file.",
    "Policy change: effective date/time, bound status, confirmation number, and documents emailed.",
  ],

  escalationNotes: [
    "Keep escalation non-adversarial: \"If this can't be resolved at your level, what's the escalation path? We'd like to resolve it with the company before involving the Department of Insurance - please note the file accordingly.\" Say it once, calmly, only after documented non-performance.",
    "If it turns adversarial (lowball settlement, denied claim), switch to the disputes playbook doctrine and the customer's written channels.",
  ],

  notPhonePortable: [
    "Elections, appeals, settlements, signatures, and coverage changes - route back to the customer.",
    "Recorded statements.",
  ],

  sourceRef:
    "call-business skill: references/playbook-insurance.md, ported 2026-07-03",
};

PlaybookSchema.parse(INSURANCE_PLAYBOOK);
