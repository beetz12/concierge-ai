import { Provider, InteractionLog } from "../types";
import type { GeneratedPrompt } from "./providerCallingService";

// API base URL - uses Next.js rewrite to proxy to backend
const API_BASE = "/api/v1/gemini";

/**
 * Task analysis response from Gemini
 */
export interface TaskAnalysis {
  taskType: string;
  intent: string;
  difficulty: "easy" | "moderate" | "complex";
}

export interface StrategicGuidance {
  keyGoals: string[];
  talkingPoints: string[];
  objectionHandlers: Record<string, string>;
  successCriteria: string[];
}

export interface AnalyzeDirectTaskResponse {
  taskAnalysis: TaskAnalysis;
  strategicGuidance: StrategicGuidance;
  generatedPrompt: GeneratedPrompt;
}

export interface ResearchPromptRequest {
  serviceType: string;
  problemDescription: string;
  userCriteria: string;
  location: string;
  urgency: string;
  providerName: string;
  clientName: string;
  clientAddress?: string;
}

export interface ServiceTerminology {
  providerTerm: string;
  appointmentTerm: string;
  visitDirection: "patient visits provider" | "provider comes to location";
}

export interface PromptAnalysisResult {
  serviceCategory: "medical" | "home_service" | "professional" | "retail" | "other";
  terminology: ServiceTerminology;
  contextualQuestions: string[];
  systemPrompt: string;
  firstMessage: string;
}

/**
 * Generic API request handler with error handling
 */
const apiRequest = async <T>(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<T> => {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || `API error: ${response.status}`);
  }

  return response.json();
};

/**
 * Step 1: Search for providers using Google Maps Grounding
 * Now calls backend API instead of Gemini directly
 */
export const searchProviders = async (
  query: string,
  location: string,
): Promise<{ providers: Provider[]; logs: InteractionLog }> => {
  try {
    const result = await apiRequest<{
      providers: Provider[];
      logs: InteractionLog;
    }>("/search-providers", { query, location });
    return result;
  } catch (error: any) {
    return {
      providers: [],
      logs: {
        timestamp: new Date().toISOString(),
        stepName: "Market Research",
        detail: `Failed to find providers: ${error.message}`,
        status: "error",
      },
    };
  }
};

/**
 * Step 2: Simulate a phone call to a provider
 * Now calls backend API instead of Gemini directly
 */
export const simulateCall = async (
  providerName: string,
  userCriteria: string,
  isDirect: boolean,
): Promise<InteractionLog> => {
  try {
    const result = await apiRequest<InteractionLog>("/simulate-call", {
      providerName,
      userCriteria,
      isDirect,
    });
    return result;
  } catch (error: any) {
    return {
      timestamp: new Date().toISOString(),
      stepName: `Calling ${providerName}`,
      detail: "Call failed to connect or dropped.",
      status: "error",
    };
  }
};

/**
 * Step 3: Analyze all results and pick a winner
 * Now calls backend API instead of Gemini directly
 */
export const selectBestProvider = async (
  requestTitle: string,
  interactions: InteractionLog[],
  providers: Provider[],
): Promise<{ selectedId: string | null; reasoning: string }> => {
  try {
    const result = await apiRequest<{
      selectedId: string | null;
      reasoning: string;
    }>("/select-best-provider", {
      requestTitle,
      interactions,
      providers,
    });
    return result;
  } catch (error: any) {
    return { selectedId: null, reasoning: "AI Analysis failed." };
  }
};

/**
 * Analyze a direct task using Gemini to generate dynamic prompts
 * This creates task-specific prompts for VAPI calls based on the user's intent
 */
export const analyzeDirectTask = async (
  taskDescription: string,
  contactName: string,
  contactPhone?: string,
): Promise<AnalyzeDirectTaskResponse | null> => {
  try {
    const result = await apiRequest<AnalyzeDirectTaskResponse>(
      "/analyze-direct-task",
      {
        taskDescription,
        contactName,
        contactPhone,
      },
    );
    return result;
  } catch (error: any) {
    console.error("[analyzeDirectTask] Failed to analyze task:", error);
    // Return null to allow fallback to default prompts
    return null;
  }
};

/**
 * Analyze a research prompt using Gemini to generate dynamic assistant configuration
 * This creates context-aware prompts for VAPI research calls based on service type
 */
export const analyzeResearchPrompt = async (
  request: ResearchPromptRequest
): Promise<PromptAnalysisResult | null> => {
  try {
    const result = await apiRequest<PromptAnalysisResult>(
      "/analyze-research-prompt",
      { ...request },
    );
    return result;
  } catch (error: any) {
    console.error("[analyzeResearchPrompt] Failed to analyze research prompt:", error);
    // Return null to allow fallback to default prompts
    return null;
  }
};
