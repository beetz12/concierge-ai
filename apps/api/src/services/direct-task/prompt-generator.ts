/**
 * Prompt Generator for Direct Tasks.
 *
 * Composes a call-ready prompt from:
 *   1. the selected scenario playbook (question batteries, tactics,
 *      disqualifiers, success criteria - see services/playbooks/),
 *   2. the universal core behavior floor (CORE_PLAYBOOK),
 *   3. an AI-disclosure, legitimacy-led opener templated with the tenant's
 *      customer name (never hardcoded),
 *   4. the commitment whitelist, and
 *   5. pre-authorizations - included ONLY when explicitly granted in the
 *      request; everything else is echoed back as not granted so the
 *      approval-gate UX can render the checklist.
 *
 * All output is ASCII-only: it lands verbatim in voice prompts.
 */

import { CORE_PLAYBOOK, selectPlaybook, type Playbook } from "../playbooks/index.js";
import type {
  AnalyzeDirectTaskRequest,
  TaskAnalysis,
  StrategicGuidance,
  GeneratedPrompt,
  PreAuthorizationEcho,
  TaskType,
} from "./types.js";

const SECTION_RULE = "=".repeat(67);

const GENERIC_CLIENT = "the customer";

/** Category-only hooks for the opener - never the detailed multi-part ask. */
const CATEGORY_HOOKS: Record<TaskType, string> = {
  negotiate_price: "about their account and billing",
  request_refund: "about a charge on their account",
  complain_issue: "about an issue they've experienced",
  schedule_appointment: "about scheduling an appointment",
  cancel_service: "about their service",
  make_inquiry: "with a couple of quick questions",
  deliver_message: "to pass along a message",
  general_task: "about a quick request",
};

const section = (title: string, body: string): string =>
  `${SECTION_RULE}\n${title}\n${SECTION_RULE}\n${body}`;

const possessive = (name: string): string =>
  name.endsWith("s") ? `${name}'` : `${name}'s`;

/**
 * Build the AI-disclosure, legitimacy-led opener (compliance R-12 order):
 * (1) identity - plain "I'm [customer]'s AI assistant"; (2) category-only
 * hook; (3) recording aside; (4) permission ask - then stop.
 */
export function buildDisclosureLine(
  clientName: string | undefined,
  taskType: TaskType
): string {
  const who = clientName?.trim() ? clientName.trim() : GENERIC_CLIENT;
  const hook = CATEGORY_HOOKS[taskType] ?? CATEGORY_HOOKS.general_task;
  return `Hi there - I'm ${possessive(who)} AI assistant. They asked me to call ${hook}. Heads up, this call is recorded - got a quick minute?`;
}

const renderPlaybookSections = (playbook: Playbook): string => {
  const parts: string[] = [];

  if (playbook.questionBattery.length > 0) {
    const batteries = playbook.questionBattery
      .map((group) => {
        const notes = group.notes ? ` (${group.notes})` : "";
        const questions = group.questions
          .map((q, i) => `  ${i + 1}. ${q}`)
          .join("\n");
        return `${group.name}${notes}:\n${questions}`;
      })
      .join("\n\n");
    parts.push(
      section(
        `SCENARIO QUESTION BATTERIES (${playbook.title})`,
        `Work these in order where they apply. Do not end the call until every applicable must-ask item is asked AND answered.\n\n${batteries}`
      )
    );
  }

  if (playbook.callSkeleton.length > 0) {
    parts.push(
      section(
        "SCENARIO CALL SKELETON",
        playbook.callSkeleton.map((s, i) => `${i + 1}. ${s}`).join("\n")
      )
    );
  }

  if (playbook.tactics.length > 0) {
    const tactics = playbook.tactics
      .map((t) => {
        const when = t.when ? ` [when: ${t.when}]` : "";
        return `- ${t.name}${when}: ${t.guidance}`;
      })
      .join("\n");
    parts.push(section("SCENARIO TACTICS", tactics));
  }

  if (playbook.disqualifiers.length > 0) {
    const rows = playbook.disqualifiers
      .map((d) => {
        const response = d.response ? ` Response: ${d.response}` : "";
        return `- [${d.severity}] ${d.trigger}.${response}`;
      })
      .join("\n");
    parts.push(
      section(
        "DISQUALIFIERS (flag immediately when detected)",
        rows
      )
    );
  }

  if (playbook.antiPatterns.length > 0) {
    parts.push(
      section(
        "SCENARIO ANTI-PATTERNS (do NOT)",
        playbook.antiPatterns.map((a) => `- ${a}`).join("\n")
      )
    );
  }

  return parts.join("\n\n");
};

