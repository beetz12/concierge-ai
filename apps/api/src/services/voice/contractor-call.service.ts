import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isDemoMode } from "../../config/demo.js";
import { getCallRuntimeConfig } from "../../config/call-runtime.js";
import {
  analyzeResearchPrompt,
  type IntakeAnswer,
  type PromptAnalysisResult,
} from "../research/prompt-analyzer.js";
import { analyzeDirectTask } from "../direct-task/analyzer.js";
import type {
  AnalyzeDirectTaskResponse,
  GeneratedPrompt,
  TaskType,
} from "../direct-task/types.js";

export type ContractorCallMode = "qualification" | "booking" | "direct_task";
export type ContractorCallUrgency =
  | "immediate"
  | "within_24_hours"
  | "within_2_days"
  | "flexible";

export interface ContractorCallInput {
  mode: ContractorCallMode;
  contractorName: string;
  contractorPhone: string;
  serviceNeeded: string;
  location: string;
  userCriteria?: string;
  problemDescription?: string;
  urgency?: ContractorCallUrgency;
  clientName?: string;
  clientPhone?: string;
  clientAddress?: string;
  preferredDateTime?: string;
  additionalNotes?: string;
  mustAskQuestions?: string[];
  dealBreakers?: string[];
  intakeAnswers?: Array<{
    questionId?: string;
    question: string;
    answer: string;
  }>;
  taskDescription?: string;
}

export interface VoicePromptPreview {
  kind: ContractorCallMode;
  variant: string;
  openingPrompt: string;
  requiredFacts: string[];
  conversationRules: string[];
  edgeCaseRules: string[];
  closingBehavior: string[];
  systemInstructions: string;
}

export interface ContractorCallPreviewResponse {
  preview: VoicePromptPreview;
}

export interface ContractorCallPlan {
  mode: ContractorCallMode;
  promptSource: "template" | "research_analysis" | "direct_task_analysis";
  criteriaSummary: string;
  previewMetadata: {
    kind: ContractorCallMode;
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
    customPrompt?: GeneratedPrompt;
  };
  generatedPrompt?: GeneratedPrompt;
  directTaskType?: TaskType;
}

export interface ContractorCallDispatchResponse {
  success: true;
  accepted: true;
  runtimeProvider: "livekit";
  sessionId: string;
  dispatchId: string;
  providerId: string;
  serviceRequestId: string;
  roomName?: string;
  participantIdentity?: string;
}

export interface ContractorCallExecutionResult extends ContractorCallDispatchResponse {
  preview: VoicePromptPreview;
  plan: ContractorCallPlan;
}

export interface ContractorCallStatus {
  session: Record<string, unknown>;
  provider: Record<string, unknown> | null;
  serviceRequest: Record<string, unknown> | null;
  events: Record<string, unknown>[];
  completed: boolean;
  result: {
    disposition: string | null;
    summary: string | null;
    availability: string | null;
    estimatedRate: string | null;
    transcript: string | null;
  };
}

interface ContractorCallServiceDependencies {
  supabase: SupabaseClient;
  fetchImpl?: typeof fetch;
  analyzeResearchPromptImpl?: (
    request: Parameters<typeof analyzeResearchPrompt>[0],
  ) => Promise<PromptAnalysisResult>;
  analyzeDirectTaskImpl?: (
    request: Parameters<typeof analyzeDirectTask>[0],
  ) => Promise<AnalyzeDirectTaskResponse>;
}

const DEFAULT_URGENCY: ContractorCallUrgency = "flexible";

const ensureTrimmedArray = (values?: string[]): string[] | undefined => {
  const normalized = values
    ?.map((value) => value.trim())
    .filter(Boolean);

  return normalized && normalized.length > 0 ? normalized : undefined;
};

