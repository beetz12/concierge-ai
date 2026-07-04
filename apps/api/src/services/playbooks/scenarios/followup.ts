/**
 * Scenario playbook: status-check / follow-up calls on an existing case.
 * The agent's signature scenario: perfect recall of every prior name, date,
 * and verbatim promise.
 * Ported from call-business references/playbook-followup.md.
 * ASCII-only; customer specifics templated.
 */

import { PlaybookSchema, type Playbook } from "../schema.js";

export const FOLLOWUP_PLAYBOOK: Playbook = {
  id: "followup",
  title: "Status-Check / Follow-Up Calls (existing case)",
  scenarios: [
    "order / repair status chase",
    "broken-promise follow-up",
    "missed callback",
    "stalled case escalation",
  ],

  preCallChecklist: [
    "Load the case ledger from prior call records: case/reference numbers, every prior rep name + date, each commitment VERBATIM with its promised date, what actually happened.",
    "Load the company's published timeline (or statutory clock) for this process - pressing without a baseline is just nagging.",
    "Put the ledger in the dispatch context.",
  ],

  callSkeleton: [
    "Case-continuity opener (first 15 seconds): \"I'm calling on behalf of [customer], regarding existing case [X], opened [date]. This is a follow-up on a commitment made [date] - I'm not opening a new request. Can you pull up that case?\"",
    "Notes-first verification: \"Before we go further, can you read me the last entry in the case notes so we're working from the same record?\" (If they can't read verbatim: \"Can you summarize the current status and last commitment shown?\") Missing the prior promise? \"The notes should show that on [date], [name] committed to [X]. Please add it now from what I'm telling you, and read it back.\"",
    "Named-promise quotation (broken commitment): \"On [date], [name] told us, quote, '[exact words]', and committed to [action] by [date]. That didn't happen. I'd like to understand why, and what the new committed date is - please note this conversation in the case.\" Blame the process, never the named person.",
    "Pin-down battery on any vague status (see battery).",
    "Baseline framing (stalled): \"Your published timeline is [X] days; we're at day [Y] - so this is outside your normal process. What flags a case at this age internally, and what's the exception path?\" Plus the aging probe: \"At what age does an open case auto-escalate? Has this one hit that threshold? Can you trigger it now?\"",
    "Escalation ask (rep at ceiling): \"I appreciate you've done what you can at your level. Is any further escalation possible - a supervisor, case manager, or specialist team?\" Plus ownership: \"Each call starts over with someone new. Can one person own this case end-to-end - name and direct contact? And to confirm: is this case owned by you, the manufacturer, or a third-party administrator - who do we hold to the dates?\"",
    "Callback appointment close (never accept \"someone will reach out\"): \"Let's set a specific callback: who calls, what number, what date and time? And if it doesn't happen by [time], what's my next step - call you back, or does it escalate?\"",
    "In-writing close: \"So we both have a record, can you email that confirmation to [customer] today? Which address will it come from?\"",
    "Reference bracketing: open with the old reference, close with a new one + read-back: \"Reference for THIS call, your name and ID, and please confirm today's commitments are in the case notes - can you read back what you entered?\"",
  ],

  questionBattery: [
    {
      name: "Pin-down battery",
      notes: "Run on any vague status.",
      questions: [
        "What stage exactly is the file in right now?",
        "What's blocking it - what specifically is missing?",
        "Who owns the next action - name and contact?",
        "What DATE will it move?",
        "If that date passes, does it auto-escalate - to whom?",
      ],
    },
    {
      name: "Ownership battery",
      questions: [
        "Can one person own this case end-to-end - name and direct contact?",
        "Is this case owned by you, the manufacturer, or a third-party administrator - who do we hold to the dates?",
        "At what age does an open case auto-escalate? Has this one hit that threshold? Can you trigger it now?",
      ],
    },
    {
      name: "Callback contract battery",
      questions: [
        "Who calls, what number, what date and time?",
        "If it doesn't happen by [time], what's my next step - call you back, or does it escalate?",
        "Can you email that confirmation to [customer] today? Which address will it come from?",
      ],
    },
  ],

  preAuthorizations: [
    {
      key: "consequence_ladder",
      description:
        "State the consequence ladder on a 3rd+ contact (AG-letter formula): \"We'd like to resolve this directly. If it isn't resolved by [date], we're prepared to file with [BBB / state AG / CFPB]. We won't file if it's resolved by then - that's genuinely our preference. Please note that in the case.\" Pre-authorized items only.",
      requiresExplicitGrant: true,
    },
  ],

  disqualifiers: [],

  tactics: [
    {
      name: "Runaround detection (the agent's structural advantage)",
      guidance:
        "Rule: if this call's promised date is LATER than the last call's promised date with no new blocking fact -> classify as runaround; do not accept the new date - jump to the escalation ask + ledger + channel switch. \"On our last call we were told [date1]. Today it's [date2], and nothing new happened in between. Each call moves the date back. Connect me with someone who can commit to a date that holds.\"",
    },
    {
      name: "Ledger read-back (final phone move)",
      guidance:
        "\"Let me read you the history on case [X]: [date1], [rep1] committed to [A] - didn't happen. [date2], [rep2] committed to [B] - didn't happen. [date3], promised callback - never came. Today is commitment number four. What's different about this one, and who, by name, is accountable for it?\" Flat, factual tone - the ledger does the work.",
    },
    {
      name: "Visible note-taking",
      guidance:
        "Announce it early: \"I'm keeping a log of this case - I have your name as [X]; what's your agent ID? I'll note the commitment we agree on.\" (Never bluff \"I'm recording\" - only say it when recording is actually on.)",
    },
    {
      name: "Help-me-help-you framing",
      guidance:
        "Use the rep's name and \"we\" language: \"what do you need from our side - anything missing from the file?\" Voice the customer's impact factually (\"without a working furnace for three weeks\"), never performed emotion.",
    },
  ],

  antiPatterns: [
    "Accepting \"someone will reach out\" as a close.",
    "Blaming the named person instead of the process.",
    "Escalating for a re-hearing of the same facts - roughly 85 percent of escalations get the same answer; escalate for OWNERSHIP and authority.",
    "Pressing without a baseline timeline - that's just nagging.",
  ],

  successCriteria: [
    "The case notes verified (or corrected) against the ledger, on the record.",
    "A new committed date with a named owner - or a classified runaround with the escalation triggered.",
    "A specific callback appointment (who, number, date, time, and the miss path).",
    "Written confirmation requested, with the sending address captured.",
    "A new reference number bracketing this call.",
  ],

  escalationNotes: [
    "Escalation cadence across calls - Call 1: baseline + commitments captured. Call 2: quote the broken promise, demand ownership. Call 3: supervisor/case manager + consequence ladder + ledger read-back.",
    "After call 3: stop calling - switch channels (written demand with the call history -> executive ladder one rung per week, never carpet-bomb -> BBB / state AG / CFPB). Also switch on: a second broken commitment, \"nothing more we can do\", no dates offered at all, or a statutory clock running.",
  ],

  notPhonePortable: [
    "Social-media posts.",
    "The executive email ladder (agent drafts, the customer sends).",
    "Regulator filings.",
    "Any statute citation not verified for the actual state and product.",
  ],

  sourceRef:
    "call-business skill: references/playbook-followup.md, ported 2026-07-03",
};

PlaybookSchema.parse(FOLLOWUP_PLAYBOOK);
