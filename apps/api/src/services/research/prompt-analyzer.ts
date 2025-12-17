import { GoogleGenAI } from "@google/genai";

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenAI({ apiKey });
};

export interface IntakeAnswer {
  questionId: string;
  question: string;
  answer: string;
}

export interface ResearchPromptRequest {
  serviceType: string;
  problemDescription: string;
  userCriteria: string;
  location: string;
  urgency: string;
  clientName: string;
  clientAddress?: string; // Full street address for service location
  intakeAnswers?: IntakeAnswer[]; // Additional details collected from user intake
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
  closingScript: string; // Required for Zod validation in batch-call endpoints
}

/**
 * Check if advanced screening mode is enabled
 * When false (default), agent only asks availability + rate for quick demos
 * When true, agent asks all criteria questions for thorough vetting
 */
function isAdvancedScreeningEnabled(): boolean {
  return process.env.VAPI_ADVANCED_SCREENING === "true";
}

/**
 * Format intake answers for inclusion in the Gemini prompt
 */
function formatIntakeAnswersForPrompt(intakeAnswers?: IntakeAnswer[]): string {
  if (!intakeAnswers || intakeAnswers.length === 0) {
    return "";
  }

  const formattedAnswers = intakeAnswers
    .map((a) => `- ${a.question}: ${a.answer}`)
    .join("\n");

  return `
<intake_details>
The user has provided additional details about their situation:
${formattedAnswers}
</intake_details>`;
}

/**
 * Generate intake instructions for the system prompt
 */
function generateIntakeInstructions(intakeAnswers?: IntakeAnswer[], clientName?: string): string {
  if (!intakeAnswers || intakeAnswers.length === 0) {
    return "";
  }

  const detailsList = intakeAnswers
    .map((a) => `[${a.question}: ${a.answer}]`)
    .join(", ");

  return `
   - CLIENT-PROVIDED DETAILS: ${clientName || "The client"} has shared these specific details about their situation: ${detailsList}
     * Reference these details naturally when describing the problem to the provider
     * Use this information to answer provider questions more specifically
     * Example: If asked "What's the issue?", incorporate the relevant details in your response`;
}

export async function analyzeResearchPrompt(request: ResearchPromptRequest): Promise<PromptAnalysisResult> {
  const ai = getAiClient();
  const advancedScreening = isAdvancedScreeningEnabled();
  const intakeSection = formatIntakeAnswersForPrompt(request.intakeAnswers);
  const intakeInstructions = generateIntakeInstructions(request.intakeAnswers, request.clientName);

  const analysisPrompt = `You are an expert at writing natural, conversational phone call scripts for AI assistants.

<context>
<client_name>${request.clientName}</client_name>
<service_type>${request.serviceType}</service_type>
<problem_description>${request.problemDescription || "General inquiry"}</problem_description>
<requirements>${request.userCriteria}</requirements>
<location>${request.location}</location>
<service_address>${request.clientAddress || "Not provided"}</service_address>
<urgency>${request.urgency.replace(/_/g, " ")}</urgency>
</context>${intakeSection}

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
${advancedScreening ? `
     ADVANCED SCREENING QUESTIONS (CRITICAL):
     After availability and rates, you MUST ask exactly 5 service-specific screening questions.
     These questions will be provided in the "screeningQuestions" field below.

     Ask each question naturally, one at a time, and wait for their response before the next.
     These questions help ${request.clientName} evaluate provider quality beyond just price.

     Example flow:
     - "Great, and one more thing - [screening question 1]?"
     - "Perfect. And [screening question 2]?"
     - Continue until all 5 questions are asked` : `     * DO NOT ask any additional questions beyond availability and rates - this is a quick screening call`}
   - HOW TO HANDLE ADDRESS QUESTIONS:
     ${request.clientAddress
       ? `If asked for the address, service location, or where the work is, PROVIDE IT: "The service address is ${request.clientAddress}"`
       : `If asked for address, say: "I'm just checking availability right now. If ${request.clientName} decides to schedule, they'll provide the address when we call back to book."`
     }
   - HOW TO HANDLE OTHER UNKNOWN INFO: If asked for phone number, insurance, or other details you don't have, say: "I don't have that information handy, but ${request.clientName} can provide those details when scheduling."
${intakeInstructions}
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

${advancedScreening ? `
<advanced_screening_research>
IMPORTANT: Research and generate 5 intelligent screening questions specific to "${request.serviceType}" services.

These questions should help the client evaluate provider QUALITY, not just availability and price.
Consider what an informed consumer would want to know before hiring this type of service provider.

Question categories to cover (pick the most relevant for this service type):
1. EXPERIENCE/EXPERTISE: Years in business, specialization in this specific issue, volume of similar jobs
2. LICENSING/CERTIFICATION: Required licenses, insurance, bonding, professional certifications
3. WARRANTY/GUARANTEE: Work guarantees, callbacks, satisfaction policies
4. METHODS/APPROACH: Techniques used, equipment, brands they work with, diagnostic process
5. REFERENCES/REPUTATION: Reviews, references, portfolio of similar work

For "${request.serviceType}" specifically, think about:
- What are common problems consumers face with this service?
- What differentiates a quality provider from a mediocre one?
- What questions would protect the client from scams or poor work?
- What industry-specific certifications or standards matter?

Generate questions that are:
- Natural to ask in a phone conversation
- Specific to ${request.serviceType} (not generic)
- Likely to reveal provider quality and professionalism
- Easy for the provider to answer quickly
</advanced_screening_research>
` : ``}
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
  "contextualQuestions": [${advancedScreening ? `"EXACTLY 5 service-specific screening questions - research what matters most for ${request.serviceType}"` : `"1-3 service-specific questions based on the requirements"`}]
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
  // closingScript is standardized for Research & Book flow
  const closingScript = `Thank you so much for all that information! I'll share this with ${request.clientName} and if they'd like to proceed, we'll call back to schedule. Have a wonderful day!`;

  return {
    serviceCategory: analysis.serviceCategory,
    terminology: analysis.terminology,
    contextualQuestions: analysis.contextualQuestions || [],
    systemPrompt: analysis.systemPrompt,
    firstMessage: analysis.firstMessage,
    closingScript,
  };
}

