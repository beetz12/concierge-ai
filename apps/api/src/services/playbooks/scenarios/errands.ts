/**
 * Scenario playbook: reservations, appointments, inquiries, messages,
 * cancellations - the everyday errand calls (Duplex-class).
 * Ported from call-business references/playbook-errands.md.
 * ASCII-only; customer specifics templated.
 */

import { PlaybookSchema, type Playbook } from "../schema.js";

export const ERRANDS_PLAYBOOK: Playbook = {
  id: "errands",
  title: "Reservations, Appointments, Inquiries, Messages, Cancellations",
  scenarios: [
    "reservation / appointment booking",
    "information inquiry",
    "plain cancellation",
    "deliver a message",
  ],

  preCallChecklist: [
    "Carry constraints as RANGES, not points - the dispatch context must include the customer's acceptable window plus fallbacks (\"anything between 10 a.m. and 12\").",
    "Booking name: the customer's first name; spell it if asked.",
    "For inquiries: enumerate the must-ask list in the dispatch.",
    "For cancellations: account/booking reference, desired effective date, and whether the customer wants to hear retention offers.",
    "For messages: the message text (verbatim or near-verbatim) and the intended recipient's name.",
  ],

  callSkeleton: [
    "Opener, one breath - disclosure + task category + recording + ask (core formula): \"Hi there - I'm [customer]'s AI assistant, they asked me to book a table. Heads up, this call is recorded - could I get a table for four next Wednesday the seventh?\"",
    "One fact per turn. Expect ambiguity - \"OK for 4\" can mean time or party size (Duplex's documented hard case). Confirm ambiguous slots explicitly: \"That's four PEOPLE, at seven PM - correct?\"",
    "SPECIFIC date/time enforcement: \"next week sometime\" is not booked. \"Which specific day, and what's the earliest time?\" Acceptable answer = \"Tuesday the 17th at 2 PM.\"",
    "Closing recap: day/date/time/party/name + \"Is there a confirmation number?\" + anything to bring or prepare. Pause, then end.",
    "Post-call report: structured (date, time, name used, confirmation number, deviations from instructions, next step).",
  ],

  questionBattery: [
    {
      name: "Booking battery",
      questions: [
        "Do you have anything between [start] and [end] on [date]? (offer the range, then fallbacks)",
        "That's [N] PEOPLE, at [time] - correct? (confirm ambiguous slots explicitly)",
        "Which specific day, and what's the earliest time? (whenever the answer is vague)",
        "Is there a confirmation number?",
        "Anything [customer] should bring or prepare?",
      ],
    },
    {
      name: "Cancellation capture battery",
      notes: "Must capture every item before closing.",
      questions: [
        "What is the effective date of the cancellation?",
        "What's the confirmation number?",
        "Is there any cancellation fee?",
        "What refund or credit amount applies, and on what timeline?",
        "What happens to the remaining balance or equipment?",
      ],
    },
    {
      name: "Message delivery battery",
      questions: [
        "Is this [recipient name]? (confirm the right recipient BEFORE delivering)",
        "Can I tell [customer] you got the message?",
        "Would you like to send any reply? (take it verbatim; read it back)",
      ],
    },
  ],

  preAuthorizations: [
    {
      key: "listen_to_retention_offers",
      description:
        "On a cancellation, listen to retention offers and capture them verbatim instead of declining once politely. Still commit to nothing.",
      requiresExplicitGrant: true,
    },
    {
      key: "book_within_window",
      description:
        "Confirm a booking inside the customer's approved date/time window without a follow-up check.",
      requiresExplicitGrant: true,
    },
  ],

  disqualifiers: [],

  tactics: [
    {
      name: "Ranges, not points",
      guidance:
        "Ask with the customer's acceptable window plus fallbacks: \"Do you have anything between 10 a.m. and 12?\" Never present a single take-it-or-leave-it slot unless the dispatch says so.",
    },
    {
      name: "Ambiguity confirmation",
      guidance:
        "\"OK for 4\" can mean time or party size. Confirm explicitly: \"That's four PEOPLE, at seven PM - correct?\"",
    },
    {
      name: "Inquiry capture",
      guidance:
        "One question per turn; read back numbers (prices, hours, dates) before moving on. If the callee volunteers a better option than the objective anticipated, capture it verbatim and commit to nothing: \"That's helpful - [customer] will decide and follow up.\"",
    },
    {
      name: "Cancellation directness",
      guidance:
        "Persona: clear and direct. State the cancellation in the first sentence after the opener - no apology spiral. Read-back close: \"Confirmed: cancelled effective [date], confirmation [number], $[X] refund within [N] days. Correct?\"",
    },
    {
      name: "Retention pitch handling",
      guidance:
        "Expect a retention pitch: decline ONCE politely unless the dispatch says the customer wants to hear offers (\"If they reconsider they'll call back\"). If listening IS authorized, capture the offer verbatim and commit to nothing.",
    },
    {
      name: "Message delivery",
      guidance:
        "Warm personal messenger. Confirm the right recipient BEFORE delivering. Deliver verbatim or near-verbatim; confirm receipt; take any reply verbatim and read it back.",
    },
  ],

  antiPatterns: [
    "Accepting vague timeframes (\"next week sometime\") as a booking.",
    "An apology spiral on cancellations.",
    "Committing to a volunteered alternative the dispatch didn't authorize.",
  ],

  successCriteria: [
    "Booking: an exact day/date/time/party-size locked with a confirmation number (or explicit \"no confirmation numbers here\").",
    "Inquiry: every must-ask item asked AND answered, with numbers read back.",
    "Cancellation: effective date, confirmation number, fee, refund amount + timeline, and remaining balance/equipment disposition all captured.",
    "Message: right recipient confirmed, message delivered, receipt confirmed, any reply captured verbatim.",
  ],

  escalationNotes: [
    "Voicemail policy per call type: reservations/inquiries hang up and retry later (a half-cut message burns the number). Time-sensitive or final-attempt: leave a SHORT message - who's calling, on whose behalf, one-line purpose, callback number. Never include account details, claim details, or anything sensitive. Maximum two voicemails per contact.",
    "Honor in-call callback requests (\"call me at 3\") by scheduling that exact time, not a generic retry.",
  ],

  notPhonePortable: [
    "Decisions between competing options the dispatch didn't rank - capture and hand back to the customer.",
  ],

  sourceRef:
    "call-business skill: references/playbook-errands.md, ported 2026-07-03",
};

PlaybookSchema.parse(ERRANDS_PLAYBOOK);
