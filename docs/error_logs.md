# frontend logs
content.js:2 DEBUG: injectProviderAPI - Wallet Standard API not available
r.onload @ content.js:2
forward-logs-shared.ts:95 Download the React DevTools for a better development experience: https://react.dev/link/react-devtools
forward-logs-shared.ts:95 [HMR] connected
forward-logs-shared.ts:95 Detected `scroll-behavior: smooth` on the `<html>` element. To disable smooth scrolling during route transitions, add `data-scroll-behavior="smooth"` to your <html> element. Learn more: https://nextjs.org/docs/messages/missing-data-scroll-behavior
warn @ forward-logs-shared.ts:95
page.tsx:183 [Concierge] Persisted 3 providers to database with UUIDs
page.tsx:242 [Concierge] Starting calls to 2 providers (LIVE_CALL_ENABLED=true, ADMIN_TEST_MODE=true)
page.tsx:247 [Concierge] ADMIN TEST MODE: Will call 2 provider(s) using test phones: +13106992541, +18032374468
page.tsx:250 [Concierge] Phone mapping: NorthStar Financial & Retirement Planning, LLC → +13106992541, TruNorth Advisors | Retirement Wealth Management Group → +18032374468
page.tsx:256 [Concierge] Generating context-aware prompts with Gemini...
page.tsx:269 [Concierge] Generated professional prompts for financial advisor
page.tsx:334 [Concierge] Starting BATCH call to 2 providers via /api/v1/providers/batch-call... (TEST MODE)
page.tsx:337 [Concierge] Providers: NorthStar Financial & Retirement Planning, LLC @ +13106992541, TruNorth Advisors | Retirement Wealth Management Group @ +18032374468
page.tsx:407 [Concierge] Batch call initiated for 2 providers - UI will update via real-time subscriptions
page.tsx:433 [Concierge] TEST MODE: Skipped 1 provider(s) due to test phone limit (2 test phones available)
page.tsx:446 [Concierge] - Fiduciary Organization, LLC (Woodmark Advisors) (Rating: 5) - Skipped
page.tsx:485 [Concierge] Calls initiated, transitioning to ANALYZING. Real-time will handle results.
page.tsx:709 Request status is ANALYZING, checking for recommendations...
page.tsx:496 [Concierge] Request 31a10ae9-23ad-4cde-9cd0-4371c97aaf48 now in ANALYZING state. Waiting for calls to complete via real-time.
page.tsx:709 Request status is ANALYZING, checking for recommendations...
page.tsx:222 Call progress: 0/2 calls completed (3 total providers)
page.tsx:230 2 call(s) still in progress, waiting...
page.tsx:222 Call progress: 0/2 calls completed (3 total providers)
page.tsx:230 2 call(s) still in progress, waiting...
page.tsx:375 [Concierge] Calls accepted (execution: 9a093fe1-1e4b-4de0-a65e-32fde0dd862d). Providers queued: 2
page.tsx:585 Interaction log added: {schema: 'public', table: 'interaction_logs', commit_timestamp: '2025-12-12T01:33:04.001Z', eventType: 'INSERT', new: {…}, …}
page.tsx:709 Request status is ANALYZING, checking for recommendations...
page.tsx:222 Call progress: 0/2 calls completed (3 total providers)
page.tsx:230 2 call(s) still in progress, waiting...
page.tsx:725 [Recommendations] Fallback poll triggered after 5s
page.tsx:222 Call progress: 0/2 calls completed (3 total providers)
page.tsx:230 2 call(s) still in progress, waiting...


# backend logs

🚀 API server running at http://localhost:8000
[01:01:39 UTC] INFO: ✓ Supabase database connection verified
[01:01:39 UTC] INFO: ✓ Supabase plugin initialized successfully
[01:01:39 UTC] INFO: Google Places API available
    service: "google_places"
[01:01:39 UTC] INFO: Webhook URL configured - using hybrid mode
    webhookUrl: "https://2ce8048103bc.ngrok-free.app/api/v1/vapi/webhook"
[01:01:39 UTC] INFO: Webhook URL configured - using hybrid mode
    webhookUrl: "https://2ce8048103bc.ngrok-free.app/api/v1/vapi/webhook"
[01:01:39 UTC] INFO: WebhookCacheService initialized
    ttl: 30
[01:01:39 UTC] INFO: VAPI API client initialized for background enrichment
[01:01:39 UTC] INFO: CallResultService initialized for DB persistence
[01:01:39 UTC] WARN: Twilio credentials not configured - SMS sending disabled
[01:01:39 UTC] INFO: [UserNotificationService] Initialized with VAPI
[01:01:39 UTC] INFO: Server listening at http://127.0.0.1:8000
[01:01:39 UTC] INFO: Server listening at http://172.26.0.169:8000
[01:01:39 UTC] INFO: Server listening at http://169.254.55.11:8000
^C8:24:56 PM [tsx] Previous process hasn't exited yet. Force killing...
dave@M3Max api % npm run dev

