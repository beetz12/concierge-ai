/**
 * VAPI Booking Assistant Configuration
 * Used for scheduling appointments after provider selection
 *
 * This is different from the screening assistant - it focuses on
 * actually booking an appointment with a provider we've already vetted.
 */

export interface BookingRequest {
  providerPhone: string;
  providerName: string;
  serviceDescription: string;
  preferredDate: string;
  preferredTime: string;
  customerName: string;
  customerPhone: string;
  location: string;
}

/**
 * Creates VAPI assistant configuration for booking calls
 * This assistant calls providers back to schedule appointments
 */
export function createBookingAssistantConfig(request: BookingRequest) {
  const systemPrompt = `You are a warm, friendly AI Assistant calling ${request.providerName} to schedule an appointment.
You are calling BACK - this provider was already contacted earlier about the service.

═══════════════════════════════════════════════════════════════════
YOUR MISSION
═══════════════════════════════════════════════════════════════════
Schedule an appointment for your client:
- Service needed: ${request.serviceDescription}
- Location: ${request.location}
- Preferred date: ${request.preferredDate}
- Preferred time: ${request.preferredTime}
- Client name: ${request.customerName}
- Client callback phone: ${request.customerPhone}

═══════════════════════════════════════════════════════════════════
CONVERSATION FLOW
═══════════════════════════════════════════════════════════════════
1. GREETING: Reference the previous conversation
   "Hi! This is the AI assistant that called earlier about ${request.serviceDescription}.
   My client has decided to go with you and I'm calling to schedule the appointment."

2. REQUEST PREFERRED TIME:
   "My client was hoping for ${request.preferredDate} around ${request.preferredTime}.
   Does that work for you?"

3. NEGOTIATE IF NEEDED:
   - If preferred time unavailable, ask what times ARE available
   - Accept the closest available time to the preference
   - Be flexible but try to get something within their timeframe

4. CONFIRM DETAILS:
   Once appointment is set, confirm:
   - "Just to confirm, that's [DATE] at [TIME]?"
   - "The service address is ${request.location}"
   - "And the best number to reach my client is ${request.customerPhone}"
   - "My client's name is ${request.customerName}"

5. GET CONFIRMATION:
   - Ask for a confirmation number if they provide one
   - Or just confirm the appointment is set
   - "Is there anything my client should prepare or know before the appointment?"

6. CLOSING:
   "Perfect! Thank you so much for getting us scheduled. My client is looking forward to it!"
   Then IMMEDIATELY invoke endCall.

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

DO NOT leave a voicemail message - we will try again later.

═══════════════════════════════════════════════════════════════════
SPEECH RULES
═══════════════════════════════════════════════════════════════════
- NEVER start sentences with: "Okay", "So", "Well", "Alright", "Um"
- Keep responses clear and direct
- Be warm and appreciative - they're helping schedule service for your client
- If they ask who you are, say you're an AI assistant calling on behalf of ${request.customerName}

═══════════════════════════════════════════════════════════════════
IF BOOKING FAILS
═══════════════════════════════════════════════════════════════════
If they can't schedule (fully booked, changed their mind, etc.):
"I understand. Thank you for letting me know. I'll relay this to my client. Have a great day!"
Then IMMEDIATELY invoke endCall.

═══════════════════════════════════════════════════════════════════
ENDING THE CALL
═══════════════════════════════════════════════════════════════════
You have an endCall function available. You MUST use it to hang up.
After your closing statement, immediately invoke endCall.
DO NOT wait for them to hang up - YOU end the call.`;

  return {
    name: `Booking-${Date.now().toString().slice(-8)}`,

    voice: {
      provider: "11labs" as const,
      voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel - warm, professional
      stability: 0.5,
      similarityBoost: 0.75,
    },

    model: {
      provider: "google" as const,
      model: "gemini-2.0-flash-exp",
      messages: [
        {
          role: "system" as const,
          content: systemPrompt,
        },
      ],
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

    firstMessage: `Hi there! This is the AI assistant that called earlier about ${request.serviceDescription}. My client has decided to go with you, and I'm calling to schedule the appointment. Do you have a quick moment?`,

    endCallFunctionEnabled: true,

    analysisPlan: {
      summaryPlan: {
        enabled: true,
        messages: [
          {
            role: "system" as const,
            content: `Summarize this booking call. Was the appointment successfully scheduled?
What date and time was confirmed? Was a confirmation number provided?
Note any special instructions or things the client should prepare.`,
          },
        ],
      },

      structuredDataPlan: {
        enabled: true,
        schema: {
          type: "object",
          properties: {
            booking_confirmed: {
              type: "boolean",
              description: "Was the appointment successfully booked?",
            },
            confirmed_date: {
              type: "string",
              description:
                "The confirmed appointment date (e.g., 'December 15, 2024')",
            },
            confirmed_time: {
              type: "string",
              description: "The confirmed appointment time (e.g., '2:00 PM')",
            },
            confirmation_number: {
              type: "string",
              description:
                "Confirmation number if provided, otherwise 'none'",
            },
            provider_contact_name: {
              type: "string",
              description: "Name of person who took the booking (if given)",
            },
            special_instructions: {
              type: "string",
              description:
                "Any preparation or special instructions for the client",
            },
            booking_failure_reason: {
              type: "string",
              description:
                "If booking failed, the reason (e.g., 'fully booked', 'wrong number')",
            },
            call_outcome: {
              type: "string",
              enum: [
                "booked",
                "rescheduling_needed",
                "declined",
                "voicemail",
                "wrong_number",
                "no_answer",
              ],
            },
            notes: {
              type: "string",
              description: "Additional relevant information from the call",
            },
          },
          required: ["booking_confirmed", "call_outcome"],
        },
        messages: [
          {
            role: "system" as const,
            content: `Analyze this booking call:
1. Was the appointment confirmed?
2. What date and time?
3. Any confirmation number?
4. If it failed, why?`,
          },
        ],
      },

      successEvaluationPlan: {
        enabled: true,
        rubric: "Checklist" as const,
        messages: [
          {
            role: "system" as const,
            content: `Evaluate this booking call:
1. Did the AI reference the previous conversation?
2. Did the AI clearly state the preferred date/time?
3. Did the AI confirm all appointment details (date, time, address, client info)?
4. Did the AI ask for a confirmation number?
5. Did the AI properly end the call?`,
          },
        ],
      },
    },
  };
}

export type BookingAssistantConfig = ReturnType<
  typeof createBookingAssistantConfig
>;
