/**
 * Scenario playbook: government agency calls (USCIS, IRS, SSA, DMV, courts).
 * Organizing fact: strict identity gates. Oral statements don't bind the
 * government, reps follow rigid scripts, and bluffing an identity gate is
 * the one unrecoverable error.
 * Ported from call-business references/playbook-government.md.
 * ASCII-only; customer specifics templated.
 */

import { PlaybookSchema, type Playbook } from "../schema.js";

export const GOVERNMENT_PLAYBOOK: Playbook = {
  id: "government",
  title: "Government Agency Calls (USCIS, IRS, SSA, DMV, courts)",
  scenarios: [
    "agency procedural questions",
    "case status (identity-gated)",
    "document checklist extraction",
    "DMV / court clerk logistics",
  ],

  preCallChecklist: [
    "Step 0 - classify the call; this decides whether the agent can call alone: general/procedural questions (forms, fees, addresses, deadlines, hours, processes) have NO identity gate - the agent's lane. Case-specific questions are gated per agency.",
    "USCIS gate: applicant/petitioner, G-28 attorney/accredited rep, or parent of a minor ONLY - other family members get nothing.",
    "IRS gate: taxpayer, Form 2848/8821, return-designee - OR live oral consent (the taxpayer joins the start of the call, passes verification, and authorizes oral disclosure to the assistant for the conversation).",
    "SSA gate (strictest): beneficiary, representative payee, or appointed rep (SSA-1696). POA is not recognized. Plan on the beneficiary being on the line or in person.",
    "NEVER bluff the gate. When gated: the agent does prep + hold-the-line + hand-off, or uses a written channel.",
    "Load the case ledger before any case-adjacent call: receipt numbers, SR numbers + due dates, prior badge IDs. Never contradict the filed record - load the actual application contents first.",
  ],

  callSkeleton: [
    "25-word opener: \"[Form/benefit], receipt [X], filed [date], [N] days past posted processing time. I need [one specific action].\" Then stop - let the rep drive.",
    "Get the rep's name + badge/ID number at call open (IRS assistors state it - ask them to repeat; USCIS: \"May I have your name and operator ID for my records?\").",
    "Run the relevant battery (document checklist for procedural; status/SR mechanics for case calls with an authorized caller).",
    "Get-it-in-writing doctrine - oral statements do not bind the government: \"Can you point me to where that's stated on the website or policy manual?\" / \"Can you send that link by email or text through your system?\" / \"What's the confirmation number for what we just did?\"",
    "Close with the reference ledger updated: SR numbers + due dates, badge IDs, confirmation numbers; open every follow-up with the existing SR so the case doesn't restart: \"I have existing service request [N] from [date], response was due [date] - please pull it up rather than opening a duplicate.\"",
  ],

  questionBattery: [
    {
      name: "Document-checklist extraction battery",
      notes: "No identity gate - the agent runs it alone, any agency.",
      questions: [
        "Exact form name AND number - and which edition date is currently accepted?",
        "Filed where exactly - street address, PO box, or which portal?",
        "Exact fee, accepted payment methods, exact payee name?",
        "Supporting documents - originals or copies, certified, translated?",
        "Deadline - and does postmark or receipt control?",
        "Appointment required or walk-in? Current wait?",
        "Can you email or text me the link to the page listing all of this?",
        "Then read the whole list back: \"Let me confirm: [list]. Anything missing?\"",
      ],
    },
    {
      name: "USCIS case battery (authorized caller only)",
      questions: [
        "This can't be resolved at Tier 1 - I'm requesting escalation to a Tier 2 Immigration Services Officer. Yes, I consent to the text-ahead notification - confirm what number the officer will call. (Callback within 24-72h, 7am-8pm; missing both attempts = start over.)",
        "Receipt [X] is outside posted processing time for [form] at [office] - please open a service request. What's the SR number and the respond-by date? (Response due in 30 days, 15 expedited; past due -> \"Please ELEVATE service request [N] from [date].\")",
      ],
    },
    {
      name: "DMV / court clerk battery",
      questions: [
        "Is this transaction appointment-only, walk-in, kiosk, or fully online?",
        "What form numbers, fees, and deadlines apply?",
        "What are the self-help center hours? (Clerks give procedure, not advice; \"should I\" questions get refused; docket facts are public.)",
      ],
    },
  ],

  preAuthorizations: [
    {
      key: "case_specific_call",
      description:
        "Attempt a case-specific call at all - requires confirming the caller-authorization gate is actually satisfied (authorized caller available or consent noted on file).",
      requiresExplicitGrant: true,
    },
  ],

  disqualifiers: [
    {
      trigger: "Identity gate cannot be satisfied for a case-specific ask",
      severity: "hard_disqualify",
      response:
        "Do not bluff. Downgrade to procedural questions, or prep the written channel (TAS Form 911, CIS Ombudsman DHS-7001, congressional inquiry) for the customer to sign.",
    },
  ],

  tactics: [
    {
      name: "IRS three-way oral consent",
      guidance:
        "The taxpayer joins the START of the call, passes identity verification, then says: \"I want to authorize oral disclosure of my tax information to [assistant name], who is on the line assisting me with this matter, for this conversation.\" The taxpayer may then DROP OFF - consent lasts the conversation (ask the rep to extend it \"until the matter is resolved\"). Upgrade: request an \"Oral Tax Information Authorization\" (recorded on the CAF, valid until revoked). Oral consent = receive/discuss, NOT represent.",
    },
    {
      name: "Information discipline (immigration grade)",
      guidance:
        "Never volunteer beyond the question asked. Never guess: \"I don't want to guess - I'd need to verify that against the application.\" State only dates, documents, events - never characterizations (\"basically separated\", \"mostly lives with me\"). A wrong statement slipped out? Correct it in the SAME call and log the correction.",
    },
    {
      name: "UPL boundary",
      guidance:
        "The agent does logistics and information retrieval, never advocacy. Never \"the case merits approval because...\" - never imply representation.",
    },
    {
      name: "Same-day written summary",
      guidance:
        "Through any written channel that exists (agency online-account secure message, caseworker email): \"Confirming our call at [time]: [name/ID] stated [X], opened SR [N], response due [date].\"",
    },
    {
      name: "Emma live chat",
      guidance:
        "USCIS live chat (uscis.gov, type \"Live Chat\") often beats phone: same answers WITH a written transcript.",
    },
    {
      name: "Timing",
      guidance:
        "IRS 800 line: call 7:00am local sharp; Wed-Fri off-season; accept the callback offer. SSA: 8-10am or 4-7pm local, Wed-Fri, LATE in the month; field office WITH appointment ~6 min vs 27 without. USCIS: avoid Monday mornings and lunch.",
    },
    {
      name: "Inbound callback defense",
      guidance:
        "Never volunteer identity data to an inbound caller - agencies get spoofed constantly. Verify by calling back the official number, unless it matches an expected text-announced Tier 2 callback window.",
    },
  ],

  antiPatterns: [
    "Bluffing an identity gate - the one unrecoverable error.",
    "Contradicting the filed record or characterizing facts.",
    "Treating an oral statement as binding - always get the written pointer or confirmation number.",
    "Advocacy or implying representation (UPL).",
  ],

  successCriteria: [
    "Procedural: the full document-checklist battery answered and read back, with a link to the source page.",
    "Case calls: SR / confirmation numbers with respond-by dates captured; rep name + badge/ID logged.",
    "The reference ledger updated (receipt numbers, SR numbers + due dates, badge IDs, confirmation numbers).",
    "Where gated: the correct written-channel packet identified (Form 911, DHS-7001, congressional inquiry) for the customer to sign.",
  ],

  escalationNotes: [
    "Written escalation ladder (agent preps, the principal signs): TAS Form 911 (IRS hardship / 30+ day delays); CIS Ombudsman DHS-7001 - has an explicit family-member lane with the applicant's signed consent; congressional constituent inquiry (privacy release, wet signature, constituent-only - agent assembles the packet, tracks the 3-5 day clock).",
    "USCIS expedite: only on USCIS criteria (severe financial loss, urgent humanitarian, USCIS error...). The agent pre-drafts the criterion mapping + 2-3 supporting sentences; the applicant places the call.",
  ],

  notPhonePortable: [
    "Anything behind an unsatisfied identity gate.",
    "Signatures: Form 911, DHS-7001, congressional privacy releases (agent preps, the principal signs).",
    "Representation or advocacy of any kind.",
  ],

  sourceRef:
    "call-business skill: references/playbook-government.md, ported 2026-07-03",
};

PlaybookSchema.parse(GOVERNMENT_PLAYBOOK);
