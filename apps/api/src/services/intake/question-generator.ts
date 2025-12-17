/**
 * Professional Intake Question Generator
 * Uses Gemini AI to generate contextual questions based on service type and problem description
 */

import { GoogleGenAI } from "@google/genai";
import type {
  GenerateIntakeQuestionsRequest,
  GenerateIntakeQuestionsResponse,
  IntakeQuestion,
  GeminiIntakeResponse,
} from "./types.js";

// Initialize Gemini client
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Helper to clean and parse JSON from Gemini responses
 */
const parseJsonResponse = (text: string): GeminiIntakeResponse => {
  try {
    // Remove markdown code blocks if present
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    return JSON.parse(cleaned) as GeminiIntakeResponse;
  } catch (error) {
    console.error("Failed to parse JSON response:", text);
    throw new Error(`Invalid JSON response from Gemini: ${error}`);
  }
};

/**
 * Determines the optimal number of questions based on description length and urgency
 */
const determineQuestionCount = (
  problemDescription: string,
  urgency?: string
): { min: number; max: number } => {
  const wordCount = problemDescription.trim().split(/\s+/).length;
  const isEmergency =
    urgency === "immediate" ||
    /emergency|urgent|asap|immediately|right now/i.test(problemDescription);

  // Emergency situations: minimal questions
  if (isEmergency) {
    return { min: 1, max: 2 };
  }

  // Detailed descriptions need fewer questions
  if (wordCount > 50) {
    return { min: 1, max: 2 };
  }

  // Moderate descriptions
  if (wordCount >= 10) {
    return { min: 2, max: 3 };
  }

  // Brief descriptions need more questions
  return { min: 4, max: 5 };
};

/**
 * Generates professional intake questions using Gemini AI
 */
export async function generateIntakeQuestions(
  request: GenerateIntakeQuestionsRequest
): Promise<GenerateIntakeQuestionsResponse> {
  const ai = getAiClient();
  const model = "gemini-2.5-flash";

  const { min, max } = determineQuestionCount(
    request.problemDescription,
    request.urgency
  );

  try {
    const prompt = `You are a professional ${request.serviceType} expert taking a phone call from a potential customer.

The customer has described their need as: "${request.problemDescription}"
${request.urgency ? `Urgency level: ${request.urgency}` : ""}

Generate ${min} to ${max} follow-up questions that a real ${request.serviceType} professional would ask on a phone call to better understand the job before providing an estimate or scheduling service.

Focus on DIAGNOSTIC questions that help understand:
- Location/area of the problem (which room, floor, section, etc.)
- Severity or extent of the issue
- Age or condition of relevant equipment/systems
- Any related symptoms or secondary issues
- Access considerations for the service location
- Previous attempts to fix or related history

DO NOT ask about:
- Contact information (we have that)
- Budget (too early)
- Scheduling availability (handled separately)
- Questions already answered in their description

Return a JSON object in this exact format:
{
  "questions": [
    {
      "id": "q1",
      "question": "The question text",
      "type": "text" | "radio" | "select",
      "options": ["option1", "option2"] // only if type is "radio" or "select"
      "placeholder": "Example answer..." // only for text type
    }
  ],
  "reasoning": "Brief explanation of why these questions were chosen",
  "estimatedTime": "30 seconds" | "1 minute" | "2 minutes" // based on number of questions
}

Rules:
- Use "radio" type for yes/no or 2-3 clear options
- Use "select" type for 4+ options
- Use "text" type for open-ended answers
- Questions should be conversational, not formal
- Keep questions brief and clear
- ONLY return valid JSON, no markdown code blocks`;

    const result = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const parsed = parseJsonResponse(result.text || "{}");

    // Ensure all questions have required: false
    const questions: IntakeQuestion[] = parsed.questions.map((q) => ({
      id: q.id,
      question: q.question,
      type: q.type,
      options: q.options,
      placeholder: q.placeholder,
      required: false as const, // ALWAYS false
    }));

    return {
      questions,
      reasoning: parsed.reasoning,
      estimatedTime: parsed.estimatedTime,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("generateIntakeQuestions error:", error);
    throw new Error(`Failed to generate intake questions: ${errorMessage}`);
  }
}
