import type { LiveKitDispatchMetadata } from "../livekit-metadata.js";

export type DirectTaskType =
  | "negotiate_price"
  | "request_refund"
  | "complain_issue"
  | "schedule_appointment"
  | "cancel_service"
  | "make_inquiry"
  | "general_task";

export type VoicePromptKind = LiveKitDispatchMetadata["kind"] | "direct_task";

export type VoicePromptVariant =
  | "outbound_qualification"
  | "outbound_booking"
  | "direct_task_negotiate_price"
  | "direct_task_request_refund"
  | "direct_task_complain_issue"
  | "direct_task_schedule_appointment"
  | "direct_task_cancel_service"
  | "direct_task_make_inquiry"
  | "direct_task_general_task";

export interface VoicePromptContext {
  kind: VoicePromptKind;
  providerName: string;
  serviceNeeded: string;
  location: string;
  userCriteria?: string;
  urgency?: string;
  problemDescription?: string;
  clientName?: string;
  clientPhone?: string;
  clientAddress?: string;
  preferredDateTime?: string;
  additionalNotes?: string;
  taskDescription?: string;
  directTaskType?: DirectTaskType;
}

export interface VoicePromptTemplate {
  kind: VoicePromptKind;
  variant: VoicePromptVariant;
  openingPrompt: string;
  requiredFacts: string[];
  conversationRules: string[];
  edgeCaseRules: string[];
  closingBehavior: string[];
  systemInstructions: string;
}

interface ComposeTemplateInput {
  kind: VoicePromptKind;
  variant: VoicePromptVariant;
  identity: string[];
  mission: string[];
  context: string[];
  requiredFacts: string[];
  conversationRules: string[];
  edgeCaseRules: string[];
  closingBehavior: string[];
  openingPrompt: string;
}

const buildSection = (title: string, lines: string[]): string =>
  lines.length > 0 ? `${title}: ${lines.join(" ")}` : "";

export const composeVoicePromptTemplate = (
  input: ComposeTemplateInput,
): VoicePromptTemplate => {
  const systemInstructions = [
    buildSection("Identity", input.identity),
    buildSection("Mission", input.mission),
    buildSection("Context", input.context),
    buildSection("Required facts", input.requiredFacts),
    buildSection("Conversation rules", input.conversationRules),
    buildSection("Edge cases", input.edgeCaseRules),
    buildSection("Closing behavior", input.closingBehavior),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    kind: input.kind,
    variant: input.variant,
    openingPrompt: input.openingPrompt,
    requiredFacts: input.requiredFacts,
    conversationRules: input.conversationRules,
    edgeCaseRules: input.edgeCaseRules,
    closingBehavior: input.closingBehavior,
    systemInstructions,
  };
};