> api@0.1.0 dev
> tsx watch src/index.ts

🚀 API server running at http://localhost:8000
[01:24:59 UTC] INFO: ✓ Supabase database connection verified
[01:24:59 UTC] INFO: ✓ Supabase plugin initialized successfully
[01:24:59 UTC] INFO: Google Places API available
    service: "google_places"
[01:24:59 UTC] INFO: Webhook URL configured - using hybrid mode
    webhookUrl: "https://2ce8048103bc.ngrok-free.app/api/v1/vapi/webhook"
[01:24:59 UTC] INFO: Webhook URL configured - using hybrid mode
    webhookUrl: "https://2ce8048103bc.ngrok-free.app/api/v1/vapi/webhook"
[01:24:59 UTC] INFO: WebhookCacheService initialized
    ttl: 30
[01:24:59 UTC] INFO: VAPI API client initialized for background enrichment
[01:24:59 UTC] INFO: CallResultService initialized for DB persistence
[01:24:59 UTC] WARN: Twilio credentials not configured - SMS sending disabled
[01:24:59 UTC] INFO: [UserNotificationService] Initialized with VAPI
[01:24:59 UTC] INFO: Server listening at http://127.0.0.1:8000
[01:24:59 UTC] INFO: Server listening at http://172.26.0.169:8000
[01:24:59 UTC] INFO: Server listening at http://169.254.55.11:8000
DEBUG Places API raw response (first 3): [
  {
    "id": "ChIJ33O8bV-l-IgRh8NotL6VUXk",
    "formattedAddress": "6208 Garners Ferry Rd Suite A, Columbia, SC 29209, USA",
    "location": {
      "latitude": 33.981802099999996,
      "longitude": -80.963411
    },
    "rating": 5,
    "googleMapsUri": "https://maps.google.com/?cid=8741932998005932935&g_mp=Cidnb29nbGUubWFwcy5wbGFjZXMudjEuUGxhY2VzLlNlYXJjaFRleHQQAhgEIAA",
    "businessStatus": "OPERATIONAL",
    "userRatingCount": 67,
    "displayName": {
      "text": "Capital City Financial Partners",
      "languageCode": "en"
    }
  },
  {
    "id": "ChIJE0qUAWSl-IgROfEsj5QJCRY",
    "formattedAddress": "Bank of America Plaza, 1901 Main St #1475, Columbia, SC 29201, USA",
    "location": {
      "latitude": 34.010813,
      "longitude": -81.03831699999999
    },
    "rating": 5,
    "googleMapsUri": "https://maps.google.com/?cid=1587810877286707513&g_mp=Cidnb29nbGUubWFwcy5wbGFjZXMudjEuUGxhY2VzLlNlYXJjaFRleHQQAhgEIAA",
    "businessStatus": "OPERATIONAL",
    "userRatingCount": 59,
    "displayName": {
      "text": "HG Wealth Advisors, LLC",
      "languageCode": "en"
    }
  },
  {
    "id": "ChIJ2cKROxuj-IgRG7DLqkdK4dQ",
    "formattedAddress": "2000 Center Point Rd, Columbia, SC 29210, USA",
    "location": {
      "latitude": 34.0415817,
      "longitude": -81.1122535
    },
    "rating": 5,
    "googleMapsUri": "https://maps.google.com/?cid=15339623477469229083&g_mp=Cidnb29nbGUubWFwcy5wbGFjZXMudjEuUGxhY2VzLlNlYXJjaFRleHQQAhgEIAA",
    "businessStatus": "OPERATIONAL",
    "userRatingCount": 15,
    "displayName": {
      "text": "Cornerstone Financial Management",
      "languageCode": "en"
    }
  }
]
DEBUG Ratings found: 20/20 places have ratings
DEBUG Filter: minRating=4.5, providers before filter: [
  { name: 'Capital City Financi', rating: 5 },
  { name: 'HG Wealth Advisors, ', rating: 5 },
  { name: 'Cornerstone Financia', rating: 5 },
  { name: 'Cornerstone Wealth A', rating: 5 },
  { name: 'Milestone Wealth Adv', rating: 5 },
  { name: 'Capital Wealth Group', rating: 5 },
  { name: 'Limehouse Financial', rating: 4.9 },
  { name: 'Brightworks Financia', rating: 5 },
  { name: 'TruNorth Advisors | ', rating: 4.9 },
  { name: 'Jamie Danford, CFP -', rating: 5 },
  { name: 'First Command Financ', rating: 5 },
  { name: 'Fiduciary Organizati', rating: 5 },
  { name: 'EFinancial Advisors', rating: 5 },
  { name: 'DaVinci Financial De', rating: 5 },
  { name: 'Cornerstone Financia', rating: 4.8 },
  { name: 'Dyadic Financial Man', rating: 5 },
  { name: 'NorthStar Financial ', rating: 4.9 },
  { name: 'PAG Advisory Group', rating: 5 },
  { name: 'Creative Financial S', rating: 5 },
  { name: 'CCM Investment Advis', rating: 5 }
]
DEBUG Filter result: 20 -> 20 providers after rating filter
Enrichment: 3 with placeId, 0 without
Enriching 3 providers...
Enriching 3 providers in batches of 5...
[01:32:59 UTC] INFO: incoming request
    reqId: "req-1"
    req: {
      "method": "POST",
      "url": "/api/v1/workflows/research",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 58939
    }
