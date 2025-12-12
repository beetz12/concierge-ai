/**
 * VAPI Call Provider Script
 *
 * This script makes real phone calls to service providers using VAPI.ai
 *
 * IMPORTANT: Assistant configuration is imported from the compiled TypeScript source
 * to maintain DRY principle. See: apps/api/src/services/vapi/assistant-config.ts
 *
 * Usage: node call-provider.js <phone> <service> <criteria> <location> <provider_name> <urgency> [provider_id] [service_request_id]
 */

const { VapiClient } = require('@vapi-ai/server-sdk');

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

const PHONE_NUMBER = process.argv[2];
const SERVICE_TYPE = process.argv[3] || "plumbing";
const USER_CRITERIA = process.argv[4] || "Need service within 2 days, must be licensed";
const LOCATION = process.argv[5] || "Greenville, SC";
const PROVIDER_NAME = process.argv[6] || "Service Provider";
const URGENCY = process.argv[7] || "within_2_days";
const PROVIDER_ID = process.argv[8] || "";
const SERVICE_REQUEST_ID = process.argv[9] || "";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;

// Validate required inputs
if (!PHONE_NUMBER) {
    console.error("Error: Phone number is required");
    console.error("Usage: node call-provider.js <phone> <service> <criteria> <location> <provider_name> <urgency> [provider_id] [service_request_id]");
    process.exit(1);
}

if (!VAPI_API_KEY || !VAPI_PHONE_NUMBER_ID) {
    console.error("Error: VAPI_API_KEY and VAPI_PHONE_NUMBER_ID environment variables are required");
    process.exit(1);
}

// Initialize VAPI client
const vapi = new VapiClient({ token: VAPI_API_KEY });

// ============================================================================
// ASSISTANT CONFIGURATION (Imported from TypeScript source)
// ============================================================================

/**
 * Import the shared assistant configuration from compiled TypeScript.
 * This ensures DRY principle - single source of truth in:
 * apps/api/src/services/vapi/assistant-config.ts
 *
 * The function signature is:
 * createAssistantConfig(request: CallRequest)
 * where CallRequest = { phoneNumber, serviceNeeded, userCriteria, location, providerName, urgency }
 */
let createAssistantConfig;

// Dynamic import for ESM module from CommonJS context
async function loadAssistantConfig() {
    try {
        // Try local scripts folder first (for Kestra Cloud)
        try {
            const configModule = await import('./assistant-config.js');
            createAssistantConfig = configModule.createAssistantConfig;
            console.log("[Config] Loaded from scripts folder (Kestra Cloud)");
            return;
        } catch (localError) {
            console.log("[Config] Local import failed, trying monorepo path...");
        }

        // Fallback: Load from monorepo (for local development)
        const configModule = await import('../../apps/api/dist/services/vapi/assistant-config.js');
        createAssistantConfig = configModule.createAssistantConfig;
        console.log("[Config] Loaded from monorepo (local development)");

    } catch (error) {
        console.error("[Config] Failed to load assistant configuration:", error.message);
        console.error("[Config] Make sure:");
        console.error("  - Local: Run 'pnpm --filter api build'");
        console.error("  - Cloud: Copy assistant-config.js to scripts folder");
        process.exit(1);
    }
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
        // Step 0: Load shared configuration
        await loadAssistantConfig();

        // Step 1: Create assistant configuration from shared source
        console.log("\n[Step 1/3] Creating VAPI assistant configuration...");
        const callRequest = {
            phoneNumber: PHONE_NUMBER,
            serviceNeeded: SERVICE_TYPE,
            userCriteria: USER_CRITERIA,
            location: LOCATION,
            providerName: PROVIDER_NAME,
            urgency: URGENCY
        };
        const assistantConfig = createAssistantConfig(callRequest);
        console.log("[Config] Using shared configuration from TypeScript source");
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
                        },
                        providerId: PROVIDER_ID,
                        serviceRequestId: SERVICE_REQUEST_ID
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
            provider: { name: PROVIDER_NAME, phone: PHONE_NUMBER },
            providerId: PROVIDER_ID,
            serviceRequestId: SERVICE_REQUEST_ID
        };

        console.log("\n[VAPI Call] Call timed out:");
        console.log(JSON.stringify(timeoutResult, null, 2));
        console.log("\n[KESTRA_OUTPUT]");
        console.log(JSON.stringify(timeoutResult));

    } catch (error) {
        const errorResult = {
            status: 'error',
            error: error.message,
            provider: { name: PROVIDER_NAME, phone: PHONE_NUMBER },
            providerId: PROVIDER_ID,
            serviceRequestId: SERVICE_REQUEST_ID
        };

        console.error("\n[VAPI Call] Error:", error.message);
        console.log("\n[KESTRA_OUTPUT]");
        console.log(JSON.stringify(errorResult));
        process.exit(1);
    }
}

main();
