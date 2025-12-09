const { VapiClient } = require('@vapi-ai/server-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Inputs
const PHONE_NUMBER = process.argv[2];
const CUSTOMER_SERVICE_NEEDED = process.argv[3] || "plumbing";
const VAPI_PRIVATE_KEY = process.env.VAPI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!PHONE_NUMBER || !VAPI_PRIVATE_KEY || !GEMINI_API_KEY) {
    console.error("Usage: node call-provider.js <phone> <service>");
    console.error("Env vars needed: VAPI_API_KEY, GEMINI_API_KEY");
    process.exit(1);
}

const vapi = new VapiClient({ token: VAPI_PRIVATE_KEY });
const gemini = new GoogleGenerativeAI(GEMINI_API_KEY);

async function main() {
    console.log(`Initializing call to ${PHONE_NUMBER} for ${CUSTOMER_SERVICE_NEEDED}...`);

    // 1. Create Assistant dynamically using Gemini for the system prompt
    // In a real hackathon, we might statically define this ID, but dynamic is cooler for the prize.
    // For safety/speed, let's use a "transient" assistant configuration in the call payload if supported,
    // or just create one. VAPI supports 'assistant' object in call creation.

    const assistantConfig = {
        name: `Concierge Agent - ${CUSTOMER_SERVICE_NEEDED}`,
        voice: {
            provider: "playht",
            voiceId: "jennifer"
        },
        model: {
            provider: "google",
            model: "gemini-2.5-flash", // The exact model name VAPI expects might vary, checking docs fallback
            messages: [
                {
                    role: "system",
                    content: `You are an AI Concierge calling a service provider. 
          Your goal is to find a ${CUSTOMER_SERVICE_NEEDED} for a client in Greenville, SC.
          
          Ask:
          1. Are you available within the next 2 days?
          2. What is your estimated rate for a standard job?
          3. Are you licensed and insured?
          
          Be professional. If they ask, say you are a digital assistant for a local homeowner.
          Terminatie the call politely once you have the answers or if they refuse.`
                }
            ]
        },
        transcriber: {
            provider: "deepgram",
            language: "en"
        },
        endCallFunctionEnabled: true // Allow AI to decide when to hang up
    };

    try {
        // 2. Initiate Call
        console.log("Sending call request to VAPI...");
        const call = await vapi.calls.create({
            phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID, // Must be in env
            customer: {
                number: PHONE_NUMBER,
            },
            assistant: assistantConfig
        });

        console.log(`Call initiated. ID: ${call.id}`);

        // 3. Poll for completion (Hackathon style - simple polling)
        // Production would use Webhook, but Kestra Script needs to "wait" effectively or return the ID.
        // For this script, let's wait up to 2 minutes for status.

        let status = call.status;
        let attempts = 0;
        while (['queued', 'ringing', 'in-progress'].includes(status) && attempts < 24) { // 2 mins max
            await new Promise(r => setTimeout(r, 5000));
            const updatedCall = await vapi.calls.get(call.id);
            status = updatedCall.status;
            console.log(`Call status: ${status}`);
            attempts++;

            if (status === 'ended') {
                const transcript = updatedCall.transcript || updatedCall.summary || "No transcript available";
                const analysis = updatedCall.analysis || {};

                // Return JSON for Kestra to parse
                console.log(JSON.stringify({
                    status: 'completed',
                    callId: call.id,
                    transcript: transcript,
                    cost: updatedCall.cost,
                    duration: updatedCall.durationMinutes
                }));
                return;
            }
        }

        if (status !== 'ended') {
            console.log(JSON.stringify({ status: 'timeout', callId: call.id }));
        }

    } catch (error) {
        console.error("VAPI Call Error:", error);
        process.exit(1);
    }
}

main();
