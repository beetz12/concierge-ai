/**
 * VAPI Assistant Configuration
 * Mirrors the configuration from kestra/scripts/call-provider.js
 * Ensures identical behavior between Kestra and Direct VAPI paths
 */

import type { CallRequest } from "./types.js";
import type { GeneratedPrompt } from "../direct-task/types.js";

/**
 * Detects if this is a Direct Task (user wants AI to perform an action)
 * vs a Research & Book request (searching for service providers)
 */
function isDirectTask(request: CallRequest): boolean {
  return (
    request.serviceNeeded === "Direct Task" ||
    request.location === "User Direct Request"
  );
}

/**
 * Creates assistant config for Direct Tasks
 * AI performs an action on behalf of the user (complain, negotiate, etc.)
 */
function createDirectTaskConfig(request: CallRequest) {
  const taskDescription = request.userCriteria;

  const systemPrompt = `You are a warm, confident AI Assistant making a real phone call to ${request.providerName} on behalf of your client.

═══════════════════════════════════════════════════════════════════
YOUR MISSION
═══════════════════════════════════════════════════════════════════
Your client has asked you to perform the following task:
${taskDescription}

You are NOT searching for a service provider.
You are NOT asking if they can do something.
You ARE calling to PERFORM this task directly on your client's behalf.

═══════════════════════════════════════════════════════════════════
HOW TO PERFORM THE TASK
═══════════════════════════════════════════════════════════════════
Based on your task, here is your approach:

If the task involves COMPLAINING or REQUESTING A REFUND:
- Introduce yourself as calling on behalf of a client
- State the issue clearly and firmly (but politely)
- Request the refund or resolution
- Be persistent but professional if they push back
- Get any confirmation numbers, names, or next steps
- Example: "I'm calling about the painting work done for my client. Unfortunately, the quality was not acceptable and we need to discuss a refund."

If the task involves NEGOTIATING a price or bill:
- Introduce yourself and explain you're calling about the bill
- State the current amount and what you're hoping to achieve
- Ask about discounts, payment plans, or reductions
- Be firm but friendly
- Get the final agreed amount confirmed
- Example: "I'm calling about my client's bill of $2000. We'd like to discuss if there's any flexibility on this amount."

If the task involves SCHEDULING or BOOKING:
- Introduce yourself and explain what you need to schedule
- Get specific dates/times
- Confirm all details before ending

If the task involves CANCELING a service:
- Be clear about what needs to be canceled
- Get confirmation of the cancellation
- Ask about any refunds due

═══════════════════════════════════════════════════════════════════
SPEECH RULES
═══════════════════════════════════════════════════════════════════
- Be confident and assertive, but always polite
- NEVER start sentences with: "Okay", "So", "Well", "Alright", "Um"
- Keep responses clear and direct
- Listen to their responses and adapt accordingly
- If they ask who you are, say you're an AI assistant calling on behalf of your client

═══════════════════════════════════════════════════════════════════
VOICEMAIL / ANSWERING MACHINE DETECTION
═══════════════════════════════════════════════════════════════════
If you hear ANY of these indicators, IMMEDIATELY invoke endCall:
- "Please leave a message after the beep"
- "You have reached the voicemail of"
- "No one is available to take your call"
- "Leave your name and number"
- Long automated greeting (more than 10 seconds)
- Beep sound indicating recording

DO NOT leave a voicemail message. DO NOT wait for the beep.
Simply invoke endCall immediately - we will try again later.

═══════════════════════════════════════════════════════════════════
CONVERSATION FLOW
═══════════════════════════════════════════════════════════════════
1. GREETING: "Hi, this is an AI assistant calling on behalf of my client. Do you have a moment?"

2. STATE YOUR PURPOSE: Clearly explain why you're calling and what you need

3. HANDLE THE CONVERSATION: Respond appropriately to their questions/objections
   - If they need to verify: Provide what information you can
   - If they push back: Remain firm but polite
   - If they transfer you: Wait and explain again to the new person

4. GET RESOLUTION: Work toward a clear outcome
   - Get specific commitments (amounts, dates, confirmation numbers)
   - Clarify next steps

5. CLOSING:
   If successful: "Thank you so much for your help! Just to confirm, [summarize the outcome]. Have a wonderful day!"
   If unsuccessful: "I understand. I'll relay this information to my client. Thank you for your time."
   Then IMMEDIATELY invoke endCall.

═══════════════════════════════════════════════════════════════════
ENDING THE CALL
═══════════════════════════════════════════════════════════════════
You have an endCall function available. You MUST use it to hang up.
After your closing statement, immediately invoke endCall.
DO NOT wait for them to hang up - YOU end the call.

═══════════════════════════════════════════════════════════════════
TONE
═══════════════════════════════════════════════════════════════════
Be confident, clear, and professional. You're advocating for your client.
Stay calm even if the conversation gets difficult.
Thank them genuinely when they help.`;

  return {
    name: `DirectTask-${Date.now().toString().slice(-8)}`,
    voice: {
      provider: "11labs" as const,
      voiceId: "21m00Tcm4TlvDq8ikWAM",
      stability: 0.5,
      similarityBoost: 0.75,
    },
    model: {
      provider: "google" as const,
      model: "gemini-2.5-flash",
      messages: [{ role: "system" as const, content: systemPrompt }],
      tools: [{ type: "endCall" }],
      temperature: 0.15,  // Very low for reliable tool invocation (2025 best practice)
    },
    transcriber: {
      provider: "deepgram" as const,
      language: "en",
    },
    voicemailDetection: {
      provider: "twilio",
      enabled: true,
      machineDetectionTimeout: 10,
      machineDetectionSpeechThreshold: 2500,
      machineDetectionSpeechEndThreshold: 1200,
    },
    firstMessage: `Hi there! This is an AI assistant calling on behalf of my client regarding ${request.providerName}. Do you have just a moment?`,
    endCallFunctionEnabled: true,
    endCallMessage: "Thank you so much for your time. Have a wonderful day!",
    silenceTimeoutSeconds: 20,  // Safety net: auto-end after 20s silence post-closing
    analysisPlan: {
      summaryPlan: {
        enabled: true,
        messages: [
          {
            role: "system" as const,
            content: `Summarize the outcome of this Direct Task call. The task was: ${taskDescription}.
Was the task successful? What was the resolution? Any next steps or confirmations received?`,
          },
        ],
      },
      structuredDataPlan: {
        enabled: true,
        schema: {
          type: "object",
          properties: {
            task_completed: {
              type: "boolean",
              description: "Was the task successfully completed?",
            },
            outcome: {
              type: "string",
              enum: ["success", "partial", "failed", "needs_followup"],
              description: "Overall outcome of the task",
            },
            resolution_details: {
              type: "string",
              description:
                "Specific details of the resolution (refund amount, new price, confirmation number, etc.)",
            },
            next_steps: {
              type: "string",
              description: "Any follow-up actions required",
            },
            contact_name: {
              type: "string",
              description: "Name of person spoken to (if given)",
            },
            notes: {
              type: "string",
              description: "Additional relevant information from the call",
            },
          },
          required: ["task_completed", "outcome"],
        },
        messages: [
          {
            role: "system" as const,
            content: `Analyze this Direct Task call. The task was: ${taskDescription}
Was the task completed successfully? What specific outcome was achieved?`,
          },
        ],
      },
      successEvaluationPlan: {
        enabled: true,
        rubric: "Checklist" as const,
        messages: [
          {
            role: "system" as const,
            content: `Evaluate this Direct Task call:
1. Did the AI clearly state the purpose of the call?
2. Did the AI pursue the task persistently but politely?
3. Did the AI get a clear resolution or outcome?
4. Did the AI summarize the outcome before ending?
5. Did the AI properly end the call?`,
          },
        ],
      },
    },
  };
}