export const createCriteriaSummary = (input: ContractorCallInput): string => {
  const sections = [
    input.userCriteria?.trim(),
    input.mustAskQuestions?.length
      ? `Must ask: ${input.mustAskQuestions.join("; ")}`
      : "",
    input.dealBreakers?.length
      ? `Deal breakers: ${input.dealBreakers.join("; ")}`
      : "",
    input.intakeAnswers?.length
      ? `User intake: ${input.intakeAnswers
          .map((answer) => `${answer.question}: ${answer.answer}`)
          .join("; ")}`
      : "",
    input.additionalNotes?.trim()
      ? `Notes: ${input.additionalNotes.trim()}`
      : "",
  ].filter(Boolean);

  return sections.join("\n");
};

export const getVoiceAgentDispatchPath = (mode: ContractorCallMode): string => {
  switch (mode) {
    case "booking":
      return "/dispatch/provider-booking";
    case "direct_task":
      return "/dispatch/direct-task";
    case "qualification":
    default:
      return "/dispatch/provider-call";
  }
};

const buildRequestTitle = (input: ContractorCallInput): string => {
  switch (input.mode) {
    case "booking":
      return `Book ${input.serviceNeeded} with ${input.contractorName}`;
    case "direct_task":
      return `Direct task call with ${input.contractorName}`;
    case "qualification":
    default:
      return `Call ${input.contractorName} about ${input.serviceNeeded}`;
  }
};

const buildRequestDescription = (input: ContractorCallInput): string => {
  if (input.mode === "direct_task") {
    return input.taskDescription?.trim() || `Direct task for ${input.contractorName}`;
  }

  if (input.mode === "booking") {
    return (
      input.problemDescription?.trim() ||
      `Confirm a ${input.serviceNeeded} booking with ${input.contractorName}.`
    );
  }

  return (
    input.problemDescription?.trim() ||
    `Interview ${input.contractorName} about ${input.serviceNeeded}.`
  );
};

export class ContractorCallService {
  private readonly supabase: SupabaseClient;
  private readonly fetchImpl: typeof fetch;
  private readonly analyzeResearchPromptImpl: (
    request: Parameters<typeof analyzeResearchPrompt>[0],
  ) => Promise<PromptAnalysisResult>;
  private readonly analyzeDirectTaskImpl: (
    request: Parameters<typeof analyzeDirectTask>[0],
  ) => Promise<AnalyzeDirectTaskResponse>;

  constructor(dependencies: ContractorCallServiceDependencies) {
    this.supabase = dependencies.supabase;
    this.fetchImpl = dependencies.fetchImpl || fetch;
    this.analyzeResearchPromptImpl =
      dependencies.analyzeResearchPromptImpl || analyzeResearchPrompt;
    this.analyzeDirectTaskImpl =
      dependencies.analyzeDirectTaskImpl || analyzeDirectTask;
  }

