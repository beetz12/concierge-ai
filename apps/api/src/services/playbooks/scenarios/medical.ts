/**
 * Scenario playbook: medical / dental / healthcare calls - booking,
 * insurance verification, price discovery, refills, records.
 * Ported from call-business references/playbook-medical.md.
 * ASCII-only; customer and family specifics templated.
 */

import { PlaybookSchema, type Playbook } from "../schema.js";

export const MEDICAL_PLAYBOOK: Playbook = {
  id: "medical",
  title: "Medical / Dental / Healthcare Calls",
  scenarios: [
    "medical appointment booking",
    "insurance / network verification",
    "procedure price discovery",
    "prescription refills",
    "medical records requests",
  ],

  preCallChecklist: [
    "Pre-call data packet per patient (offices ask in this order): legal name, DOB, address, phone, insurance carrier, member ID, group number, subscriber name + relationship.",
    "Plan/network name EXACTLY as printed on the card (e.g. \"Choice Plus\" - not just the carrier), plan type (HMO/PPO/POS).",
    "Reason for visit, referring physician, pharmacy.",
    "Newborn: add the mother's policy info; if enrollment is pending - \"covered under [parent]'s policy, enrollment in process, coverage retroactive to date of birth\" (newborn 30-day rule).",
    "HIPAA envelope: SCHEDULING for anyone is always allowed - third-party booking is not a HIPAA issue. The wall is information flowing BACK: results, visit details, sometimes appointment times.",
    "Minor child: the parent is the personal representative with full authority - the agent represents the parent: \"calling on behalf of [parent], [child]'s parent and personal representative.\"",
    "Adult family member: needs an authorization or \"authorized contact\" note on file at each provider - one-time setup per provider.",
  ],

  callSkeleton: [
    "Three-part opener (kills wasted calls): \"Quick check before we book: is Dr. [X] accepting new patients, is the practice in-network for [specific plan/network name], and how far out is the first new-patient opening?\"",
    "Run the network-verification battery - \"we accept\" is NOT \"in-network\".",
    "Run the booking battery: earliest-with-anyone, cancellation list, specialist gate check.",
    "Ask for the new-patient paperwork link + arrival time; flag \"new patient\" so they book the longer slot.",
    "For price discovery: route past the front desk (see battery).",
    "If refused PHI: capture what form or process is needed, exit gracefully, hand off to the customer: \"What form do you need so future calls go smoothly? Can you email your authorization form today?\"",
  ],

  questionBattery: [
    {
      name: "Network verification battery",
      notes: "The number-one trap: \"we accept\" is NOT \"in-network\".",
      questions: [
        "Is Dr. [X] accepting new patients?",
        "I'm not asking whether you accept [Carrier] - is this practice contracted and in-network for [exact plan/network from the card]?",
        "How far out is the first new-patient opening?",
      ],
    },
    {
      name: "Booking battery",
      questions: [
        "What's the earliest with Dr. [X]? And first available with ANY provider - including PAs/NPs - or your other locations?",
        "Book that, AND add [patient] to the cancellation list - they can come on very short notice, any provider. Is the waitlist by phone or text, and what number will the call come from? (You're not added automatically; you must ask.)",
        "The plan is [HMO/PPO]. Do you need a referral on file before the visit, and does this service require prior authorization? Who initiates the auth, and will you confirm it's approved before the appointment date?",
        "Can you send the new-patient paperwork link, and what arrival time should [patient] plan for?",
      ],
    },
    {
      name: "Price discovery battery",
      notes:
        "The front desk genuinely can't answer - route past them to billing / cost estimates.",
      questions: [
        "What's the exact procedure name and the CPT code(s) you'll bill? Does that include facility AND professional charges?",
        "Can you transfer me to billing or your cost-estimates line - or give me their direct number?",
        "What's your discounted cash price for CPT [code] - the self-pay rate, not the gross charge? Is there a prompt-pay discount for paying in full at time of service?",
        "The patient will be self-pay for this visit. I'd like a written Good Faith Estimate - I understand it's required within 3 business days. Can you email it? (Final bill more than $400 over the GFE = federal dispute right; \"self-pay\" includes an insured patient choosing not to file a claim.)",
        "For high-stakes visits: what's the practice's billing NPI, Tax ID, and exact billing entity name? (Then verify with the insurer: \"Is NPI [X], Tax ID [Y], in-network for plan [Z] as of [appointment date]?\" - office answers about network status are often wrong; the two-call pattern is the gold standard.)",
      ],
    },
    {
      name: "Refills and records battery",
      questions: [
        "Pharmacy first: \"Does [patient], DOB [X], have refills on [drug, dose]? If not, can you send a renewal request to Dr. [Y]?\" (Zero refills -> the prescriber's refill line; allow 48-72 hours. Controlled substances need a visit - don't burn calls.)",
        "Records: \"Who handles records requests? We'd like [records] in electronic PDF. What's your itemized fee, and will it be completed within the 30-day HIPAA window? Email us the authorization form.\" (Agent obtains the form + process; the customer signs.)",
      ],
    },
  ],

  preAuthorizations: [
    {
      key: "book_for_family_member",
      description:
        "Book on behalf of a named family member and share that patient's scheduling details with the office.",
      requiresExplicitGrant: true,
    },
    {
      key: "share_insurance_details",
      description:
        "Read the patient's member ID / group number to the office for eligibility checks.",
      requiresExplicitGrant: true,
    },
  ],

  disqualifiers: [],

  tactics: [
    {
      name: "Cancellation-list chasing",
      guidance:
        "Call at office opening - overnight cancellations sit unfilled at the morning bell.",
    },
    {
      name: "Authorization conversion",
      when: "Blocked on PHI for an adult family member.",
      guidance:
        "Convert the call into setup: \"What form do you need so future calls go smoothly? Can you email your authorization form today?\"",
    },
    {
      name: "Reference-number discipline",
      guidance:
        "Insurer and consequential office calls: rep name + call reference number, always. Network or coverage answers without a reference number are worthless later.",
    },
  ],

  antiPatterns: [
    "Accepting \"we accept [Carrier]\" as an in-network confirmation.",
    "Asking the front desk for prices instead of routing to billing / cost estimates.",
    "Burning calls on controlled-substance refills that require a visit.",
  ],

  successCriteria: [
    "Booking: new-patient status, network status (against the exact plan name), and the earliest date captured; patient added to the cancellation list when useful.",
    "Price: CPT codes, discounted cash price, and a written Good Faith Estimate requested where applicable.",
    "Referral / prior-auth requirements identified with a named owner for the auth.",
    "Refill: status confirmed and renewal routed; records: form, fee, and timeline captured.",
  ],

  escalationNotes: [
    "High-stakes network answers get double verification: practice's NPI + Tax ID + billing entity, then confirm with the insurer for the specific plan and date.",
    "If the office refuses to engage with a third-party caller, capture the authorization form and process, then hand off.",
  ],

  notPhonePortable: [
    "Receiving clinical results or details without an authorization on file.",
    "Signing authorization or intake forms.",
    "Decisions about care. The agent books, prices, routes, and preps - it does not receive PHI it isn't authorized for.",
  ],

  sourceRef:
    "call-business skill: references/playbook-medical.md, ported 2026-07-03",
};

PlaybookSchema.parse(MEDICAL_PLAYBOOK);