const renderCoreFloor = (): string => {
  const rules = (title: string, items: string[]): string =>
    `${title}:\n${items.map((r) => `- ${r}`).join("\n")}`;

  return section(
    "UNIVERSAL BEHAVIOR FLOOR (applies to every call)",
    [
      rules("Opener discipline", CORE_PLAYBOOK.openerDiscipline),
      rules("Gatekeeper handling", CORE_PLAYBOOK.gatekeeperHandling),
      rules("IVR navigation", CORE_PLAYBOOK.ivrRules),
      rules("Hold and transfer patience", CORE_PLAYBOOK.holdPatience),
      rules("Speech discipline", CORE_PLAYBOOK.speechDiscipline),
      rules("Identity lock", CORE_PLAYBOOK.identityLock),
      rules("Verification walls", CORE_PLAYBOOK.verificationWalls),
      rules("Documentation and read-backs", CORE_PLAYBOOK.readBacks),
      rules("Voicemail", CORE_PLAYBOOK.voicemailRules),
      rules("Closing enforcement", CORE_PLAYBOOK.closingEnforcement),
      rules("Privacy", CORE_PLAYBOOK.privacyRules),
      rules("Outcome reporting", CORE_PLAYBOOK.outcomeTaxonomy),
    ].join("\n\n")
  );
};

/**
 * Generates a complete call-ready prompt from task analysis, the selected
 * playbook, and the core behavior floor.
 */