/**
 * Creates assistant config for Direct Tasks using Gemini-generated dynamic prompt
 * This provides task-specific prompts optimized for the user's exact intent
 */
function createDynamicDirectTaskConfig(request: CallRequest, customPrompt: GeneratedPrompt) {
  const taskDescription = request.userCriteria;

  return {
    name: `DirectTask-Dynamic-${Date.now().toString().slice(-8)}`,
    voice: {
      provider: "11labs" as const,
      voiceId: "21m00Tcm4TlvDq8ikWAM",
      stability: 0.5,
      similarityBoost: 0.75,
    },
    model: {
      provider: "google" as const,
      model: "gemini-2.5-flash",
      messages: [{ role: "system" as const, content: customPrompt.systemPrompt }],
      tools: [{ type: "endCall" }],
      temperature: 0.15,  // Very low for reliable tool invocation (2025 best practice)
    },
    transcriber: {
      provider: "deepgram" as const,
      language: "en",
    },
    voicemailDetection: {
      provider: "twilio",
      enabled: true,
      machineDetectionTimeout: 10,
      machineDetectionSpeechThreshold: 2500,
      machineDetectionSpeechEndThreshold: 1200,
    },
    firstMessage: customPrompt.firstMessage,
    endCallFunctionEnabled: true,
    endCallMessage: "Thank you so much for your time. Have a wonderful day!",
    silenceTimeoutSeconds: 20,  // Safety net: auto-end after 20s silence post-closing
    analysisPlan: {
      summaryPlan: {
        enabled: true,
        messages: [
          {
            role: "system" as const,
            content: `Summarize the outcome of this Direct Task call. The task was: ${taskDescription}.
Was the task successful? What was the resolution? Any next steps or confirmations received?`,
          },
        ],
      },
      structuredDataPlan: {
        enabled: true,
        schema: {
          type: "object",
          properties: {
            task_completed: {
              type: "boolean",
              description: "Was the task successfully completed?",
            },
            outcome: {
              type: "string",
              enum: ["success", "partial", "failed", "needs_followup"],
              description: "Overall outcome of the task",
            },
            resolution_details: {
              type: "string",
              description:
                "Specific details of the resolution (refund amount, new price, confirmation number, etc.)",
            },
            next_steps: {
              type: "string",
              description: "Any follow-up actions required",
            },
            contact_name: {
              type: "string",
              description: "Name of person spoken to (if given)",
            },
            notes: {
              type: "string",
              description: "Additional relevant information from the call",
            },
          },
          required: ["task_completed", "outcome"],
        },
        messages: [
          {
            role: "system" as const,
            content: `Analyze this Direct Task call. The task was: ${taskDescription}
Was the task completed successfully? What specific outcome was achieved?`,
          },
        ],
      },
      successEvaluationPlan: {
        enabled: true,
        rubric: "Checklist" as const,
        messages: [
          {
            role: "system" as const,
            content: `Evaluate this Direct Task call:
1. Did the AI clearly state the purpose of the call?
2. Did the AI pursue the task persistently but politely?
3. Did the AI get a clear resolution or outcome?
4. Did the AI summarize the outcome before ending?
5. Did the AI properly end the call?`,
          },
        ],
      },
    },
  };
}

