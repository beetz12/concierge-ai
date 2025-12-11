/**
 * Schedule Booking Script
 *
 * This script makes VAPI calls to book appointments with service providers.
 * Used by Kestra schedule_service workflow.
 *
 * IMPORTANT: Assistant configuration is imported from the compiled TypeScript source
 * to maintain DRY principle. See: apps/api/src/services/vapi/booking-assistant-config.ts
 *
 * Usage: node schedule-booking.js <provider_phone> <provider_name> <service> <date> <time> <customer_name> <customer_phone> <location>
 */

const { VapiClient } = require('@vapi-ai/server-sdk');

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

const PROVIDER_PHONE = process.argv[2];
const PROVIDER_NAME = process.argv[3] || "Service Provider";
const SERVICE_DESCRIPTION = process.argv[4] || "service";
const PREFERRED_DATE = process.argv[5] || "this week";
const PREFERRED_TIME = process.argv[6] || "morning";
const CUSTOMER_NAME = process.argv[7] || "Customer";
const CUSTOMER_PHONE = process.argv[8] || "";
const LOCATION = process.argv[9] || "";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID;

// Validate required inputs
if (!PROVIDER_PHONE) {
    console.error("Error: Provider phone number is required");
    console.error("Usage: node schedule-booking.js <provider_phone> <provider_name> <service> <date> <time> <customer_name> <customer_phone> <location>");
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

let createBookingAssistantConfig;

async function loadBookingConfig() {
    try {
        // Try local scripts folder first (for Kestra Cloud)
        try {
            const configModule = await import('./booking-assistant-config.js');
            createBookingAssistantConfig = configModule.createBookingAssistantConfig;
            console.log("[Config] Loaded from scripts folder (Kestra Cloud)");
            return;
        } catch (localError) {
            console.log("[Config] Local import failed, trying monorepo path...");
        }

        // Fallback: Load from monorepo (for local development)
        const configModule = await import('../../apps/api/dist/services/vapi/booking-assistant-config.js');
        createBookingAssistantConfig = configModule.createBookingAssistantConfig;
        console.log("[Config] Loaded from monorepo (local development)");

    } catch (error) {
        console.error("[Config] Failed to load booking configuration:", error.message);
        console.error("[Config] Make sure:");
        console.error("  - Local: Run 'pnpm --filter api build'");
        console.error("  - Cloud: Copy booking-assistant-config.js to scripts folder");
        process.exit(1);
    }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log(`[VAPI Booking] Scheduling appointment with ${PROVIDER_NAME}`);
    console.log(`[VAPI Booking] Provider Phone: ${PROVIDER_PHONE}`);
    console.log(`[VAPI Booking] Service: ${SERVICE_DESCRIPTION}`);
    console.log(`[VAPI Booking] Preferred: ${PREFERRED_DATE} at ${PREFERRED_TIME}`);
    console.log(`[VAPI Booking] Customer: ${CUSTOMER_NAME}`);
    console.log(`[VAPI Booking] Customer Phone: ${CUSTOMER_PHONE}`);
    console.log(`[VAPI Booking] Location: ${LOCATION}`);
    console.log("=".repeat(60));

    try {
        // Step 0: Load booking configuration
        await loadBookingConfig();

        // Step 1: Create booking assistant configuration
        console.log("\n[Step 1/3] Creating booking assistant configuration...");
        // Map script args to BookingRequest interface expected by createBookingAssistantConfig
        // Interface expects: providerName, providerPhone, serviceNeeded, clientName, clientPhone, location, preferredDateTime
        const bookingRequest = {
            providerPhone: PROVIDER_PHONE,
            providerName: PROVIDER_NAME,
            serviceNeeded: SERVICE_DESCRIPTION,  // maps serviceDescription -> serviceNeeded
            clientName: CUSTOMER_NAME,           // maps customerName -> clientName
            clientPhone: CUSTOMER_PHONE,         // maps customerPhone -> clientPhone
            location: LOCATION,
            preferredDateTime: PREFERRED_DATE && PREFERRED_TIME
                ? `${PREFERRED_DATE} at ${PREFERRED_TIME}`
                : PREFERRED_DATE || PREFERRED_TIME || "as soon as possible"  // combine date/time
        };
        const assistantConfig = createBookingAssistantConfig(bookingRequest);
        console.log("[Config] Using booking configuration from TypeScript source");
        console.log("[Config] Voice: ElevenLabs Rachel");
        console.log("[Config] EndCall tool: Enabled");

        // Step 2: Initiate the booking call
        console.log("\n[Step 2/3] Initiating booking call...");
        const call = await vapi.calls.create({
            phoneNumberId: VAPI_PHONE_NUMBER_ID,
            customer: {
                number: PROVIDER_PHONE,
                name: PROVIDER_NAME
            },
            assistant: assistantConfig
        });

        console.log(`[VAPI Booking] Call initiated successfully!`);
        console.log(`[VAPI Booking] Call ID: ${call.id}`);
        console.log(`[VAPI Booking] Status: ${call.status}`);

        // Step 3: Poll for completion
        console.log("\n[Step 3/3] Waiting for call to complete...");
        let status = call.status;
        let attempts = 0;
        const maxAttempts = 60; // 5 minutes max

        while (['queued', 'ringing', 'in-progress'].includes(status) && attempts < maxAttempts) {
            await new Promise(r => setTimeout(r, 5000));
            attempts++;

            try {
                const updatedCall = await vapi.calls.get(call.id);
                status = updatedCall.status;
                console.log(`[VAPI Booking] Status check ${attempts}/${maxAttempts}: ${status}`);

                if (status === 'ended') {
                    console.log("\n[VAPI Booking] Call completed!");

                    // Extract booking-specific data from analysis
                    const structuredData = updatedCall.analysis?.structuredData || {};

                    const result = {
                        status: 'completed',
                        callId: call.id,
                        duration: updatedCall.durationMinutes || 0,
                        endedReason: updatedCall.endedReason || "unknown",
                        booking_confirmed: structuredData.booking_confirmed || false,
                        confirmed_date: structuredData.confirmed_date || null,
                        confirmed_time: structuredData.confirmed_time || null,
                        confirmation_number: structuredData.confirmation_number || null,
                        call_outcome: structuredData.call_outcome || "unknown",
                        special_instructions: structuredData.special_instructions || null,
                        booking_failure_reason: structuredData.booking_failure_reason || null,
                        transcript: updatedCall.artifact?.transcript || updatedCall.transcript || "No transcript",
                        analysis: {
                            summary: updatedCall.analysis?.summary || "No summary",
                            structuredData: structuredData,
                            successEvaluation: updatedCall.analysis?.successEvaluation || "Not evaluated"
                        },
                        provider: {
                            name: PROVIDER_NAME,
                            phone: PROVIDER_PHONE
                        },
                        appointment: {
                            service: SERVICE_DESCRIPTION,
                            location: LOCATION,
                            customer: CUSTOMER_NAME,
                            customerPhone: CUSTOMER_PHONE,
                            preferredDate: PREFERRED_DATE,
                            preferredTime: PREFERRED_TIME
                        }
                    };

                    console.log("\n" + "=".repeat(60));
                    console.log("[VAPI Booking] FINAL RESULT:");
                    console.log("=".repeat(60));
                    console.log(JSON.stringify(result, null, 2));
                    console.log("\n[KESTRA_OUTPUT]");
                    console.log(JSON.stringify(result));
                    return;
                }
            } catch (pollError) {
                console.error(`[VAPI Booking] Poll error (attempt ${attempts}):`, pollError.message);
            }
        }

        // Timeout handling
        const timeoutResult = {
            status: 'timeout',
            callId: call.id,
            lastKnownStatus: status,
            message: `Booking call did not complete within ${maxAttempts * 5} seconds`,
            booking_confirmed: false,
            call_outcome: 'timeout',
            provider: { name: PROVIDER_NAME, phone: PROVIDER_PHONE }
        };

        console.log("\n[VAPI Booking] Call timed out:");
        console.log(JSON.stringify(timeoutResult, null, 2));
        console.log("\n[KESTRA_OUTPUT]");
        console.log(JSON.stringify(timeoutResult));

    } catch (error) {
        const errorResult = {
            status: 'error',
            error: error.message,
            booking_confirmed: false,
            call_outcome: 'error',
            provider: { name: PROVIDER_NAME, phone: PROVIDER_PHONE }
        };

        console.error("\n[VAPI Booking] Error:", error.message);
        console.log("\n[KESTRA_OUTPUT]");
        console.log(JSON.stringify(errorResult));
        process.exit(1);
    }
}

main();
