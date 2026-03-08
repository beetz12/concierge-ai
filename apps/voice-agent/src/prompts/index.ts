import { buildBookingTemplate } from "./booking-template.js";
import { buildDirectTaskTemplate } from "./direct-task-template.js";
import { buildQualificationTemplate } from "./qualification-template.js";
import type { VoicePromptContext, VoicePromptTemplate } from "./template-types.js";

export type { DirectTaskType, VoicePromptContext, VoicePromptTemplate } from "./template-types.js";

export const buildVoicePromptTemplate = (
  context: VoicePromptContext,
): VoicePromptTemplate => {
  switch (context.kind) {
    case "booking":
      return buildBookingTemplate(context);
    case "direct_task":
      return buildDirectTaskTemplate(context);
    case "qualification":
    default:
      return buildQualificationTemplate(context);
  }
};
