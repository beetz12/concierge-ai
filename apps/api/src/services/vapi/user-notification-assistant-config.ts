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
  serviceNeeded: string;
  location: string;
  requestUrl?: string;

  recommendations: Array<{
    rank: number;
    providerName: string;
    availability: string;
    // Rich data fields (matching SMS notification quality)
    rating?: number;           // Google rating (e.g., 4.8)
    reviewCount?: number;      // Number of reviews
    estimatedRate?: string;    // e.g., "$85/hour" or "Call for quote"
    score?: number;            // AI recommendation score (0-100)
    reasoning?: string;        // Why this provider was recommended
  }>;

  /** AI's overall recommendation explaining why top provider was chosen */
  overallRecommendation?: string;
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
  const { userName, recommendations, serviceNeeded, location, overallRecommendation } = request;

  // Build detailed provider information for the AI's knowledge base
  const detailedProviderInfo = recommendations.map((r) => {
    const lines: string[] = [`**${r.providerName}** (Option ${r.rank})`];

    if (r.rating) {
      let ratingLine = `- Rating: ${r.rating.toFixed(1)} stars`;
      if (r.reviewCount) {
        ratingLine += ` from ${r.reviewCount} reviews`;
      }
      lines.push(ratingLine);
    }

    lines.push(`- Availability: ${r.availability}`);

    if (r.estimatedRate) {
      lines.push(`- Estimated Rate: ${r.estimatedRate}`);
    }

    if (r.reasoning) {
      lines.push(`- Why Recommended: ${r.reasoning}`);
    }

    return lines.join('\n');
  }).join('\n\n');

  // Build concise spoken summary for reading aloud
  const spokenSummary = recommendations.map((r) => {
    let summary = `Option ${r.rank}: ${r.providerName}`;
    if (r.rating) {
      summary += ` with ${r.rating.toFixed(1)} stars`;
      if (r.reviewCount && r.reviewCount > 50) {
        summary += ` from over ${Math.floor(r.reviewCount / 10) * 10} reviews`;
      }
    }
    summary += `, available ${r.availability}`;
    if (r.estimatedRate) {
      summary += `, estimated ${r.estimatedRate}`;
    }
    return summary;
  }).join('. ');

  // Get top provider details for emphasis
  const topProvider = recommendations[0];
  const topProviderHighlight = topProvider ?
    `${topProvider.providerName}${topProvider.rating ? ` (${topProvider.rating.toFixed(1)} stars)` : ''}` :
    'the first provider';

  return {
    name: "AI Concierge - User Notification",
    model: {
      provider: "google" as const,
      model: "gemini-2.0-flash",
      temperature: 0.25, // Slightly higher for natural conversation while maintaining accuracy
      tools: [{ type: "endCall", description: "End the phone call. Use this immediately after your closing statement." }],
      messages: [
        {
          role: "system" as const,
          content: `You are a friendly AI assistant calling to present provider recommendations. You have detailed information about each provider and can answer questions to help the user make an informed decision.

## YOUR KNOWLEDGE BASE

### Service Request
- Service Needed: ${serviceNeeded}
- Location: ${location}
- Customer: ${userName || 'Customer'}

### Provider Details (in order of recommendation)
${detailedProviderInfo}

${overallRecommendation ? `### AI Recommendation Summary\n${overallRecommendation}` : ''}

## CONVERSATION FLOW

**1. Opening (warm and informative):**
"Hi ${userName || 'there'}! This is AI Concierge calling about your ${serviceNeeded} request. Great news - I've researched providers in ${location} and found some excellent options for you!"

**2. Lead with your TOP recommendation:**
"My top recommendation is ${topProviderHighlight}.${topProvider?.reasoning ? ` ${topProvider.reasoning.split('.')[0]}.` : ''} They're available ${topProvider?.availability || 'soon'}${topProvider?.estimatedRate ? ` and their estimated rate is ${topProvider.estimatedRate}` : ''}."

**3. Briefly mention alternatives:**
"I also found two other great options: ${recommendations[1]?.providerName || 'a second provider'}${recommendations[1]?.rating ? ` with ${recommendations[1].rating.toFixed(1)} stars` : ''} available ${recommendations[1]?.availability || 'soon'}, and ${recommendations[2]?.providerName || 'a third option'} available ${recommendations[2]?.availability || 'soon'}."

**4. Invite questions or selection:**
"Would you like more details about any of these, or are you ready to choose? Just say 1, 2, or 3."

**5. Handle Questions (use your knowledge base):**
- If asked about ratings/reviews: Share specific numbers from your knowledge
- If asked about pricing: Give estimated rates, mention if it's competitive
- If asked "why this one?": Explain the reasoning in a conversational way
- If asked about availability: Be specific with dates/times
- After answering, ask: "Does that help? Ready to choose?"

**6. Confirm Selection:**
When they choose: "Excellent choice! I'll book ${topProvider?.providerName || 'them'} for you right away. You'll receive a confirmation shortly."

**7. Closing:**
"Thanks for using AI Concierge! Have a wonderful day!"
Then IMMEDIATELY invoke the endCall tool.

## IMPORTANT GUIDELINES
1. Be CONVERSATIONAL, not robotic - you're helping with an important decision
2. Lead with your TOP pick and explain WHY it's best
3. Answer questions using your knowledge base - be specific with numbers
4. Create gentle urgency: "availability might change" if they hesitate
5. If they ask something not in your knowledge: "I don't have that specific detail, but based on my research..."
6. Keep responses concise - this is a phone call, not a lecture
7. After confirming selection, end promptly with endCall tool

## ENDING THE CALL (CRITICAL)
After your closing statement, IMMEDIATELY invoke the endCall tool.
DO NOT wait for their response after closing.
DO NOT say additional goodbyes - just invoke endCall.`
        }
      ]
    },
    voice: {
      provider: "11labs" as const,
      voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel - friendly and clear
      stability: 0.5,
      similarityBoost: 0.75,
    },
    firstMessage: `Hi ${userName || 'there'}! This is AI Concierge calling about your ${serviceNeeded} request. Great news - I've researched providers in ${location} and found some excellent options for you!`,
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
            enum: ["selected", "no_selection", "declined_all", "wants_callback", "voicemail"],
            description: "The outcome of the notification call",
          },
          user_questions: {
            type: "array",
            items: { type: "string" },
            description: "Questions the user asked about providers (e.g., 'asked about pricing', 'asked why top pick')",
          },
          decision_factors: {
            type: "string",
            description: "What factors influenced the user's decision (e.g., 'chose based on rating', 'price was main concern')",
          },
        },
        required: ["call_outcome"],
      },
      successEvaluationPrompt: "Evaluate if the user successfully selected a provider (1, 2, or 3) or expressed a clear preference. Consider the call successful if they made a selection.",
      summaryPrompt: "Summarize: 1) Which provider was selected (if any), 2) What questions the user asked, 3) What factors influenced their decision.",
    },
  };
}
