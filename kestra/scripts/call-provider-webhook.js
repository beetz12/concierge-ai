/**
 * VAPI Call Provider Script - WEBHOOK VERSION
 *
 * This script makes real phone calls to service providers using VAPI.ai
 * with webhook-based status updates instead of SDK polling.
 *
 * FIXES IMPLEMENTED:
 * 1. Only asks questions from explicit criteria (no made-up questions)
 * 2. ElevenLabs voice (fixes "dot" being spoken as word)
 * 3. Anti-hallucination rules (no invented names, complete sentences)
 * 4. Single-person logic (ONE technician with ALL qualities)
 * 5. Proper call ending with endCall function
 * 6. WEBHOOK-BASED: Polls OUR backend instead of VAPI SDK
 * 7. Personal AI assistant framing (not generic concierge)
 * 8. Probes for specifics on vague answers (pricing breakdown, etc.)
 *
 * Usage: node call-provider-webhook.js <phone> <service> <criteria> <location> <provider_name> <urgency> <client_name> <problem_description>
 */

const { VapiClient } = require('@vapi-ai/server-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

const PHONE_NUMBER = process.argv[2];
const SERVICE_TYPE = process.argv[3] || "plumbing";
const USER_CRITERIA = process.argv[4] || "Need service within 2 days, must be licensed";
const LOCATION = process.argv[5] || "Greenville, SC";
const PROVIDER_NAME = process.argv[6] || "Service Provider";
const URGENCY = process.argv[7] || "within_2_days";
const CLIENT_NAME = process.argv[8] || "my client";
const PROBLEM_DESCRIPTION = process.argv[9] || `${SERVICE_TYPE} issue`;

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
const VAPI_WEBHOOK_URL = process.env.VAPI_WEBHOOK_URL;
const BACKEND_API_URL = process.env.BACKEND_API_URL || "http://localhost:8000";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Validate required inputs
if (!PHONE_NUMBER) {
    console.error("Error: Phone number is required");
    console.error("Usage: node call-provider-webhook.js <phone> <service> <criteria> <location> <provider_name> <urgency> [client_name] [problem_description]");
    process.exit(1);
}

if (!VAPI_API_KEY || !VAPI_PHONE_NUMBER_ID) {
    console.error("Error: VAPI_API_KEY and VAPI_PHONE_NUMBER_ID environment variables are required");
    process.exit(1);
}

if (!VAPI_WEBHOOK_URL) {
    console.error("Error: VAPI_WEBHOOK_URL environment variable is required");
    console.error("This should be the URL where VAPI will send webhook events");
    process.exit(1);
}

if (!GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY environment variable is required");
    process.exit(1);
}

// Initialize clients
const vapi = new VapiClient({ token: VAPI_API_KEY });
const gemini = new GoogleGenerativeAI(GEMINI_API_KEY);

// ============================================================================
// SYSTEM PROMPT - COMPREHENSIVE FIX
// ============================================================================

/**
 * Generate the system prompt with all fixes applied
 * This is now direct and explicit rather than delegating to Gemini
 */
function getSystemPrompt() {
    const urgencyText = URGENCY.replace(/_/g, ' ');

    return `You are ${CLIENT_NAME}'s personal AI assistant, making a real phone call to ${PROVIDER_NAME}.
You are calling about a specific ${SERVICE_TYPE} issue: ${PROBLEM_DESCRIPTION}
Location: ${LOCATION}

═══════════════════════════════════════════════════════════════════
YOUR IDENTITY
═══════════════════════════════════════════════════════════════════
You are a personal AI assistant working on behalf of ${CLIENT_NAME}.
You sound warm, professional, and knowledgeable - like a trusted friend helping out.
You represent ${CLIENT_NAME} personally, not a generic service.

═══════════════════════════════════════════════════════════════════
THE PROBLEM
═══════════════════════════════════════════════════════════════════
${PROBLEM_DESCRIPTION}

Your first goal is to explain this problem clearly and ask if they can handle it.

═══════════════════════════════════════════════════════════════════
CRITICAL: SINGLE PERSON REQUIREMENT
═══════════════════════════════════════════════════════════════════
${CLIENT_NAME} needs to find ONE SINGLE PERSON who has ALL of these qualities:
${USER_CRITERIA}

You are NOT looking for different people with different qualities.
You need ONE person who possesses ALL requirements together.

═══════════════════════════════════════════════════════════════════
PROBING FOR SPECIFICS (VERY IMPORTANT)
═══════════════════════════════════════════════════════════════════
When the provider gives VAGUE or AMBIGUOUS answers, you MUST probe for specifics.
${CLIENT_NAME} needs clear, actionable information to make a decision.

PRICING - If they say a number like "$300" or "around $200", ask:
- "Is that the total estimated cost to complete the job?"
- "Does that include parts and labor?"
- "Is that a trip fee, or the full cost?"
- "What would cause that price to go up?"

AVAILABILITY - If they say "soon" or "maybe next week", ask:
- "Could you give me a specific day that might work?"
- "Would morning or afternoon work better?"

EXPERIENCE/QUALIFICATIONS - If they say "yes we can do that", ask:
- "Have you handled this specific type of issue before?"
- "How long have you been doing this kind of work?"

TIMELINE - If they say "a few hours" or "depends", ask:
- "What's your best estimate for this type of job?"
- "What factors would make it take longer?"

WARRANTY/GUARANTEE - Always ask:
- "Do you offer any warranty on the work?"

The goal is to get SPECIFIC, CONCRETE answers that help ${CLIENT_NAME} compare providers.

═══════════════════════════════════════════════════════════════════
CONVERSATION FLOW
═══════════════════════════════════════════════════════════════════
1. GREETING & INTRODUCTION:
   - Introduce yourself as ${CLIENT_NAME}'s personal AI assistant
   - Ask if they have a moment to chat

2. EXPLAIN THE PROBLEM:
   - Describe the issue: "${PROBLEM_DESCRIPTION}"
   - Ask: "Is this something you'd be able to help with?"
   - If NO: Thank them warmly and END THE CALL
   - If YES: Continue

3. AVAILABILITY:
   - "${CLIENT_NAME} needs help ${urgencyText}. Are you available?"
   - If NO: Thank them and END THE CALL
   - If YES: Continue

4. PRICING (probe for specifics!):
   - "What would something like this typically cost?"
   - FOLLOW UP on their answer to understand the full cost breakdown
   - Ask about what's included vs extra charges

5. CLIENT REQUIREMENTS: Ask about each ONE AT A TIME
   ${USER_CRITERIA}
   - Always reference the SAME person
   - Probe for specifics on vague answers

6. WARRANTY/GUARANTEE:
   - "Do you offer any warranty or guarantee on the work?"

7. CLOSING:
   - "Thank you so much for your time! I'll share all this with ${CLIENT_NAME}."
   - Then IMMEDIATELY call your endCall function

═══════════════════════════════════════════════════════════════════
SPEECH RULES
═══════════════════════════════════════════════════════════════════
- NEVER start sentences with: "Okay", "So", "Well", "Alright", "Um"
- NEVER invent names or call them by a name they didn't give
- NEVER say incomplete sentences
- NEVER bundle multiple questions together
- Keep responses short and complete
- Wait for their answer before asking the next question
- Always use "${CLIENT_NAME}" when referring to your client, not "my client"

═══════════════════════════════════════════════════════════════════
ENDING THE CALL (CRITICAL)
═══════════════════════════════════════════════════════════════════
You have an endCall function. When you call it, the system IMMEDIATELY hangs up
and plays a goodbye message. Do NOT say goodbye yourself - just call endCall.

IMMEDIATELY call endCall when:
- You have finished collecting information (don't wait for them to respond)
- They say they can't help (thank them briefly, then endCall)
- They decline to answer (acknowledge, then endCall)
- You've asked your final question and gotten an answer (endCall right after acknowledging)

DO NOT:
- Wait for silence after your closing statement
- Say "goodbye" or "have a great day" (the system does this)
- Wait for them to hang up first
- Continue talking after deciding to end the call

═══════════════════════════════════════════════════════════════════
TONE
═══════════════════════════════════════════════════════════════════
Be warm, genuine, and conversational - like a trusted assistant.
You care about getting the best outcome for ${CLIENT_NAME}.
Acknowledge their answers: "That's helpful!", "Perfect!", "I appreciate that!"
When probing for details, be polite: "Just to make sure I have this right..."`;
}

// ============================================================================
// VAPI ASSISTANT CONFIGURATION - ALL FIXES + WEBHOOKS
// ============================================================================

function createAssistantConfig() {
    const systemPrompt = getSystemPrompt();

    return {
        name: `Concierge-${Date.now().toString().slice(-8)}`,

        // FIX #2: ElevenLabs voice (handles punctuation correctly, no "dot" issue)
        voice: {
            provider: "11labs",
            voiceId: "21m00Tcm4TlvDq8ikWAM",  // Rachel - warm, professional
            stability: 0.5,
            similarityBoost: 0.75
        },

        // Model configuration
        model: {
            provider: "google",
            model: "gemini-2.0-flash-exp",
            messages: [
                {
                    role: "system",
                    content: systemPrompt
                }
            ]
        },

        // Transcription
        transcriber: {
            provider: "deepgram",
            language: "en"
        },

        // First message - personal AI assistant introduction with problem details
        firstMessage: `Hi there! I'm ${CLIENT_NAME}'s personal AI assistant. ${CLIENT_NAME} is in ${LOCATION} and has a ${SERVICE_TYPE} issue - ${PROBLEM_DESCRIPTION}. Do you have just a quick moment to see if you might be able to help?`,

        // FIX #5: Enable endCall function with immediate disconnect
        endCallFunctionEnabled: true,

        // FIX #6: End call message - spoken before immediate hangup
        endCallMessage: "Goodbye, have a great day!",

        // FIX #7: Reduce silence timeout so call ends quickly after goodbye (min 10)
        silenceTimeoutSeconds: 10,

        // NEW: Webhook configuration (FIXED: use nested server object, not flat serverUrl)
        server: {
            url: VAPI_WEBHOOK_URL,
            timeoutSeconds: 20
        },
        serverMessages: [
            "status-update",
            "end-of-call-report"
        ],

        // Analysis configuration
        analysisPlan: {
            summaryPlan: {
                enabled: true,
                messages: [
                    {
                        role: "system",
                        content: `Summarize this call for ${CLIENT_NAME}:
1. Can they handle the problem (${PROBLEM_DESCRIPTION})?
2. What's their availability?
3. What's the full pricing breakdown (total cost, what's included, what's extra)?
4. Any warranty offered?
5. Was ONE person found with ALL required qualities?
6. Overall recommendation?`
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
                        availability_details: {
                            type: "string",
                            description: "Specific day/time mentioned for availability"
                        },
                        // Price breakdown
                        estimated_rate: {
                            type: "string",
                            description: "The price quoted (raw number or range)"
                        },
                        price_type: {
                            type: "string",
                            enum: ["total_estimate", "starting_price", "trip_fee", "hourly_rate", "flat_rate", "unclear"],
                            description: "What does the quoted price represent?"
                        },
                        price_includes: {
                            type: "string",
                            description: "What is included in the price (parts, labor, etc.)"
                        },
                        price_variables: {
                            type: "string",
                            description: "What could cause the price to change?"
                        },
                        // Warranty
                        warranty_offered: {
                            type: "boolean",
                            description: "Did they mention any warranty or guarantee?"
                        },
                        warranty_details: {
                            type: "string",
                            description: "Details about warranty coverage and duration"
                        },
                        // Single person tracking
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
                        // Can handle the job
                        can_handle_job: {
                            type: "boolean",
                            description: "Did they confirm they can handle this specific problem?"
                        },
                        experience_level: {
                            type: "string",
                            description: "Any experience/qualification details mentioned"
                        },
                        estimated_duration: {
                            type: "string",
                            description: "How long did they estimate the job would take?"
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
                    required: ["availability", "can_handle_job", "call_outcome"]
                },
                messages: [
                    {
                        role: "system",
                        content: `Analyze this call for ${CLIENT_NAME}. Extract all pricing details carefully:

Problem: ${PROBLEM_DESCRIPTION}
Requirements: ${USER_CRITERIA}

Key extractions needed:
1. Can they handle this specific job?
2. Price breakdown: What exactly does the quoted price cover? Is it a total estimate, trip fee, or hourly rate?
3. What's included vs extra charges?
4. Any warranty or guarantee offered?
5. Did we find ONE person with ALL requirements?`
                    }
                ]
            },

            successEvaluationPlan: {
                enabled: true,
                rubric: "Checklist",
                messages: [
                    {
                        role: "system",
                        content: `Evaluate this call for ${CLIENT_NAME}:
1. Did we explain the problem (${PROBLEM_DESCRIPTION}) and ask if they can handle it?
2. Did we confirm availability with specific timing?
3. Did we get pricing AND clarify what the price includes (not just accept a number)?
4. Did we probe vague answers for specifics (trip fee vs total, what's included, etc.)?
5. Did we ask about warranty/guarantee?
6. Did we track ONE person for ALL requirements?
7. Did we properly end the call (not wait for them to hang up)?`
                    }
                ]
            }
        }
    };
}

// ============================================================================
// BACKEND POLLING - REPLACES VAPI SDK POLLING
// ============================================================================

/**
 * Poll OUR backend for call results instead of VAPI directly
 * The backend receives webhook events from VAPI and stores the results
 *
 * ENRICHMENT-AWARE POLLING:
 * - Backend first caches webhook data with dataStatus='partial'
 * - Backend then fetches from VAPI API and updates to dataStatus='complete'
 * - We wait for dataStatus='complete' or 'fetch_failed' before returning
 */
async function pollBackendForResults(callId, maxAttempts = 60) {
    console.log(`[Backend Poll] Starting to poll ${BACKEND_API_URL} for call ${callId}`);
    console.log(`[Backend Poll] Will wait for dataStatus='complete' (max ${maxAttempts} attempts)`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(r => setTimeout(r, 5000));

        try {
            const response = await fetch(
                `${BACKEND_API_URL}/api/v1/vapi/calls/${callId}`
            );

            // 404 means the call hasn't been processed yet
            if (response.status === 404) {
                console.log(`[Backend Poll] Attempt ${attempt}/${maxAttempts}: Call not ready yet (waiting for webhook)`);
                continue;
            }

            // Check for other errors
            if (!response.ok) {
                console.error(`[Backend Poll] Error response: ${response.status} ${response.statusText}`);
                continue;
            }

            // Success - parse the data
            // Backend returns { success: true, data: {...} }
            const responseJson = await response.json();
            const callData = responseJson.data;

            // Log current status including dataStatus
            const dataStatus = callData?.dataStatus || 'unknown';
            console.log(`[Backend Poll] Attempt ${attempt}/${maxAttempts}: status=${callData?.status}, dataStatus=${dataStatus}`);

            // Check if call has completed AND data is enriched
            if (callData && callData.status === 'completed') {
                // Check dataStatus for enrichment completion
                if (dataStatus === 'complete') {
                    console.log(`[Backend Poll] Call completed with COMPLETE data! Returning results.`);
                    console.log(`[Backend Poll] Transcript length: ${callData.transcript?.length || 0} chars`);
                    console.log(`[Backend Poll] Has summary: ${!!callData.analysis?.summary}`);
                    return callData;
                }

                if (dataStatus === 'fetch_failed') {
                    console.warn(`[Backend Poll] Enrichment failed, using partial data`);
                    return callData;
                }

                if (dataStatus === 'partial' || dataStatus === 'fetching') {
                    console.log(`[Backend Poll] Call completed but enrichment in progress (${dataStatus}), continuing to wait...`);
                    continue;
                }

                // Legacy: no dataStatus field (old cached data or backend not updated)
                // Fall back to old behavior
                console.log(`[Backend Poll] Call completed (no dataStatus field - legacy data)`);
                return callData;
            }

            // If still in progress, continue polling
            console.log(`[Backend Poll] Call still in progress...`);

        } catch (error) {
            console.error(`[Backend Poll] Fetch error on attempt ${attempt}:`, error.message);
            // Continue polling even on errors
        }
    }

    // Timeout
    console.error(`[Backend Poll] Timeout after ${maxAttempts} attempts`);
    return { status: 'timeout' };
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log(`[VAPI Call Webhook] Initializing call to ${PROVIDER_NAME}`);
    console.log(`[VAPI Call Webhook] Phone: ${PHONE_NUMBER}`);
    console.log(`[VAPI Call Webhook] Service: ${SERVICE_TYPE}`);
    console.log(`[VAPI Call Webhook] Location: ${LOCATION}`);
    console.log(`[VAPI Call Webhook] Urgency: ${URGENCY}`);
    console.log(`[VAPI Call Webhook] Client: ${CLIENT_NAME}`);
    console.log(`[VAPI Call Webhook] Problem: ${PROBLEM_DESCRIPTION}`);
    console.log(`[VAPI Call Webhook] Criteria: ${USER_CRITERIA}`);
    console.log(`[VAPI Call Webhook] Webhook URL: ${VAPI_WEBHOOK_URL}`);
    console.log(`[VAPI Call Webhook] Backend URL: ${BACKEND_API_URL}`);
    console.log("=".repeat(60));

    try {
        // Step 1: Create assistant configuration with all fixes + webhooks
        console.log("\n[Step 1/3] Creating VAPI assistant with webhooks...");
        const assistantConfig = createAssistantConfig();
        console.log("[Config] Voice: ElevenLabs Rachel");
        console.log("[Config] EndCall tool: Enabled");
        console.log("[Config] Single-person tracking: Enabled");
        console.log("[Config] Price probing: Enabled");
        console.log("[Config] Personal AI assistant framing: Enabled");
        console.log("[Config] Webhook URL: Configured");
        console.log("[Config] Server Messages: status-update, end-of-call-report");

        // Step 2: Initiate the call
        console.log("\n[Step 2/3] Initiating VAPI call...");
        const call = await vapi.calls.create({
            phoneNumberId: VAPI_PHONE_NUMBER_ID,
            customer: {
                number: PHONE_NUMBER,
                name: "Service Provider"
            },
            assistant: assistantConfig
        });

        console.log(`[VAPI Call] Call initiated successfully!`);
        console.log(`[VAPI Call] Call ID: ${call.id}`);
        console.log(`[VAPI Call] Status: ${call.status}`);
        console.log(`[VAPI Call] Webhooks will be sent to: ${VAPI_WEBHOOK_URL}`);

        // Step 3: Poll OUR backend for completion
        console.log("\n[Step 3/3] Polling backend for call completion...");
        console.log(`[Backend Poll] Will check ${BACKEND_API_URL}/api/v1/vapi/calls/${call.id}`);

        const backendData = await pollBackendForResults(call.id);

        if (backendData.status === 'timeout') {
            const timeoutResult = {
                status: 'timeout',
                callId: call.id,
                message: `Backend polling timed out after 5 minutes`,
                provider: { name: PROVIDER_NAME, phone: PHONE_NUMBER }
            };

            console.log("\n[VAPI Call] Backend polling timed out:");
            console.log(JSON.stringify(timeoutResult, null, 2));
            console.log("\n[KESTRA_OUTPUT]");
            console.log(JSON.stringify(timeoutResult));
            return;
        }

        // Success! Build the result from backend data
        console.log("\n[VAPI Call] Call completed via webhook!");

        const result = {
            status: 'completed',
            callId: call.id,
            duration: backendData.duration || 0,
            endedReason: backendData.endedReason || "unknown",
            transcript: backendData.transcript || "No transcript",
            analysis: {
                summary: backendData.analysis?.summary || "No summary",
                structuredData: backendData.analysis?.structuredData || {},
                successEvaluation: backendData.analysis?.successEvaluation || "Not evaluated"
            },
            provider: {
                name: PROVIDER_NAME,
                phone: PHONE_NUMBER,
                service: SERVICE_TYPE,
                location: LOCATION
            },
            request: {
                criteria: USER_CRITERIA,
                urgency: URGENCY
            }
        };

        console.log("\n" + "=".repeat(60));
        console.log("[VAPI Call] FINAL RESULT:");
        console.log("=".repeat(60));
        console.log(JSON.stringify(result, null, 2));
        console.log("\n[KESTRA_OUTPUT]");
        console.log(JSON.stringify(result));

    } catch (error) {
        const errorResult = {
            status: 'error',
            error: error.message,
            provider: { name: PROVIDER_NAME, phone: PHONE_NUMBER }
        };

        console.error("\n[VAPI Call] Error:", error.message);
        console.log("\n[KESTRA_OUTPUT]");
        console.log(JSON.stringify(errorResult));
        process.exit(1);
    }
}

main();
