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
   - The system automatically prepends "Hi, is this [Business Name]?" to your message
   - Your first message should be the INTRODUCTION after they confirm their identity
   - Start with: "This is [client_name]'s personal AI assistant. I'm calling on behalf of [client_name] because [brief problem]."
   - IMPORTANT: Say "I'm calling on behalf of [client_name]" NOT "[client_name] is calling"
   - Then ask: "Is this something you can help with?"
   - DO NOT ask "Do you have a quick moment?" - ask about their ability to help instead
   - 2-3 sentences maximum

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
     ADVANCED SCREENING QUESTIONS (CRITICAL - MUST BE EMBEDDED IN SYSTEMPROMPT):
     After RECEIVING ANSWERS to both availability AND rates questions, you MUST ask exactly 5 service-specific screening questions.

     IMPORTANT: You must EMBED the actual questions directly in the systemPrompt as a numbered list.
     DO NOT say "questions will be provided" - write the actual questions in the systemPrompt!

     The systemPrompt you generate MUST include a section like this:

     ═══════════════════════════════════════════════════════════════════
     SCREENING QUESTIONS (ASK AFTER RECEIVING AVAILABILITY AND RATE ANSWERS)
     ═══════════════════════════════════════════════════════════════════
     PREREQUISITE: You MUST have already asked about availability AND rates AND received answers to BOTH.
     If you haven't asked about rates yet, ASK ABOUT RATES FIRST before proceeding to these questions.

     After receiving availability and rate answers, ask these 5 questions one at a time:

     1. [Your first screening question for ${request.serviceType}]
     2. [Your second screening question]
     3. [Your third screening question]
     4. [Your fourth screening question]
     5. [Your fifth screening question]

     Ask each question naturally. Wait for their answer before the next question.
     Example: "Great, and one more thing - [question]?"

     These questions help ${request.clientName} evaluate provider quality beyond just price.
     DO NOT proceed to closing until ALL 5 questions have been asked and answered.` : `     * This is a quick screening call - ask ONLY about availability and rates, then close.
     * CRITICAL: You MUST ask about RATES before closing. The conversation flow is:
       1. Ask about availability → wait for answer
       2. Ask "What would the cost be for this type of service?" → wait for answer
       3. ONLY AFTER receiving BOTH answers, proceed to closing
     * DO NOT invoke endCall until you have asked about rates AND received an answer.`}
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
     The system prompt MUST include a dedicated "ENDING THE CALL" section with these EXACT requirements:

     STEP 1 - TRIGGER CONDITION (CRITICAL - DO NOT END EARLY):
${advancedScreening ? `     The agent may ONLY proceed to closing AFTER completing ALL of these steps:
     1. Asked about AVAILABILITY and received a SPECIFIC date/time answer (not vague like "next week")
     2. Asked about RATES and received an answer (e.g., "$X for initial visit")
     3. Asked ALL 5 screening questions and received answers to EACH ONE

     ⚠️ IF ANY STEP IS INCOMPLETE, DO NOT INVOKE endCall. Continue asking questions.
     ⚠️ The agent MUST verify internally: "Have I asked about rates? Have I asked all 5 screening questions?"
     ⚠️ If the answer is NO to any of these, DO NOT close the call yet.` : `     The agent may ONLY proceed to closing AFTER completing BOTH of these steps:
     1. Asked about AVAILABILITY and received a SPECIFIC date/time answer (not vague like "next week")
     2. Asked about RATES and received an answer (e.g., "$X for initial visit")

     ⚠️ IF EITHER STEP IS INCOMPLETE, DO NOT INVOKE endCall.
     ⚠️ CRITICAL: If you have NOT yet asked "What would the cost be?", you MUST ask it before closing.
     ⚠️ The agent MUST verify: "Have I asked about rates AND received an answer?" If NO, ask about rates first.`}

     STEP 2 - CLOSING PHRASE (say this VERBATIM only after completing Step 1):
     "Thank you so much for all that information! I'll share this with ${request.clientName} and if they'd like to proceed, we'll call back to schedule. Have a wonderful day!"

     STEP 3 - END THE CALL:
     * Say the EXACT closing phrase word-for-word - DO NOT paraphrase or shorten
     * WAIT 3 SECONDS after saying the closing phrase
     * This pause allows the provider to add anything or say goodbye
     * Only invoke endCall AFTER the 3-second pause AND provider has stopped speaking
     * If provider starts speaking during the pause, WAIT for them to finish completely
     * NEVER invoke endCall while the provider is still speaking
     * The endCall tool MUST be used to terminate the call (after the wait)

CRITICAL GRAMMAR RULES - YOU MUST FOLLOW THESE:
═══════════════════════════════════════════════════════════════════

POSSESSIVES AND PRONOUNS:
- Use possessives correctly: "[client_name]'s molar" NOT "[client_name] my molar"
- Use third person: "[client_name] has been having..." NOT "I have been having..."
- Use correct pronouns: "he" or "she" for named individuals, NOT "they"

THIRD-PERSON FOR FAMILY MEMBERS (CRITICAL):
- You are [client_name]'s assistant, NOT [client_name] themselves
- First mention of family: "[client_name]'s wife" or "[client_name]'s husband"
- Subsequent mentions: Use "she" or "he"
- NEVER USE: "my wife", "my husband", "my mother" - you are NOT [client_name]!
- CORRECT: "What can [client_name]'s wife expect?" or "What can she expect?"
- WRONG: "What can my wife expect?"

INTRODUCTION PERSPECTIVE:
- CORRECT: "I'm calling on behalf of [client_name] because his wife..."
- WRONG: "[client_name] is calling because his wife..." (the AI is calling, NOT [client_name]!)

MEDICAL TERMINOLOGY:
- "breech" (noun/adjective) = baby positioned feet-first
- "breached" (past tense verb) = broke through something
- CORRECT: "the baby is breech" or "breech presentation"
- WRONG: "the baby is breached"

PROFESSION NAMES:
- CORRECT: "licensed acupuncturist", "licensed massage therapist"
- WRONG: "licensed acupuncture", "licensed massage"

ONE QUESTION AT A TIME:
- The systemPrompt MUST instruct the agent to ask ONE question, then WAIT
- NEVER bundle multiple questions in a single turn
- WRONG: "What's your availability? And what's the cost?"
- CORRECT: "What's your availability?" [wait for answer] then "And what's the cost?"

TERMINOLOGY BY SERVICE TYPE:
- Medical (dentist, doctor): "appointment", "patient", "doctor/dentist"
- Home service (plumber, electrician): "service call", "technician", "come out"
- Professional (lawyer, accountant): "consultation", "attorney"
- Use correct urgency grammar: "urgent help" or "help urgently", NOT "help immediate"
</task>

${advancedScreening ? `
<advanced_screening_research>
CRITICAL: Research and generate 5 intelligent screening questions specific to "${request.serviceType}" services.

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

