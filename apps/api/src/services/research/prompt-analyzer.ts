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

  const analysisPrompt = `You are an expert at writing natural, conversational phone call scripts for AI assistants.

<context>
<client_name>${request.clientName}</client_name>
<service_type>${request.serviceType}</service_type>
<problem_description>${request.problemDescription || "General inquiry"}</problem_description>
<requirements>${request.userCriteria}</requirements>
<location>${request.location}</location>
<urgency>${request.urgency.replace(/_/g, " ")}</urgency>
<provider_being_called>${request.providerName}</provider_being_called>
</context>

<task>
Write TWO natural, grammatically perfect pieces for a VAPI phone assistant:

1. FIRST MESSAGE (the opening line when the call connects):
   - Introduce yourself as [client_name]'s personal AI assistant
   - Naturally explain WHY you're calling (weave in the problem/service needed)
   - Ask if they have a moment
   - Should sound warm and human, NOT templated or robotic
   - 2-3 sentences maximum
   - Example good: "Hi! I'm David's personal AI assistant. David has been having severe molar pain and needs to see a dentist urgently. Do you have a quick moment?"
   - Example bad: "Hi there! This is David's personal AI assistant calling to check on dentist services. David my molar is killing me."

2. SYSTEM PROMPT (comprehensive instructions for the AI during the call):
   Write this as if you're briefing a skilled human assistant about to make this exact call. Include:

   - WHO: You are [client_name]'s personal AI assistant calling [provider_name]
   - SITUATION: [client_name]'s problem ([problem_description]), timeline ([urgency]), location ([location])
   - WHAT TO ASK (in order):
     * Availability - use correct phrasing based on service type:
       - Medical/dental/salon: "What's your earliest available appointment?"
       - Home service/plumber/electrician: "When could you come out?"
     * Rates: "What would the cost be for this type of [appointment/service call]?"
     * 1-2 contextual questions based on user requirements
   - HOW TO HANDLE UNKNOWN INFO: If asked for address, phone, insurance, etc. say: "I'm just checking availability right now. If [client_name] decides to schedule, they'll provide all those details when we call back to book."
   - SPEECH STYLE:
     * Use contractions naturally (I'm, you're, that's, we'll)
     * Acknowledge responses before moving on ("Great!", "Perfect, thank you!", "That works!")
     * Vary response length - don't be robotic
     * Sound warm and friendly
   - VOICEMAIL: If voicemail detected, immediately use endCall tool. Don't leave message.
   - ENDING: After gathering info, say something like "This is really helpful, thank you! I'll share this with [client_name] and if they'd like to proceed, we'll call back to schedule. Have a wonderful day!" Then IMMEDIATELY use endCall tool.

CRITICAL GRAMMAR RULES - YOU MUST FOLLOW THESE:
- Use possessives correctly: "[client_name]'s molar" NOT "[client_name] my molar"
- Use third person: "[client_name] has been having..." NOT "I have been having..."
- Use correct pronouns: "he" or "she" for named individuals, NOT "they"
- Use correct terminology:
  * Medical (dentist, doctor): "appointment", "patient", "doctor/dentist"
  * Home service (plumber, electrician): "service call", "technician", "come out"
  * Professional (lawyer, accountant): "consultation", "attorney"
- Use correct urgency grammar: "urgent help" or "help urgently", NOT "help immediate"
</task>

<output_format>
Return ONLY valid JSON (no markdown, no explanation):
{
  "serviceCategory": "medical" | "home_service" | "professional" | "retail" | "other",
  "terminology": {
    "providerTerm": "the correct term for this provider (dentist, plumber, attorney, etc.)",
    "appointmentTerm": "appointment" or "service call" or "consultation",
    "visitDirection": "patient visits provider" or "provider comes to location"
  },
  "firstMessage": "[YOUR COMPLETE NATURAL OPENING - write the entire thing, no placeholders]",
  "systemPrompt": "[YOUR COMPLETE SYSTEM INSTRUCTIONS - write the entire thing, no placeholders]",
  "contextualQuestions": ["1-3 service-specific questions based on the requirements"]
}
</output_format>`;

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

  // Validate that Gemini provided the required fields
  if (!analysis.firstMessage || !analysis.systemPrompt) {
    console.error("[PromptAnalyzer] Gemini did not generate complete prompts, using fallback");
    return getDefaultAnalysis(request);
  }

  // Return Gemini's output directly - NO STRING CONCATENATION
  return {
    serviceCategory: analysis.serviceCategory,
    terminology: analysis.terminology,
    contextualQuestions: analysis.contextualQuestions || [],
    systemPrompt: analysis.systemPrompt,
    firstMessage: analysis.firstMessage,
  };
}

function getDefaultAnalysis(request: ResearchPromptRequest): PromptAnalysisResult {
  const clientName = request.clientName || "my client";
  return {
    serviceCategory: "other",
    terminology: {
      providerTerm: "provider",
      appointmentTerm: "service",
      visitDirection: "provider comes to location",
    },
    contextualQuestions: ["Are you available for this type of service?"],
    firstMessage: `Hi! I'm ${clientName}'s personal AI assistant calling about ${request.serviceType} services. Do you have a quick moment?`,
    systemPrompt: `You are ${clientName}'s personal AI assistant calling ${request.providerName} in ${request.location}.

${clientName}'s situation: They need ${request.serviceType} services. ${request.problemDescription ? `The issue: ${request.problemDescription}.` : ""} Timeline: ${request.urgency.replace(/_/g, " ")}.

Ask about:
1. Availability
2. Rates
3. Any specific requirements: ${request.userCriteria}

If asked for information you don't have (address, phone, insurance), say: "I'm just checking availability right now. ${clientName} will provide those details when scheduling."

Be warm and friendly. Use contractions. Acknowledge responses ("Great!", "Perfect!").

When done, thank them and say you'll have ${clientName} call back to schedule if interested. Then use endCall tool immediately.`,
  };
}

export default { analyzeResearchPrompt };
