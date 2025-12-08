const { google } = require('googleapis');

// Inputs
const PROVIDER_NAME = process.argv[2] || "Service Provider";
const APPOINTMENT_TIME = process.argv[3]; // ISO string expected

if (!process.env.GOOGLE_SERVICE_ACCOUNT) {
    console.error("Missing GOOGLE_SERVICE_ACCOUNT env var");
    process.exit(1);
}

// Parse Service Account
let credentials;
try {
    credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
} catch (e) {
    console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT JSON", e);
    process.exit(1);
}

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

async function main() {
    console.log(`Scheduling appointment with ${PROVIDER_NAME} at ${APPOINTMENT_TIME}...`);

    const auth = new google.auth.JWT(
        credentials.client_email,
        null,
        credentials.private_key,
        SCOPES
    );

    const calendar = google.calendar({ version: 'v3', auth });

    const startTime = new Date(APPOINTMENT_TIME);
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour default

    const event = {
        summary: `Concierge: ${PROVIDER_NAME}`,
        description: `Automated booking by AI Concierge for ${PROVIDER_NAME}.`,
        start: {
            dateTime: startTime.toISOString(),
            timeZone: 'America/New_York', // Defaulting for hackathon
        },
        end: {
            dateTime: endTime.toISOString(),
            timeZone: 'America/New_York',
        },
    };

    try {
        const res = await calendar.events.insert({
            calendarId: 'primary', // Or specific ID
            resource: event,
        });

        console.log(JSON.stringify({
            status: 'confirmed',
            link: res.data.htmlLink,
            eventId: res.data.id
        }));

    } catch (error) {
        console.error("Calendar API Error:", error);
        // Fallback for Hackathon if API fails (e.g. unverified app):
        console.log(JSON.stringify({
            status: 'simulated',
            reason: 'API_ERROR_FALLBACK',
            details: error.message
        }));
    }
}

main();
