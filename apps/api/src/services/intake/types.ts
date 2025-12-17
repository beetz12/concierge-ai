/**
 * Professional Intake Question Types
 * Defines interfaces for generating and handling intake questions
 */

export interface IntakeQuestion {
  id: string;
  question: string;
  type: "text" | "radio" | "select";
  options?: string[];
  placeholder?: string;
  required: false; // ALWAYS false - all intake questions are optional
}

export interface GenerateIntakeQuestionsRequest {
  serviceType: string;
  problemDescription: string;
  urgency?: "immediate" | "within_24_hours" | "within_2_days" | "flexible";
}

export interface GenerateIntakeQuestionsResponse {
  questions: IntakeQuestion[];
  reasoning: string;
  estimatedTime: string;
}

export interface IntakeAnswer {
  questionId: string;
  question: string;
  answer: string;
}

/**
 * Internal type for Gemini response parsing
 */
export interface GeminiIntakeResponse {
  questions: Array<{
    id: string;
    question: string;
    type: "text" | "radio" | "select";
    options?: string[];
    placeholder?: string;
  }>;
  reasoning: string;
  estimatedTime: string;
}