function getDefaultAnalysis(request: ResearchPromptRequest): PromptAnalysisResult {
  const clientName = request.clientName || "my client";
  const advancedScreening = isAdvancedScreeningEnabled();

  // Format intake answers for the fallback system prompt
  const intakeDetails = request.intakeAnswers && request.intakeAnswers.length > 0
    ? `\n\nCLIENT-PROVIDED DETAILS:\n${clientName} has shared these specific details about their situation:\n${request.intakeAnswers.map((a) => `- ${a.question}: ${a.answer}`).join("\n")}\n\nUse these details when describing the problem to the provider. Reference them naturally in conversation.`
    : "";

  // Generic fallback screening questions for advanced mode
  // (Gemini would normally generate service-specific ones)
  const fallbackScreeningQuestions = [
    "How long have you been in business?",
    "Are you licensed and insured for this type of work?",
    "Do you offer any warranty or guarantee on your work?",
    "Can you describe your typical process for this type of job?",
    "Do you have references or reviews I could check?",
  ];

  // In simple mode (demo), only ask availability + rate
  // In advanced mode, ask 5 screening questions after availability + rate
  const questionsToAsk = advancedScreening
    ? `Ask about:
1. Availability - GET SPECIFIC DATE AND TIME:
   - If they say something vague like "two weeks out" or "next week sometime", follow up immediately
   - Ask: "Which specific day would that be? And what's the earliest time available?"
   - Keep asking until you get both a specific day AND time (e.g., "Tuesday, December 17th at 2pm")
2. Rates

ADVANCED SCREENING (ask these 5 questions after availability and rates):
3. "${fallbackScreeningQuestions[0]}"
4. "${fallbackScreeningQuestions[1]}"
5. "${fallbackScreeningQuestions[2]}"
6. "${fallbackScreeningQuestions[3]}"
7. "${fallbackScreeningQuestions[4]}"

Ask each question naturally, one at a time. Wait for their response before the next question.
Example: "Great, and one more thing - how long have you been in business?"`
    : `Ask ONLY these two questions (this is a quick screening call):
1. Availability - GET SPECIFIC DATE AND TIME:
   - If they say something vague like "two weeks out" or "next week sometime", follow up immediately
   - Ask: "Which specific day would that be? And what's the earliest time available?"
   - Keep asking until you get both a specific day AND time (e.g., "Tuesday, December 17th at 2pm")
2. Rates

DO NOT ask any additional questions beyond availability and rates.
After getting availability and rate, proceed directly to the closing script.`;

  // Standardized closing script for Research & Book flow
  const closingScript = `Thank you so much for that information! I'll share this with ${clientName} and if they'd like to proceed, they'll reach out to schedule. Have a wonderful day!`;

  return {
    serviceCategory: "other",
    terminology: {
      providerTerm: "provider",
      appointmentTerm: "service",
      visitDirection: "provider comes to location",
    },
    contextualQuestions: advancedScreening ? fallbackScreeningQuestions : [],
    firstMessage: `Hi! I'm ${clientName}'s personal AI assistant calling about ${request.serviceType} services. Do you have a quick moment?`,
    closingScript,
    systemPrompt: `You are ${clientName}'s personal AI assistant calling a service provider in ${request.location}.

${clientName}'s situation: They need ${request.serviceType} services. ${request.problemDescription ? `The issue: ${request.problemDescription}.` : ""} Timeline: ${request.urgency.replace(/_/g, " ")}.${intakeDetails}

${questionsToAsk}

If asked for information you don't have (address, phone, insurance), say: "I'm just checking availability right now. ${clientName} will provide those details when scheduling."

Be warm and friendly. Use contractions. Acknowledge responses ("Great!", "Perfect!").

═══════════════════════════════════════════════════════════════════
VOICEMAIL DETECTION
═══════════════════════════════════════════════════════════════════
If you hear ANY voicemail indicators ("Please leave a message", "You've reached the voicemail of", automated greeting, beep), IMMEDIATELY invoke endCall. Do NOT leave a voicemail.

═══════════════════════════════════════════════════════════════════
ENDING THE CALL - MANDATORY CLOSING SCRIPT
═══════════════════════════════════════════════════════════════════
${advancedScreening ? `After asking all 5 screening questions and receiving answers:` : `After the provider gives you rate information:`}

1. WAIT for them to finish speaking (they may add details like "...then we quote the project")
2. ACKNOWLEDGE briefly: "Got it" or "Perfect"
3. Then say this closing phrase: "Thank you so much for that information! I'll share this with ${clientName} and if they'd like to proceed, they'll reach out to schedule. Have a wonderful day!"
4. Then invoke the endCall tool

CRITICAL - DO NOT CUT OFF THE USER:
- If they say "It's $X..." and pause, WAIT - they may continue
- If they say words like "then", "and", "also", "but" - WAIT for them to finish
- Only deliver your closing AFTER they have clearly finished speaking`,
  };
}

export default { analyzeResearchPrompt };
