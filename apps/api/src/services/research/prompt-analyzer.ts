import { GoogleGenAI } from "@google/genai";

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenAI({ apiKey });
};

export interface ResearchPromptRequest {
  serviceType: string;
  problemDescription: string;
  userCriteria: string;
  location: string;
  urgency: string;
  providerName: string;
  clientName: string;
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

export async function analyzeResearchPrompt(request: ResearchPromptRequest): Promise<PromptAnalysisResult> {
  const ai = getAiClient();

  const analysisPrompt = `Analyze this service request and provide terminology and questions.

Service Type: ${request.serviceType}
Problem: ${request.problemDescription}
Location: ${request.location}

Respond in JSON format:
{
  "serviceCategory": "medical" | "home_service" | "professional" | "retail" | "other",
  "terminology": {
    "providerTerm": "what to call them (e.g., dentist, plumber, lawyer)",
    "appointmentTerm": "appointment or service call or consultation",
    "visitDirection": "patient visits provider" or "provider comes to location"
  },
  "contextualQuestions": ["1-3 service-specific questions to ask"]
}`;

  const response = await ai.models.generateContent({
    model: "gemini-2.0-flash-exp",
    contents: analysisPrompt,
  });

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Parse JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // Return defaults if parsing fails
    return getDefaultAnalysis(request);
  }

  const analysis = JSON.parse(jsonMatch[0]);

  // Build the prompts using the analysis
  const systemPrompt = buildSystemPrompt(request, analysis);
  const firstMessage = buildFirstMessage(request, analysis);

  return {
    ...analysis,
    systemPrompt,
    firstMessage,
  };
}

function getDefaultAnalysis(request: ResearchPromptRequest): PromptAnalysisResult {
  return {
    serviceCategory: "other",
    terminology: {
      providerTerm: "provider",
      appointmentTerm: "service",
      visitDirection: "provider comes to location",
    },
    contextualQuestions: ["Are you available for this type of service?"],
    systemPrompt: buildSystemPrompt(request, {
      terminology: { providerTerm: "provider", appointmentTerm: "service", visitDirection: "provider comes to location" },
      contextualQuestions: [],
    }),
    firstMessage: buildFirstMessage(request, {
      terminology: { providerTerm: "service", appointmentTerm: "service", visitDirection: "provider comes to location" },
    }),
  };
}

function buildSystemPrompt(request: ResearchPromptRequest, analysis: any): string {
  const { terminology, contextualQuestions } = analysis;
  const clientName = request.clientName || "my client";
  const urgencyText = request.urgency.replace(/_/g, " ");

  return `You are a warm, friendly personal AI assistant making a real phone call to ${request.providerName}.
You are calling on behalf of ${clientName} in ${request.location}.

═══════════════════════════════════════════════════════════════════
YOUR IDENTITY
═══════════════════════════════════════════════════════════════════
You are ${clientName}'s personal AI assistant. When introducing yourself, say:
"Hi there! This is ${clientName}'s personal AI assistant..."

═══════════════════════════════════════════════════════════════════
${clientName.toUpperCase()}'S SITUATION
═══════════════════════════════════════════════════════════════════
Service needed: ${request.serviceType}
Problem: ${request.problemDescription || "General inquiry"}
Timeline: ${urgencyText}
Requirements: ${request.userCriteria}

═══════════════════════════════════════════════════════════════════
HANDLING REQUESTS FOR INFORMATION YOU DON'T HAVE
═══════════════════════════════════════════════════════════════════
If the provider asks for information you don't have, such as:
- Client's address
- Client's phone number
- Insurance information
- Specific details about the property/situation
- Payment information

RESPOND WITH:
"I'm just checking availability and rates right now. If ${clientName} decides to schedule with you, they'll provide all those details when we call back to book the appointment."

DO NOT make up information. DO NOT guess addresses or phone numbers.
Simply explain you're gathering initial information first.

═══════════════════════════════════════════════════════════════════
TERMINOLOGY (USE THESE EXACT TERMS)
═══════════════════════════════════════════════════════════════════
- Refer to provider as: "${terminology.providerTerm}"
- This is a "${terminology.appointmentTerm}" type service
- ${terminology.visitDirection === "patient visits provider"
    ? `${clientName} will COME TO the provider's location`
    : `The provider will COME OUT to ${clientName}'s location`}

═══════════════════════════════════════════════════════════════════
QUESTIONS TO ASK
═══════════════════════════════════════════════════════════════════
1. Availability: "${clientName} needs this ${urgencyText}. Are you available?"
   - If YES: "${terminology.visitDirection === "patient visits provider"
     ? "What's your earliest available appointment?"
     : "When could you come out?"}"
2. Rates: "What would the rate be for this type of ${terminology.appointmentTerm}?"
${contextualQuestions?.map((q: string, i: number) => `${i + 3}. ${q}`).join('\n') || ''}

═══════════════════════════════════════════════════════════════════
VOICEMAIL DETECTION
═══════════════════════════════════════════════════════════════════
If you detect voicemail or answering machine, IMMEDIATELY use the endCall tool.
DO NOT leave a message. DO NOT wait for beep.

═══════════════════════════════════════════════════════════════════
ENDING THE CALL
═══════════════════════════════════════════════════════════════════
After gathering information, say:
"Thank you so much! I'll share this with ${clientName} and if they'd like to proceed, we'll call back to schedule. Have a wonderful day!"

Then IMMEDIATELY use the endCall tool. DO NOT wait for their response.`;
}

function buildFirstMessage(request: ResearchPromptRequest, analysis: any): string {
  const clientName = request.clientName || "my client";
  const urgencyText = request.urgency.replace(/_/g, " ");
  const problem = request.problemDescription
    ? ` ${clientName} ${request.problemDescription}.`
    : "";

  return `Hi there! This is ${clientName}'s personal AI assistant calling to check on ${request.serviceType} services.${problem} Do you have just a quick moment?`;
}

export default { analyzeResearchPrompt };
