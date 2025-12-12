/**
 * VAPI Booking Assistant Configuration
 * Handles callback to provider to schedule/confirm appointment
 */

export interface BookingRequest {
  providerName: string;
  providerPhone: string;
  serviceNeeded: string;
  clientName?: string;
  clientPhone?: string;
  location: string; // City/state (backward compatible)
  clientAddress?: string; // Full street address
  preferredDateTime?: string;
  serviceRequestId?: string;
  providerId?: string;
  additionalNotes?: string;
}

/**
 * Creates VAPI assistant configuration for booking appointments
 * AI calls the provider back to schedule a specific appointment time
 */
export function createBookingAssistantConfig(request: BookingRequest) {
  const clientName = request.clientName || "my client";
  const preferredTime = request.preferredDateTime || "as soon as possible";

  const systemPrompt = `You are a warm, professional AI Assistant making a real phone call to ${request.providerName} to schedule an appointment.

═══════════════════════════════════════════════════════════════════
YOUR MISSION
═══════════════════════════════════════════════════════════════════
You are calling to schedule a confirmed appointment for ${clientName} who needs ${request.serviceNeeded} services in ${request.location}.

You have already spoken to this provider and they confirmed availability.
Now you are calling back to lock in a specific date and time.

═══════════════════════════════════════════════════════════════════
APPOINTMENT DETAILS
═══════════════════════════════════════════════════════════════════
Service needed: ${request.serviceNeeded}
${request.clientAddress ? `Service address: ${request.clientAddress}` : `Service area: ${request.location} (general area only)`}
Preferred time: ${preferredTime}
${request.additionalNotes ? `Additional notes: ${request.additionalNotes}` : ""}

═══════════════════════════════════════════════════════════════════
INFORMATION YOU CAN PROVIDE
═══════════════════════════════════════════════════════════════════
${request.clientName ? `Client name: ${request.clientName}` : "Client name: Available upon scheduling"}
${request.clientPhone ? `Client callback number: ${request.clientPhone}` : "Client will provide contact details directly"}
${request.clientAddress ? `If asked for the address: "The service address is ${request.clientAddress}"` : `CRITICAL: You do NOT have the street address. If asked: "${clientName} will provide their exact address when the technician arrives."`}

If they ask for information you don't have (like payment method, etc.):
"${clientName} will provide those details directly when you arrive for the appointment.
For now, we just want to lock in the date and time."

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
SPEECH RULES
═══════════════════════════════════════════════════════════════════
- Be warm, friendly, and professional
- NEVER start sentences with: "Okay", "So", "Well", "Alright", "Um"
- Keep responses clear and direct
- Listen carefully to their available times
- Confirm all details before ending

═══════════════════════════════════════════════════════════════════
CONVERSATION FLOW
═══════════════════════════════════════════════════════════════════

1. GREETING:
   "Hi there! This is ${clientName}'s AI assistant calling back about scheduling the ${request.serviceNeeded} appointment. Do you have a moment?"

2. REFERENCE PREVIOUS CALL:
   "We spoke earlier and you mentioned you were available ${preferredTime}. I'd like to lock in a specific date and time if possible."

3. SCHEDULE THE APPOINTMENT:
   - Propose the preferred time: "Would ${preferredTime} work for you?"
   - If they suggest alternatives, work with them to find a mutually agreeable time
   - Be flexible and accommodating
   - Get SPECIFIC: day of week, date, and time (e.g., "Tuesday, January 15th at 2:00 PM")

4. CONFIRM DETAILS:
   Once you have a time, confirm:
   "Perfect! Just to confirm:
   - Service: ${request.serviceNeeded}
   - Date and time: [REPEAT THE CONFIRMED DATE/TIME]
   - Location: ${request.location}
   - Client: ${clientName}

   Is there anything else you need from us before the appointment?"

5. GET CONFIRMATION NUMBER (if applicable):
   "Do you have a confirmation number or reference number I can give ${clientName}?"

6. CLOSING:
   "Excellent! ${clientName} will see you on [DATE] at [TIME]. Thank you so much for your time!"
   Then IMMEDIATELY invoke endCall.

═══════════════════════════════════════════════════════════════════
HANDLING ISSUES
═══════════════════════════════════════════════════════════════════

If they say they're no longer available:
"I understand. Let me check - what would be your next available time slot?"
Try to reschedule. If they absolutely cannot help, politely end:
"I understand. Thank you for letting me know. Have a great day!"
Then invoke endCall.

If they ask to speak directly to the client:
"Of course! I'll have ${clientName} call you back at this number.
Before I go, can we tentatively hold [TIME] so ${clientName} knows what to expect?"

If they're confused about who you are:
"I'm calling on behalf of ${clientName}. We spoke earlier about ${request.serviceNeeded} services,
and you confirmed you were available. I'm just calling back to schedule the specific appointment time."

═══════════════════════════════════════════════════════════════════
ENDING THE CALL
═══════════════════════════════════════════════════════════════════
You have an endCall function available. You MUST use it to hang up.

After confirming the appointment and saying goodbye, immediately invoke endCall.
DO NOT wait for them to hang up - YOU end the call.

═══════════════════════════════════════════════════════════════════
TONE
═══════════════════════════════════════════════════════════════════
Be warm, enthusiastic, and genuinely grateful for their time.
This is a positive interaction - you're confirming something they already agreed to.
Thank them sincerely when they confirm the appointment.`;

  return {
    name: `Booking-${Date.now().toString().slice(-8)}`,

    // ElevenLabs voice (Rachel - warm, professional)
    voice: {
      provider: "11labs" as const,
      voiceId: "21m00Tcm4TlvDq8ikWAM",
      stability: 0.5,
      similarityBoost: 0.75,
    },

    // Model configuration
    model: {
      provider: "google" as const,
      model: "gemini-2.0-flash-exp",
      messages: [
        {
          role: "system" as const,
          content: systemPrompt,
        },
      ],
      tools: [{ type: "endCall" }],
      temperature: 0.15,
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
    firstMessage: `Hi there! This is ${clientName}'s AI assistant calling back about scheduling the ${request.serviceNeeded} appointment. Do you have just a moment?`,

    // Enable endCall function
    endCallFunctionEnabled: true,
    endCallMessage: "Thank you so much for your time. Have a wonderful day!",
    silenceTimeoutSeconds: 20,

    // Analysis configuration
    analysisPlan: {
      summaryPlan: {
        enabled: true,
        messages: [
          {
            role: "system" as const,
            content: `Summarize the appointment booking call. Was an appointment successfully scheduled?
What date and time was confirmed? Was a confirmation number provided? Any issues or follow-up needed?`,
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
              description:
                "Was the appointment successfully scheduled and confirmed?",
            },
            confirmed_date: {
              type: "string",
              description:
                "The confirmed appointment date (e.g., 'Tuesday, January 15th, 2025')",
            },
            confirmed_time: {
              type: "string",
              description: "The confirmed appointment time (e.g., '2:00 PM')",
            },
            confirmation_number: {
              type: "string",
              description:
                "Confirmation or reference number provided by the provider (if any)",
            },
            contact_name: {
              type: "string",
              description:
                "Name of the person you spoke to at the provider (if given)",
            },
            reschedule_needed: {
              type: "boolean",
              description:
                "Does the client need to call back to reschedule or provide more info?",
            },
            next_steps: {
              type: "string",
              description:
                "Any follow-up actions required before the appointment",
            },
            provider_notes: {
              type: "string",
              description:
                "Additional notes or requirements mentioned by the provider",
            },
            call_outcome: {
              type: "string",
              enum: [
                "confirmed",
                "rescheduled",
                "provider_unavailable",
                "client_callback_needed",
                "failed",
                "voicemail",
              ],
              description: "Overall outcome of the booking call",
            },
          },
          required: ["booking_confirmed", "call_outcome"],
        },
        messages: [
          {
            role: "system" as const,
            content: `Analyze this booking call. Was the appointment successfully confirmed?
Extract all relevant appointment details including date, time, confirmation number, and any next steps.`,
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
1. Did the AI clearly state the purpose of the callback?
2. Did the AI reference the previous conversation?
3. Did the AI successfully schedule a specific date and time?
4. Did the AI confirm all appointment details before ending?
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
