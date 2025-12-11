🚀 API server running at http://localhost:8000
[19:32:01 UTC] INFO: ✓ Supabase database connection verified
[19:32:01 UTC] INFO: ✓ Supabase plugin initialized successfully
[19:32:01 UTC] INFO: Google Places API available
    service: "google_places"
[19:32:01 UTC] INFO: Webhook URL configured - using hybrid mode
    webhookUrl: "https://2ce8048103bc.ngrok-free.app/api/v1/vapi/webhook"
[19:32:01 UTC] INFO: Webhook URL configured - using hybrid mode
    webhookUrl: "https://2ce8048103bc.ngrok-free.app/api/v1/vapi/webhook"
[19:32:01 UTC] INFO: WebhookCacheService initialized
    ttl: 30
[19:32:01 UTC] INFO: VAPI API client initialized for background enrichment
[19:32:01 UTC] INFO: CallResultService initialized for DB persistence
[19:32:01 UTC] INFO: Server listening at http://127.0.0.1:8000
[19:32:01 UTC] INFO: Server listening at http://192.168.68.63:8000
Enrichment: 10 with placeId, 0 without
Enriching 10 providers...
Enriching 10 providers in batches of 5...
[19:36:06 UTC] INFO: incoming request
    reqId: "req-1"
    req: {
      "method": "POST",
      "url": "/api/v1/workflows/research",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 52985
    }
[19:36:06 UTC] INFO: Starting provider research
    service: "auto mechanic"
    location: "greenville sc"
    serviceRequestId: "ed435943-66c9-4888-8265-283a7e63c5a2"
[19:36:06 UTC] INFO: Using Direct Gemini for research
    method: "direct_gemini"
[19:36:06 UTC] INFO: Starting provider research
    service: "auto mechanic"
    location: "greenville sc"
    hasPlacesAPI: true
[19:36:06 UTC] INFO: Searching with Places API
    service: "auto mechanic"
    location: "greenville sc"
    minRating: 4.5
[19:36:07 UTC] INFO: Places API search completed
    totalFound: 20
[19:36:07 UTC] INFO: Places API results filtered and sorted
    totalFound: 20
    afterFilters: 18
    returned: 10
Successfully enriched 10 providers
Phone filter: 10 with phone, 0 without
Enrichment complete: {
  totalInput: 10,
  enrichedCount: 10,
  withPhoneCount: 10,
  skippedNoPlaceId: 0,
  durationMs: 642
}
[19:36:08 UTC] INFO: request completed
    reqId: "req-1"
    res: {
      "statusCode": 200
    }
    responseTime: 1456.5108340084553
[19:36:08 UTC] INFO: incoming request
    reqId: "req-2"
    req: {
      "method": "POST",
      "url": "/api/v1/gemini/analyze-research-prompt",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 53004
    }
[19:36:12 UTC] INFO: request completed
    reqId: "req-2"
    res: {
      "statusCode": 200
    }
    responseTime: 3651.07166698575
[19:36:14 UTC] INFO: incoming request
    reqId: "req-3"
    req: {
      "method": "POST",
      "url": "/api/v1/gemini/select-best-provider",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 53059
    }
[19:36:16 UTC] INFO: request completed
    reqId: "req-3"
    res: {
      "statusCode": 200
    }
    responseTime: 1475.5855419933796
[19:46:40 UTC] INFO: incoming request
    reqId: "req-4"
    req: {
      "method": "GET",
      "url": "/health",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 56818
    }
[19:46:40 UTC] INFO: request completed
    reqId: "req-4"
    res: {
      "statusCode": 200
    }
    responseTime: 1.1865839958190918
[19:46:42 UTC] INFO: incoming request
    reqId: "req-5"
    req: {
      "method": "GET",
      "url": "/health",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 56837
    }
[19:46:42 UTC] INFO: request completed
    reqId: "req-5"
    res: {
      "statusCode": 200
    }
    responseTime: 0.4079580008983612
[19:46:53 UTC] INFO: incoming request
    reqId: "req-6"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/webhook",
      "host": "2ce8048103bc.ngrok-free.app",
      "remoteAddress": "127.0.0.1",
      "remotePort": 56905
    }
[19:46:53 UTC] INFO: Route GET:/api/v1/vapi/webhook not found
    reqId: "req-6"
[19:46:53 UTC] INFO: request completed
    reqId: "req-6"
    res: {
      "statusCode": 404
    }
    responseTime: 0.41987499594688416
