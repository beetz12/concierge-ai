export type LiveKitCallKind = "qualification" | "booking" | "direct_task";

export interface LiveKitDynamicPrompt {
  systemPrompt: string;
  firstMessage?: string;
  closingScript?: string;
  contextualQuestions?: string[];
}

export interface LiveKitDispatchMetadata {
  kind: LiveKitCallKind;
  sessionId: string;
  serviceRequestId: string;
  providerId: string;
  providerName: string;
  providerPhone: string;
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
  mustAskQuestions?: string[];
  dealBreakers?: string[];
  taskDescription?: string;
  directTaskType?: string;
  customPrompt?: LiveKitDynamicPrompt;
}

export const serializeDispatchMetadata = (
  metadata: LiveKitDispatchMetadata,
): string => JSON.stringify(metadata);

export const parseDispatchMetadata = (raw: string | undefined): LiveKitDispatchMetadata => {
  if (!raw) {
    throw new Error("LiveKit dispatch metadata is required");
  }

  const parsed = JSON.parse(raw) as Partial<LiveKitDispatchMetadata>;
  const requiredFields = [
    "kind",
    "sessionId",
    "serviceRequestId",
    "providerId",
    "providerName",
    "providerPhone",
    "serviceNeeded",
    "location",
  ] as const;

  for (const field of requiredFields) {
    if (!parsed[field]) {
      throw new Error(`LiveKit dispatch metadata is missing ${field}`);
    }
  }

  if (
    parsed.kind !== "qualification" &&
    parsed.kind !== "booking" &&
    parsed.kind !== "direct_task"
  ) {
    throw new Error(`Unsupported LiveKit dispatch kind: ${parsed.kind}`);
  }

  return parsed as LiveKitDispatchMetadata;
};

export const buildDispatchRoomName = (sessionId: string): string =>
  `concierge-${sessionId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