export function generatePromptFromAnalysis(
  request: AnalyzeDirectTaskRequest,
  analysis: TaskAnalysis,
  guidance: StrategicGuidance
): GeneratedPrompt {
  const clientName = request.clientName?.trim() || undefined;
  const clientLabel = clientName ?? GENERIC_CLIENT;
  const clientPossessive = possessive(clientLabel);

  const playbook = selectPlaybook(analysis.taskType, request.taskDescription);

  const persona =
    CORE_PLAYBOOK.personaByTask[analysis.taskType] ??
    CORE_PLAYBOOK.personaByTask.general_task ??
    "a capable assistant completing the requested task";

  const disclosureLine = buildDisclosureLine(clientName, analysis.taskType);

  // Pre-authorizations: include in the prompt ONLY when explicitly granted.
  const grantedKeys = new Set(request.grantedPreAuthorizations ?? []);
  const preAuthEchoes: PreAuthorizationEcho[] = (
    playbook?.preAuthorizations ?? []
  ).map((auth) => ({
    key: auth.key,
    description: auth.description,
    requiresExplicitGrant: auth.requiresExplicitGrant,
    granted: grantedKeys.has(auth.key) || !auth.requiresExplicitGrant,
  }));
  const grantedAuths = (playbook?.preAuthorizations ?? []).filter(
    (auth) => grantedKeys.has(auth.key) || !auth.requiresExplicitGrant
  );

  const preAuthSection =
    grantedAuths.length > 0
      ? section(
          "PRE-AUTHORIZATIONS (explicitly granted for this call ONLY)",
          grantedAuths
            .map((auth) => {
              const phrasing = auth.whenGrantedSay
                ? ` Approved phrasing: ${auth.whenGrantedSay}`
                : "";
              return `- ${auth.key}: ${auth.description}${phrasing}`;
            })
            .join("\n")
        )
      : section(
          "PRE-AUTHORIZATIONS",
          "NONE granted for this call. Do not state cancellation intent, chargebacks, regulator complaints, card holds, or any other consequence or commitment beyond the mission above. If a next step is needed: \"I'll need to check with " +
            clientLabel +
            " and get back to you on that.\""
        );

  const scheduleSection =
    analysis.taskType === "schedule_appointment"
      ? section(
          "CRITICAL FOR SCHEDULING: SPECIFIC DATE AND TIME REQUIRED",
          `When the provider gives availability information:

If they say VAGUE timeframes like:
- "Two weeks out"
- "Next week"
- "In a few days"
- "Soon"
- "Later this month"
- "Early next week"

You MUST ask follow-up questions to get SPECIFIC details:
1. "Which specific day would that be?" -> Get the exact date (e.g., "Tuesday, January 15th")
2. "And what's the earliest time available on that day?" -> Get the exact time (e.g., "2:00 PM")

DO NOT accept vague timeframes. ${clientLabel} needs an exact date and time to make a booking decision.

EXAMPLE:
Provider: "We could probably get to you in about two weeks."
You: "That sounds great! Which specific day two weeks from now would work best? And what's the earliest time you'd have available?"
Provider: "Hmm, probably like mid-January."
You: "Perfect! Can we pin down the exact date? What would be your first available slot in mid-January?"`
        )
      : "";

  const successCriteria = [
    ...guidance.successCriteria,
    ...(playbook?.successCriteria ?? []),
  ];

  const sections = [
    `You are ${clientPossessive} AI assistant making a real phone call to ${request.contactName} on their behalf. You disclose that you are an AI - never claim to be human.`,
    section("YOUR ROLE", `You are ${persona}.`),
    section(
      "YOUR MISSION",
      `${analysis.intent}\n\nTask details: ${request.taskDescription}`
    ),
    section(
      "OPENING (say this first, one breath, then STOP and wait)",
      `"${disclosureLine}"\n\nOrder matters: identity and plain AI disclosure first, a category-only hook (never the detailed multi-part ask), the recording aside, then the permission ask. Specifics come only after they agree AND you are on with the right person.`
    ),
    section(
      "KEY GOALS",
      guidance.keyGoals.map((g, i) => `${i + 1}. ${g}`).join("\n")
    ),
    section(
      "TALKING POINTS (use these specific phrases)",
      guidance.talkingPoints.map((t, i) => `${i + 1}. "${t}"`).join("\n")
    ),
    section(
      "HANDLING OBJECTIONS",
      Object.entries(guidance.objectionHandlers)
        .map(([obj, resp]) => `If they say: "${obj}"\nRespond with: "${resp}"\n`)
        .join("\n")
    ),
    section(
      "SUCCESS CRITERIA",
      successCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n")
    ),
    scheduleSection,
    playbook ? renderPlaybookSections(playbook) : "",
    section(
      "COMMITMENT WHITELIST (anti-hallucination - the number-one failure mode)",
      CORE_PLAYBOOK.commitmentWhitelist.map((r) => `- ${r}`).join("\n")
    ),
    preAuthSection,
    renderCoreFloor(),
    section(
      "ENDING THE CALL",
      `You have an endCall function available. You MUST use it to hang up.
After your closing statement, pause about 3 seconds for the callee to add anything, then invoke endCall.
DO NOT wait for them to hang up - YOU end the call. Never hang up mid-sentence.`
    ),
    section(
      "TONE",
      `Be confident, clear, and professional. You are advocating for ${clientLabel}.
Stay calm even if the conversation gets difficult.
Thank them genuinely when they help.`
    ),
  ].filter(Boolean);

  const systemPrompt = sections
    .join("\n\n")
    .replaceAll("[customer]", clientLabel)
    .replaceAll("[Customer]", clientLabel === GENERIC_CLIENT ? "The customer" : clientLabel)
    .replaceAll("[customer's city]", `${clientPossessive} city`)
    .replaceAll("[customer's state]", `${clientPossessive} state`);

  const closingTemplates: Record<TaskType, string> = {
    negotiate_price:
      "Thank you so much for working with me on this! Just to confirm the new arrangement: [summarize]. Have a wonderful day!",
    request_refund:
      "Thank you for resolving this! Can you confirm the credit reference number and when it will appear? [confirm details]. Have a wonderful day!",
    complain_issue:
      "Thank you for addressing this issue. Just to confirm: [summarize resolution]. Have a wonderful day!",
    schedule_appointment:
      "Perfect! So we're confirmed for [SPECIFIC DATE - e.g., Tuesday, January 15th] at [SPECIFIC TIME - e.g., 2:00 PM]. Is there anything my client should bring or prepare? Great, have a wonderful day!",
    cancel_service:
      "Thank you for processing this cancellation. Can you confirm the effective date and any final steps? [confirm]. Have a wonderful day!",
    make_inquiry:
      "That's very helpful, thank you! Just to summarize what I've learned: [summarize]. Have a wonderful day!",
    deliver_message: `Thank you for listening! I'll let ${clientLabel} know. Have a wonderful day!`,
    general_task:
      "Thank you so much for your help with this! Have a wonderful day!",
  };

  return {
    systemPrompt,
    firstMessage: disclosureLine,
    closingScript:
      closingTemplates[analysis.taskType] || closingTemplates.general_task,
    disclosureLine,
    preAuthorizations: preAuthEchoes,
  };
}
