/**
 * Scenario playbook: disputes, complaints, billing, refunds, retention.
 * Ported from call-business references/playbook-disputes.md.
 * Phone-channel tactics only; ASCII-only; customer name is templated at
 * composition time, never hardcoded.
 */

import { PlaybookSchema, type Playbook } from "../schema.js";

export const DISPUTES_PLAYBOOK: Playbook = {
  id: "disputes",
  title: "Disputes, Complaints, Billing, Refunds, Retention",
  scenarios: [
    "billing dispute",
    "complaint",
    "refund request",
    "price negotiation",
    "retention / cancellation leverage",
  ],

  preCallChecklist: [
    "Account number, service address, tenure (\"customer since...\", payment history).",
    "The documented loss as a PRECISE number (\"$487.50: invoice + two service calls\") - never a range.",
    "The specific remedy wanted (refund $X / credit / fee removal / repair by date).",
    "Competitor BATNA if retention call: real, current, local pricing (pre-fetch it - verifiable beats bluff).",
  ],

  callSkeleton: [
    "30-second opener - problem + remedy (an unclear problem/remedy statement is the number-one communication failure behind unresolved first calls): \"Hi, I'm calling about account [X]. On [date], [one-sentence problem]. [Customer] is looking for [specific remedy]. Can you help with that, or is there a better team for this?\"",
    "Get the rep's name + a reference number (core discipline).",
    "Work the ask using the pattern library.",
    "Close with read-back + date-certain + case number; or graceful exit + retry plan.",
  ],

  questionBattery: [
    {
      name: "Dispute opener battery",
      questions: [
        "Can you help with this, or is there a better team for it?",
        "May I get your name and a reference number for this call?",
        "Can you walk me through exactly how you arrived at that amount?",
        "When exactly will [customer] have an answer?",
        "What's the case number, and what happens if nothing changes by that date?",
      ],
    },
  ],

  preAuthorizations: [
    {
      key: "cancel_if_needed",
      description:
        "State a cancellation intent to unlock the retention department. NEVER bluff it - only real if the customer is genuinely prepared to cancel.",
      requiresExplicitGrant: true,
      whenGrantedSay: "I'm calling to cancel [customer]'s service.",
    },
    {
      key: "chargeback_or_regulator",
      description:
        "State a card dispute or regulator complaint (FCC / state AG) as the named next step if unresolved.",
      requiresExplicitGrant: true,
      whenGrantedSay:
        "[Customer] would rather settle this directly. If we can't, the next steps are a card dispute and a complaint with the regulator. Anything else you can do before it goes that route?",
    },
  ],

  disqualifiers: [],

  tactics: [
    {
      name: "Calm politeness",
      when: "Always - beats anger measurably (eBay-mediation + politeness studies).",
      guidance:
        "\"I know this isn't your fault personally - I'm hoping you can help me fix it.\"",
    },
    {
      name: "Walk-me-through-it",
      when: "Any lowball offer.",
      guidance:
        "\"Before I respond - can you walk me through exactly how you arrived at that amount?\" Then rebut point by point.",
    },
    {
      name: "Never accept first offer",
      when: "Any monetary offer.",
      guidance:
        "\"I appreciate the offer, but it doesn't cover [documented loss]. Based on [evidence], the right number is $X.\" Then wait - don't counter yourself.",
    },
    {
      name: "Face-saving supervisor ask",
      when: "Rep at authority ceiling.",
      guidance:
        "\"I really appreciate that you're trying your best, but the solutions so far don't work for [customer]. I'd like to talk to a supervisor.\"",
    },
    {
      name: "Calibrated questions (Voss)",
      when: "\"Policy says no.\"",
      guidance:
        "\"How am I supposed to accept that when the repair costs $X?\" / \"What would you do in my position?\" / \"Whose hands aren't tied by this policy?\"",
    },
    {
      name: "Accusation audit (Voss)",
      when: "Aggressive ask.",
      guidance:
        "\"You're probably going to think this is a big ask, and you've heard this before - here's why this case is different...\"",
    },
    {
      name: "Precise non-round anchor (Voss)",
      when: "Stating the remedy.",
      guidance:
        "\"$487.50 - that's the invoice plus two service calls.\" Never \"around $500\".",
    },
    {
      name: "Tenure + loss framing",
      when: "Billing / retention.",
      guidance:
        "\"[Customer]'s been a customer 6 years, always on time - about $6,800 of business. They'd rather not move it over a $15 dispute.\"",
    },
    {
      name: "Competitor BATNA, cited",
      when: "Retention.",
      guidance:
        "\"[Competitor] is $35 a month flat in their zip. What can you do against that?\" Only with a real, pre-fetched competing price.",
    },
    {
      name: "Retention trigger (\"cancel\")",
      when: "Telecom / subscription, ONLY if cancel is pre-authorized.",
      guidance:
        "\"I'm calling to cancel [customer]'s service\" -> routed to retention -> make the stay-offer ask.",
    },
    {
      name: "Broken record",
      when: "Deflections.",
      guidance:
        "Restate the identical ask calmly, maximum 3 times, then the supervisor ask.",
    },
    {
      name: "Deadline framing",
      when: "Unresolved close.",
      guidance:
        "\"When exactly will [customer] have an answer? ... If nothing by Thursday the 19th, they'll call back and ask for [name]'s supervisor - does that timeline work?\"",
    },
    {
      name: "Next-step statement (not threat)",
      when: "Ladder exhausted + pre-authorized only.",
      guidance:
        "\"They'd rather settle this directly. If we can't, the next steps are a card dispute and a complaint with [FCC / state AG]. Anything else you can do before it goes that route?\"",
    },
    {
      name: "Mirror + brief pause",
      when: "Stonewalling; use sparingly.",
      guidance:
        "Rep: \"There's nothing I can do.\" -> \"Nothing you can do?\" then pause about 2 seconds - longer dead air reads as a dropped call from an AI voice.",
    },
  ],

  antiPatterns: [
    "Performed emotion or anger - backfires generally, doubly hollow from a disclosed AI. Portable variant: factual third-person hardship - \"This left [customer] without a furnace for nine days in January, with two kids at home.\"",
    "Empty ultimatums; using the word \"fair\" as your argument (invite THEM to use it).",
    "Re-arguing every fact each round - repeat only the 2-3 strongest points.",
    "Accepting a counteroffer on the spot - \"[Customer] will review and respond by [date].\"",
  ],

  successCriteria: [
    "The specific remedy (refund amount, credit, fee removal, repair date) is agreed, or a concrete counteroffer is captured for the customer to review.",
    "Rep name and a reference/case number are captured.",
    "A date-certain next step with a named owner is locked in the read-back.",
    "If unresolved: a graceful exit with the escalation path documented.",
  ],

  escalationNotes: [
    "HUCA (hang up, call again) is a retry policy, not an in-call tactic: rep answers vary widely; outcomes are a distribution - sample it. If the rep is wrong or unhelpful and the supervisor route failed, exit gracefully (\"Thanks for checking - [customer] will think it over\") and redial later.",
    "CAP: 2-3 attempts, spaced hours or days - daily hammering gets the account flagged.",
    "Industry notes - Telecom/cable/subscription: most negotiable; retention + BATNA + promo-cycle timing; single-call game. Insurance: calls only set up written exchanges; walk-me-through + never-first-offer; multi-week cadence. Retail/e-commerce: reps have refund authority; politeness + tenure + HUCA; single-call game. Contractor disputes: owner-operators have full authority but ego stakes - accusation audit and face-saving matter most; real leverage is written (license board, small claims); phone is for relationship preservation.",
  ],

  notPhonePortable: [
    "Written escalation (license board complaints, small claims filings, regulator complaints) - the agent drafts, the customer files.",
  ],

  sourceRef:
    "call-business skill: references/playbook-disputes.md, ported 2026-07-03",
};

PlaybookSchema.parse(DISPUTES_PLAYBOOK);
