import { composeVoicePromptTemplate, type DirectTaskType, type VoicePromptContext } from "./template-types.js";
import {
  CALLBACK_RULES,
  GATEKEEPER_RULES,
  OUTBOUND_CALL_RULES,
  TURN_TAKING_RULES,
  VOICE_STYLE_RULES,
  VOICEMAIL_RULES,
  WRONG_NUMBER_RULES,
} from "./shared-rules.js";

const ROLE_BY_TASK: Record<DirectTaskType, string> = {
  negotiate_price: "a calm, persuasive negotiator",
  request_refund: "a persistent but polite refund advocate",
  complain_issue: "a firm but professional complaint handler",
  schedule_appointment: "an efficient scheduling assistant",
  cancel_service: "a clear and direct cancellation assistant",
  make_inquiry: "a concise information-gathering assistant",
  general_task: "a capable assistant handling a client task",
};

const PURPOSE_BY_TASK: Record<DirectTaskType, string> = {
  negotiate_price: "work toward a better price or billing outcome",
  request_refund: "request a refund or billing correction",
  complain_issue: "explain the issue and push for a concrete resolution",
  schedule_appointment: "schedule the requested appointment",
  cancel_service: "cancel the requested service cleanly",
  make_inquiry: "gather the needed information clearly",
  general_task: "complete the client task efficiently",
};

const openingByTask = (context: VoicePromptContext, taskType: DirectTaskType): string => {
  const taskLabel =
    taskType === "negotiate_price"
      ? "billing"
      : taskType === "request_refund"
        ? "a refund request"
        : taskType === "complain_issue"
          ? "an issue on a client's behalf"
          : taskType === "schedule_appointment"
            ? `scheduling ${context.serviceNeeded}`
            : taskType === "cancel_service"
              ? "a service cancellation"
              : "a client request";

  return `Say exactly: "Hi, this is an assistant calling on behalf of a client. Is this ${context.providerName}?" Then wait for the answer. After they confirm, briefly say you are calling about ${taskLabel}.`;
};

export const buildDirectTaskTemplate = (context: VoicePromptContext) => {
  const taskType = context.directTaskType || "general_task";
  const taskDescription = context.taskDescription || context.userCriteria || "complete the requested client task";

  return composeVoicePromptTemplate({
    kind: "direct_task",
    variant: `direct_task_${taskType}`,
    identity: [
      `You are ${ROLE_BY_TASK[taskType]} making an outbound phone call on behalf of a client.`,
    ],
    mission: [
      `Your goal is to ${PURPOSE_BY_TASK[taskType]}.`,
      `Task description: ${taskDescription}.`,
    ],
    context: [
      `Counterparty: ${context.providerName}.`,
      context.serviceNeeded ? `Service context: ${context.serviceNeeded}.` : "",
      context.location ? `Location: ${context.location}.` : "",
      context.clientName ? `Client name: ${context.clientName}.` : "",
      context.additionalNotes ? `Additional notes: ${context.additionalNotes}.` : "",
    ].filter(Boolean),
    requiredFacts: [
      "First confirm that you reached the correct company or person.",
      "State the task clearly in one sentence.",
      "Work toward a specific outcome, commitment, or answer.",
      "Summarize the result before ending the call.",
    ],
    conversationRules: [
      ...VOICE_STYLE_RULES,
      ...OUTBOUND_CALL_RULES,
      ...TURN_TAKING_RULES,
      "Be direct and professional without sounding scripted.",
      "If the other party pushes back, stay calm and restate the request clearly.",
      "If you need a number, date, or commitment, ask for it explicitly rather than leaving it vague.",
    ],
    edgeCaseRules: [
      ...VOICEMAIL_RULES,
      ...WRONG_NUMBER_RULES,
      ...GATEKEEPER_RULES,
      ...CALLBACK_RULES,
      "If the issue needs a manager or specialist, accept the transfer and restate the purpose briefly to the new person.",
    ],
    closingBehavior: [
      "Once the outcome is clear, give one short closing sentence that summarizes the result.",
      "Immediately after the closing sentence finishes playing, use finishCall.",
    ],
    openingPrompt: openingByTask(context, taskType),
  });
};
