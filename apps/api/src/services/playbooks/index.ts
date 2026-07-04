/**
 * Playbook registry and selection.
 *
 * selectPlaybook(taskType, taskDescription) picks the scenario playbook that
 * layers on top of the universal core floor (CORE_PLAYBOOK). Every TaskType
 * maps to a playbook; description keywords can route to a more specific
 * scenario (contractor vetting, warranty, medical, insurance, travel,
 * government, follow-up). A null result means core-only: the call runs on
 * the behavior floor without scenario tactics.
 */

import type { TaskType } from "../direct-task/types.js";
import type { Playbook } from "./schema.js";
import { CONTRACTORS_PLAYBOOK } from "./scenarios/contractors.js";
import { DISPUTES_PLAYBOOK } from "./scenarios/disputes.js";
import { ERRANDS_PLAYBOOK } from "./scenarios/errands.js";
import { FOLLOWUP_PLAYBOOK } from "./scenarios/followup.js";
import { GOVERNMENT_PLAYBOOK } from "./scenarios/government.js";
import { INSURANCE_PLAYBOOK } from "./scenarios/insurance.js";
import { MEDICAL_PLAYBOOK } from "./scenarios/medical.js";
import { TRAVEL_PLAYBOOK } from "./scenarios/travel.js";
import { WARRANTY_PLAYBOOK } from "./scenarios/warranty.js";

export * from "./schema.js";
export { CORE_PLAYBOOK } from "./core.js";
export { CONTRACTORS_PLAYBOOK } from "./scenarios/contractors.js";
export { DISPUTES_PLAYBOOK } from "./scenarios/disputes.js";
export { ERRANDS_PLAYBOOK } from "./scenarios/errands.js";
export { FOLLOWUP_PLAYBOOK } from "./scenarios/followup.js";
export { GOVERNMENT_PLAYBOOK } from "./scenarios/government.js";
export { INSURANCE_PLAYBOOK } from "./scenarios/insurance.js";
export { MEDICAL_PLAYBOOK } from "./scenarios/medical.js";
export { TRAVEL_PLAYBOOK } from "./scenarios/travel.js";
export { WARRANTY_PLAYBOOK } from "./scenarios/warranty.js";

/** All scenario playbooks, keyed by id. */
export const ALL_PLAYBOOKS: readonly Playbook[] = [
  DISPUTES_PLAYBOOK,
  CONTRACTORS_PLAYBOOK,
  WARRANTY_PLAYBOOK,
  ERRANDS_PLAYBOOK,
  MEDICAL_PLAYBOOK,
  INSURANCE_PLAYBOOK,
  TRAVEL_PLAYBOOK,
  GOVERNMENT_PLAYBOOK,
  FOLLOWUP_PLAYBOOK,
];

/**
 * Scenario keyword detectors, checked in priority order against the task
 * description. More specific scenarios win over the generic task-type map
 * (e.g. request_refund + "flight" routes to travel, whose DOT-refund
 * doctrine beats the generic disputes doctrine).
 */
const SCENARIO_DETECTORS: ReadonlyArray<{
  playbook: Playbook;
  pattern: RegExp;
}> = [
  {
    playbook: FOLLOWUP_PLAYBOOK,
    pattern:
      /\bfollow[ -]?up\b|\bstatus (?:check|of|on)\b|\bexisting case\b|\bcase number\b|\bstill waiting\b|\bpromised .*call ?back\b/i,
  },
  {
    playbook: GOVERNMENT_PLAYBOOK,
    pattern:
      /\buscis\b|\birs\b|\bssa\b|\bsocial security\b|\bdmv\b|\bimmigration\b|\bcourt clerk\b|\bclerk of court\b|\bgovernment agency\b/i,
  },
  {
    playbook: TRAVEL_PLAYBOOK,
    pattern:
      /\bflight\b|\bairline\b|\bairport\b|\bhotel\b|\bresort fee\b|\bitinerary\b|\brebook/i,
  },
  {
    playbook: INSURANCE_PLAYBOOK,
    pattern:
      /\binsur(?:ance|er)\b|\badjuster\b|\bpolicy number\b|\bfnol\b|\bdeductible\b|\bpremium\b|\bcoverage verification\b/i,
  },
  {
    playbook: MEDICAL_PLAYBOOK,
    pattern:
      /\bdoctor\b|\bdentist\b|\bdental\b|\bmedical\b|\bclinic\b|\bphysician\b|\bpediatric|\bprescription\b|\brefill\b|\bpharmacy\b|\bpatient\b|\bdr\.\s/i,
  },
  {
    playbook: WARRANTY_PLAYBOOK,
    pattern: /\bwarrant(?:y|ies)\b|\bdefect(?:ive)?\b|\brma\b|\bgoodwill (?:repair|replacement)\b/i,
  },
  {
    playbook: CONTRACTORS_PLAYBOOK,
    pattern:
      /\bcontractors?\b|\bplumb(?:er|ing)\b|\bhvac\b|\belectrician\b|\broof(?:er|ing)\b|\bhandyman\b|\blandscap|\bremodel|\brenovat|\bgeneral contractor\b|\bvet(?:ting)? (?:a |the )?(?:vendor|pro|provider|company)\b|\b(?:get|collect|compare) (?:a |three |3 |multiple )?(?:quotes?|bids?|estimates?)\b|\blicense number\b/i,
  },
];

/** Task types whose generic home is the disputes playbook. */
const DISPUTE_TASK_TYPES: ReadonlySet<TaskType> = new Set([
  "negotiate_price",
  "request_refund",
  "complain_issue",
]);

/** Task types whose generic home is the errands playbook. */
const ERRAND_TASK_TYPES: ReadonlySet<TaskType> = new Set([
  "schedule_appointment",
  "make_inquiry",
  "deliver_message",
]);

/**
 * Heuristic for cancel_service: a cancellation that carries leverage intent
 * (retention offers, fee fights, refunds) runs on the disputes doctrine;
 * a plain cancellation is an errand.
 */
const CANCEL_DISPUTE_PATTERN =
  /\bretention\b|\bnegotiat|\bdiscount\b|\bcounter[ -]?offer\b|\bfee\b|\brefund\b|\bdispute\b|\bprice\b|\bkeep (?:me|us|them) as\b|\bbetter (?:deal|rate|offer)\b/i;

/**
 * Select the scenario playbook for a task.
 *
 * @returns the playbook to layer on the core floor, or null for core-only
 *          (general_task with no scenario signal).
 */
export function selectPlaybook(
  taskType: TaskType,
  taskDescription: string
): Playbook | null {
  const description = taskDescription ?? "";

  for (const detector of SCENARIO_DETECTORS) {
    if (detector.pattern.test(description)) {
      return detector.playbook;
    }
  }

  if (DISPUTE_TASK_TYPES.has(taskType)) {
    return DISPUTES_PLAYBOOK;
  }
  if (ERRAND_TASK_TYPES.has(taskType)) {
    return ERRANDS_PLAYBOOK;
  }
  if (taskType === "cancel_service") {
    return CANCEL_DISPUTE_PATTERN.test(description)
      ? DISPUTES_PLAYBOOK
      : ERRANDS_PLAYBOOK;
  }

  // general_task: core-only unless a scenario detector matched above.
  return null;
}
