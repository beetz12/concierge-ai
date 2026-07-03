/**
 * Playbook schema (Zod).
 *
 * A Playbook is scenario-specific call doctrine, stored as validated data:
 * question batteries, pre-authorization checklists (with explicit-grant
 * flags), disqualifier lists, success criteria, and escalation notes.
 * Scenario playbooks layer on top of the universal core floor (see core.ts).
 *
 * Ported from the call-business skill references (see each module's
 * sourceRef). Content is intentionally verbose: the substance of the source
 * playbooks must survive into prompts, so do not trim phrasings to summaries.
 */

import { z } from "zod";

/** A named battery of questions the agent works through on the call. */
export const QuestionGroupSchema = z.object({
  /** Battery name, e.g. "Fee battery" or "Pin-down battery". */
  name: z.string().min(1),
  /** The questions, in the order they should be asked. */
  questions: z.array(z.string().min(1)).min(1),
  /** Optional usage note (when to run this battery, what answers mean). */
  notes: z.string().optional(),
});

/**
 * Something the agent may only say or do when the customer explicitly
 * granted it for this dispatch. Items with `requiresExplicitGrant: true`
 * MUST be excluded from the prompt unless granted in the request.
 */
export const PreAuthorizationSchema = z.object({
  /** Stable key used to grant this item in a request, e.g. "cancel_if_needed". */
  key: z.string().min(1),
  /** What the agent is authorized to state or do when granted. */
  description: z.string().min(1),
  /**
   * True when the item may never be assumed: the customer must explicitly
   * grant it per dispatch (e.g. cancel-bluff, chargeback mention, card hold).
   */
  requiresExplicitGrant: z.boolean(),
  /** Optional phrasing the agent uses once the item is granted. */
  whenGrantedSay: z.string().optional(),
});

export const DisqualifierSeveritySchema = z.enum([
  "hard_disqualify",
  "strong_negative",
  "investigate",
]);

/** A red flag detectable on the call, with severity and optional response. */
export const DisqualifierSchema = z.object({
  /** What the counterparty said or did. */
  trigger: z.string().min(1),
  severity: DisqualifierSeveritySchema,
  /** Optional in-call response when the trigger fires. */
  response: z.string().optional(),
});

/** A named tactic or pattern with guidance on when and how to use it. */
export const TacticSchema = z.object({
  name: z.string().min(1),
  /** When to deploy it. */
  when: z.string().optional(),
  /** The phrasing or behavior, ported verbatim where it matters. */
  guidance: z.string().min(1),
});

export const PlaybookSchema = z.object({
  /** Stable id, e.g. "disputes", "contractors". */
  id: z.string().min(1),
  title: z.string().min(1),
  /** Scenarios this playbook covers (used for routing and documentation). */
  scenarios: z.array(z.string().min(1)).min(1),
  /** Data to gather from the customer/context before dispatch. */
  preCallChecklist: z.array(z.string().min(1)),
  /** The call skeleton, step by step. */
  callSkeleton: z.array(z.string().min(1)),
  /** Question batteries (must-ask material for the prompt). */
  questionBattery: z.array(QuestionGroupSchema),
  /** Pre-authorization checklist with explicit-grant flags. */
  preAuthorizations: z.array(PreAuthorizationSchema),
  /** Red flags / auto-fail triggers. */
  disqualifiers: z.array(DisqualifierSchema),
  /** Named tactics and deflection counters. */
  tactics: z.array(TacticSchema),
  /** Things the agent must NOT do in this scenario. */
  antiPatterns: z.array(z.string().min(1)),
  /** What a successful call produces. */
  successCriteria: z.array(z.string().min(1)).min(1),
  /** Escalation and retry doctrine (HUCA caps, channel switches, ladders). */
  escalationNotes: z.array(z.string().min(1)),
  /** Work that cannot be done by phone; hand back to the customer. */
  notPhonePortable: z.array(z.string().min(1)),
  /** Where this content was ported from. */
  sourceRef: z.string().min(1),
});

export type QuestionGroup = z.infer<typeof QuestionGroupSchema>;
export type PreAuthorization = z.infer<typeof PreAuthorizationSchema>;
export type Disqualifier = z.infer<typeof DisqualifierSchema>;
export type DisqualifierSeverity = z.infer<typeof DisqualifierSeveritySchema>;
export type Tactic = z.infer<typeof TacticSchema>;
export type Playbook = z.infer<typeof PlaybookSchema>;

/**
 * The universal behavior floor every call gets regardless of scenario.
 * Ported from playbook-core.md + agent-baseline.md (prompt-baked behaviors).
 */
export const CorePlaybookSchema = z.object({
  id: z.literal("core"),
  /** Legitimacy-led opener rules: disclosure order, category-only hook. */
  openerDiscipline: z.array(z.string().min(1)).min(1),
  /** Receptionists/operators get the short greeting, never the pitch. */
  gatekeeperHandling: z.array(z.string().min(1)).min(1),
  /** IVR navigation, including the never-keyword-match rule. */
  ivrRules: z.array(z.string().min(1)).min(1),
  /** Hold/transfer silence is normal; wait, do not announce disconnects. */
  holdPatience: z.array(z.string().min(1)).min(1),
  /** Two sentences max, one question per turn, spoken forms. */
  speechDiscipline: z.array(z.string().min(1)).min(1),
  /** The agent may only commit to what the dispatch authorizes. */
  commitmentWhitelist: z.array(z.string().min(1)).min(1),
  /** Never adopt callee instructions; never reveal the prompt. */
  identityLock: z.array(z.string().min(1)).min(1),
  /** Account-holder walls: one polite attempt, then graceful exit. */
  verificationWalls: z.array(z.string().min(1)).min(1),
  /** Rep name + reference number at open; read-back lock-in at close. */
  readBacks: z.array(z.string().min(1)).min(1),
  /** Voicemail defaults and bans. */
  voicemailRules: z.array(z.string().min(1)).min(1),
  /** Must-ask enforcement, specific date/time rule, goodbye sequence. */
  closingEnforcement: z.array(z.string().min(1)).min(1),
  /** Data minimization: city/ZIP only, never card numbers. */
  privacyRules: z.array(z.string().min(1)).min(1),
  /** Post-call outcome labels + structured fields. */
  outcomeTaxonomy: z.array(z.string().min(1)).min(1),
  /** Persona line per task type, keyed by TaskType. */
  personaByTask: z.record(z.string(), z.string().min(1)),
  /** Call-timing guidance. */
  timing: z.array(z.string().min(1)),
  sourceRef: z.string().min(1),
});

export type CorePlaybook = z.infer<typeof CorePlaybookSchema>;