  async buildCallPlan(input: ContractorCallInput): Promise<ContractorCallPlan> {
    const criteriaSummary = createCriteriaSummary(input);
    const mustAskQuestions = ensureTrimmedArray(input.mustAskQuestions);
    const dealBreakers = ensureTrimmedArray(input.dealBreakers);
    const urgency = input.urgency || DEFAULT_URGENCY;
    const baseMetadata = {
      kind: input.mode,
      providerName: input.contractorName,
      providerPhone: input.contractorPhone,
      serviceNeeded: input.serviceNeeded,
      location: input.location,
      userCriteria: criteriaSummary,
      urgency,
      problemDescription: input.problemDescription,
      clientName: input.clientName,
      clientPhone: input.clientPhone,
      clientAddress: input.clientAddress,
      preferredDateTime: input.preferredDateTime,
      additionalNotes: input.additionalNotes,
      mustAskQuestions,
      dealBreakers,
      taskDescription: input.taskDescription,
    } satisfies ContractorCallPlan["previewMetadata"];

    if (input.mode === "qualification") {
      const analysis = await this.analyzeResearchPromptImpl({
        serviceType: input.serviceNeeded,
        problemDescription:
          input.problemDescription ||
          `The client wants to compare ${input.serviceNeeded} options.`,
        userCriteria: criteriaSummary,
        location: input.location,
        urgency,
        clientName: input.clientName || "the client",
        clientAddress: input.clientAddress,
        intakeAnswers: input.intakeAnswers?.map(
          (answer, index): IntakeAnswer => ({
            questionId: answer.questionId || `intake_${index + 1}`,
            question: answer.question,
            answer: answer.answer,
          }),
        ),
      });

      return {
        mode: input.mode,
        promptSource: "research_analysis",
        criteriaSummary,
        generatedPrompt: {
          systemPrompt: analysis.systemPrompt,
          firstMessage: analysis.firstMessage,
          closingScript: analysis.closingScript,
          contextualQuestions: analysis.contextualQuestions,
        },
        previewMetadata: {
          ...baseMetadata,
          customPrompt: {
            systemPrompt: analysis.systemPrompt,
            firstMessage: analysis.firstMessage,
            closingScript: analysis.closingScript,
            contextualQuestions: analysis.contextualQuestions,
          },
        },
      };
    }

    if (input.mode === "direct_task") {
      if (!input.taskDescription?.trim()) {
        throw new Error("taskDescription is required for direct_task calls");
      }

      const analysis = await this.analyzeDirectTaskImpl({
        taskDescription: input.taskDescription,
        contactName: input.contractorName,
        contactPhone: input.contractorPhone,
      });

      return {
        mode: input.mode,
        promptSource: "direct_task_analysis",
        criteriaSummary,
        directTaskType: analysis.taskAnalysis.taskType,
        generatedPrompt: analysis.generatedPrompt,
        previewMetadata: {
          ...baseMetadata,
          directTaskType: analysis.taskAnalysis.taskType,
          customPrompt: analysis.generatedPrompt,
        },
      };
    }

    return {
      mode: input.mode,
      promptSource: "template",
      criteriaSummary,
      previewMetadata: baseMetadata,
    };
  }

  async previewCall(input: ContractorCallInput) {
    const plan = await this.buildCallPlan(input);
    const response = await this.requestVoiceAgent<ContractorCallPreviewResponse>(
      "/preview/call",
      {
        metadata: plan.previewMetadata,
      },
    );

    return {
      plan,
      preview: response.preview,
    };
  }

  async dispatchCall(input: ContractorCallInput): Promise<ContractorCallExecutionResult> {
    const { plan, preview } = await this.previewCall(input);
    const persistedContext = await this.createPersistenceContext(input, plan);
    const payload = await this.requestVoiceAgent<ContractorCallDispatchResponse>(
      getVoiceAgentDispatchPath(input.mode),
      {
        request: {
          ...plan.previewMetadata,
          serviceRequestId: persistedContext.serviceRequestId,
          providerId: persistedContext.providerId,
        },
      },
    );

    await this.recordInteractionLog({
      requestId: persistedContext.serviceRequestId,
      detail: `Dispatched ${input.mode} call to ${input.contractorName} (${payload.sessionId}).`,
      transcript: {
        sessionId: payload.sessionId,
        dispatchId: payload.dispatchId,
        mode: input.mode,
        preview,
      },
    });

    return {
      ...payload,
      preview,
      plan,
    };
  }

