/**
 * Direct Task Analyzer
 * Uses Gemini to analyze user tasks and generate dynamic prompts
 */

import { GoogleGenAI } from "@google/genai";
import type {
  AnalyzeDirectTaskRequest,
  AnalyzeDirectTaskResponse,
  TaskAnalysis,
  StrategicGuidance,
} from "./types.js";
import { generatePromptFromAnalysis } from "./prompt-generator.js";

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
const parseJsonResponse = (text: string): any => {
  try {
    // Remove markdown code blocks if present
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Failed to parse JSON response:", text);
    throw new Error(`Invalid JSON response from Gemini: ${error}`);
  }
};

/**
 * Analyzes a direct task and generates strategic guidance and prompts
 */
export async function analyzeDirectTask(
  request: AnalyzeDirectTaskRequest
): Promise<AnalyzeDirectTaskResponse> {
  const ai = getAiClient();
  const model = "gemini-2.5-flash";

  try {
    // Step 1: Classify the task
    const classificationPrompt = `Analyze this task and classify it:

Task: "${request.taskDescription}"
Contact: "${request.contactName}"

Return a JSON object with:
{
  "taskType": one of: "negotiate_price", "request_refund", "complain_issue", "schedule_appointment", "cancel_service", "make_inquiry", "general_task",
  "intent": brief description of what the user wants to achieve,
  "difficulty": "easy", "moderate", or "complex" based on typical resistance expected
}

ONLY return valid JSON, no markdown.`;

    const classificationResult = await ai.models.generateContent({
      model,
      contents: classificationPrompt,
      config: { responseMimeType: "application/json" },
    });

    const taskAnalysis: TaskAnalysis = parseJsonResponse(
      classificationResult.text || "{}"
    );

    // Step 2: Generate strategic guidance based on task type
    const strategyPrompt = `You are an expert negotiator and customer service advocate.

For this task type: ${taskAnalysis.taskType}
User's intent: ${taskAnalysis.intent}
Contact: ${request.contactName}
Full task description: "${request.taskDescription}"

Generate strategic guidance as JSON:
{
  "keyGoals": [3-5 specific goals to achieve during the call],
  "talkingPoints": [5-7 specific things to say, tailored to this exact task],
  "objectionHandlers": {
    "common objection 1": "response to use",
    "common objection 2": "response to use"
    // 3-5 relevant objections for this task type
  },
  "successCriteria": [2-4 measurable outcomes that define success]
}

Make the talking points SPECIFIC to: "${request.taskDescription}"
ONLY return valid JSON, no markdown.`;

    const strategyResult = await ai.models.generateContent({
      model,
      contents: strategyPrompt,
      config: { responseMimeType: "application/json" },
    });

    const strategicGuidance: StrategicGuidance = parseJsonResponse(
      strategyResult.text || "{}"
    );

    // Step 3: Generate the actual prompt
    const generatedPrompt = generatePromptFromAnalysis(
      request,
      taskAnalysis,
      strategicGuidance
    );

    return {
      taskAnalysis,
      strategicGuidance,
      generatedPrompt,
    };
  } catch (error: any) {
    console.error("analyzeDirectTask error:", error);
    throw new Error(
      `Failed to analyze direct task: ${error.message || error}`
    );
  }
}
