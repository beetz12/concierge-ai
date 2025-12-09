/**
 * VAPI Call Provider Script - COMPREHENSIVE FIX v2
 *
 * This script makes real phone calls to service providers using VAPI.ai
 *
 * FIXES IMPLEMENTED:
 * 1. Only asks questions from explicit criteria (no made-up questions)
 * 2. ElevenLabs voice (fixes "dot" being spoken as word)
 * 3. Anti-hallucination rules (no invented names, complete sentences)
 * 4. Single-person logic (ONE technician with ALL qualities)
 * 5. Proper call ending with endCall function
 *
 * Usage: node call-provider.js <phone> <service> <criteria> <location> <provider_name> <urgency>
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

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Validate required inputs
if (!PHONE_NUMBER) {
    console.error("Error: Phone number is required");
    console.error("Usage: node call-provider.js <phone> <service> <criteria> <location> <provider_name> <urgency>");
    process.exit(1);
}

if (!VAPI_API_KEY || !VAPI_PHONE_NUMBER_ID) {
    console.error("Error: VAPI_API_KEY and VAPI_PHONE_NUMBER_ID environment variables are required");
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

    return `You are a warm, friendly AI Concierge making a real phone call to ${PROVIDER_NAME}.
You are calling on behalf of a client in ${LOCATION} who needs ${SERVICE_TYPE} services.

═══════════════════════════════════════════════════════════════════
CRITICAL: SINGLE PERSON REQUIREMENT
═══════════════════════════════════════════════════════════════════
Your client needs to find ONE SINGLE PERSON who has ALL of these qualities:
${USER_CRITERIA}

You are NOT looking for different people with different qualities.
You need ONE person who possesses ALL requirements together.

═══════════════════════════════════════════════════════════════════
QUESTIONS TO ASK (ONLY THESE - DO NOT INVENT OTHERS)
═══════════════════════════════════════════════════════════════════
Standard questions:
1. Availability: "Are you available ${urgencyText}?"
2. Rates: "What would your rate be for this type of work?"

Client-specific requirements (ask about each ONE AT A TIME):
${USER_CRITERIA}

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
}

// ============================================================================
// VAPI ASSISTANT CONFIGURATION - ALL FIXES
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

        // First message
        firstMessage: `Hi there! This is the AI Concierge calling on behalf of a client in ${LOCATION} who needs ${SERVICE_TYPE} help. Do you have just a quick moment?`,

        // FIX #5: Enable endCall function (tools array not supported at assistant level)
        endCallFunctionEnabled: true,

        // Analysis configuration
        analysisPlan: {
            summaryPlan: {
                enabled: true,
                messages: [
                    {
                        role: "system",
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
                        // FIX #4: Single person tracking
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
                        role: "system",
                        content: `Analyze this call. The client needed ONE SINGLE PERSON with ALL these qualities:
${USER_CRITERIA}

Key question: Did we find ONE person who has ALL requirements? Not different people for different requirements.`
                    }
                ]
            },

            successEvaluationPlan: {
                enabled: true,
                rubric: "Checklist",
                messages: [
                    {
                        role: "system",
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

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log(`[VAPI Call] Initializing call to ${PROVIDER_NAME}`);
    console.log(`[VAPI Call] Phone: ${PHONE_NUMBER}`);
    console.log(`[VAPI Call] Service: ${SERVICE_TYPE}`);
    console.log(`[VAPI Call] Location: ${LOCATION}`);
    console.log(`[VAPI Call] Urgency: ${URGENCY}`);
    console.log(`[VAPI Call] Criteria: ${USER_CRITERIA}`);
    console.log("=".repeat(60));

    try {
        // Step 1: Create assistant configuration with all fixes
        console.log("\n[Step 1/3] Creating VAPI assistant with comprehensive fixes...");
        const assistantConfig = createAssistantConfig();
        console.log("[Config] Voice: ElevenLabs Rachel");
        console.log("[Config] EndCall tool: Enabled");
        console.log("[Config] Single-person tracking: Enabled");

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

        // Step 3: Poll for completion
        console.log("\n[Step 3/3] Waiting for call to complete...");
        let status = call.status;
        let attempts = 0;
        const maxAttempts = 60;

        while (['queued', 'ringing', 'in-progress'].includes(status) && attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 5000));
            attempts++;

            try {
                const updatedCall = await vapi.calls.get(call.id);
                status = updatedCall.status;
                console.log(`[VAPI Call] Status check ${attempts}/${maxAttempts}: ${status}`);

                if (status === 'ended') {
                    console.log("\n[VAPI Call] Call completed!");

                    const result = {
                        status: 'completed',
                        callId: call.id,
                        duration: updatedCall.durationMinutes || 0,
                        endedReason: updatedCall.endedReason || "unknown",
                        transcript: updatedCall.artifact?.transcript || updatedCall.transcript || "No transcript",
                        analysis: {
                            summary: updatedCall.analysis?.summary || "No summary",
                            structuredData: updatedCall.analysis?.structuredData || {},
                            successEvaluation: updatedCall.analysis?.successEvaluation || "Not evaluated"
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
                    return;
                }
            } catch (pollError) {
                console.error(`[VAPI Call] Poll error (attempt ${attempts}):`, pollError.message);
            }
        }

        // Timeout handling
        const timeoutResult = {
            status: 'timeout',
            callId: call.id,
            lastKnownStatus: status,
            message: `Call did not complete within ${maxAttempts * 5} seconds`,
            provider: { name: PROVIDER_NAME, phone: PHONE_NUMBER }
        };

        console.log("\n[VAPI Call] Call timed out:");
        console.log(JSON.stringify(timeoutResult, null, 2));
        console.log("\n[KESTRA_OUTPUT]");
        console.log(JSON.stringify(timeoutResult));

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
