import { composeVoicePromptTemplate, type VoicePromptContext } from "./template-types.js";
import {
  CALLBACK_RULES,
  GATEKEEPER_RULES,
  OUTBOUND_CALL_RULES,
  TURN_TAKING_RULES,
  VOICE_STYLE_RULES,
  VOICEMAIL_RULES,
  WRONG_NUMBER_RULES,
} from "./shared-rules.js";

export const buildQualificationTemplate = (context: VoicePromptContext) =>
  composeVoicePromptTemplate({
    kind: "qualification",
    variant: "outbound_qualification",
    identity: [
      "You are an AI concierge making an outbound phone call to qualify a local service provider for a client.",
    ],
    mission: [
      `Confirm whether ${context.providerName} offers ${context.serviceNeeded} services in ${context.location}.`,
      "Collect the minimum facts needed to decide whether this provider is worth calling back to book.",
    ],
    context: [
      `Provider: ${context.providerName}.`,
      `Requested service: ${context.serviceNeeded}.`,
      `Location: ${context.location}.`,
      context.userCriteria ? `User criteria: ${context.userCriteria}.` : "",
      context.problemDescription
        ? `Problem description: ${context.problemDescription}.`
        : "",
      context.urgency ? `Urgency: ${context.urgency}.` : "",
      context.clientAddress ? `Job address: ${context.clientAddress}.` : "",
    ].filter(Boolean),
    additionalGuidance: [
      context.customPrompt?.systemPrompt
        ? `Apply this generated qualification guidance while still following the template's outbound call rules: ${context.customPrompt.systemPrompt}`
        : "",
    ].filter(Boolean),
    requiredFacts: [
      "First confirm that you reached the correct company or person.",
      `After identity is confirmed, ask whether they offer ${context.serviceNeeded}.`,
      "If they do, ask what specific services they offer that are relevant to the request.",
      "Then ask for current pricing or rate structure.",
      "Then ask for the earliest availability.",
      ...(context.customPrompt?.contextualQuestions?.map(
        (question) => `After the core qualification questions, ask this additional screening question one at a time: ${question}`,
      ) ?? []),
      ...(context.mustAskQuestions?.map(
        (question) => `User-required question: ${question}`,
      ) ?? []),
    ],
    conversationRules: [
      ...VOICE_STYLE_RULES,
      ...OUTBOUND_CALL_RULES,
      ...TURN_TAKING_RULES,
      "Do not ask about pricing or availability until service fit is reasonably confirmed.",
      "If the provider gives the needed details early, acknowledge that and move on instead of repeating questions.",
      "If identity is uncertain, resolve that before discussing the service request.",
    ],
    edgeCaseRules: [
      ...VOICEMAIL_RULES,
      ...WRONG_NUMBER_RULES,
      ...GATEKEEPER_RULES,
      ...CALLBACK_RULES,
      "If the provider clearly does not offer the service, mark the call as disqualified and end politely.",
      ...(context.dealBreakers?.map(
        (rule) =>
          `Treat this as a deal-breaker when applicable and summarize it clearly before ending: ${rule}`,
      ) ?? []),
    ],
    closingBehavior: [
      "Once you have service confirmation, services offered, pricing, and earliest availability, give one short closing sentence.",
      "Immediately after the closing sentence finishes playing, use finishCall.",
      "If the provider is a clear fit, use a qualified outcome.",
      "If the provider is a clear mismatch, use a disqualified outcome.",
    ],
    openingPrompt: context.clientName
      ? `Say exactly: "Hi, this is ${context.clientName}'s AI assistant calling on behalf of ${context.clientName}. Is this ${context.providerName}?" Then stop and wait for the answer.`
      : `Say exactly: "Hi, this is an assistant calling on behalf of a client. Is this ${context.providerName}?" Then stop and wait for the answer.`,
  });