/**
 * Creates assistant config for Research & Book requests
 * AI searches for service providers and gathers information
 *
 * Supports two modes:
 * 1. Gemini-generated custom prompt (when request.customPrompt provided) - Natural language
 * 2. Template-based prompt (fallback) - String concatenation from request fields
 */
function createProviderSearchConfig(request: CallRequest) {
  // If Gemini-generated customPrompt is provided, use it directly
  // This gives us natural language without string concatenation
  if (request.customPrompt?.systemPrompt && request.customPrompt?.firstMessage) {
    console.log('[AssistantConfig] Using Gemini-generated customPrompt');

    const clientName = request.clientName || "my client";

    // CRITICAL: Append explicit endCall instructions to ensure reliable call termination
    // This acts as a safety net even if Gemini's generated prompt lacks strong endCall instructions
    const endCallSafetyNet = `

═══════════════════════════════════════════════════════════════════
CRITICAL: ENDING THE CALL
═══════════════════════════════════════════════════════════════════
You have an endCall tool available. You MUST use it to hang up the call.

After your closing statement (thanking them and saying you'll call back to schedule),
IMMEDIATELY invoke the endCall tool. DO NOT wait for their response.
DO NOT say "goodbye" or continue the conversation - just invoke endCall.
YOU must end the call - do not wait for them to hang up.

If you detect voicemail (automated greeting, "leave a message", beep), immediately invoke endCall.`;

    const enhancedSystemPrompt = request.customPrompt.systemPrompt + endCallSafetyNet;

    return {
      name: `Concierge-${Date.now().toString().slice(-8)}`,
      voice: {
        provider: "11labs" as const,
        voiceId: "21m00Tcm4TlvDq8ikWAM",
        stability: 0.5,
        similarityBoost: 0.75,
      },
      model: {
        provider: "google" as const,
        model: "gemini-2.5-flash",
        messages: [{ role: "system" as const, content: enhancedSystemPrompt }],
        tools: [{ type: "endCall" }],
        temperature: 0.15,  // Very low for reliable tool invocation (2025 best practice)
      },
      transcriber: {
        provider: "deepgram" as const,
        model: "nova-2",
        language: "en-US",
      },
      voicemailDetection: {
        provider: "twilio",
        enabled: true,
        machineDetectionTimeout: 30, // Max 59 seconds per VAPI API
        machineDetectionSpeechThreshold: 2500, // Min 1000ms per VAPI API
        machineDetectionSpeechEndThreshold: 1200, // Min 1000ms per VAPI API
      },
      firstMessage: request.customPrompt.firstMessage,
      endCallFunctionEnabled: true,
      endCallMessage: request.customPrompt.closingScript || "Thank you so much for your time. Have a wonderful day!",
      silenceTimeoutSeconds: 20,  // Safety net: auto-end after 20s silence post-closing
      analysisPlan: {
        structuredDataSchema: {
          type: "object",
          properties: {
            availability: {
              type: "string",
              description: "When they're available (specific date/time if given)",
            },
            estimated_rate: {
              type: "string",
              description: "Cost estimate or rate information",
            },
            all_criteria_met: {
              type: "boolean",
              description: "Does the provider meet ALL of the client's requirements?",
            },
            earliest_availability: {
              type: "string",
              description: "Earliest date/time they can start work",
            },
            disqualified: {
              type: "boolean",
              description: "Was the provider disqualified due to not meeting requirements?",
            },
            disqualification_reason: {
              type: "string",
              description: "Reason the provider was disqualified (if applicable)",
            },
            call_outcome: {
              type: "string",
              enum: ["positive", "negative", "neutral", "no_answer", "voicemail"],
              description: "Overall outcome of the call",
            },
            notes: {
              type: "string",
              description: "Any additional notes from the conversation",
            },
          },
          required: ["availability", "all_criteria_met", "call_outcome"],
        },
        successEvaluationPrompt: `Evaluate if ${clientName}'s needs can be met by this provider based on the call.`,
        successEvaluationRubric: "AutomaticRubric",
        summaryPrompt: `Summarize the key information gathered for ${clientName}: availability, rates, and whether requirements are met.`,
      },
    };
  }

  // FALLBACK: Original template-based approach
  const urgencyText = request.urgency.replace(/_/g, " ");
  const clientName = request.clientName || "my client";

  // Build address section based on what we have
  const addressSection = request.clientAddress
    ? `
═══════════════════════════════════════════════════════════════════
SERVICE LOCATION (YOU HAVE THIS INFORMATION)
═══════════════════════════════════════════════════════════════════
Service address: ${request.clientAddress}

If the provider asks for the address, you CAN provide it:
"The service address is ${request.clientAddress}"
`
    : `
═══════════════════════════════════════════════════════════════════
SERVICE LOCATION (LIMITED INFORMATION)
═══════════════════════════════════════════════════════════════════
Service area: ${request.location} (general area only - NOT a street address)

CRITICAL: You do NOT have ${clientName}'s street address.
If the provider asks for the specific street address, respond:
"I'm just checking availability and rates right now. If ${clientName} decides
to schedule with you, they'll provide their exact address when we call back
to book the appointment."

DO NOT make up an address. DO NOT use "${request.location}" as if it's a street address.
`;

  const systemPrompt = `You are a warm, friendly AI Concierge making a real phone call to ${request.providerName}.

═══════════════════════════════════════════════════════════════════
YOUR IDENTITY
═══════════════════════════════════════════════════════════════════
You are ${clientName}'s personal AI assistant. Introduce yourself as:
"Hi there! This is ${clientName}'s personal AI assistant..."

You are calling on behalf of ${clientName} who needs ${request.serviceNeeded} services.
${addressSection}

═══════════════════════════════════════════════════════════════════
HANDLING REQUESTS FOR INFORMATION YOU DON'T HAVE
═══════════════════════════════════════════════════════════════════
If the provider asks for information you don't have (like phone number, insurance,
payment info, etc.), respond:

"I'm just checking availability and rates right now. If ${clientName} decides
to schedule with you, they'll provide all those details when we call back
to book the appointment."

DO NOT make up information. DO NOT guess. Just explain you're gathering
initial information first.

═══════════════════════════════════════════════════════════════════
CRITICAL: SINGLE PERSON REQUIREMENT
═══════════════════════════════════════════════════════════════════
${clientName} needs to find ONE SINGLE PERSON who has ALL of these qualities:
${request.userCriteria}

You are NOT looking for different people with different qualities.
You need ONE person who possesses ALL requirements together.

═══════════════════════════════════════════════════════════════════
QUESTIONS TO ASK (ONLY THESE - DO NOT INVENT OTHERS)
═══════════════════════════════════════════════════════════════════
Standard questions:
1. Availability: "Are you available ${urgencyText}?"
   - If YES: "Great! What's your soonest availability? When could you come out?"
2. Rates: "What would your rate be for this type of work?"

Client-specific requirements (ask about each ONE AT A TIME):
${request.userCriteria}

When asking about these requirements, ALWAYS refer to THE SAME PERSON:
- First question: "Do you have a technician who [first requirement]?"
- Follow-up questions: "And is this same person also [next requirement]?"
- Keep referring back: "The technician you mentioned - are they also [requirement]?"

DO NOT ask questions that are not in the criteria above.
DO NOT ask about licensing/certification unless it's in the criteria.

═══════════════════════════════════════════════════════════════════
VOICEMAIL / ANSWERING MACHINE DETECTION
═══════════════════════════════════════════════════════════════════
If you hear ANY of these indicators, IMMEDIATELY invoke endCall:
- "Please leave a message after the beep"
- "You have reached the voicemail of"
- "No one is available to take your call"
- "Leave your name and number"
- Long automated greeting (more than 10 seconds)
- Beep sound indicating recording

DO NOT leave a voicemail message. DO NOT wait for the beep.
Simply invoke endCall immediately - we will try again later.

═══════════════════════════════════════════════════════════════════
DISQUALIFICATION DETECTION
═══════════════════════════════════════════════════════════════════
As you gather information, watch for responses that DISQUALIFY the provider:
- They say they don't have anyone available
- They say they can't meet a specific requirement
- They explicitly state they don't do the type of work needed
- They say their rate is significantly higher than reasonable

If disqualified, politely wrap up:
"Thank you so much for taking the time to chat. Unfortunately, it sounds like this particular request might not be the best fit for ${clientName} right now, but I really appreciate your help. Have a wonderful day!"
Then immediately invoke endCall.

DO NOT mention calling back to schedule if they are disqualified.

═══════════════════════════════════════════════════════════════════
SPEECH RULES
═══════════════════════════════════════════════════════════════════
- NEVER start sentences with: "Okay", "So", "Well", "Alright", "Um"
- NEVER invent names or call them by a name they didn't give
- NEVER say incomplete sentences
- NEVER bundle multiple questions together
- Keep responses short and complete
- Wait for their answer before asking the next question

═══════════════════════════════════════════════════════════════════
CONVERSATION FLOW
═══════════════════════════════════════════════════════════════════
1. GREETING: Ask if they have a moment to chat

2. AVAILABILITY: "${clientName} needs help ${urgencyText}. Are you available?"
   - If NO: Thank them warmly and END THE CALL
   - If YES: "Great! What's your soonest availability? When could you come out?"
   - Get their specific earliest date/time (e.g., "Tomorrow at 2pm", "Friday morning")

3. RATES: "What would your typical rate be?"

4. CLIENT REQUIREMENTS: Ask about each requirement ONE AT A TIME
   - Always reference the SAME person
   - Use phrases like: "And this person - are they also..."
   - Acknowledge each answer warmly before the next question

5. CLOSING & CALLBACK:
   IF provider meets ALL criteria:
   Say: "Perfect, thank you so much for all that information! I'll share this with ${clientName} and if they'd like to proceed, we'll call back to schedule. Does that sound good?"
   - Wait for their response (usually "yes", "sounds good", etc.)
   - Acknowledge: "Great, have a wonderful day!"
   - Then IMMEDIATELY invoke endCall

   IF provider is disqualified:
   Use the polite exit script (no mention of scheduling):
   "Thank you so much for taking the time to chat. Unfortunately, it sounds like this particular request might not be the best fit for ${clientName} right now, but I really appreciate your help. Have a wonderful day!"
   - Then IMMEDIATELY invoke endCall

═══════════════════════════════════════════════════════════════════
ENDING THE CALL
═══════════════════════════════════════════════════════════════════
After gathering the information you need, say:
"Thank you so much! I'll share this with ${clientName} and if they'd like to proceed, we'll call back to schedule. Have a wonderful day!"

Then IMMEDIATELY use the endCall tool. DO NOT wait for their response.
DO NOT say "goodbye" - just invoke endCall right after your closing statement.

Use endCall when:
- You have all the information you need
- They say they're not available
- They decline to answer
- The conversation naturally concludes

═══════════════════════════════════════════════════════════════════
TONE
═══════════════════════════════════════════════════════════════════
Be warm, genuine, and conversational - like a helpful friend.
Acknowledge their answers: "That's great!", "Perfect!", "I appreciate that!"
For unusual requirements, frame naturally: "${clientName} specifically mentioned..."`;

  return {
    name: `Concierge-${Date.now().toString().slice(-8)}`,

    // ElevenLabs voice (Rachel - handles punctuation correctly, no "dot" issue)
    voice: {
      provider: "11labs" as const,
      voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel - warm, professional
      stability: 0.5,
      similarityBoost: 0.75,
    },

    // Model configuration
    model: {
      provider: "google" as const,
      model: "gemini-2.5-flash",
      messages: [
        {
          role: "system" as const,
          content: systemPrompt,
        },
      ],
      tools: [{ type: "endCall" }],
      temperature: 0.15,  // Very low for reliable tool invocation (2025 best practice)
    },

    // Transcription
    transcriber: {
      provider: "deepgram" as const,
      language: "en",
    },

    // Voicemail detection
    voicemailDetection: {
      provider: "twilio",
      enabled: true,
      machineDetectionTimeout: 10,
      machineDetectionSpeechThreshold: 2500,
      machineDetectionSpeechEndThreshold: 1200,
    },

    // First message
    firstMessage: (() => {
      const problemText = request.problemDescription
        ? ` ${clientName} ${request.problemDescription}.`
        : "";
      return `Hi there! This is ${clientName}'s personal AI assistant calling to check on ${request.serviceNeeded} services.${problemText} Do you have just a quick moment?`;
    })(),

    // Enable endCall function (VAPI handles tool registration automatically)
    endCallFunctionEnabled: true,
    endCallMessage: "Thank you so much for your time. Have a wonderful day!",
    silenceTimeoutSeconds: 20,  // Safety net: auto-end after 20s silence post-closing

    // Analysis configuration
    analysisPlan: {
      summaryPlan: {
        enabled: true,
        messages: [
          {
            role: "system" as const,
            content:
              `Summarize: Was ONE person found with ALL required qualities? What are their rates? What is their soonest/earliest availability (specific date/time)? Does the provider meet all ${clientName}'s requirements?`,
          },
        ],
      },

      structuredDataPlan: {
        enabled: true,
        schema: {
          type: "object",
          properties: {
            availability: {
              type: "string",
              enum: [
                "available",
                "unavailable",
                "callback_requested",
                "unclear",
              ],
            },
            earliest_availability: {
              type: "string",
              description:
                "Specific date/time when provider can come out (e.g., 'Tomorrow at 2pm', 'Friday morning', 'Next Monday')",
            },
            estimated_rate: {
              type: "string",
            },
            single_person_found: {
              type: "boolean",
              description:
                "Did we find ONE person with ALL required qualities?",
            },
            technician_name: {
              type: "string",
              description:
                "Name of the specific technician discussed (if given)",
            },
            all_criteria_met: {
              type: "boolean",
              description: `Does the SAME person meet ALL ${clientName}'s requirements?`,
            },
            criteria_details: {
              type: "object",
              description: "Details about each criterion for the SAME person",
            },
            disqualified: {
              type: "boolean",
              description:
                "Was the provider disqualified due to not meeting requirements?",
            },
            disqualification_reason: {
              type: "string",
              description:
                "Reason the provider was disqualified (if applicable)",
            },
            call_outcome: {
              type: "string",
              enum: [
                "positive",
                "negative",
                "neutral",
                "no_answer",
                "voicemail",
              ],
            },
            recommended: {
              type: "boolean",
            },
            notes: {
              type: "string",
            },
          },
          required: [
            "availability",
            "single_person_found",
            "all_criteria_met",
            "call_outcome",
          ],
        },
        messages: [
          {
            role: "system" as const,
            content: `Analyze this call. ${clientName} needed ONE SINGLE PERSON with ALL these qualities:
${request.userCriteria}

Key questions:
1. Did we find ONE person who has ALL requirements? Not different people for different requirements.
2. Was the provider disqualified during the call? If so, what was the reason?`,
          },
        ],
      },

      successEvaluationPlan: {
        enabled: true,
        rubric: "Checklist" as const,
        messages: [
          {
            role: "system" as const,
            content: `Evaluate:
1. Did we confirm availability AND get specific soonest availability (date/time)?
2. Did we get rates?
3. Did we ask ONLY about the explicit criteria (not invented questions)?
4. Did we track ONE person for ALL requirements (not different people)?
5. Did we deliver the callback closing script ("I'll call you back to schedule")?
6. Did we properly end the call (not wait for them to hang up)?`,
          },
        ],
      },
    },
  };
}

/**
 * Creates VAPI assistant configuration for provider calls
 * Routes to appropriate config based on request type:
 * - Direct Tasks: AI performs an action (complain, negotiate, etc.)
 * - Research & Book: AI searches for service providers
 *
 * @param request - The call request information
 * @param customPrompt - Optional Gemini-generated custom prompt for Direct Tasks
 */
export function createAssistantConfig(
  request: CallRequest,
  customPrompt?: GeneratedPrompt
) {
  if (isDirectTask(request)) {
    if (customPrompt) {
      return createDynamicDirectTaskConfig(request, customPrompt);
    }
    return createDirectTaskConfig(request);  // Fallback to static template
  }
  return createProviderSearchConfig(request);
}

export type AssistantConfig = ReturnType<typeof createAssistantConfig>;
