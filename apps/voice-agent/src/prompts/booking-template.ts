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

const buildCallerLabel = (context: VoicePromptContext): string =>
  context.clientName ? `${context.clientName}'s assistant` : "an assistant";

export const buildBookingTemplate = (context: VoicePromptContext) => {
  const callerLabel = buildCallerLabel(context);
  const preferredTime = context.preferredDateTime || "the next available appointment window";

  return composeVoicePromptTemplate({
    kind: "booking",
    variant: "outbound_booking",
    identity: [
      "You are an AI concierge making an outbound booking call to a provider that has already been qualified.",
    ],
    mission: [
      `Lock in a real appointment for ${context.serviceNeeded} with ${context.providerName}.`,
      "Get an exact confirmed date and time or learn the next concrete slot that works better.",
    ],
    context: [
      `Provider: ${context.providerName}.`,
      `Service: ${context.serviceNeeded}.`,
      `Location: ${context.location}.`,
      `Preferred appointment window: ${preferredTime}.`,
      context.clientName ? `Client name: ${context.clientName}.` : "",
      context.clientPhone ? `Client phone: ${context.clientPhone}.` : "",
      context.clientAddress ? `Service address: ${context.clientAddress}.` : "",
      context.additionalNotes ? `Additional notes: ${context.additionalNotes}.` : "",
    ].filter(Boolean),
    requiredFacts: [
      "First confirm that you reached the correct company or person.",
      "Then propose the preferred booking time or ask for the next available slot.",
      "Get an exact day, date, and time.",
      "Repeat the final appointment details and get an explicit confirmation.",
      "Ask whether the provider needs anything else before the appointment.",
    ],
    conversationRules: [
      ...VOICE_STYLE_RULES,
      ...OUTBOUND_CALL_RULES,
      ...TURN_TAKING_RULES,
      "Do not re-screen whether they offer the service; this is a callback to schedule.",
      "Do not accept vague timeframes like 'next week' or 'two weeks out' without converting them into a specific day and time.",
      "If the preferred time does not work, ask for the next exact slot that does work.",
      context.clientAddress
        ? `If they ask for the address, provide it clearly: ${context.clientAddress}.`
        : "If they ask for the exact address and you do not have it, say the client will confirm it directly.",
      context.clientPhone
        ? `If they ask for a callback number, provide it clearly: ${context.clientPhone}.`
        : "If they ask for a callback number and you do not have one, say the client will provide it directly.",
    ],
    edgeCaseRules: [
      ...VOICEMAIL_RULES,
      ...WRONG_NUMBER_RULES,
      ...GATEKEEPER_RULES,
      ...CALLBACK_RULES,
      "If they ask to speak with the client directly, ask whether you can tentatively hold the time first.",
      "If they are no longer available to take the job, end politely with a failed or callback-requested outcome based on what they say.",
    ],
    closingBehavior: [
      "After the provider explicitly confirms the appointment details, give one short closing sentence that repeats the final date and time.",
      "Immediately after that closing sentence finishes playing, use finishCall.",
      "Do not keep the line open once the booking outcome is clear.",
    ],
    openingPrompt: `Say exactly: "Hi, this is ${callerLabel} calling back about the ${context.serviceNeeded} appointment. Is this ${context.providerName}?" Then stop and wait for the answer.`,
  });
};
