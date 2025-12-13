/**
 * VAPI Call Provider Script - WEBHOOK VERSION
 *
 * This script makes real phone calls to service providers using VAPI.ai
 * with webhook-based status updates instead of SDK polling.
 *
 * CONFIGURATION:
 * - Uses shared assistant config from apps/api/src/services/vapi/assistant-config.ts
 * - Adds webhook-specific configuration (server URL, backend polling)
 * - Enhances with personal AI framing and problem description details
 *
 * FEATURES:
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

// NOTE: Shared configurations are imported dynamically in main()
// from: apps/api/dist/services/vapi/webhook-config.js
// This is the source of truth for webhook-enabled assistant configuration

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

// Initialize clients
const vapi = new VapiClient({ token: VAPI_API_KEY });

// ============================================================================
// WEBHOOK-ENHANCED ASSISTANT CONFIGURATION
// ============================================================================

/**
 * Creates VAPI assistant configuration with script-specific enhancements.
 *
 * Uses the shared createWebhookAssistantConfig from the TypeScript source
 * (apps/api/dist/services/vapi/webhook-config.js) which handles:
 * - Base assistant config (voice, prompts, analysis schema)
 * - Webhook server URL and timeout configuration
 * - Server messages configuration
 *
 * This wrapper adds script-specific enhancements:
 * - Enhanced first message with CLIENT_NAME and PROBLEM_DESCRIPTION
 * - End call message
 * - Reduced silence timeout
 *
 * @param {Function} sharedCreateWebhookAssistantConfig - Imported from shared config
 */
function createEnhancedWebhookAssistantConfig(sharedCreateWebhookAssistantConfig) {
    // Get webhook-enabled configuration from shared source
    const baseWebhookConfig = sharedCreateWebhookAssistantConfig(
        {
            providerName: PROVIDER_NAME,
            providerPhone: PHONE_NUMBER,
            location: LOCATION,
            serviceNeeded: SERVICE_TYPE,
            userCriteria: USER_CRITERIA,
            urgency: URGENCY
        },
        VAPI_WEBHOOK_URL
    );

    // Add script-specific enhancements
    return {
        ...baseWebhookConfig,

        // Override first message with more context (script-specific enhancement)
        // Note: Using CLIENT_NAME and PROBLEM_DESCRIPTION from Kestra script CLI args
        firstMessage: `Hi there! I'm ${CLIENT_NAME}'s personal AI assistant. ${CLIENT_NAME} is in ${LOCATION} and has a ${SERVICE_TYPE} issue - ${PROBLEM_DESCRIPTION}. Do you have just a quick moment to see if you might be able to help?`,

        // Add end call message
        endCallMessage: "Goodbye, have a great day!",

        // Reduce silence timeout so call ends quickly after goodbye
        silenceTimeoutSeconds: 10
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
        // Step 1: Load shared config and create assistant configuration
        console.log("\n[Step 1/3] Loading shared webhook config...");

        // Load webhook config with fallback logic
        let createWebhookAssistantConfig;

        try {
            // Try local scripts folder first (for Kestra Cloud)
            try {
                const configModule = await import('./webhook-config.js');
                createWebhookAssistantConfig = configModule.createWebhookAssistantConfig;
                console.log("[Config] Webhook config loaded from scripts folder (Kestra Cloud)");
            } catch (localError) {
                console.log("[Config] Local webhook import failed, trying monorepo path...");

                // Fallback: Load from monorepo (for local development)
                const configModule = await import('../../apps/api/dist/services/vapi/webhook-config.js');
                createWebhookAssistantConfig = configModule.createWebhookAssistantConfig;
                console.log("[Config] Webhook config loaded from monorepo (local development)");
            }

        } catch (error) {
            console.error("[Config] Failed to load webhook configuration:", error.message);
            console.error("[Config] Make sure:");
            console.error("  - Local: Run 'pnpm --filter api build'");
            console.error("  - Cloud: Copy webhook-config.js to scripts folder");
            process.exit(1);
        }

        console.log("[Config] Creating VAPI assistant with shared webhook config + script enhancements...");
        const assistantConfig = createEnhancedWebhookAssistantConfig(createWebhookAssistantConfig);
        console.log("[Config] Voice: ElevenLabs Rachel (from shared config)");
        console.log("[Config] EndCall tool: Enabled (from shared config)");
        console.log("[Config] Single-person tracking: Enabled (from shared config)");
        console.log("[Config] Webhook URL: Configured (from shared webhook-config)");
        console.log("[Config] Server Messages: status-update, end-of-call-report (from shared webhook-config)");
        console.log("[Config] Personal AI assistant framing: Enhanced (script-specific)");

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