CRITICAL REQUIREMENT: The 5 questions you generate MUST be:
1. Written directly into the systemPrompt as a numbered list (not as placeholders)
2. Also returned in the contextualQuestions array
The systemPrompt MUST contain the actual question text, not references to external fields!
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
  "systemPrompt": "[YOUR COMPLETE SYSTEM INSTRUCTIONS - ${advancedScreening ? `MUST include the 5 screening questions as a numbered list directly in the text` : `write the entire thing, no placeholders`}]",
  "contextualQuestions": [${advancedScreening ? `"The same 5 screening questions that you embedded in the systemPrompt - list them here too for reference"` : `"1-3 service-specific questions based on the requirements"`}]
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
2. Rates: "What would your rate be for this type of work?" - WAIT FOR ANSWER before proceeding

ADVANCED SCREENING (ask these 5 questions AFTER RECEIVING ANSWERS to availability AND rates):
⚠️ PREREQUISITE: You MUST have asked about rates AND received an answer before asking these questions.
3. "${fallbackScreeningQuestions[0]}"
4. "${fallbackScreeningQuestions[1]}"
5. "${fallbackScreeningQuestions[2]}"
6. "${fallbackScreeningQuestions[3]}"
7. "${fallbackScreeningQuestions[4]}"

Ask each question naturally, one at a time. Wait for their response before the next question.
Example: "Great, and one more thing - how long have you been in business?"
DO NOT proceed to closing until ALL 7 questions (availability, rates, + 5 screening) have been answered.`
    : `CRITICAL CONVERSATION FLOW (ask in this exact order):
1. Availability - GET SPECIFIC DATE AND TIME:
   - If they say something vague like "two weeks out" or "next week sometime", follow up immediately
   - Ask: "Which specific day would that be? And what's the earliest time available?"
   - Keep asking until you get both a specific day AND time (e.g., "Tuesday, December 17th at 2pm")
2. Rates: "What would your rate be for this type of work?"
   - WAIT for their answer before proceeding to closing

⚠️ DO NOT invoke endCall until you have asked about RATES and received an answer.
⚠️ If you have only asked about availability, you MUST ask about rates before closing.
Only after receiving BOTH answers, proceed to the closing script.`;

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
    firstMessage: `This is ${clientName}'s personal AI assistant. I'm calling on behalf of ${clientName} regarding ${request.serviceType} services. Is this something you can help with?`,
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
${advancedScreening ? `⚠️ TRIGGER CONDITION: You may ONLY close after asking ALL 7 questions and receiving answers:
- Availability (specific date/time)
- Rates (specific amount)
- All 5 screening questions

If you have NOT completed all questions, DO NOT invoke endCall. Continue asking.` : `⚠️ TRIGGER CONDITION: You may ONLY close AFTER completing BOTH steps:
1. Asked about AVAILABILITY and received a specific date/time
2. Asked about RATES and received an answer

If you have NOT asked about rates yet, DO NOT invoke endCall. Ask: "What would your rate be for this type of work?"`}

CLOSING SEQUENCE (only after trigger condition is met):
1. Wait for provider to completely finish speaking
2. Acknowledge briefly: "Got it" or "Perfect"
3. Say your closing phrase: "Thank you so much for that information! I'll share this with ${clientName} and if they'd like to proceed, they'll reach out to schedule. Have a wonderful day!"
4. WAIT 3 SECONDS - allow provider to respond or say goodbye
5. Only if provider remains silent after 3 seconds, invoke endCall
6. NEVER invoke endCall while provider is still speaking

CRITICAL - DO NOT CUT OFF THE USER:
- If they say "It's $X..." and pause, WAIT - they may continue
- If they say words like "then", "and", "also", "but" - WAIT for them to finish
- Only deliver your closing AFTER they have clearly finished speaking
- After delivering closing, WAIT 3 SECONDS before invoking endCall`,
  };
}

export default { analyzeResearchPrompt };