[19:46:55 UTC] INFO: incoming request
    reqId: "req-7"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/webhook",
      "host": "2ce8048103bc.ngrok-free.app",
      "remoteAddress": "127.0.0.1",
      "remotePort": 56919
    }
[19:46:55 UTC] INFO: Route GET:/api/v1/vapi/webhook not found
    reqId: "req-7"
[19:46:55 UTC] INFO: request completed
    reqId: "req-7"
    res: {
      "statusCode": 404
    }
    responseTime: 0.2749580144882202
[19:47:20 UTC] INFO: incoming request
    reqId: "req-8"
    req: {
      "method": "POST",
      "url": "/api/v1/workflows/research",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 57052
    }
[19:47:20 UTC] INFO: Starting provider research
    service: "plumber"
    location: "Greenville SC"
[19:47:20 UTC] INFO: Using Direct Gemini for research
    method: "direct_gemini"
[19:47:20 UTC] INFO: Starting provider research
    service: "plumber"
    location: "Greenville SC"
    hasPlacesAPI: true
[19:47:20 UTC] INFO: Searching with Places API
    service: "plumber"
    location: "Greenville SC"
    minRating: 4.5
Enrichment: 10 with placeId, 0 without
Enriching 10 providers...
Enriching 10 providers in batches of 5...
[19:47:21 UTC] INFO: Places API search completed
    totalFound: 20
[19:47:21 UTC] INFO: Places API results filtered and sorted
    totalFound: 20
    afterFilters: 19
    returned: 10
Successfully enriched 10 providers
Phone filter: 10 with phone, 0 without
Enrichment complete: {
  totalInput: 10,
  enrichedCount: 10,
  withPhoneCount: 10,
  skippedNoPlaceId: 0,
  durationMs: 626
}
[19:47:21 UTC] INFO: request completed
    reqId: "req-8"
    res: {
      "statusCode": 200
    }
    responseTime: 1361.167250007391
[19:56:46 UTC] INFO: incoming request
    reqId: "req-9"
    req: {
      "method": "POST",
      "url": "/api/v1/workflows/research",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 60227
    }
[19:56:46 UTC] INFO: Starting provider research
    service: "car mechanic"
    location: "columbia sc"
    serviceRequestId: "5e1f9e4e-fa15-4326-8f09-ce4b1888adbd"
[19:56:46 UTC] INFO: Using Direct Gemini for research
    method: "direct_gemini"
[19:56:46 UTC] INFO: Starting provider research
    service: "car mechanic"
    location: "columbia sc"
    hasPlacesAPI: true
[19:56:46 UTC] INFO: Searching with Places API
    service: "car mechanic"
    location: "columbia sc"
    minRating: 4.5
[19:56:47 UTC] INFO: Places API search completed
    totalFound: 20
[19:56:47 UTC] INFO: Places API results filtered and sorted
    totalFound: 20
    afterFilters: 0
    returned: 0
[19:56:47 UTC] WARN: Places API returned no results, falling back to Maps grounding
    request: {
      "service": "car mechanic",
      "location": "columbia sc",
      "daysNeeded": 2,
      "minRating": 4.5,
      "maxDistance": 25,
      "requirePhone": true,
      "maxResults": 10,
      "minEnrichedResults": 3,
      "serviceRequestId": "5e1f9e4e-fa15-4326-8f09-ce4b1888adbd"
    }
Enrichment: 0 with placeId, 10 without
No providers with placeId to enrich
[19:57:02 UTC] INFO: request completed
    reqId: "req-9"
    res: {
      "statusCode": 200
    }
    responseTime: 15891.272916018963
[19:57:03 UTC] INFO: incoming request
    reqId: "req-a"
    req: {
      "method": "POST",
      "url": "/api/v1/gemini/analyze-research-prompt",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 60344
    }
[19:57:07 UTC] INFO: request completed
    reqId: "req-a"
    res: {
      "statusCode": 200
    }
    responseTime: 3915.5630829930305
[19:57:11 UTC] INFO: incoming request
    reqId: "req-b"
    req: {
      "method": "POST",
      "url": "/api/v1/gemini/select-best-provider",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 60386
    }
[19:57:14 UTC] INFO: request completed
    reqId: "req-b"
    res: {
      "statusCode": 200
    }
    responseTime: 3074.211834013462
