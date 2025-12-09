/**
 * VAPI Assistant Configuration
 * Mirrors the configuration from kestra/scripts/call-provider.js
 * Ensures identical behavior between Kestra and Direct VAPI paths
 */

import type { CallRequest } from './types.js';

/**
 * Creates VAPI assistant configuration for provider calls
 * This configuration is used for both Kestra and Direct VAPI paths
 */
export function createAssistantConfig(request: CallRequest) {
  const urgencyText = request.urgency.replace(/_/g, ' ');

  const systemPrompt = `You are a warm, friendly AI Concierge making a real phone call to ${request.providerName}.
You are calling on behalf of a client in ${request.location} who needs ${request.serviceNeeded} services.

═══════════════════════════════════════════════════════════════════
CRITICAL: SINGLE PERSON REQUIREMENT
═══════════════════════════════════════════════════════════════════
Your client needs to find ONE SINGLE PERSON who has ALL of these qualities:
${request.userCriteria}

You are NOT looking for different people with different qualities.
You need ONE person who possesses ALL requirements together.

═══════════════════════════════════════════════════════════════════
QUESTIONS TO ASK (ONLY THESE - DO NOT INVENT OTHERS)
═══════════════════════════════════════════════════════════════════
Standard questions:
1. Availability: "Are you available ${urgencyText}?"
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

2. AVAILABILITY: "My client needs help ${urgencyText}. Are you available?"
   - If NO: Thank them warmly and END THE CALL
   - If YES: Continue

3. RATES: "What would your typical rate be?"

4. CLIENT REQUIREMENTS: Ask about each requirement ONE AT A TIME
   - Always reference the SAME person
   - Use phrases like: "And this person - are they also..."
   - Acknowledge each answer warmly before the next question

5. CLOSING: "Thank you so much for your time! I'll share this with my client."
   Then immediately END THE CALL using your endCall function.

═══════════════════════════════════════════════════════════════════
ENDING THE CALL
═══════════════════════════════════════════════════════════════════
You have an endCall function available. You MUST use it to hang up.
After your closing statement, immediately invoke endCall.
DO NOT wait for them to hang up - YOU end the call.

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
For unusual requirements, frame naturally: "My client specifically mentioned..."`;

  return {
    name: `Concierge-${Date.now().toString().slice(-8)}`,

    // ElevenLabs voice (Rachel - handles punctuation correctly, no "dot" issue)
    voice: {
      provider: "11labs" as const,
      voiceId: "21m00Tcm4TlvDq8ikWAM",  // Rachel - warm, professional
      stability: 0.5,
      similarityBoost: 0.75
    },

    // Model configuration
    model: {
      provider: "google" as const,
      model: "gemini-2.0-flash-exp",
      messages: [
        {
          role: "system" as const,
          content: systemPrompt
        }
      ]
    },

    // Transcription
    transcriber: {
      provider: "deepgram" as const,
      language: "en"
    },

    // First message
    firstMessage: `Hi there! This is the AI Concierge calling on behalf of a client in ${request.location} who needs ${request.serviceNeeded} help. Do you have just a quick moment?`,

    // Enable endCall function
    endCallFunctionEnabled: true,

    // Add endCall tool explicitly
    tools: [
      {
        type: "endCall" as const,
        async: false,
        messages: [
          {
            type: "request-start" as const,
            content: "Thank you for your time. Have a great day!"
          }
        ]
      }
    ],

    // Analysis configuration
    analysisPlan: {
      summaryPlan: {
        enabled: true,
        messages: [
          {
            role: "system" as const,
            content: "Summarize: Was ONE person found with ALL required qualities? What are their rates and availability?"
          }
        ]
      },

      structuredDataPlan: {
        enabled: true,
        schema: {
          type: "object",
          properties: {
            availability: {
              type: "string",
              enum: ["available", "unavailable", "callback_requested", "unclear"]
            },
            estimated_rate: {
              type: "string"
            },
            single_person_found: {
              type: "boolean",
              description: "Did we find ONE person with ALL required qualities?"
            },
            technician_name: {
              type: "string",
              description: "Name of the specific technician discussed (if given)"
            },
            all_criteria_met: {
              type: "boolean",
              description: "Does the SAME person meet ALL client requirements?"
            },
            criteria_details: {
              type: "object",
              description: "Details about each criterion for the SAME person"
            },
            call_outcome: {
              type: "string",
              enum: ["positive", "negative", "neutral", "no_answer", "voicemail"]
            },
            recommended: {
              type: "boolean"
            },
            notes: {
              type: "string"
            }
          },
          required: ["availability", "single_person_found", "all_criteria_met", "call_outcome"]
        },
        messages: [
          {
            role: "system" as const,
            content: `Analyze this call. The client needed ONE SINGLE PERSON with ALL these qualities:
${request.userCriteria}

Key question: Did we find ONE person who has ALL requirements? Not different people for different requirements.`
          }
        ]
      },

      successEvaluationPlan: {
        enabled: true,
        rubric: "Checklist" as const,
        messages: [
          {
            role: "system" as const,
            content: `Evaluate:
1. Did we confirm availability?
2. Did we get rates?
3. Did we ask ONLY about the explicit criteria (not invented questions)?
4. Did we track ONE person for ALL requirements (not different people)?
5. Did we properly end the call (not wait for them to hang up)?`
          }
        ]
      }
    }
  };
}

export type AssistantConfig = ReturnType<typeof createAssistantConfig>;
