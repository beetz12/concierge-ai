/**
 * Send Notification Script
 *
 * This script sends SMS notifications to users via Twilio
 * Used by Kestra notify_user workflow
 *
 * Usage: node send-notification.js <user_phone> <user_name> <request_url> '<providers_json>'
 */

const twilio = require('twilio');

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

const USER_PHONE = process.argv[2];
const USER_NAME = process.argv[3] || "Customer";
const REQUEST_URL = process.argv[4] || "";
const PROVIDERS_JSON = process.argv[5] || "[]";

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// Validate required inputs
if (!USER_PHONE) {
    console.error("Error: User phone number is required");
    console.error("Usage: node send-notification.js <user_phone> <user_name> <request_url> '<providers_json>'");
    process.exit(1);
}

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_PHONE_NUMBER) {
    console.error("Error: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER environment variables are required");
    process.exit(1);
}

// Initialize Twilio client
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// ============================================================================
// MESSAGE FORMATTING
// ============================================================================

/**
 * Format the SMS message with top 3 provider recommendations
 */
function formatSmsMessage(userName, providers, requestUrl) {
    let parsedProviders;
    try {
        parsedProviders = typeof providers === 'string' ? JSON.parse(providers) : providers;
    } catch (e) {
        console.error("[Parse] Failed to parse providers JSON:", e.message);
        parsedProviders = [];
    }

    let message = `Hi ${userName}! AI Concierge found your top providers:\n\n`;

    if (parsedProviders.length === 0) {
        message += "No providers matched your criteria.\n";
    } else {
        parsedProviders.slice(0, 3).forEach((provider, index) => {
            const name = provider.name || provider.providerName || "Unknown";
            const availability = provider.earliestAvailability || provider.availability || "Contact for availability";
            message += `${index + 1}. ${name} - ${availability}\n`;
        });
    }

    message += `\nReply 1, 2, or 3 to book`;

    if (requestUrl) {
        message += `, or visit:\n${requestUrl}`;
    }

    return message;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
    console.log("=".repeat(60));
    console.log(`[SMS] Sending notification to ${USER_NAME}`);
    console.log(`[SMS] Phone: ${USER_PHONE}`);
    console.log(`[SMS] Request URL: ${REQUEST_URL || "(none)"}`);
    console.log("=".repeat(60));

    try {
        // Format the message
        const messageBody = formatSmsMessage(USER_NAME, PROVIDERS_JSON, REQUEST_URL);
        console.log("\n[SMS] Message content:");
        console.log("-".repeat(40));
        console.log(messageBody);
        console.log("-".repeat(40));

        // Send the SMS
        console.log("\n[SMS] Sending via Twilio...");
        const message = await client.messages.create({
            body: messageBody,
            to: USER_PHONE,
            from: TWILIO_PHONE_NUMBER
        });

        console.log(`[SMS] Message sent successfully!`);
        console.log(`[SMS] Message SID: ${message.sid}`);
        console.log(`[SMS] Status: ${message.status}`);

        const result = {
            status: 'sent',
            messageSid: message.sid,
            deliveredTo: USER_PHONE,
            messageStatus: message.status,
            dateSent: message.dateCreated,
            userName: USER_NAME
        };

        console.log("\n" + "=".repeat(60));
        console.log("[SMS] FINAL RESULT:");
        console.log("=".repeat(60));
        console.log(JSON.stringify(result, null, 2));
        console.log("\n[KESTRA_OUTPUT]");
        console.log(JSON.stringify(result));

    } catch (error) {
        const errorResult = {
            status: 'error',
            error: error.message,
            code: error.code || 'UNKNOWN',
            moreInfo: error.moreInfo || null,
            deliveredTo: USER_PHONE
        };

        console.error("\n[SMS] Error:", error.message);
        if (error.code) {
            console.error(`[SMS] Twilio Error Code: ${error.code}`);
        }
        if (error.moreInfo) {
            console.error(`[SMS] More info: ${error.moreInfo}`);
        }

        console.log("\n[KESTRA_OUTPUT]");
        console.log(JSON.stringify(errorResult));
        process.exit(1);
    }
}

main();