  async getCallStatus(sessionId: string): Promise<ContractorCallStatus> {
    const sessionResult = await this.supabase
      .from("voice_call_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionResult.error || !sessionResult.data) {
      throw new Error(`Voice session not found: ${sessionId}`);
    }

    const session = sessionResult.data;
    const [eventsResult, providerResult, serviceRequestResult] = await Promise.all([
      this.supabase
        .from("voice_call_events")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true }),
      this.supabase
        .from("providers")
        .select("*")
        .eq("id", session.provider_id)
        .single(),
      this.supabase
        .from("service_requests")
        .select("*")
        .eq("id", session.service_request_id)
        .single(),
    ]);

    const provider = providerResult.error ? null : providerResult.data;
    const serviceRequest = serviceRequestResult.error
      ? null
      : serviceRequestResult.data;
    const events = eventsResult.error ? [] : eventsResult.data || [];
    const providerCallResult =
      provider && typeof provider.call_result === "object" && provider.call_result
        ? (provider.call_result as Record<string, unknown>)
        : null;
    const outcome =
      session.outcome && typeof session.outcome === "object"
        ? (session.outcome as Record<string, unknown>)
        : null;

    return {
      session,
      provider,
      serviceRequest,
      events,
      completed: ["completed", "failed", "cancelled"].includes(session.status),
      result: {
        disposition: this.pickString(
          outcome?.disposition,
          providerCallResult?.disposition,
        ),
        summary: this.pickString(
          outcome?.summary,
          provider?.call_summary,
        ),
        availability: this.pickString(
          outcome?.availability,
          providerCallResult?.availability,
        ),
        estimatedRate: this.pickString(
          outcome?.estimatedRate,
          providerCallResult?.estimatedRate,
        ),
        transcript: this.pickString(provider?.call_transcript),
      },
    };
  }

  private async createPersistenceContext(
    input: ContractorCallInput,
    plan: ContractorCallPlan,
  ): Promise<{ serviceRequestId: string; providerId: string }> {
    if (isDemoMode()) {
      return {
        serviceRequestId: `demo-request-${crypto.randomUUID()}`,
        providerId: `demo-provider-${crypto.randomUUID()}`,
      };
    }

    const serviceRequestInsert = {
      type: input.mode === "direct_task" ? "DIRECT_TASK" : "RESEARCH_AND_BOOK",
      title: buildRequestTitle(input),
      description: buildRequestDescription(input),
      criteria: plan.criteriaSummary || input.userCriteria || "",
      location: input.location,
      status: "CALLING",
      preferred_contact: "phone",
      direct_contact_info: {
        clientName: input.clientName || null,
        clientPhone: input.clientPhone || null,
        clientAddress: input.clientAddress || null,
        urgency: input.urgency || DEFAULT_URGENCY,
        mustAskQuestions: input.mustAskQuestions || [],
        dealBreakers: input.dealBreakers || [],
        intakeAnswers: input.intakeAnswers || [],
        callMode: input.mode,
      },
      user_phone: input.clientPhone || null,
    };

    const serviceRequestResult = await this.supabase
      .from("service_requests")
      .insert(serviceRequestInsert)
      .select("id")
      .single();

    if (serviceRequestResult.error || !serviceRequestResult.data) {
      throw new Error(
        `Failed to create service request: ${serviceRequestResult.error?.message || "unknown error"}`,
      );
    }

    const providerResult = await this.supabase
      .from("providers")
      .insert({
        request_id: serviceRequestResult.data.id,
        name: input.contractorName,
        phone: input.contractorPhone,
        address: input.clientAddress || null,
        source: "User Input",
        call_status: "queued",
        call_method: "livekit",
      })
      .select("id")
      .single();

    if (providerResult.error || !providerResult.data) {
      throw new Error(
        `Failed to create provider record: ${providerResult.error?.message || "unknown error"}`,
      );
    }

    return {
      serviceRequestId: serviceRequestResult.data.id,
      providerId: providerResult.data.id,
    };
  }

  private async recordInteractionLog(input: {
    requestId: string;
    detail: string;
    transcript: Record<string, unknown>;
  }) {
    if (isDemoMode()) {
      return;
    }

    await this.supabase.from("interaction_logs").insert({
      request_id: input.requestId,
      step_name: "Contractor Call Dispatched",
      detail: input.detail,
      status: "info",
      transcript: input.transcript,
    });
  }

  private async requestVoiceAgent<T>(pathname: string, payload: unknown): Promise<T> {
    const config = getCallRuntimeConfig();
    const voiceAgentUrl =
      process.env.VOICE_AGENT_SERVICE_URL || "http://127.0.0.1:8787";
    const response = await this.fetchImpl(`${voiceAgentUrl}${pathname}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-voice-agent-key": config.voiceAgent.sharedSecret,
      },
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as T | { message?: string };
    if (!response.ok) {
      const message =
        typeof data === "object" && data && "message" in data
          ? data.message
          : JSON.stringify(data);
      throw new Error(
        `Voice agent request failed (${response.status}): ${message}`,
      );
    }

    return data as T;
  }

  private pickString(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }

    return null;
  }
}
