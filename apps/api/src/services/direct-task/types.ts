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
  | "deliver_message"
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

/**
 * A pre-authorization echoed back with the generated prompt so the approval
 * gate UX can render exactly what the agent may (and may not) state on the
 * call. Items with granted=false are excluded from the prompt.
 */
export interface PreAuthorizationEcho {
  key: string;
  description: string;
  requiresExplicitGrant: boolean;
  granted: boolean;
}

export interface GeneratedPrompt {
  systemPrompt: string;
  firstMessage: string;
  closingScript?: string; // Optional - backend provides default based on clientName when not provided
  contextualQuestions?: string[]; // Screening questions for Research & Book flow (VAPI_ADVANCED_SCREENING=true)
  /**
   * The AI-disclosure opener line (identity + AI + recording + permission).
   * Always set by the direct-task prompt generator; optional only because
   * the legacy Research-and-Book flow builds prompts without it.
   */
  disclosureLine?: string;
  /** Playbook pre-authorizations with their granted status, for the approval gate. */
  preAuthorizations?: PreAuthorizationEcho[];
}

export interface AnalyzeDirectTaskRequest {
  taskDescription: string;
  contactName: string;
  contactPhone?: string;
  /**
   * The tenant's customer the agent calls on behalf of. Used to template the
   * disclosure opener ("I'm [clientName]'s AI assistant"); never hardcoded.
   */
  clientName?: string;
  /**
   * Keys of playbook pre-authorizations the customer explicitly granted for
   * this dispatch. Anything not listed here is excluded from the prompt.
   */
  grantedPreAuthorizations?: string[];
}

export interface AnalyzeDirectTaskResponse {
  taskAnalysis: TaskAnalysis;
  strategicGuidance: StrategicGuidance;
  generatedPrompt: GeneratedPrompt;
}
