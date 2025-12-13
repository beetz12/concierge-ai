/**
 * @deprecated This script uses inline configuration and is not maintained.
 * Use call-provider.js instead, which imports the shared assistant-config.js
 * for a single source of truth.
 *
 * This file is kept for historical reference only.
 */

const { VapiClient } = require('@vapi-ai/server-sdk');

// Inputs
const PHONE_NUMBER = process.argv[2];
const CUSTOMER_SERVICE_NEEDED = process.argv[3] || "plumbing";
const VAPI_PRIVATE_KEY = process.env.VAPI_API_KEY;

if (!PHONE_NUMBER || !VAPI_PRIVATE_KEY) {
    console.error("Usage: node call-provider-improved.js <phone> <service>");
    console.error("Env vars needed: VAPI_API_KEY, VAPI_PHONE_NUMBER_ID");
    process.exit(1);
}

const vapi = new VapiClient({ token: VAPI_PRIVATE_KEY });

/**
 * Wait for call to complete and extract structured results
 */
async function waitForCallCompletion(callId, maxWaitMinutes = 3) {
    const maxAttempts = (maxWaitMinutes * 60) / 5; // Poll every 5 seconds
    let attempts = 0;

    while (attempts < maxAttempts) {
        const call = await vapi.calls.get(callId);
        const status = call.status;

        console.error(`[Poll ${attempts + 1}/${maxAttempts}] Call status: ${status}`);

        if (status === 'ended') {
            // Extract all available data
            return {
                success: true,
                callId: call.id,
                endedReason: call.endedReason,

                // Transcript
                transcript: call.artifact?.transcript || '',

                // Analysis (structured data from analysisPlan)
                summary: call.analysis?.summary || '',
                structuredData: call.analysis?.structuredData || {},
                successEvaluation: call.analysis?.successEvaluation || 'unknown',

                // Metadata
                cost: call.costBreakdown?.total || 0,
                duration: call.durationMinutes || 0,

                // Raw messages for debugging
                messageCount: call.messages?.length || 0
            };
        }

        if (!['queued', 'ringing', 'in-progress'].includes(status)) {
            // Call failed or in unexpected state
            return {
                success: false,
                callId: call.id,
                status,
                endedReason: call.endedReason,
                error: `Call ended with unexpected status: ${status}`
            };
        }

        await new Promise(r => setTimeout(r, 5000));
        attempts++;
    }

    // Timeout
    return {
        success: false,
        callId,
        error: 'Timeout waiting for call completion',
        timeout: true
    };
}

async function main() {
    console.error(`Initializing call to ${PHONE_NUMBER} for ${CUSTOMER_SERVICE_NEEDED}...`);

    const assistantConfig = {
        name: `Concierge Agent - ${CUSTOMER_SERVICE_NEEDED}`,
        voice: {
            provider: "playht",
            voiceId: "jennifer"
        },
        model: {
            provider: "google",
            model: "gemini-2.5-flash",
            messages: [
                {
                    role: "system",
                    content: `You are an AI Concierge calling a service provider.
Your goal is to find a ${CUSTOMER_SERVICE_NEEDED} for a client in Greenville, SC.

Ask these questions clearly and concisely:
1. Are you available within the next 2 days?
2. What is your estimated rate for a standard ${CUSTOMER_SERVICE_NEEDED} job?
3. Are you licensed and insured?

Be professional and conversational. If they ask who you are, say you are a digital assistant helping a local homeowner find a reliable service provider.

End the call politely once you have answers to all three questions, or if they decline to provide information.`
                }
            ]
        },
        transcriber: {
            provider: "deepgram",
            language: "en"
        },
        endCallFunctionEnabled: true,

        // CRITICAL: Analysis plan for structured output
        analysisPlan: {
            // Summary prompt (2-3 sentences)
            summaryPrompt: "Summarize the key points of this call with the service provider, including their responses to availability, pricing, and licensing. Note if the call went to voicemail or if the provider was unresponsive.",

            // Structured data extraction prompt
            structuredDataPrompt: `Extract the following information from the call:
- availability: Whether they are available within 2 days (available/unavailable/unclear)
- estimated_rate: The rate they mentioned (e.g., "$85/hour", "$200-500 per job", "not provided")
- licensed_and_insured: Whether they confirmed being licensed and insured (yes/no/unclear)
- notes: Any additional relevant information (specializations, conditions, concerns)
- call_outcome: How the call ended (completed/voicemail/no_answer/refused/other)

If information was not provided or unclear, use "unclear" or "not provided" as appropriate.`,

            // Schema definition (validated by VAPI using Claude/GPT-4)
            structuredDataSchema: {
                type: "object",
                properties: {
                    availability: {
                        type: "string",
                        enum: ["available", "unavailable", "unclear"],
                        description: "Whether provider is available within 2 days"
                    },
                    estimated_rate: {
                        type: "string",
                        description: "Hourly or project rate mentioned, or 'not provided'"
                    },
                    licensed_and_insured: {
                        type: "string",
                        enum: ["yes", "no", "unclear"],
                        description: "Whether provider confirmed they are licensed and insured"
                    },
                    notes: {
                        type: "string",
                        description: "Additional relevant information from the call"
                    },
                    call_outcome: {
                        type: "string",
                        enum: ["completed", "voicemail", "no_answer", "refused", "other"],
                        description: "How the call ended"
                    },
                    provider_seemed_professional: {
                        type: "boolean",
                        description: "Whether the provider seemed professional and reliable based on the conversation"
                    }
                },
                required: ["availability", "licensed_and_insured", "call_outcome"]
            },

            // Success evaluation
            successEvaluationPrompt: "Did we successfully gather availability, rate, and licensing information? Pass if we got clear answers to at least 2 out of 3 questions and the provider was responsive.",
            successEvaluationRubric: "PassFail" // Returns "Pass" or "Fail"
        }
    };

    try {
        // Initiate call
        console.error("Sending call request to VAPI...");
        const call = await vapi.calls.create({
            phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
            customer: {
                number: PHONE_NUMBER,
            },
            assistant: assistantConfig
        });

        console.error(`Call initiated. ID: ${call.id}`);

        // Wait for completion
        const result = await waitForCallCompletion(call.id, 3);

        // Output JSON result for Kestra to parse
        console.log(JSON.stringify(result, null, 2));

        // Exit with appropriate code
        process.exit(result.success ? 0 : 1);

    } catch (error) {
        console.error("VAPI Call Error:", error);
        console.log(JSON.stringify({
            success: false,
            error: error.message,
            stack: error.stack
        }));
        process.exit(1);
    }
}

main();
