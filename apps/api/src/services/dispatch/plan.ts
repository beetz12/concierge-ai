/**
 * Deterministic dispatch-plan builder (SaaS slice 8).
 *
 * The plan-review screen (Gate 1) regenerates the plan on every edit, so
 * plan generation must be fast, offline, and reproducible. This module
 * classifies the task with static keyword rules, derives strategic guidance
 * from the selected playbook's own content, and composes the full prompt via
 * the slice-4 prompt generator (which owns disclosure lines and the
 * pre-authorization echo). The legacy Gemini analyzer
 * (services/direct-task/analyzer.ts) remains in place for the /direct flow.
 */

import {
  generatePromptFromAnalysis,
} from "../direct-task/prompt-generator.js";
import type {
  AnalyzeDirectTaskRequest,
  GeneratedPrompt,
  StrategicGuidance,
  TaskAnalysis,
  TaskType,
} from "../direct-task/types.js";
import { selectPlaybook, type Playbook } from "../playbooks/index.js";
import type { ComplianceTaskType } from "../compliance/types.js";

/** Ordered keyword rules; the first match wins. */
const TASK_TYPE_RULES: Array<{ pattern: RegExp; taskType: TaskType }> = [
  { pattern: /\brefund|money back|reimburs|charge ?back/i, taskType: "request_refund" },
  {
    pattern: /\bnegotiat|lower(ing)? (the )?(price|rate|bill)|better (deal|rate|price)|price match|\bdiscount\b/i,
    taskType: "negotiate_price",
  },
  {
    pattern: /\bcomplain|complaint\b|unacceptable|\bescalat/i,
    taskType: "complain_issue",
  },
  { pattern: /\bcancel\b/i, taskType: "cancel_service" },
  {
    pattern: /\breschedul|\bschedul|appointment|\bbook(ing)?\b/i,
    taskType: "schedule_appointment",
  },
  {
    pattern: /pass along|leave (a |the )?message|let .{0,40}\bknow\b|tell (him|her|them)\b/i,
    taskType: "deliver_message",
  },
  {
    pattern: /\binquir|find out|check (if|whether|on)|\bask\b|are they|do they|hours\b|status of/i,
    taskType: "make_inquiry",
  },
];

const DIFFICULTY_BY_TYPE: Record<TaskType, TaskAnalysis["difficulty"]> = {
  negotiate_price: "complex",
  request_refund: "complex",
  complain_issue: "complex",
  cancel_service: "moderate",
  schedule_appointment: "moderate",
  make_inquiry: "easy",
  deliver_message: "easy",
  general_task: "moderate",
};

/**
 * Direct-task type -> R-27 compliance taxonomy. All direct-task types are
 * buyer-side, non-solicitation calls placed on the tenant's behalf.
 */
export const COMPLIANCE_TASK_TYPE_BY_TASK: Record<TaskType, ComplianceTaskType> = {
  negotiate_price: "rate_negotiation",
  request_refund: "dispute_followup",
  complain_issue: "complaint",
  schedule_appointment: "appointment_booking",
  cancel_service: "general_inquiry",
  make_inquiry: "general_inquiry",
  deliver_message: "general_inquiry",
  general_task: "general_inquiry",
};

/** Static keyword classification; no model call, same input -> same output. */
export function classifyTask(taskDescription: string): TaskAnalysis {
  const matched = TASK_TYPE_RULES.find((rule) =>
    rule.pattern.test(taskDescription),
  );
  const taskType = matched?.taskType ?? "general_task";
  const intent = taskDescription.trim().replace(/\s+/g, " ").slice(0, 160);
  return {
    taskType,
    intent,
    difficulty: DIFFICULTY_BY_TYPE[taskType],
  };
}

/** Guidance derived from the playbook's own content (no free-form AI text). */
export function buildGuidance(
  analysis: TaskAnalysis,
  playbook: Playbook | null,
): StrategicGuidance {
  const keyGoals = [
    analysis.intent,
    ...(playbook?.successCriteria.slice(0, 3) ?? []),
  ];
  const talkingPoints =
    playbook?.callSkeleton.slice(0, 5) ??
    ["State the objective plainly, confirm the details, and close with a read-back."];
  const objectionHandlers: Record<string, string> = {};
  for (const tactic of playbook?.tactics.slice(0, 4) ?? []) {
    objectionHandlers[tactic.name] = tactic.guidance;
  }
  const successCriteria = playbook?.successCriteria.slice(0, 4) ?? [
    "The objective is achieved or a concrete next step with a date is secured.",
  ];
  return { keyGoals, talkingPoints, objectionHandlers, successCriteria };
}

/**
 * Must-ask questions for the call plan: the first battery of the selected
 * playbook (its must-ask material), capped so the review screen stays
 * scannable.
 */
export function deriveMustAsk(
  playbook: Playbook | null,
  analysis: TaskAnalysis,
): string[] {
  const battery = playbook?.questionBattery[0]?.questions ?? [];
  if (battery.length > 0) {
    return battery.slice(0, 5);
  }
  return [`Confirm: ${analysis.intent}`];
}

export interface DispatchPlanInput {
  taskDescription: string;
  contactName: string;
  contactPhone?: string;
  clientName?: string;
  grantedPreAuthorizations?: string[];
}

export interface DispatchPlanResult {
  taskAnalysis: TaskAnalysis;
  strategicGuidance: StrategicGuidance;
  generatedPrompt: GeneratedPrompt;
  mustAsk: string[];
  playbookId: string | null;
  complianceTaskType: ComplianceTaskType;
}

/** Build the full reviewable plan for the Gate-1 screen. */
export function buildDispatchPlan(input: DispatchPlanInput): DispatchPlanResult {
  const analysis = classifyTask(input.taskDescription);
  const playbook = selectPlaybook(analysis.taskType, input.taskDescription);
  const guidance = buildGuidance(analysis, playbook);

  const request: AnalyzeDirectTaskRequest = {
    taskDescription: input.taskDescription,
    contactName: input.contactName,
    contactPhone: input.contactPhone,
    clientName: input.clientName,
    grantedPreAuthorizations: input.grantedPreAuthorizations,
  };
  const generatedPrompt = generatePromptFromAnalysis(request, analysis, guidance);

  return {
    taskAnalysis: analysis,
    strategicGuidance: guidance,
    generatedPrompt,
    mustAsk: deriveMustAsk(playbook, analysis),
    playbookId: playbook?.id ?? null,
    complianceTaskType: COMPLIANCE_TASK_TYPE_BY_TASK[analysis.taskType],
  };
}
