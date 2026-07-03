/**
 * Scenario playbook: travel calls - airlines, hotels, OTAs.
 * Changes, cancellations, refunds, IRROPS rebooking, hotel issues.
 * Ported from call-business references/playbook-travel.md.
 * ASCII-only; customer specifics templated.
 */

import { PlaybookSchema, type Playbook } from "../schema.js";

export const TRAVEL_PLAYBOOK: Playbook = {
  id: "travel",
  title: "Travel Calls (airlines, hotels, OTAs)",
  scenarios: [
    "flight change / cancellation / refund",
    "IRROPS rebooking",
    "hotel issue (walk, rate match, fees)",
    "OTA refund ping-pong",
  ],

  preCallChecklist: [
    "Confirmation / PNR, ticket numbers, loyalty numbers (lead with elite or co-brand card lines).",
    "For IRROPS: pre-research 2-3 specific alternate flights WITH flight numbers before dialing.",
    "Know the regulatory posture: DOT automatic refund rule (tickets issued on/after Oct 28, 2024; flights to/from/within the US only): airline cancellation or \"significant change\" (arrival moved 3+ hrs domestic / 6+ hrs international; airport change; added connection; downgrade) = CASH refund to original payment - 7 business days for card payments, 20 calendar days otherwise - if the customer declines the rebooking.",
    "24-hour rule: booked direct, 7+ days to departure, less than 24h ago -> full refund, no reason needed.",
    "There is NO US cash-compensation right for delays - never claim it; it marks the caller as misinformed. Controllable disruptions (mechanical/crew/IT - not weather): all large US carriers committed to meals (3+ hr delay) and hotel + transport overnight.",
    "Phone numbers ONLY from the airline/hotel/OTA's own domain, app, or card-back. SEO-poisoned fake support numbers are a documented scam vector. Never read payment details to a search-sourced number.",
  ],

  callSkeleton: [
    "Open with the loyalty number and the one-sentence situation; get the rep's name.",
    "IRROPS: present the pre-researched alternates: \"I have three options: first choice [flight] at [time], then [flight] at [time], then [flight] tomorrow. Can you confirm the first?\" Exact flight numbers collapse the search and beat the next-available-in-2-days default.",
    "Significant change / cancellation: \"This is a significant change under DOT rules. We can take [specific alternate flight] at no charge, or a full cash refund - which can you confirm now?\" The refund right is the BATNA; agents often grant the better flight free instead.",
    "Decline vouchers explicitly, on the record: \"We decline the travel credit and choose the refund to the original form of payment.\" Keeping credit anyway? \"Confirm it's valid five years, as DOT requires, and email the terms.\"",
    "Controllable disruption? Get the classification on the call: \"Was this cancellation controllable - mechanical, not weather? Then per your customer service plan, please issue hotel and meal vouchers now, or confirm receipts will be reimbursed.\"",
    "Close with the confirmation number, the rebooked itinerary read-back, and the refund timeline on the record.",
  ],

  questionBattery: [
    {
      name: "IRROPS battery",
      questions: [
        "Can you confirm [first-choice flight number] at [time]? If not, [second choice]? If not, [third choice]?",
        "Was this disruption controllable - mechanical or crew, not weather?",
        "For controllable disruptions: [partner] flight [number] departs at [time] with availability - your customer service plan commits to partner rebooking; please endorse the ticket over.",
        "Please issue hotel and meal vouchers now, or confirm receipts will be reimbursed.",
        "What's the new record locator, and can you email the updated itinerary now?",
      ],
    },
    {
      name: "Refund battery",
      questions: [
        "This qualifies as a significant change under DOT rules - can you confirm the cash refund to the original form of payment now?",
        "We decline the travel credit - please note that on the record.",
        "What's the refund confirmation number, and what date will it post? (7 business days for card payments)",
      ],
    },
    {
      name: "Everyday airline battery",
      questions: [
        "I'd like a same-day confirmed change to flight [X]; if no confirmable inventory, add me to same-day standby and protect the original seat. (Check fare-class eligibility first; basic economy usually excluded.)",
        "The fare on my exact flight dropped to $X - change me to the same flight at today's fare and issue the difference as credit. (Award tickets: always reprice.)",
        "Goodwill after a bad flight (Customer Relations, not reservations): \"On [flight/date], [failure]. I'm not asking for a ticket refund - I'd like [15,000 miles / $150 voucher] as goodwill.\" Calibration: minor ~5-10k miles or $50-100; multi-hour controllable ~10-25k or $100-250; downgrade or broken paid amenity = fare-difference/fee refund (that one IS a DOT right).",
      ],
    },
    {
      name: "Hotel battery",
      questions: [
        "Walk package (overbooked): \"I expect the standard walk package: comparable or better room, you cover tonight and any rate difference, taxi both ways, and bonus points as goodwill - and please email written confirmation that you couldn't honor the reservation.\"",
        "Rate match: \"I'd rather book direct - [OTA] shows $X for the same room and dates. Match it, or match plus breakfast, and you keep the full revenue instead of paying their commission.\"",
        "Resort-fee pushback: \"The amenities the fee covers were [closed / undisclosed at booking] - remove it from the folio. If the desk can't, the manager on duty has folio authority.\"",
        "Late checkout: call the night before or morning of; cite elite tier if applicable; anchor past the need (\"1pm - we'd take noon\").",
      ],
      notes:
        "Routing: central reservations = book/cancel only (no authority); front desk = room moves, late checkout, minor credits; manager on duty = fee waivers, comp nights, walk packages; revenue manager/GM (business hours, property line) = multi-night rate negotiation.",
    },
    {
      name: "OTA ping-pong battery",
      notes: "Merchant of record owes the money; supplier controls inventory.",
      questions: [
        "To the airline: \"I'm not asking you to refund - please document the schedule change / add the waiver code in the PNR so [OTA] can process the refund they're required to issue.\"",
        "To the OTA: \"Can you call the property or airline now to confirm the authorization while I hold - or set up a three-way call?\"",
        "Can you send the supplier's approval or denial in writing? (Quote it verbatim to the other side. Both sides looping = card chargeback with the documented ping-pong as evidence.)",
      ],
    },
  ],

  preAuthorizations: [
    {
      key: "accept_rebooking_within_window",
      description:
        "Accept a specific rebooking option inside the customer's approved alternates list.",
      requiresExplicitGrant: true,
    },
    {
      key: "file_dot_complaint",
      description:
        "Name the DOT complaint as the next step: \"If this can't be resolved today I'll file with the DOT Office of Aviation Consumer Protection - I'd rather close it with you now.\" Mention once, calmly; actual filing is the customer's approval.",
      requiresExplicitGrant: true,
    },
    {
      key: "spend_ceiling_for_fees",
      description:
        "Accept change fees or fare differences up to the customer's approved ceiling.",
      requiresExplicitGrant: true,
    },
  ],

  disqualifiers: [
    {
      trigger: "Support number sourced from web search instead of the carrier's own domain, app, or card-back",
      severity: "hard_disqualify",
      response: "Do not dial; re-source the number from the official domain.",
    },
  ],

  tactics: [
    {
      name: "Channel multiplexing",
      guidance:
        "The voice agent holds the phone line while the customer works app chat / stands in line / sits in the lounge; the first channel to answer wins.",
    },
    {
      name: "Line arbitrage",
      guidance:
        "Elite / co-brand card lines first (loyalty number in the opener); IVR callback over raw hold; international call centers (from the airline's OWN website) when US holds are an hour plus.",
    },
    {
      name: "Never cite dead rules",
      guidance:
        "NEVER say \"Rule 240 requires you\" (dead rule) and never claim an EU261-style US delay-compensation right (the proposal was dropped) - both flag the caller as misinformed. Amenities are commitments, not compensation.",
    },
    {
      name: "Cancel before departure - NEVER no-show",
      guidance:
        "A no-show kills the whole ticket value and can auto-suspend coupons. Exception: if a weather waiver or likely airline cancellation is in play, waiting can convert a nonrefundable ticket into a cash refund - decide deliberately with the customer.",
    },
    {
      name: "Missed flight (customer's fault)",
      guidance:
        "Call before or near departure - the \"flat-tire rule\" same-day standby is customary goodwill, not a right; ask politely.",
    },
    {
      name: "Connection protection",
      guidance:
        "Never reveal segment-skipping or hidden-city intent to any agent. If rerouted away from a needed connection: \"I specifically need the connection through [city] - I have a commitment there during the layover,\" nothing more.",
    },
  ],

  antiPatterns: [
    "Citing Rule 240 or a US delay-compensation right - both dead or nonexistent.",
    "Accepting a voucher without the on-the-record decline of credit when cash is owed.",
    "Combative tone - it earns PNR notes that poison every later call.",
    "Reading payment details to a search-sourced support number.",
  ],

  successCriteria: [
    "IRROPS: confirmed onto a specific alternate flight, itinerary emailed, disruption classification captured.",
    "Refund: cash refund confirmed with a confirmation number and posting timeline; voucher declined on the record.",
    "Hotel: walk package / rate match / fee removal resolved with written confirmation requested.",
    "OTA: the supplier's documentation (waiver code, schedule-change note, written approval) captured so the merchant of record can process.",
  ],

  escalationNotes: [
    "HUCA: 2-4 attempts max, polite exit, vary the phrasing. Redials count as new dispatches - get them pre-authorized in the plan (\"up to N retries if refused\") rather than re-gating each one mid-incident.",
    "DOT complaint backstop: refund not processed in 7 business days or voucher pushed in violation of the rule -> mention once calmly, then actually file (web form, customer approves).",
  ],

  notPhonePortable: [
    "Standing in line / lounge desks (the customer does these while the agent holds the line).",
    "Filing the DOT complaint web form (agent drafts, customer approves).",
  ],

  sourceRef:
    "call-business skill: references/playbook-travel.md, ported 2026-07-03",
};

PlaybookSchema.parse(TRAVEL_PLAYBOOK);