[01:32:59 UTC] INFO: Starting provider research
    service: "financial advisor"
    location: "columbia sc"
    serviceRequestId: "31a10ae9-23ad-4cde-9cd0-4371c97aaf48"
[01:32:59 UTC] INFO: Using Direct Gemini for research
    method: "direct_gemini"
[01:32:59 UTC] INFO: Starting provider research
    service: "financial advisor"
    location: "columbia sc"
    hasPlacesAPI: true
[01:32:59 UTC] INFO: Searching with Places API
    service: "financial advisor"
    location: "columbia sc"
    minRating: 4.5
[01:33:00 UTC] INFO: Places API search completed
    totalFound: 20
[01:33:00 UTC] INFO: Places API results filtered and sorted
    totalFound: 20
    afterFilters: 3
    returned: 3
Successfully enriched 3 providers
Phone filter: 3 with phone, 0 without
Enrichment complete: {
  totalInput: 3,
  enrichedCount: 3,
  withPhoneCount: 3,
  skippedNoPlaceId: 0,
  durationMs: 208
}
[01:33:00 UTC] INFO: request completed
    reqId: "req-1"
    res: {
      "statusCode": 200
    }
    responseTime: 781.142666041851
[01:33:00 UTC] INFO: incoming request
    reqId: "req-2"
    req: {
      "method": "POST",
      "url": "/api/v1/gemini/analyze-research-prompt",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 58950
    }
[01:33:03 UTC] INFO: request completed
    reqId: "req-2"
    res: {
      "statusCode": 200
    }
    responseTime: 2931.7346670031548
[01:33:03 UTC] INFO: incoming request
    reqId: "req-3"
    req: {
      "method": "POST",
      "url": "/api/v1/providers/batch-call-async",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 58972
    }
[01:33:03 UTC] INFO: Starting async batch call
    executionId: "9a093fe1-1e4b-4de0-a65e-32fde0dd862d"
    providerCount: 2
[01:33:04 UTC] INFO: request completed
    reqId: "req-3"
    res: {
      "statusCode": 202
    }
    responseTime: 473.365208029747
[01:33:04 UTC] INFO: Background batch call processing started
    executionId: "9a093fe1-1e4b-4de0-a65e-32fde0dd862d"
[01:33:04 UTC] INFO: Initiating batch provider calls (single routing decision)
    method: "kestra"
    providerCount: 2
    maxConcurrent: 5
[01:33:04 UTC] INFO: Triggering Kestra batch contact flow
    providerCount: 2
    flowId: "contact_providers"
    maxConcurrent: 5
[01:33:04 UTC] INFO: Kestra concurrent execution triggered
    executionId: "4uuCfBWrFbWSiZsZkCx3ai"
    namespace: "ai_concierge"
    flowId: "contact_providers"
[01:33:09 UTC] ERROR: Kestra batch execution failed
    state: "FAILED"
    executionId: "4uuCfBWrFbWSiZsZkCx3ai"
[01:33:09 UTC] INFO: Batch provider calls completed via Kestra
    stats: {
      "total": 2,
      "completed": 0,
      "failed": 2,
      "timeout": 0,
      "noAnswer": 0,
      "voicemail": 0,
      "duration": 0,
      "averageCallDuration": 0
    }
    method: "kestra"
[01:33:09 UTC] INFO: Background batch call processing completed
    executionId: "9a093fe1-1e4b-4de0-a65e-32fde0dd862d"


# kestra logs
Execution failed! Last error was: Cannot invoke “io.kestra.core.models.tasks.runners.TaskRunner.getType()” because the return value of “io.kestra.plugin.scripts.exec.AbstractExecScript.getTaskRunner()” is null

State
Namespace
ai_concierge
Flow
contact_providers
Revision
5
Labels
system.correlationId:4uuCfBWrFbWSiZsZkCx3ai
Created date
2 minutes ago
Updated date
2 minutes ago
Duration
0.99s
Steps
4
Attempt
1
Original creation date
2 minutes ago
Schedule date

