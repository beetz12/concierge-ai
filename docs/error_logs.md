[11:25:49 UTC] INFO: Batch provider calls completed
    total: 2
    completed: 2
    failed: 0
    timeout: 0
    noAnswer: 0
    voicemail: 0
    duration: 91902
    averageCallDuration: 0
    errorCount: 0
    durationSeconds: "91.90"
[11:25:49 UTC] INFO: Batch provider calls completed via Direct VAPI
    stats: {
      "total": 2,
      "completed": 2,
      "failed": 0,
      "timeout": 0,
      "noAnswer": 0,
      "voicemail": 0,
      "duration": 91902,
      "averageCallDuration": 0
    }
    method: "direct_vapi"
[11:25:49 UTC] INFO: Background batch call processing completed
    executionId: "a7ce1d08-8841-4bfe-b1e9-9f02c4921174"
    success: true
    resultsInDatabase: true
[11:25:49 UTC] INFO: Kestra batch completed with results in database - waiting for all provider results
    executionId: "a7ce1d08-8841-4bfe-b1e9-9f02c4921174"
    serviceRequestId: "48af4388-9a50-4ec8-804b-95582e51c58d"
[11:25:49 UTC] INFO: All provider calls completed - generating recommendations
    executionId: "a7ce1d08-8841-4bfe-b1e9-9f02c4921174"
    completedCount: 2
    totalProviders: 10
[11:25:49 UTC] INFO: Status updated to ANALYZING after confirming all provider calls completed
    executionId: "a7ce1d08-8841-4bfe-b1e9-9f02c4921174"
    serviceRequestId: "48af4388-9a50-4ec8-804b-95582e51c58d"
[Filter] Excluding Dipple Plumbing, Electrical, Heating & Air: disqualified - Mailbox full, unable to leave a message or discuss service.
[11:25:49 UTC] INFO: Generating recommendations
    kestraEnabled: false
    kestraHealthy: false
    callResultsCount: 2
[11:25:50 UTC] INFO: Direct Gemini recommendations generated successfully
    recommendationCount: 1
[11:25:50 UTC] INFO: Recommendations stored in database and status updated to RECOMMENDED
    executionId: "a7ce1d08-8841-4bfe-b1e9-9f02c4921174"
    serviceRequestId: "48af4388-9a50-4ec8-804b-95582e51c58d"
    recommendationCount: 1
[11:25:51 UTC] INFO: [UserNotificationService] Initialized with VAPI
[11:25:51 UTC] INFO: [TriggerNotification] Sending VAPI phone notification
    userPhone: "+13106992541"
    serviceRequestId: "48af4388-9a50-4ec8-804b-95582e51c58d"
    providerCount: 1
[11:25:51 UTC] INFO: [UserNotificationService] Initiating user notification call
    userPhone: "+13106992541"
    serviceRequestId: "48af4388-9a50-4ec8-804b-95582e51c58d"
[11:25:51 UTC] ERROR: [UserNotificationService] Failed to call user
    error: {
      "statusCode": 400,
      "body": {
        "message": [
          "assistant.model.each value in tools.property description should not exist"
        ],
        "error": "Bad Request",
        "statusCode": 400
      },
      "rawResponse": {
        "headers": {},
        "redirected": false,
        "status": 400,
        "statusText": "Bad Request",
        "type": "basic",
        "url": "https://api.vapi.ai/call"
      }
    }
[11:25:51 UTC] WARN: [TriggerNotification] VAPI call failed, falling back to SMS
    serviceRequestId: "48af4388-9a50-4ec8-804b-95582e51c58d"
    error: "Status code: 400\nBody: {\n  \"message\": [\n    \"assistant.model.each value in tools.property description should not exist\"\n  ],\n  \"error\": \"Bad Request\",\n  \"statusCode\": 400\n}"
[11:25:51 UTC] INFO: DirectTwilioClient initialized
[11:25:51 UTC] INFO: [TriggerNotification] Sending SMS notification
    userPhone: "+13106992541"
    serviceRequestId: "48af4388-9a50-4ec8-804b-95582e51c58d"
    providerCount: 1
[11:25:51 UTC] INFO: Sending SMS notification via Twilio
    to: "+13106992541"
    userName: "David"
    providerCount: 1
[11:25:51 UTC] INFO: SMS sent successfully
    messageSid: "SMac9a7e25aa0d2fdea32e008bd89d8549"
    status: "queued"
    to: "+13106992541"
[11:25:51 UTC] INFO: [TriggerNotification] Notification status updated in database
    serviceRequestId: "48af4388-9a50-4ec8-804b-95582e51c58d"
    method: "sms"
[11:25:51 UTC] INFO: User notification sent successfully
    serviceRequestId: "48af4388-9a50-4ec8-804b-95582e51c58d"
    method: "sms"
