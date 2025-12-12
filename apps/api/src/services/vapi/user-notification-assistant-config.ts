/**
 * User Notification Assistant Configuration
 *
 * VAPI assistant that calls users to present top 3 provider recommendations
 * and capture their selection (1, 2, or 3).
 */

export interface UserNotificationRequest {
  userPhone: string;
  userName?: string;
  serviceRequestId: string;
  recommendations: Array<{
    rank: number;
    providerName: string;
    availability: string;
    rate?: string;
    reasoning?: string;
  }>;
  serviceNeeded: string;
  location: string;
  requestUrl?: string;
}

export interface UserNotificationResult {
  success: boolean;
  callId?: string;
  selectedProvider?: number;
  callOutcome: "selected" | "no_selection" | "voicemail" | "no_answer" | "error";
  transcript?: string;
  error?: string;
}

export function createUserNotificationAssistantConfig(request: UserNotificationRequest) {
  const { userName, recommendations, serviceNeeded, location, requestUrl } = request;

  // Build recommendations script
  const recsScript = recommendations.map((r, i) =>
    `${i + 1}. ${r.providerName} - Available ${r.availability}${r.rate ? `, ${r.rate}` : ''}`
  ).join('\n');

  return {
    name: "AI Concierge - User Notification",
    model: {
      provider: "google" as const,
      model: "gemini-2.0-flash",
      temperature: 0.15, // Very low for precise selection capture (2025 best practice)
      tools: [{ type: "endCall", description: "End the phone call. Use this immediately after your closing statement." }],
      messages: [
        {
          role: "system" as const,
          content: `You are an AI assistant calling to present provider recommendations and capture the user's selection.

## YOUR TASK
1. Greet the user warmly
2. Read the 3 provider recommendations clearly
3. Ask which one they'd like to book (1, 2, or 3)
4. Confirm their selection
5. End the call politely

## RECOMMENDATIONS TO READ
${recsScript}

## CONVERSATION FLOW

**Opening:**
"Hi ${userName || 'there'}! This is AI Concierge calling about your ${serviceNeeded} request in ${location}. I found 3 great options for you!"

**Read Recommendations:**
Read each provider clearly with their availability.

**Ask for Selection:**
"Which provider would you like me to book? Just say 1, 2, or 3."

**Handle Response:**
- If they say a number (1-3): "Great choice! I'll book ${recommendations[0]?.providerName || 'that provider'} for you right away."
- If unclear: "I didn't catch that. Could you say 1, 2, or 3?"
- If they want more info: Briefly explain, then ask again
- If they decline all: "No problem! ${requestUrl ? `You can review them at ${requestUrl}` : 'Feel free to call us back when you decide.'}"

**Closing:**
"Thanks for using AI Concierge! You'll receive a confirmation shortly. Have a great day!"
Then IMMEDIATELY invoke the endCall tool. DO NOT wait for their response. DO NOT say "goodbye" - just invoke endCall right after your closing.

## ENDING THE CALL (CRITICAL)
You have an endCall tool available. You MUST use it to hang up the call.
After your closing statement, IMMEDIATELY invoke endCall.
DO NOT wait for them to respond or hang up - YOU end the call.

## IMPORTANT
- Be concise and clear
- Don't ramble or over-explain
- Capture their selection accurately
- Maximum 2 minutes for the call`
        }
      ]
    },
    voice: {
      provider: "11labs" as const,
      voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel - friendly and clear
      stability: 0.5,
      similarityBoost: 0.75,
    },
    firstMessage: `Hi ${userName || 'there'}! This is AI Concierge calling about your ${serviceNeeded} request in ${location}. I found 3 great providers for you! Let me tell you about them.`,
    endCallFunctionEnabled: true,
    endCallMessage: "Thanks for using AI Concierge! Goodbye!",
    silenceTimeoutSeconds: 15,
    maxDurationSeconds: 180, // 3 minutes max
    analysisPlan: {
      structuredDataSchema: {
        type: "object" as const,
        properties: {
          selected_provider: {
            type: "number",
            description: "The provider number selected by the user (1, 2, or 3). Null if no selection made.",
          },
          call_outcome: {
            type: "string",
            enum: ["selected", "no_selection", "declined_all", "wants_more_time"],
            description: "The outcome of the notification call",
          },
          user_questions: {
            type: "string",
            description: "Any questions the user asked about the providers",
          },
        },
        required: ["call_outcome"],
      },
      successEvaluationPrompt: "Evaluate if the user successfully selected a provider (1, 2, or 3) or expressed a clear preference.",
      summaryPrompt: "Summarize the user's provider selection and any questions they asked.",
    },
  };
}
