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
  clientName: string;
  clientAddress?: string; // Full street address for service location
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
<service_address>${request.clientAddress || "Not provided"}</service_address>
<urgency>${request.urgency.replace(/_/g, " ")}</urgency>
</context>

<task>
Write TWO natural, grammatically perfect pieces for a VAPI phone assistant:

1. FIRST MESSAGE (the opening line when the call connects):
   - Introduce yourself as [client_name]'s personal AI assistant
   - Naturally explain WHY you're calling (weave in the problem/service needed)
   - Ask if they have a moment
   - Should sound warm and human, NOT templated or robotic
   - 2-3 sentences maximum
   - DO NOT mention a specific provider/business name - the system will handle that
   - Example good: "Hi! I'm David's personal AI assistant. David has been having severe molar pain and needs to see a dentist urgently. Do you have a quick moment?"
   - Example bad: "Hi there! This is David's personal AI assistant calling to check on dentist services. David my molar is killing me."

2. SYSTEM PROMPT (comprehensive instructions for the AI during the call):
   Write this as if you're briefing a skilled human assistant about to make this exact call. Include:

   - WHO: You are [client_name]'s personal AI assistant calling a service provider
   - SITUATION: [client_name]'s problem ([problem_description]), timeline ([urgency]), location ([location])
   - WHAT TO ASK (in order):
     * Availability - use correct phrasing based on service type:
       - Medical/dental/salon: "What's your earliest available appointment?"
       - Home service/plumber/electrician: "When could you come out?"

     CRITICAL - FOLLOW UP ON VAGUE AVAILABILITY:
     If the provider gives a VAGUE timeframe (e.g., "two weeks out", "next week", "in a few days", "sometime next month"), you MUST follow up immediately for specifics:
     - Ask: "Which specific day would that be? And what's the earliest time available?"
     - Do NOT accept vague answers - the client needs an exact date and time to make a decision
     - Keep asking politely but persistently until you get BOTH: [specific day] AND [specific time]
     - Examples of acceptable answers: "Tuesday, December 17th at 2pm", "Next Monday the 16th at 10am", "This Thursday at 3:30pm"
     - Examples of UNACCEPTABLE answers: "two weeks out", "next week sometime", "in a few days", "early next week"

     * Rates: "What would the cost be for this type of [appointment/service call]?"
     * 1-2 contextual questions based on user requirements
   - HOW TO HANDLE ADDRESS QUESTIONS:
     ${request.clientAddress
       ? `If asked for the address, service location, or where the work is, PROVIDE IT: "The service address is ${request.clientAddress}"`
       : `If asked for address, say: "I'm just checking availability right now. If ${request.clientName} decides to schedule, they'll provide the address when we call back to book."`
     }
   - HOW TO HANDLE OTHER UNKNOWN INFO: If asked for phone number, insurance, or other details you don't have, say: "I don't have that information handy, but ${request.clientName} can provide those details when scheduling."
   - SPEECH STYLE:
     * Use contractions naturally (I'm, you're, that's, we'll)
     * Acknowledge responses before moving on ("Great!", "Perfect, thank you!", "That works!")
     * Vary response length - don't be robotic
     * Sound warm and friendly
   - VOICEMAIL DETECTION (CRITICAL): If you hear ANY voicemail indicators ("Please leave a message", "You've reached the voicemail of", automated greeting, beep), IMMEDIATELY invoke the endCall tool. Do NOT leave a voicemail. Do NOT wait for the beep. Just invoke endCall.
   - ENDING THE CALL (CRITICAL - MANDATORY CLOSING SCRIPT):
     The system prompt MUST include a dedicated "ENDING THE CALL" section that REQUIRES the agent to say this EXACT phrase VERBATIM:

     "Thank you so much for all that information! I'll share this with ${request.clientName} and if they'd like to proceed, we'll call back to schedule. Have a wonderful day!"

     The instructions MUST emphasize:
     * Say the EXACT phrase above word-for-word - DO NOT paraphrase or shorten
     * Then IMMEDIATELY invoke the endCall tool
     * DO NOT wait for their response after the closing
     * The endCall tool MUST be used to terminate the call

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
    model: "gemini-2.5-flash",
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
    systemPrompt: `You are ${clientName}'s personal AI assistant calling a service provider in ${request.location}.

${clientName}'s situation: They need ${request.serviceType} services. ${request.problemDescription ? `The issue: ${request.problemDescription}.` : ""} Timeline: ${request.urgency.replace(/_/g, " ")}.

Ask about:
1. Availability - GET SPECIFIC DATE AND TIME:
   - If they say something vague like "two weeks out" or "next week sometime", follow up immediately
   - Ask: "Which specific day would that be? And what's the earliest time available?"
   - Keep asking until you get both a specific day AND time (e.g., "Tuesday, December 17th at 2pm")
2. Rates
3. Any specific requirements: ${request.userCriteria}

If asked for information you don't have (address, phone, insurance), say: "I'm just checking availability right now. ${clientName} will provide those details when scheduling."

Be warm and friendly. Use contractions. Acknowledge responses ("Great!", "Perfect!").

═══════════════════════════════════════════════════════════════════
VOICEMAIL DETECTION
═══════════════════════════════════════════════════════════════════
If you hear ANY voicemail indicators ("Please leave a message", "You've reached the voicemail of", automated greeting, beep), IMMEDIATELY invoke endCall. Do NOT leave a voicemail.

═══════════════════════════════════════════════════════════════════
ENDING THE CALL
═══════════════════════════════════════════════════════════════════
After gathering the information you need, say:
"This is really helpful, thank you! I'll share this with ${clientName} and if they'd like to proceed, we'll call back to schedule. Have a wonderful day!"

Then IMMEDIATELY invoke the endCall tool. DO NOT wait for their response.
DO NOT say "goodbye" - just invoke endCall right after your closing statement.
YOU must end the call - do not wait for them to hang up.`,
  };
}

export default { analyzeResearchPrompt };
