/**
 * Scenario playbook: contractor / vendor finding, vetting, quotes.
 * Ported from call-business references/playbook-contractors.md.
 * First-contact and follow-up calls to home-service pros (plumbing, HVAC,
 * electrical, roofing, GC). ASCII-only; customer specifics templated.
 */

import { PlaybookSchema, type Playbook } from "../schema.js";

export const CONTRACTORS_PLAYBOOK: Playbook = {
  id: "contractors",
  title: "Contractor / Vendor Finding, Vetting, Quotes",
  scenarios: [
    "contractor vetting",
    "vendor screening",
    "quote collection",
    "home-service first contact",
  ],

  preCallChecklist: [
    "Build the job spec packet (quote quality is bounded by description quality): symptom + when it started + frequency; what's been tried; location in the house.",
    "Equipment brand/model/age (water heater label, HVAC data plate); house age.",
    "Shutoff valve status if plumbing (a seized valve changes the job).",
    "ONE fixed written scope - read the SAME spec verbatim to every vendor (quotes are only comparable on identical scope; the AI is better at verbatim-identical delivery than any human).",
    "Self-triage urgency BEFORE the call: true emergency = active water, sewage, no heat in freezing temps, gas smell. Everything else: \"This is NOT an emergency - we'd like your first standard-rate appointment.\" Don't let the dispatcher upsell routine work to emergency rates.",
    "Privacy: city + ZIP only on first contact; never the street address.",
  ],

  callSkeleton: [
    "Core opener + job spec read-out: \"Let me read exactly what [customer] needs so you're quoting the same job as everyone else: [spec]. Anything missing or that you'd do differently?\"",
    "Run the fee battery (every service call - fee structures vary $70-300 and \"free\" is usually rolled in).",
    "Ballpark, two-stage: \"I understand you can't quote firm without seeing it. Based on the description, what's the typical range - is this a $300 job or a $3,000 job?\" Then book the site visit for the written firm quote. (Refuses even a range on a standard job = weak signal; a suspiciously firm LOW number sight-unseen = worse signal.)",
    "Run the vetting battery (project work; skip for $150 service calls).",
    "Payment structure: \"What deposit do you require, and how is the rest scheduled?\"",
    "Pricing model: \"Fixed-price or time-and-materials? If T&M - hourly rate, materials markup, and can you put a not-to-exceed cap in writing?\" (T&M with an NTE cap is the homeowner-favorable hybrid.)",
    "Scheduling, concrete-slot: \"What's your earliest actual date and arrival window?\" -> \"Can we lock Tuesday 1-3 PM now?\" -> \"Confirmation by text or email?\" Backlog honesty check: \"What's your current backlog?\" (\"We can start tomorrow\" on a big project = red flag - good contractors have backlogs.)",
    "Anti-ghosting callback contract (end of EVERY call without a number or booking): \"When exactly should we expect the estimate - end of day Thursday? ... If we haven't heard by then, should we take that as a pass?\" Log the date; call back ON it. (Graceful-exit phrasing converts silent ghosting into explicit signal.)",
  ],

  questionBattery: [
    {
      name: "Fee battery",
      notes:
        "Every service call - fee structures vary $70-300 and \"free\" is usually rolled in.",
      questions: [
        "What's the diagnostic / service-call fee - flat or hourly?",
        "Is it credited toward the repair if we proceed?",
        "If we decline the repair, is that fee the total out-of-pocket?",
        "What triggers after-hours pricing?",
        "Does it include a written estimate?",
      ],
    },
    {
      name: "Vetting battery",
      notes: "Project work; skip for small service calls (~$150).",
      questions: [
        "License: \"Can I get your state contractor license number? We verify on the state license lookup before scheduling.\" (Never accept yes/no. Hesitation or defensiveness = disqualify. Example: SC requires a license at $5,000+ jobs, S.C. Code 40-11-20; verify at llr.sc.gov/clb.)",
        "Insurance VIA THE AGENT: \"Can you give me your insurance agent's name and number so we can request a current certificate for general liability and workers' comp?\" (not \"are you insured?\")",
        "Subs: \"Your own employees or subcontractors? If subs - who, and are they covered by your liability and comp?\" (\"Same 2 subs for 10 years\" = good; \"I have guys\" = bad)",
        "Warranty: \"What written warranty on labor and materials, and how long?\" (instant specific answer = established shop; \"we stand behind our work\" = weak)",
        "References: \"Three references from similar jobs in the last 2 years, ideally near [customer's city]?\"",
      ],
    },
    {
      name: "Money and scheduling battery",
      questions: [
        "What deposit do you require, and how is the rest scheduled?",
        "Fixed-price or time-and-materials? If T&M - what hourly rate, what materials markup, and can you put a not-to-exceed cap in writing?",
        "What's your earliest actual date and arrival window - can we lock a specific slot now?",
        "What's your current backlog?",
        "When exactly should we expect the estimate - and if we haven't heard by then, should we take that as a pass?",
      ],
    },
  ],

  preAuthorizations: [
    {
      key: "book_appointment",
      description:
        "Lock a specific appointment slot within the customer's approved windows.",
      requiresExplicitGrant: true,
    },
    {
      key: "share_job_address",
      description:
        "Share the street address (beyond city + ZIP) when booking a confirmed site visit.",
      requiresExplicitGrant: true,
    },
  ],

  disqualifiers: [
    { trigger: "Cash-only or full payment upfront", severity: "hard_disqualify" },
    { trigger: "Deposit greater than one-third of the total", severity: "hard_disqualify" },
    { trigger: "Dodges the license number", severity: "hard_disqualify" },
    {
      trigger: "\"Price only good today\" / urgency pressure",
      severity: "hard_disqualify",
      response:
        "\"[Customer] doesn't make same-day decisions. Is the price valid 30 days in writing?\"",
    },
    {
      trigger: "Offers to waive the insurance deductible (roofers)",
      severity: "hard_disqualify",
      response: "That is fraud - end the vetting.",
    },
    { trigger: "Won't put the estimate in writing", severity: "strong_negative" },
    { trigger: "No physical local address", severity: "strong_negative" },
    {
      trigger: "Suspiciously low bid vs the others",
      severity: "investigate",
      response: "Investigate the scope gap; don't auto-accept.",
    },
  ],

  tactics: [
    {
      name: "Identical-scope read-out",
      guidance:
        "Read the same written spec verbatim to every vendor so quotes are comparable. 3-bid minimum on projects; small jobs (under $500): 3 bids is bad etiquette - confirm rate + fee structure and book.",
    },
    {
      name: "Three-quotes disclosure",
      guidance:
        "Saying \"we're getting three quotes\" matter-of-factly at first contact HELPS (serious buyer). Revealing competitors' NUMBERS before their bid is in HURTS (bid-shopping; invites quality cuts). Safe: \"We're deciding within two weeks on scope fit and reviews, not just price.\"",
    },
    {
      name: "Scope-gap callback",
      when: "Quotes diverge.",
      guidance:
        "Price gaps are usually SCOPE gaps. \"Contractor B specs [X] where you spec [Y] - can you revise using [chosen tier] so we're comparing the same job? We're not asking you to match a price - we're asking you to match a scope.\"",
    },
    {
      name: "Responsiveness telemetry",
      guidance:
        "Log per vendor: human answer vs voicemail, callback latency, whether they could answer fee and license questions. Pre-sale phone experience predicts mid-project communication.",
    },
    {
      name: "Deposit legitimacy rule",
      guidance:
        "Large deposits are legitimate ONLY for special-order items (custom cabinets, tile), never commodity materials (roofing, lumber, pipe - bought on 30-day account).",
    },
  ],

  antiPatterns: [
    "Letting a dispatcher upsell routine work to emergency rates.",
    "Revealing competitors' quoted numbers before this vendor's bid is in.",
    "Accepting \"are you insured?\" yes/no answers instead of the insurance-agent certificate route.",
  ],

  successCriteria: [
    "Fee structure captured (diagnostic fee, credit-toward-repair, after-hours trigger).",
    "A ballpark range or a booked site visit for a written firm quote.",
    "Credentials screen complete: license number, insurance-agent contact, subs, warranty, references (project work).",
    "Disqualifier screen run - any hard disqualifier logged.",
    "A locked appointment slot or an explicit callback contract with a date.",
  ],

  escalationNotes: [
    "No supervisor ladder here - the escalation is across vendors: log the callback contract date, call back ON it, and move to the next candidate when a vendor ghosts or disqualifies.",
  ],

  notPhonePortable: [
    "Site visits / inspecting past work.",
    "Reading and signing the contract.",
    "In-person gut-check.",
    "The call's realistic outputs: fee structure, ballpark, credentials, disqualifier screen, locked appointment, callback contract.",
  ],

  sourceRef:
    "call-business skill: references/playbook-contractors.md, ported 2026-07-03",
};

PlaybookSchema.parse(CONTRACTORS_PLAYBOOK);
