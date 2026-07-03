/**
 * Scenario playbook: warranty claims, repairs, replacements, goodwill.
 * Ported from call-business references/playbook-warranty.md.
 * ASCII-only; customer specifics templated.
 */

import { PlaybookSchema, type Playbook } from "../schema.js";

export const WARRANTY_PLAYBOOK: Playbook = {
  id: "warranty",
  title: "Warranty Claims, Repairs, Replacements, Goodwill",
  scenarios: [
    "warranty claim",
    "defect repair",
    "replacement request",
    "out-of-warranty goodwill",
  ],

  preCallChecklist: [
    "Pre-call evidence kit - have ALL of it staged in the dispatch context; reps work a fixed intake script: model number, serial / date code, purchase date + retailer + order number, warranty length and status.",
    "One-sentence symptom.",
    "Troubleshooting already done (ONLY what the customer actually did - never fabricate).",
    "Prior case numbers.",
    "Photos and receipt \"ready to email or upload wherever you direct.\"",
  ],

  callSkeleton: [
    "IVR: say \"representative\" / press 0; \"returning a call\" sometimes triggers a live callback.",
    "Authorized-assistant framing (core floor) - keep the customer reachable for a 30-second verification bridge if the rep requires the account holder.",
    "Fact block + named remedy in 20 seconds or less, script order - no narrative build-up (concise facts + explicit remedy wins; story loses): \"I'm calling about a warranty claim on a [model]. Serial [Y], purchased [date] from [retailer], order [Z] - within the [N]-year warranty. The symptom: [one sentence]. [Customer]'s already done [troubleshooting]. They're requesting a [repair/replacement].\"",
    "Lock in the report date (a defect reported in-warranty must be fixed even if the warranty expires during processing): \"Please note in the case that this defect is being reported today, [date], within the warranty period. What's the case number?\"",
    "Counter deflections as they arise (see tactics).",
    "Out of warranty? Run the goodwill ladder IN ORDER, stopping at the first yes.",
    "Logistics - ask by NAME, reps rarely volunteer: prepaid label and advance replacement (see battery).",
    "Close: case number + rep name + date-certain + named next step, e.g. \"So: [action] by [date], case [number]. If nothing by then, what's my next step?\" (escalation consequences only if pre-authorized).",
    "Same-day written recap email (the agent drafts; creates the paper trail escalation requires).",
    "Stuck? HUCA - graceful exit, redial for a different rep (cap 2-3, log both case IDs); then written executive escalation one rung at a time.",
  ],

  questionBattery: [
    {
      name: "Claim intake battery",
      questions: [
        "What's the case number for this claim?",
        "Please note the defect is being reported today, within the warranty period - can you confirm that's in the case notes?",
        "What's the repair/replacement decision, and by what date?",
        "Since this is a manufacturing defect claim, not a discretionary return, I'd like a prepaid return label emailed with the RMA - that's standard for warranty claims. Can you generate it on this call?",
        "Do you offer an advance replacement or cross-ship RMA - replacement ships first, defective unit returns in the same box?",
      ],
    },
    {
      name: "Goodwill ladder (out-of-warranty; stop at first yes)",
      notes: "Run IN ORDER; stop at the first yes.",
      questions: [
        "Open-handed ask: \"[Customer] really likes this [product] - it just failed earlier than expected. What options do you have to make this right?\" (lets the rep pick their most generous tool)",
        "Loyalty framing + internal-justification mirror: \"Is a one-time goodwill exception possible, in the interest of customer satisfaction? [Customer] owns [N] of your products; this is their first claim.\" Then STOP TALKING.",
        "Pay-for-repair gambit: \"They're happy to pay - can you quote the out-of-warranty repair cost and turnaround?\" (when repair logistics cost more than a unit, reps often offer discounted or free replacement)",
        "Ask-twice: the first \"no\" is often scripted; one polite push unlocks negotiation: \"I understand that's standard policy. Is there any other option you can offer - an exception, a discount on replacement, or someone who can authorize one?\"",
      ],
    },
  ],

  preAuthorizations: [
    {
      key: "card_hold_for_cross_ship",
      description:
        "Authorize a card hold for an advance replacement / cross-ship RMA. Needs the customer's explicit pre-consent; the agent never speaks card numbers.",
      requiresExplicitGrant: true,
    },
    {
      key: "escalation_consequences",
      description:
        "Name the escalation next step (state AG complaint / card chargeback) after the committed date.",
      requiresExplicitGrant: true,
      whenGrantedSay:
        "Please note [customer] will escalate to [state AG / chargeback] after that date.",
    },
  ],

  disqualifiers: [],

  tactics: [
    {
      name: "Deflection: \"Never registered -> no warranty\"",
      guidance:
        "\"Registration isn't required - under FTC warranty guidance (16 CFR 700.6, full warranties), failure to register doesn't void coverage when the purchase date is shown. I have the dated receipt.\"",
    },
    {
      name: "Deflection: \"Third-party part/service voided it\"",
      guidance:
        "\"Under Magnuson-Moss the warranty can't be denied for that unless you show that service caused THIS failure. The failure is [symptom], unrelated. Process the claim or document the specific causal finding in the case notes.\"",
    },
    {
      name: "Deflection: \"Go through the retailer\"",
      guidance:
        "\"The retailer's window closed [date]; per your own warranty terms, claims after that are processed by [Company] directly. I have receipt and serial - please open the claim.\"",
    },
    {
      name: "Deflection: \"Out of warranty\" (failed unreasonably early)",
      guidance:
        "\"The written warranty is [N] months, but a [product] is reasonably expected to last [X] years. Under the implied warranty of merchantability in [customer's state], [customer] is asking [Company] to repair or replace it.\" Consequences (state AG, chargeback) only if pre-authorized.",
    },
    {
      name: "Deflection: \"No receipt on file\"",
      guidance:
        "\"Can you check coverage by serial? [serial]. We can also provide the [retailer] order history or card statement.\" (Serial lookup; manufacturing date code works as a shorter fallback.)",
    },
    {
      name: "Stall risk near warranty end",
      guidance:
        "Run the report-date lock-in and get it in the case notes: the defect was reported in-warranty, today, on the record.",
    },
    {
      name: "Refused prepaid label",
      guidance:
        "\"Can you note in the case that [Company] is asking the customer to pay freight on a warranty defect?\"",
    },
  ],

  antiPatterns: [
    "Narrative build-up before the fact block - concise facts + explicit remedy wins; story loses.",
    "Fabricating troubleshooting steps the customer didn't do.",
    "Stating escalation consequences that were not pre-authorized.",
  ],

  successCriteria: [
    "Case number, rep name, and the report date locked into the case notes.",
    "A named remedy decision (repair / replacement / goodwill offer) or an explicit denial with the stated reason documented.",
    "Return logistics captured: prepaid label status, RMA, advance-replacement option.",
    "A date-certain next step with a named owner.",
  ],

  escalationNotes: [
    "HUCA cap 2-3 attempts with a graceful exit; log every case ID from every attempt.",
    "After phone attempts: written executive escalation one rung at a time (never carpet-bomb); the agent drafts the same-day recap email after every call to build the paper trail.",
  ],

  notPhonePortable: [
    "One-way video product inspection (some vendors require it).",
    "Certified physical mail (agent drafts, customer mails).",
    "In-store visits.",
    "Card-hold authorization for cross-ship (needs the customer's pre-consent).",
  ],

  sourceRef:
    "call-business skill: references/playbook-warranty.md, ported 2026-07-03",
};

PlaybookSchema.parse(WARRANTY_PLAYBOOK);
