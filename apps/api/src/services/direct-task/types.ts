/**
 * Direct Task Analyzer Types
 * Defines interfaces for task analysis, strategic guidance, and prompt generation
 */

export type TaskType =
  | "negotiate_price"
  | "request_refund"
  | "complain_issue"
  | "schedule_appointment"
  | "cancel_service"
  | "make_inquiry"
  | "general_task";

export interface TaskAnalysis {
  taskType: TaskType;
  intent: string;
  difficulty: "easy" | "moderate" | "complex";
}

export interface StrategicGuidance {
  keyGoals: string[];
  talkingPoints: string[];
  objectionHandlers: Record<string, string>;
  successCriteria: string[];
}

export interface GeneratedPrompt {
  systemPrompt: string;
  firstMessage: string;
  closingScript: string;
}

export interface AnalyzeDirectTaskRequest {
  taskDescription: string;
  contactName: string;
  contactPhone?: string;
}

export interface AnalyzeDirectTaskResponse {
  taskAnalysis: TaskAnalysis;
  strategicGuidance: StrategicGuidance;
  generatedPrompt: GeneratedPrompt;
}
