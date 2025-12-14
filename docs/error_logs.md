2025-12-14T17:09:28.344589399Z [inf]            },
2025-12-14T17:09:28.344596599Z [inf]            "instancePath": "",
2025-12-14T17:09:28.344598553Z [inf]            "message": "must have required property 'providerName'"
2025-12-14T17:09:28.344605730Z [inf]            "schemaPath": "#/required",
2025-12-14T17:09:28.344607801Z [inf]          }
2025-12-14T17:09:28.344615151Z [inf]            "keyword": "required",
2025-12-14T17:09:28.344616197Z [inf]        ],
2025-12-14T17:09:28.344623786Z [inf]            "params": {
2025-12-14T17:09:28.344624986Z [inf]        "validationContext": "body"
2025-12-14T17:09:28.344633669Z [inf]              "missingProperty": "providerName"
2025-12-14T17:09:28.344634233Z [inf]      }
2025-12-14T17:09:28.344686455Z [inf]                at handler (/app/node_modules/.pnpm/fastify@5.6.2/node_modules/fastify/lib/handle-request.js:69:7)
2025-12-14T17:09:28.344693313Z [inf]                at onDone (/app/node_modules/.pnpm/fastify@5.6.2/node_modules/fastify/lib/content-type-parser.js:219:5)
2025-12-14T17:09:28.344699599Z [inf]                at AsyncResource.runInAsyncScope (node:async_hooks:203:9)
2025-12-14T17:09:28.344706023Z [inf]                at bound (node:async_hooks:235:16)
2025-12-14T17:09:28.344712458Z [inf]                at Parser.defaultJsonParser [as fn] (/app/node_modules/.pnpm/fastify@5.6.2/node_modules/fastify/lib/content-type-parser.js:307:7)
2025-12-14T17:09:28.344719022Z [inf]                at IncomingMessage.onEnd (/app/node_modules/.pnpm/fastify@5.6.2/node_modules/fastify/lib/content-type-parser.js:289:27)
2025-12-14T17:09:28.348408961Z [inf]  [17:09:28 UTC] INFO: Hybrid mode active - real calls to test phones + simulated calls for remaining
2025-12-14T17:09:28.348416964Z [inf]      reqId: "req-1j"
2025-12-14T17:09:28.348425521Z [inf]      adminTestPhones: [
2025-12-14T17:09:28.348434643Z [inf]        "+13106992541"
2025-12-14T17:09:28.348440337Z [inf]      }
2025-12-14T17:09:28.348440853Z [inf]          "name": "Forest Kitchen Design",
2025-12-14T17:09:28.348448268Z [inf]      reqId: "req-1j"
2025-12-14T17:09:28.348452461Z [inf]      responseTime: 0.9592897891998291
2025-12-14T17:09:28.348453777Z [inf]          "phone": "+13106992541"
2025-12-14T17:09:28.348457802Z [inf]      req: {
2025-12-14T17:09:28.348466261Z [inf]  [17:09:28 UTC] INFO: incoming request
2025-12-14T17:09:28.348466263Z [inf]        "method": "POST",
2025-12-14T17:09:28.348469354Z [inf]      ]
2025-12-14T17:09:28.348474531Z [inf]        "url": "/api/v1/providers/batch-call-async",
2025-12-14T17:09:28.348479513Z [inf]      providerCount: 10
2025-12-14T17:09:28.348487413Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:28.348489293Z [inf]  [17:09:28 UTC] INFO: Hybrid mode: providers split into real and simulated calls
2025-12-14T17:09:28.348495251Z [inf]        "remoteAddress": "100.64.0.7",
2025-12-14T17:09:28.348502959Z [inf]        "remotePort": 35424
2025-12-14T17:09:28.348508075Z [inf]      reqId: "req-1j"
2025-12-14T17:09:28.348512481Z [inf]      }
2025-12-14T17:09:28.348517425Z [inf]      realCallProviders: [
2025-12-14T17:09:28.348527542Z [inf]        {
2025-12-14T17:09:28.348527835Z [inf]      res: {
2025-12-14T17:09:28.348528144Z [inf]        }
2025-12-14T17:09:28.348537315Z [inf]        "statusCode": 400
2025-12-14T17:09:28.348537930Z [inf]        {
2025-12-14T17:09:28.348539337Z [inf]      ]
2025-12-14T17:09:28.348546885Z [inf]      simulatedProviders: [
2025-12-14T17:09:28.349586698Z [inf]          "name": "Lambert Custom Carpentry",
2025-12-14T17:09:28.349593831Z [inf]          "id": "6b8b409a-752b-4f36-a6bc-fb9e9c8c67c3"
2025-12-14T17:09:28.349602083Z [inf]        },
2025-12-14T17:09:28.349608151Z [inf]        {
2025-12-14T17:09:28.349614273Z [inf]          "name": "Brightline Painting - Greenville Painting Company",
2025-12-14T17:09:28.349620361Z [inf]          "id": "8194b5a4-9ee8-41a7-a1e7-a52f6f602f31"
2025-12-14T17:09:28.349630224Z [inf]        },
2025-12-14T17:09:28.349637488Z [inf]        {
2025-12-14T17:09:28.349646257Z [inf]          "name": "Precision Carpentry & Plumbing",
2025-12-14T17:09:28.349652360Z [inf]          "id": "5917b5f9-96da-40a0-8a90-20d8a5dfd7a4"
2025-12-14T17:09:28.349658427Z [inf]        },
2025-12-14T17:09:28.349668493Z [inf]        {
2025-12-14T17:09:28.349674709Z [inf]          "name": "Hgi Cabinetry",
2025-12-14T17:09:28.349680756Z [inf]          "id": "b31121ca-d843-4bda-94ff-7fbf6bab2e2a"
2025-12-14T17:09:28.349687336Z [inf]        },
2025-12-14T17:09:28.349693641Z [inf]        {
2025-12-14T17:09:28.349706508Z [inf]          "name": "Dell Builders",
2025-12-14T17:09:28.349712691Z [inf]          "id": "b3043f83-ffa1-43fc-b037-6be4067b1e63"
2025-12-14T17:09:28.349719728Z [inf]        },
2025-12-14T17:09:28.349725771Z [inf]        {
2025-12-14T17:09:28.349734368Z [inf]          "name": "Home Improvement Greenville SC",
2025-12-14T17:09:28.349741405Z [inf]          "id": "f381251c-9b63-4ce8-af47-b94fd99fbc4a"
2025-12-14T17:09:28.349749182Z [inf]        },
2025-12-14T17:09:28.349759979Z [inf]        {
2025-12-14T17:09:28.349766076Z [inf]          "name": "New Life Home Services, LLC",
2025-12-14T17:09:28.349774105Z [inf]          "id": "7b12fac8-233f-4994-8dfc-81944bfb186f"
2025-12-14T17:09:28.349820780Z [inf]        },
2025-12-14T17:09:28.349829222Z [inf]        {
2025-12-14T17:09:28.349837105Z [inf]          "name": "Rockler Woodworking and Hardware - Greenville",
2025-12-14T17:09:28.349860885Z [inf]          "id": "a650d1a5-3319-4d8b-ab1b-fdd1056cf14a"
2025-12-14T17:09:28.349867433Z [inf]        },
2025-12-14T17:09:28.349873608Z [inf]        {
2025-12-14T17:09:28.349879880Z [inf]          "name": "Woodcraft of Greenville",
2025-12-14T17:09:28.349886181Z [inf]          "id": "69f75b70-1ee4-4141-bd02-6b8ad472717f"
2025-12-14T17:09:28.349892473Z [inf]        }
2025-12-14T17:09:28.349898470Z [inf]      ]
2025-12-14T17:09:28.349904452Z [inf]  [17:09:28 UTC] INFO: Starting async batch call
2025-12-14T17:09:28.349910397Z [inf]      executionId: "d80928b0-1f32-4f17-a8a3-d326dfaad3ee"
2025-12-14T17:09:28.349915442Z [inf]      providerCount: 1
2025-12-14T17:09:28.595286452Z [inf]  [17:09:28 UTC] INFO: request completed
2025-12-14T17:09:28.595299896Z [inf]      reqId: "req-1j"
2025-12-14T17:09:28.595306570Z [inf]      providerId: "8194b5a4-9ee8-41a7-a1e7-a52f6f602f31"
2025-12-14T17:09:28.595306902Z [inf]  [17:09:28 UTC] INFO: [SimulatedCallService] Generating simulated call
2025-12-14T17:09:28.595310159Z [inf]      res: {
2025-12-14T17:09:28.595313836Z [inf]      providerName: "Brightline Painting - Greenville Painting Company"
2025-12-14T17:09:28.595320106Z [inf]        "statusCode": 202
2025-12-14T17:09:28.595321349Z [inf]      scenario: "completed"
2025-12-14T17:09:28.595321367Z [inf]      providerId: "6b8b409a-752b-4f36-a6bc-fb9e9c8c67c3"
2025-12-14T17:09:28.595329115Z [inf]  [17:09:28 UTC] INFO: [SimulatedCallService] Generating simulated call
2025-12-14T17:09:28.595330435Z [inf]      }
2025-12-14T17:09:28.595332579Z [inf]      providerName: "Lambert Custom Carpentry"
2025-12-14T17:09:28.595337528Z [inf]  [17:09:28 UTC] INFO: Kestra disabled via env var, using direct VAPI
2025-12-14T17:09:28.595340668Z [inf]      responseTime: 342.42109513282776
2025-12-14T17:09:28.595345126Z [inf]      scenario: "completed"
2025-12-14T17:09:28.595349462Z [inf]  [17:09:28 UTC] INFO: Starting simulated calls for remaining providers
2025-12-14T17:09:28.595350043Z [inf]  [17:09:28 UTC] INFO: Background batch call processing started
2025-12-14T17:09:28.595357258Z [inf]      executionId: "d80928b0-1f32-4f17-a8a3-d326dfaad3ee"
2025-12-14T17:09:28.595358477Z [inf]  [17:09:28 UTC] INFO: [SimulatedCallService] Generating simulated call
2025-12-14T17:09:28.595359460Z [inf]      executionId: "d80928b0-1f32-4f17-a8a3-d326dfaad3ee"
2025-12-14T17:09:28.595364333Z [inf]      simulatedCount: 9
2025-12-14T17:09:28.595370406Z [inf]  [17:09:28 UTC] INFO: [SimulatedCallService] Starting batch simulation
2025-12-14T17:09:28.595380596Z [inf]      count: 9
2025-12-14T17:09:28.595386595Z [inf]      maxConcurrent: 5
2025-12-14T17:09:28.595923522Z [inf]      providerId: "5917b5f9-96da-40a0-8a90-20d8a5dfd7a4"
2025-12-14T17:09:28.595932525Z [inf]      providerName: "Precision Carpentry & Plumbing"
2025-12-14T17:09:28.595939998Z [inf]      scenario: "completed"
2025-12-14T17:09:28.595942789Z [inf]      location: "Greenville, SC"
2025-12-14T17:09:28.595949070Z [inf]  [17:09:28 UTC] INFO: [SimulatedCallService] Generating simulated call
2025-12-14T17:09:28.595949103Z [inf]  [17:09:28 UTC] INFO: [SimulatedCallService] Generating simulated call
2025-12-14T17:09:28.595952670Z [inf]      maxConcurrent: 5
2025-12-14T17:09:28.595953335Z [inf]      urgency: "within_2_days"
2025-12-14T17:09:28.595957693Z [inf]      providerId: "b31121ca-d843-4bda-94ff-7fbf6bab2e2a"
2025-12-14T17:09:28.595959145Z [inf]      providerId: "b3043f83-ffa1-43fc-b037-6be4067b1e63"
2025-12-14T17:09:28.595963327Z [inf]  [17:09:28 UTC] INFO: Processing batch 1/1
2025-12-14T17:09:28.595965869Z [inf]  [17:09:28 UTC] INFO: Webhook URL configured - using hybrid mode
2025-12-14T17:09:28.595968450Z [inf]      providerName: "Hgi Cabinetry"
2025-12-14T17:09:28.595969713Z [inf]      providerName: "Dell Builders"
2025-12-14T17:09:28.595976309Z [inf]      webhookUrl: "https://api-production-8fe4.up.railway.app/api/v1/vapi/webhook"
2025-12-14T17:09:28.595979306Z [inf]      scenario: "completed"
2025-12-14T17:09:28.595984796Z [inf]      scenario: "completed"
2025-12-14T17:09:28.595985289Z [inf]  [17:09:28 UTC] INFO: Starting batch provider calls
2025-12-14T17:09:28.595985485Z [inf]  [17:09:28 UTC] INFO: Initiating batch provider calls (single routing decision)
2025-12-14T17:09:28.595992657Z [inf]      method: "direct_vapi"
2025-12-14T17:09:28.595994767Z [inf]      totalProviders: 1
2025-12-14T17:09:28.595997622Z [inf]      providerCount: 1
2025-12-14T17:09:28.596003161Z [inf]      maxConcurrent: 5
2025-12-14T17:09:28.596015407Z [inf]      service: "Carpenter"
2025-12-14T17:09:28.596362595Z [inf]      batch: 1
2025-12-14T17:09:28.596370397Z [inf]      totalBatches: 1
2025-12-14T17:09:28.596376905Z [inf]      batchSize: 1
2025-12-14T17:09:28.596383846Z [inf]      progress: "1/1"
2025-12-14T17:09:28.596390434Z [inf]  [17:09:28 UTC] INFO: Initiating direct VAPI call
2025-12-14T17:09:28.596397316Z [inf]      provider: "Forest Kitchen Design"
2025-12-14T17:09:28.596404314Z [inf]      phone: "+13106992541"
2025-12-14T17:09:28.596410449Z [inf]      service: "Carpenter"
2025-12-14T17:09:28.596415898Z [inf]      webhookEnabled: true
2025-12-14T17:09:29.618878108Z [inf]  [17:09:29 UTC] INFO: VAPI call created
2025-12-14T17:09:29.618880568Z [inf]      providerId: "3df6608f-fccf-44b1-a0d3-b19f895c5714"
2025-12-14T17:09:29.618881617Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:29.618885276Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:29.618888919Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:29.618892186Z [inf]        "remotePort": 19444
2025-12-14T17:09:29.618895890Z [inf]  [17:09:29 UTC] INFO: incoming request
2025-12-14T17:09:29.618897206Z [inf]      status: "queued"
2025-12-14T17:09:29.618901398Z [inf]      }
2025-12-14T17:09:29.618904096Z [inf]      reqId: "req-1k"
2025-12-14T17:09:29.618907330Z [inf]      webhookEnabled: true
2025-12-14T17:09:29.618908603Z [inf]  [17:09:29 UTC] WARN: Call result not found in cache
2025-12-14T17:09:29.618913189Z [inf]      req: {
2025-12-14T17:09:29.618915795Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:29.618917962Z [inf]  [17:09:29 UTC] INFO: Provider call marked in_progress
2025-12-14T17:09:29.618923590Z [inf]        "method": "GET",
2025-12-14T17:09:29.618923595Z [inf]  [17:09:29 UTC] INFO: request completed
2025-12-14T17:09:29.618931003Z [inf]      reqId: "req-1k"
2025-12-14T17:09:29.618931370Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:29.618937097Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:29.618938557Z [inf]      res: {
2025-12-14T17:09:29.618943921Z [inf]        "statusCode": 404
2025-12-14T17:09:29.618950676Z [inf]      }
2025-12-14T17:09:29.618956820Z [inf]      responseTime: 0.7785899639129639
2025-12-14T17:09:31.668129392Z [inf]  [17:09:31 UTC] INFO: incoming request
2025-12-14T17:09:31.668141309Z [inf]      reqId: "req-1l"
2025-12-14T17:09:31.668150869Z [inf]      req: {
2025-12-14T17:09:31.668158282Z [inf]        "method": "GET",
2025-12-14T17:09:31.668163924Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:31.668169999Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:31.668176942Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:31.668182809Z [inf]        "remotePort": 19444
2025-12-14T17:09:31.668187156Z [inf]      }
2025-12-14T17:09:31.668191876Z [inf]  [17:09:31 UTC] WARN: Call result not found in cache
2025-12-14T17:09:31.668196083Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:31.668199800Z [inf]  [17:09:31 UTC] INFO: request completed
2025-12-14T17:09:31.668204192Z [inf]      reqId: "req-1l"
2025-12-14T17:09:31.668208425Z [inf]      res: {
2025-12-14T17:09:31.668212820Z [inf]        "statusCode": 404
2025-12-14T17:09:31.668216757Z [inf]      }
2025-12-14T17:09:31.668221004Z [inf]      responseTime: 0.5289599895477295
2025-12-14T17:09:33.719500786Z [inf]  [17:09:33 UTC] INFO: request completed
2025-12-14T17:09:33.719507302Z [inf]      reqId: "req-1m"
2025-12-14T17:09:33.719511913Z [inf]      res: {
2025-12-14T17:09:33.719516858Z [inf]        "statusCode": 404
2025-12-14T17:09:33.719520444Z [inf]  [17:09:33 UTC] INFO: incoming request
2025-12-14T17:09:33.719522876Z [inf]      }
2025-12-14T17:09:33.719528818Z [inf]      responseTime: 0.4893040657043457
2025-12-14T17:09:33.719530031Z [inf]      reqId: "req-1m"
2025-12-14T17:09:33.719537452Z [inf]      req: {
2025-12-14T17:09:33.719541575Z [inf]        "method": "GET",
2025-12-14T17:09:33.719545398Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:33.719549016Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:33.719552979Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:33.719557000Z [inf]        "remotePort": 19444
2025-12-14T17:09:33.719560819Z [inf]      }
2025-12-14T17:09:33.719564827Z [inf]  [17:09:33 UTC] WARN: Call result not found in cache
2025-12-14T17:09:33.719568447Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:35.777080695Z [inf]  [17:09:35 UTC] INFO: incoming request
2025-12-14T17:09:35.777090105Z [inf]      reqId: "req-1n"
2025-12-14T17:09:35.777098161Z [inf]      req: {
2025-12-14T17:09:35.777105346Z [inf]        "method": "GET",
2025-12-14T17:09:35.777113033Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:35.777120218Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:35.777126577Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:35.777133200Z [inf]        "remotePort": 19444
2025-12-14T17:09:35.777139785Z [inf]      }
2025-12-14T17:09:35.777148323Z [inf]  [17:09:35 UTC] WARN: Call result not found in cache
2025-12-14T17:09:35.777154630Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:35.777161175Z [inf]  [17:09:35 UTC] INFO: request completed
2025-12-14T17:09:35.777174892Z [inf]      reqId: "req-1n"
2025-12-14T17:09:35.777182177Z [inf]      res: {
2025-12-14T17:09:35.777188487Z [inf]        "statusCode": 404
2025-12-14T17:09:35.777194748Z [inf]      }
2025-12-14T17:09:35.777200930Z [inf]      responseTime: 0.4762380123138428
2025-12-14T17:09:36.801162957Z [inf]      scenario: "completed"
2025-12-14T17:09:36.801166193Z [inf]  [17:09:36 UTC] INFO: [SimulatedCallService] Simulation complete
2025-12-14T17:09:36.801180078Z [inf]      outcome: "positive"
2025-12-14T17:09:36.801180158Z [inf]      providerId: "b3043f83-ffa1-43fc-b037-6be4067b1e63"
2025-12-14T17:09:36.801193177Z [inf]      callId: "sim-6d4e634f"
2025-12-14T17:09:36.801195208Z [inf]      duration: 2.5
2025-12-14T17:09:36.801204430Z [inf]      scenario: "completed"
2025-12-14T17:09:36.801208193Z [inf]  [17:09:36 UTC] INFO: VAPI webhook received
2025-12-14T17:09:36.801215638Z [inf]      outcome: "positive"
2025-12-14T17:09:36.801221533Z [inf]      type: "status-update"
2025-12-14T17:09:36.801225873Z [inf]      duration: 3.2
2025-12-14T17:09:36.801235121Z [inf]  [17:09:36 UTC] INFO: incoming request
2025-12-14T17:09:36.801237818Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:36.801245748Z [inf]      reqId: "req-1o"
2025-12-14T17:09:36.801251997Z [inf]  [17:09:36 UTC] INFO: request completed
2025-12-14T17:09:36.801256161Z [inf]      req: {
2025-12-14T17:09:36.801265862Z [inf]      reqId: "req-1o"
2025-12-14T17:09:36.801265925Z [inf]        "method": "POST",
2025-12-14T17:09:36.801280340Z [inf]      res: {
2025-12-14T17:09:36.801280370Z [inf]        "url": "/api/v1/vapi/webhook",
2025-12-14T17:09:36.801288965Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:36.801296056Z [inf]        "remoteAddress": "100.64.0.9",
2025-12-14T17:09:36.801302840Z [inf]        "remotePort": 21288
2025-12-14T17:09:36.801310637Z [inf]      }
2025-12-14T17:09:36.801318582Z [inf]  [17:09:36 UTC] INFO: [SimulatedCallService] Simulation complete
2025-12-14T17:09:36.801325922Z [inf]      providerId: "6b8b409a-752b-4f36-a6bc-fb9e9c8c67c3"
2025-12-14T17:09:36.801333550Z [inf]      callId: "sim-f9209cd9"
2025-12-14T17:09:36.801883340Z [inf]        "statusCode": 200
2025-12-14T17:09:36.801893500Z [inf]      }
2025-12-14T17:09:36.801901649Z [inf]      responseTime: 74.5819661617279
2025-12-14T17:09:37.821411571Z [inf]  [17:09:37 UTC] INFO: [SimulatedCallService] Simulation complete
2025-12-14T17:09:37.821423924Z [inf]      providerId: "5917b5f9-96da-40a0-8a90-20d8a5dfd7a4"
2025-12-14T17:09:37.821434036Z [inf]      callId: "sim-aa088143"
2025-12-14T17:09:37.821441796Z [inf]      scenario: "completed"
2025-12-14T17:09:37.821447719Z [inf]      outcome: "positive"
2025-12-14T17:09:37.821453636Z [inf]      duration: 3.1
2025-12-14T17:09:37.822336059Z [inf]  [17:09:37 UTC] INFO: incoming request
2025-12-14T17:09:37.822336815Z [inf]      }
2025-12-14T17:09:37.822346041Z [inf]  [17:09:37 UTC] WARN: Call result not found in cache
2025-12-14T17:09:37.822347685Z [inf]      reqId: "req-1p"
2025-12-14T17:09:37.822351799Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:37.822355175Z [inf]      req: {
2025-12-14T17:09:37.822360632Z [inf]  [17:09:37 UTC] INFO: request completed
2025-12-14T17:09:37.822365342Z [inf]        "method": "GET",
2025-12-14T17:09:37.822365363Z [inf]      reqId: "req-1p"
2025-12-14T17:09:37.822371167Z [inf]      res: {
2025-12-14T17:09:37.822373918Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:37.822376356Z [inf]        "statusCode": 404
2025-12-14T17:09:37.822381396Z [inf]      }
2025-12-14T17:09:37.822383310Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:37.822387013Z [inf]      responseTime: 0.5069808959960938
2025-12-14T17:09:37.822392056Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:37.822398044Z [inf]        "remotePort": 19444
2025-12-14T17:09:40.086254714Z [inf]  [17:09:39 UTC] INFO: [SimulatedCallService] Simulation complete
2025-12-14T17:09:40.086261574Z [inf]      providerId: "b31121ca-d843-4bda-94ff-7fbf6bab2e2a"
2025-12-14T17:09:40.086268338Z [inf]      callId: "sim-d21557a1"
2025-12-14T17:09:40.086272767Z [inf]      scenario: "completed"
2025-12-14T17:09:40.086278056Z [inf]      outcome: "positive"
2025-12-14T17:09:40.086282424Z [inf]      duration: 3.8
2025-12-14T17:09:40.086286594Z [inf]  [17:09:39 UTC] INFO: incoming request
2025-12-14T17:09:40.086290633Z [inf]      reqId: "req-1q"
2025-12-14T17:09:40.086294453Z [inf]      req: {
2025-12-14T17:09:40.086298391Z [inf]        "method": "GET",
2025-12-14T17:09:40.086302583Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:40.086306442Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:40.086311139Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:40.086315864Z [inf]        "remotePort": 19444
2025-12-14T17:09:40.086320203Z [inf]      }
2025-12-14T17:09:40.086324144Z [inf]  [17:09:39 UTC] WARN: Call result not found in cache
2025-12-14T17:09:40.086328012Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:40.086331921Z [inf]  [17:09:39 UTC] INFO: request completed
2025-12-14T17:09:40.086336392Z [inf]      reqId: "req-1q"
2025-12-14T17:09:40.086339988Z [inf]      res: {
2025-12-14T17:09:40.086343759Z [inf]        "statusCode": 404
2025-12-14T17:09:40.086347377Z [inf]      }
2025-12-14T17:09:40.086351414Z [inf]      responseTime: 0.5338928699493408
2025-12-14T17:09:42.038982402Z [inf]  [17:09:41 UTC] INFO: [SimulatedCallService] Simulation complete
2025-12-14T17:09:42.038990103Z [inf]      providerId: "8194b5a4-9ee8-41a7-a1e7-a52f6f602f31"
2025-12-14T17:09:42.038999470Z [inf]      callId: "sim-1e5a9b33"
2025-12-14T17:09:42.039006926Z [inf]      scenario: "completed"
2025-12-14T17:09:42.039015169Z [inf]      outcome: "positive"
2025-12-14T17:09:42.039022953Z [inf]      duration: 2.7
2025-12-14T17:09:42.039030709Z [inf]  [17:09:41 UTC] INFO: [SimulatedCallService] Generating simulated call
2025-12-14T17:09:42.039041419Z [inf]      providerId: "f381251c-9b63-4ce8-af47-b94fd99fbc4a"
2025-12-14T17:09:42.039048749Z [inf]      providerName: "Home Improvement Greenville SC"
2025-12-14T17:09:42.039056986Z [inf]      scenario: "no_answer"
2025-12-14T17:09:42.039064669Z [inf]  [17:09:41 UTC] INFO: [SimulatedCallService] Created no-answer result
2025-12-14T17:09:42.039073501Z [inf]      providerId: "f381251c-9b63-4ce8-af47-b94fd99fbc4a"
2025-12-14T17:09:42.039080908Z [inf]      callId: "sim-dd8980ec"
2025-12-14T17:09:42.039087727Z [inf]      scenario: "no_answer"
2025-12-14T17:09:42.039095588Z [inf]  [17:09:41 UTC] INFO: [SimulatedCallService] Generating simulated call
2025-12-14T17:09:42.039102973Z [inf]      providerId: "7b12fac8-233f-4994-8dfc-81944bfb186f"
2025-12-14T17:09:42.039109989Z [inf]      providerName: "New Life Home Services, LLC"
2025-12-14T17:09:42.039116633Z [inf]      scenario: "completed"
2025-12-14T17:09:42.039123421Z [inf]  [17:09:41 UTC] INFO: [SimulatedCallService] Generating simulated call
2025-12-14T17:09:42.039131855Z [inf]      providerId: "a650d1a5-3319-4d8b-ab1b-fdd1056cf14a"
2025-12-14T17:09:42.039139122Z [inf]      providerName: "Rockler Woodworking and Hardware - Greenville"
2025-12-14T17:09:42.039146406Z [inf]      scenario: "completed"
2025-12-14T17:09:42.039152358Z [inf]  [17:09:41 UTC] INFO: [SimulatedCallService] Generating simulated call
2025-12-14T17:09:42.039763730Z [inf]      providerId: "69f75b70-1ee4-4141-bd02-6b8ad472717f"
2025-12-14T17:09:42.039772249Z [inf]      providerName: "Woodcraft of Greenville"
2025-12-14T17:09:42.039779001Z [inf]      scenario: "completed"
2025-12-14T17:09:42.039785355Z [inf]  [17:09:41 UTC] INFO: incoming request
2025-12-14T17:09:42.039792114Z [inf]      reqId: "req-1r"
2025-12-14T17:09:42.039798862Z [inf]      req: {
2025-12-14T17:09:42.039805309Z [inf]        "method": "GET",
2025-12-14T17:09:42.039870158Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:42.039870177Z [inf]      res: {
2025-12-14T17:09:42.039881371Z [inf]        "statusCode": 404
2025-12-14T17:09:42.039892451Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:42.039894083Z [inf]      }
2025-12-14T17:09:42.039906568Z [inf]      responseTime: 0.5235409736633301
2025-12-14T17:09:42.039909940Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:42.039922374Z [inf]        "remotePort": 19444
2025-12-14T17:09:42.039932123Z [inf]      }
2025-12-14T17:09:42.039955485Z [inf]  [17:09:41 UTC] WARN: Call result not found in cache
2025-12-14T17:09:42.039963264Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:42.039970782Z [inf]  [17:09:41 UTC] INFO: request completed
2025-12-14T17:09:42.039979102Z [inf]      reqId: "req-1r"
2025-12-14T17:09:44.044623241Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:44.044624322Z [inf]  [17:09:43 UTC] INFO: incoming request
2025-12-14T17:09:44.044629944Z [inf]      reqId: "req-1s"
2025-12-14T17:09:44.044633440Z [inf]        "remotePort": 19444
2025-12-14T17:09:44.044633566Z [inf]        "statusCode": 404
2025-12-14T17:09:44.044637217Z [inf]      req: {
2025-12-14T17:09:44.044640973Z [inf]      }
2025-12-14T17:09:44.044643034Z [inf]      }
2025-12-14T17:09:44.044643564Z [inf]        "method": "GET",
2025-12-14T17:09:44.044647414Z [inf]  [17:09:43 UTC] WARN: Call result not found in cache
2025-12-14T17:09:44.044650180Z [inf]      responseTime: 0.5365040302276611
2025-12-14T17:09:44.044650367Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:44.044653947Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:44.044660302Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:44.044661558Z [inf]  [17:09:43 UTC] INFO: request completed
2025-12-14T17:09:44.044671701Z [inf]      reqId: "req-1s"
2025-12-14T17:09:44.044679549Z [inf]      res: {
2025-12-14T17:09:46.026107560Z [inf]  [17:09:45 UTC] INFO: incoming request
2025-12-14T17:09:46.026118172Z [inf]      reqId: "req-1t"
2025-12-14T17:09:46.026125532Z [inf]      req: {
2025-12-14T17:09:46.026133725Z [inf]        "method": "GET",
2025-12-14T17:09:46.026141955Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:46.026149605Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:46.026156765Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:46.026163718Z [inf]        "remotePort": 19444
2025-12-14T17:09:46.026171551Z [inf]      }
2025-12-14T17:09:46.026179429Z [inf]  [17:09:45 UTC] WARN: Call result not found in cache
2025-12-14T17:09:46.026186994Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:46.026192942Z [inf]  [17:09:45 UTC] INFO: request completed
2025-12-14T17:09:46.026199151Z [inf]      reqId: "req-1t"
2025-12-14T17:09:46.026206689Z [inf]      res: {
2025-12-14T17:09:46.026213788Z [inf]        "statusCode": 404
2025-12-14T17:09:46.026220966Z [inf]      }
2025-12-14T17:09:46.026227581Z [inf]      responseTime: 0.572066068649292
2025-12-14T17:09:48.075552519Z [inf]  [17:09:47 UTC] INFO: incoming request
2025-12-14T17:09:48.075560824Z [inf]      reqId: "req-1u"
2025-12-14T17:09:48.075565764Z [inf]      req: {
2025-12-14T17:09:48.075572266Z [inf]        "method": "GET",
2025-12-14T17:09:48.075576930Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:48.075581598Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:48.075585367Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:48.075589224Z [inf]        "remotePort": 19444
2025-12-14T17:09:48.075593747Z [inf]      }
2025-12-14T17:09:48.076562884Z [inf]  [17:09:47 UTC] WARN: Call result not found in cache
2025-12-14T17:09:48.076568500Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:48.076573225Z [inf]  [17:09:47 UTC] INFO: request completed
2025-12-14T17:09:48.076577703Z [inf]      reqId: "req-1u"
2025-12-14T17:09:48.076581211Z [inf]      res: {
2025-12-14T17:09:48.076585054Z [inf]        "statusCode": 404
2025-12-14T17:09:48.076589665Z [inf]      }
2025-12-14T17:09:48.076594093Z [inf]      responseTime: 0.4199070930480957
2025-12-14T17:09:50.135327316Z [inf]  [17:09:49 UTC] INFO: incoming request
2025-12-14T17:09:50.135336106Z [inf]      reqId: "req-1v"
2025-12-14T17:09:50.135344531Z [inf]      req: {
2025-12-14T17:09:50.135353672Z [inf]        "method": "GET",
2025-12-14T17:09:50.135362008Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:50.135370624Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:50.135379304Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:50.135386365Z [inf]        "remotePort": 19444
2025-12-14T17:09:50.135392502Z [inf]      }
2025-12-14T17:09:50.135398553Z [inf]  [17:09:49 UTC] WARN: Call result not found in cache
2025-12-14T17:09:50.135404084Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:50.135410178Z [inf]  [17:09:49 UTC] INFO: request completed
2025-12-14T17:09:50.135415846Z [inf]      reqId: "req-1v"
2025-12-14T17:09:50.135420959Z [inf]      res: {
2025-12-14T17:09:50.135427591Z [inf]        "statusCode": 404
2025-12-14T17:09:50.135435001Z [inf]      }
2025-12-14T17:09:50.135440829Z [inf]      responseTime: 0.5806319713592529
2025-12-14T17:09:51.151668662Z [inf]  [17:09:50 UTC] INFO: [SimulatedCallService] Simulation complete
2025-12-14T17:09:51.151674723Z [inf]      providerId: "a650d1a5-3319-4d8b-ab1b-fdd1056cf14a"
2025-12-14T17:09:51.151681338Z [inf]      callId: "sim-cddf6279"
2025-12-14T17:09:51.151688713Z [inf]      scenario: "completed"
2025-12-14T17:09:51.151695143Z [inf]      outcome: "negative"
2025-12-14T17:09:51.151702741Z [inf]      duration: 1.8
2025-12-14T17:09:51.151709650Z [inf]  [17:09:51 UTC] INFO: [SimulatedCallService] Simulation complete
2025-12-14T17:09:51.151716729Z [inf]      providerId: "69f75b70-1ee4-4141-bd02-6b8ad472717f"
2025-12-14T17:09:51.151723356Z [inf]      callId: "sim-bc689d4b"
2025-12-14T17:09:51.151728031Z [inf]      scenario: "completed"
2025-12-14T17:09:51.151732726Z [inf]      outcome: "positive"
2025-12-14T17:09:51.151736756Z [inf]      duration: 3.2
2025-12-14T17:09:51.669341450Z [inf]  [17:09:51 UTC] INFO: incoming request
2025-12-14T17:09:51.669342170Z [inf]  [17:09:51 UTC] INFO: request completed
2025-12-14T17:09:51.669349513Z [inf]      reqId: "req-1w"
2025-12-14T17:09:51.669351011Z [inf]      reqId: "req-1w"
2025-12-14T17:09:51.669356146Z [inf]      req: {
2025-12-14T17:09:51.669357433Z [inf]      res: {
2025-12-14T17:09:51.669361876Z [inf]        "method": "GET",
2025-12-14T17:09:51.669363283Z [inf]        "statusCode": 404
2025-12-14T17:09:51.669367549Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:51.669369820Z [inf]      }
2025-12-14T17:09:51.669373138Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:51.669375807Z [inf]      responseTime: 0.4912409782409668
2025-12-14T17:09:51.669378414Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:51.669382273Z [inf]        "remotePort": 19444
2025-12-14T17:09:51.669386249Z [inf]      }
2025-12-14T17:09:51.669390543Z [inf]  [17:09:51 UTC] WARN: Call result not found in cache
2025-12-14T17:09:51.669394460Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:52.196219822Z [inf]  [17:09:52 UTC] INFO: [SimulatedCallService] Simulation complete
2025-12-14T17:09:52.196219980Z [inf]      noAnswer: 1
2025-12-14T17:09:52.196229658Z [inf]      failed: 0
2025-12-14T17:09:52.196230713Z [inf]      providerId: "7b12fac8-233f-4994-8dfc-81944bfb186f"
2025-12-14T17:09:52.196238849Z [inf]      durationMs: 23503
2025-12-14T17:09:52.196240790Z [inf]      callId: "sim-a2b16022"
2025-12-14T17:09:52.196248168Z [inf]      scenario: "completed"
2025-12-14T17:09:52.196254006Z [inf]      outcome: "positive"
2025-12-14T17:09:52.196259450Z [inf]      duration: 3
2025-12-14T17:09:52.196265655Z [inf]  [17:09:52 UTC] INFO: [SimulatedCallService] Batch simulation complete
2025-12-14T17:09:52.196269794Z [inf]      total: 9
2025-12-14T17:09:52.196274236Z [inf]      completed: 8
2025-12-14T17:09:52.196278905Z [inf]      voicemail: 0
2025-12-14T17:09:52.313176957Z [inf]  [17:09:52 UTC] INFO: Call result saved to database
2025-12-14T17:09:52.313184538Z [inf]      callId: "sim-f9209cd9"
2025-12-14T17:09:52.313191757Z [inf]      providerId: "6b8b409a-752b-4f36-a6bc-fb9e9c8c67c3"
2025-12-14T17:09:52.313197575Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:09:52.569340904Z [inf]  [17:09:52 UTC] INFO: Call result saved to database
2025-12-14T17:09:52.569346769Z [inf]      callId: "sim-1e5a9b33"
2025-12-14T17:09:52.569351372Z [inf]      providerId: "8194b5a4-9ee8-41a7-a1e7-a52f6f602f31"
2025-12-14T17:09:52.569357896Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:09:52.692961732Z [inf]  [17:09:52 UTC] INFO: Call result saved to database
2025-12-14T17:09:52.692967961Z [inf]      callId: "sim-aa088143"
2025-12-14T17:09:52.692972064Z [inf]      providerId: "5917b5f9-96da-40a0-8a90-20d8a5dfd7a4"
2025-12-14T17:09:52.692977074Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:09:52.821650429Z [inf]  [17:09:52 UTC] INFO: Call result saved to database
2025-12-14T17:09:52.821659775Z [inf]      callId: "sim-d21557a1"
2025-12-14T17:09:52.821667006Z [inf]      providerId: "b31121ca-d843-4bda-94ff-7fbf6bab2e2a"
2025-12-14T17:09:52.821673025Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:09:53.112721026Z [inf]  [17:09:52 UTC] INFO: Call result saved to database
2025-12-14T17:09:53.112724801Z [inf]      callId: "sim-6d4e634f"
2025-12-14T17:09:53.112728799Z [inf]      providerId: "b3043f83-ffa1-43fc-b037-6be4067b1e63"
2025-12-14T17:09:53.112732439Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:09:53.112736651Z [inf]  [17:09:53 UTC] INFO: Call result saved to database
2025-12-14T17:09:53.112740269Z [inf]      callId: "sim-dd8980ec"
2025-12-14T17:09:53.112744548Z [inf]      providerId: "f381251c-9b63-4ce8-af47-b94fd99fbc4a"
2025-12-14T17:09:53.112748980Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:09:53.208838485Z [inf]  [17:09:53 UTC] INFO: Call result saved to database
2025-12-14T17:09:53.208844605Z [inf]      callId: "sim-a2b16022"
2025-12-14T17:09:53.208849347Z [inf]      providerId: "7b12fac8-233f-4994-8dfc-81944bfb186f"
2025-12-14T17:09:53.208853967Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:09:53.341219960Z [inf]  [17:09:53 UTC] INFO: Call result saved to database
2025-12-14T17:09:53.341226511Z [inf]      callId: "sim-cddf6279"
2025-12-14T17:09:53.341232293Z [inf]      providerId: "a650d1a5-3319-4d8b-ab1b-fdd1056cf14a"
2025-12-14T17:09:53.341236347Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:09:53.471503526Z [inf]  [17:09:53 UTC] INFO: Call result saved to database
2025-12-14T17:09:53.471518114Z [inf]      callId: "sim-bc689d4b"
2025-12-14T17:09:53.471528739Z [inf]      providerId: "69f75b70-1ee4-4141-bd02-6b8ad472717f"
2025-12-14T17:09:53.471538425Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:09:53.471549105Z [inf]  [17:09:53 UTC] INFO: Simulated calls completed and saved to database
2025-12-14T17:09:53.471556847Z [inf]      executionId: "d80928b0-1f32-4f17-a8a3-d326dfaad3ee"
2025-12-14T17:09:53.471562574Z [inf]      simulatedTotal: 9
2025-12-14T17:09:53.471568871Z [inf]      simulatedCompleted: 8
2025-12-14T17:09:53.471574667Z [inf]      simulatedFailed: 0
2025-12-14T17:09:53.728168440Z [inf]  [17:09:53 UTC] INFO: incoming request
2025-12-14T17:09:53.728168613Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:53.728181473Z [inf]      reqId: "req-1x"
2025-12-14T17:09:53.728181780Z [inf]  [17:09:53 UTC] INFO: request completed
2025-12-14T17:09:53.728191371Z [inf]      req: {
2025-12-14T17:09:53.728191553Z [inf]      reqId: "req-1x"
2025-12-14T17:09:53.728197429Z [inf]      res: {
2025-12-14T17:09:53.728201731Z [inf]        "method": "GET",
2025-12-14T17:09:53.728204461Z [inf]        "statusCode": 404
2025-12-14T17:09:53.728210643Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:53.728210818Z [inf]      }
2025-12-14T17:09:53.728216790Z [inf]      responseTime: 0.5949211120605469
2025-12-14T17:09:53.728220513Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:53.728227697Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:53.728235028Z [inf]        "remotePort": 19444
2025-12-14T17:09:53.728242404Z [inf]      }
2025-12-14T17:09:53.728249877Z [inf]  [17:09:53 UTC] WARN: Call result not found in cache
2025-12-14T17:09:55.770840430Z [inf]  [17:09:55 UTC] INFO: incoming request
2025-12-14T17:09:55.770846549Z [inf]      reqId: "req-1y"
2025-12-14T17:09:55.770850611Z [inf]      req: {
2025-12-14T17:09:55.770854559Z [inf]        "method": "GET",
2025-12-14T17:09:55.770858277Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:55.770862308Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:55.770866512Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:55.770870709Z [inf]        "remotePort": 19444
2025-12-14T17:09:55.770875859Z [inf]      }
2025-12-14T17:09:55.770879732Z [inf]  [17:09:55 UTC] WARN: Call result not found in cache
2025-12-14T17:09:55.770883105Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:55.770887072Z [inf]  [17:09:55 UTC] INFO: request completed
2025-12-14T17:09:55.770890591Z [inf]      reqId: "req-1y"
2025-12-14T17:09:55.770894321Z [inf]      res: {
2025-12-14T17:09:55.770898053Z [inf]        "statusCode": 404
2025-12-14T17:09:55.770901414Z [inf]      }
2025-12-14T17:09:55.770905513Z [inf]      responseTime: 0.5668680667877197
2025-12-14T17:09:57.832061568Z [inf]  [17:09:57 UTC] INFO: incoming request
2025-12-14T17:09:57.832068382Z [inf]      reqId: "req-1z"
2025-12-14T17:09:57.832071934Z [inf]      req: {
2025-12-14T17:09:57.832075764Z [inf]        "method": "GET",
2025-12-14T17:09:57.832079845Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:57.832083639Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:57.832088055Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:57.832093197Z [inf]        "remotePort": 19444
2025-12-14T17:09:57.832097069Z [inf]      }
2025-12-14T17:09:57.832100704Z [inf]  [17:09:57 UTC] WARN: Call result not found in cache
2025-12-14T17:09:57.832104654Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:57.832108225Z [inf]  [17:09:57 UTC] INFO: request completed
2025-12-14T17:09:57.832112037Z [inf]      reqId: "req-1z"
2025-12-14T17:09:57.832115568Z [inf]      res: {
2025-12-14T17:09:57.832119304Z [inf]        "statusCode": 404
2025-12-14T17:09:57.832123055Z [inf]      }
2025-12-14T17:09:57.832126690Z [inf]      responseTime: 0.47796010971069336
2025-12-14T17:09:59.876469333Z [inf]  [17:09:59 UTC] INFO: incoming request
2025-12-14T17:09:59.876471540Z [inf]      reqId: "req-20"
2025-12-14T17:09:59.876476405Z [inf]      reqId: "req-20"
2025-12-14T17:09:59.876481567Z [inf]      res: {
2025-12-14T17:09:59.876481985Z [inf]      req: {
2025-12-14T17:09:59.876487751Z [inf]        "method": "GET",
2025-12-14T17:09:59.876489541Z [inf]        "statusCode": 404
2025-12-14T17:09:59.876493262Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:09:59.876498567Z [inf]      }
2025-12-14T17:09:59.876499111Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:09:59.876504307Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:09:59.876509489Z [inf]      responseTime: 0.543738842010498
2025-12-14T17:09:59.876510025Z [inf]        "remotePort": 19444
2025-12-14T17:09:59.876515097Z [inf]      }
2025-12-14T17:09:59.876519585Z [inf]  [17:09:59 UTC] WARN: Call result not found in cache
2025-12-14T17:09:59.876524123Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:09:59.876528316Z [inf]  [17:09:59 UTC] INFO: request completed
2025-12-14T17:10:01.929832495Z [inf]      reqId: "req-21"
2025-12-14T17:10:01.929841384Z [inf]      res: {
2025-12-14T17:10:01.929848057Z [inf]        "statusCode": 404
2025-12-14T17:10:01.929853417Z [inf]      }
2025-12-14T17:10:01.929859595Z [inf]      responseTime: 1.8495471477508545
2025-12-14T17:10:01.929903627Z [inf]  [17:10:01 UTC] INFO: incoming request
2025-12-14T17:10:01.929913272Z [inf]      reqId: "req-21"
2025-12-14T17:10:01.929923369Z [inf]      req: {
2025-12-14T17:10:01.929929346Z [inf]        "method": "GET",
2025-12-14T17:10:01.929935174Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:10:01.929941574Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:10:01.929946187Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:10:01.929950834Z [inf]        "remotePort": 19444
2025-12-14T17:10:01.929955651Z [inf]      }
2025-12-14T17:10:01.929960514Z [inf]  [17:10:01 UTC] WARN: Call result not found in cache
2025-12-14T17:10:01.929965454Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:01.929969814Z [inf]  [17:10:01 UTC] INFO: request completed
2025-12-14T17:10:04.096169656Z [inf]  [17:10:03 UTC] INFO: incoming request
2025-12-14T17:10:04.096180730Z [inf]      responseTime: 0.46138501167297363
2025-12-14T17:10:04.096186943Z [inf]      reqId: "req-22"
2025-12-14T17:10:04.096196925Z [inf]      req: {
2025-12-14T17:10:04.096205358Z [inf]        "method": "GET",
2025-12-14T17:10:04.096213392Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:10:04.096221751Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:10:04.096230525Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:10:04.096240666Z [inf]        "remotePort": 19444
2025-12-14T17:10:04.096252322Z [inf]      }
2025-12-14T17:10:04.096262016Z [inf]  [17:10:03 UTC] WARN: Call result not found in cache
2025-12-14T17:10:04.096272562Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:04.096281247Z [inf]  [17:10:03 UTC] INFO: request completed
2025-12-14T17:10:04.096288407Z [inf]      reqId: "req-22"
2025-12-14T17:10:04.096294893Z [inf]      res: {
2025-12-14T17:10:04.096301397Z [inf]        "statusCode": 404
2025-12-14T17:10:04.096307397Z [inf]      }
2025-12-14T17:10:06.102486461Z [inf]  [17:10:05 UTC] WARN: Call result not found in cache
2025-12-14T17:10:06.102499768Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:06.102507686Z [inf]  [17:10:05 UTC] INFO: request completed
2025-12-14T17:10:06.102517072Z [inf]      reqId: "req-23"
2025-12-14T17:10:06.102524201Z [inf]      res: {
2025-12-14T17:10:06.102532084Z [inf]        "statusCode": 404
2025-12-14T17:10:06.102538571Z [inf]      }
2025-12-14T17:10:06.102545618Z [inf]      responseTime: 0.47312211990356445
2025-12-14T17:10:06.102608849Z [inf]  [17:10:05 UTC] INFO: incoming request
2025-12-14T17:10:06.102613346Z [inf]      reqId: "req-23"
2025-12-14T17:10:06.102617693Z [inf]      req: {
2025-12-14T17:10:06.102624358Z [inf]        "method": "GET",
2025-12-14T17:10:06.102629620Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:10:06.102635085Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:10:06.102642061Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:10:06.102650301Z [inf]        "remotePort": 19444
2025-12-14T17:10:06.102658338Z [inf]      }
2025-12-14T17:10:08.123459890Z [inf]        "method": "GET",
2025-12-14T17:10:08.123470151Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:10:08.123477493Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:10:08.123484242Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:10:08.123491168Z [inf]        "remotePort": 19444
2025-12-14T17:10:08.123497785Z [inf]      }
2025-12-14T17:10:08.123504000Z [inf]  [17:10:07 UTC] WARN: Call result not found in cache
2025-12-14T17:10:08.123510686Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:08.123516905Z [inf]  [17:10:07 UTC] INFO: request completed
2025-12-14T17:10:08.123523448Z [inf]      reqId: "req-24"
2025-12-14T17:10:08.123529693Z [inf]      res: {
2025-12-14T17:10:08.123536168Z [inf]        "statusCode": 404
2025-12-14T17:10:08.123542830Z [inf]      }
2025-12-14T17:10:08.123550235Z [inf]      responseTime: 0.6024229526519775
2025-12-14T17:10:08.123550263Z [inf]  [17:10:07 UTC] INFO: incoming request
2025-12-14T17:10:08.123559811Z [inf]      reqId: "req-24"
2025-12-14T17:10:08.123569027Z [inf]      req: {
2025-12-14T17:10:10.139865011Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:10.139875815Z [inf]  [17:10:09 UTC] INFO: request completed
2025-12-14T17:10:10.139883797Z [inf]      reqId: "req-25"
2025-12-14T17:10:10.139891298Z [inf]      res: {
2025-12-14T17:10:10.139898718Z [inf]        "statusCode": 404
2025-12-14T17:10:10.139918250Z [inf]      reqId: "req-25"
2025-12-14T17:10:10.139924652Z [inf]      }
2025-12-14T17:10:10.139929541Z [inf]      req: {
2025-12-14T17:10:10.139937523Z [inf]      responseTime: 0.5175790786743164
2025-12-14T17:10:10.139939707Z [inf]  [17:10:09 UTC] INFO: incoming request
2025-12-14T17:10:10.139941965Z [inf]        "method": "GET",
2025-12-14T17:10:10.139950637Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:10:10.139957585Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:10:10.139964893Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:10:10.139973419Z [inf]        "remotePort": 19444
2025-12-14T17:10:10.139981494Z [inf]      }
2025-12-14T17:10:10.139991806Z [inf]  [17:10:09 UTC] WARN: Call result not found in cache
2025-12-14T17:10:12.187854069Z [inf]  [17:10:11 UTC] INFO: incoming request
2025-12-14T17:10:12.187859458Z [inf]      reqId: "req-26"
2025-12-14T17:10:12.187864851Z [inf]      req: {
2025-12-14T17:10:12.187870215Z [inf]        "method": "GET",
2025-12-14T17:10:12.187875175Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:10:12.187880076Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:10:12.187884975Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:10:12.187890407Z [inf]        "remotePort": 19444
2025-12-14T17:10:12.187897512Z [inf]      }
2025-12-14T17:10:12.187902696Z [inf]  [17:10:11 UTC] WARN: Call result not found in cache
2025-12-14T17:10:12.187907813Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:12.187913762Z [inf]  [17:10:11 UTC] INFO: request completed
2025-12-14T17:10:12.187919120Z [inf]      reqId: "req-26"
2025-12-14T17:10:12.187924858Z [inf]      res: {
2025-12-14T17:10:12.187930012Z [inf]        "statusCode": 404
2025-12-14T17:10:12.187935044Z [inf]      }
2025-12-14T17:10:12.187940264Z [inf]      responseTime: 0.4993290901184082
2025-12-14T17:10:14.229832836Z [inf]      }
2025-12-14T17:10:14.229842565Z [inf]  [17:10:13 UTC] INFO: incoming request
2025-12-14T17:10:14.229845390Z [inf]      responseTime: 0.49287915229797363
2025-12-14T17:10:14.229847953Z [inf]        "remotePort": 19444
2025-12-14T17:10:14.229854613Z [inf]      reqId: "req-27"
2025-12-14T17:10:14.229860623Z [inf]      }
2025-12-14T17:10:14.229865072Z [inf]      req: {
2025-12-14T17:10:14.229868498Z [inf]  [17:10:13 UTC] WARN: Call result not found in cache
2025-12-14T17:10:14.229874194Z [inf]        "method": "GET",
2025-12-14T17:10:14.229876398Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:14.229882473Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:10:14.229883258Z [inf]  [17:10:13 UTC] INFO: request completed
2025-12-14T17:10:14.229890452Z [inf]      reqId: "req-27"
2025-12-14T17:10:14.229891822Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:10:14.229897775Z [inf]      res: {
2025-12-14T17:10:14.229900252Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:10:14.229904300Z [inf]        "statusCode": 404
2025-12-14T17:10:16.278066066Z [inf]  [17:10:15 UTC] INFO: incoming request
2025-12-14T17:10:16.278070068Z [inf]      responseTime: 0.6022179126739502
2025-12-14T17:10:16.278074540Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:16.278078251Z [inf]      reqId: "req-28"
2025-12-14T17:10:16.278085317Z [inf]  [17:10:15 UTC] INFO: request completed
2025-12-14T17:10:16.278087638Z [inf]      req: {
2025-12-14T17:10:16.278093335Z [inf]      reqId: "req-28"
2025-12-14T17:10:16.278098334Z [inf]        "method": "GET",
2025-12-14T17:10:16.278100954Z [inf]      res: {
2025-12-14T17:10:16.278107537Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:10:16.278107969Z [inf]        "statusCode": 404
2025-12-14T17:10:16.278115308Z [inf]      }
2025-12-14T17:10:16.278117570Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:10:16.278125686Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:10:16.278133846Z [inf]        "remotePort": 19444
2025-12-14T17:10:16.278142424Z [inf]      }
2025-12-14T17:10:16.278150906Z [inf]  [17:10:15 UTC] WARN: Call result not found in cache
2025-12-14T17:10:18.326818783Z [inf]  [17:10:17 UTC] INFO: incoming request
2025-12-14T17:10:18.326834425Z [inf]      reqId: "req-29"
2025-12-14T17:10:18.326843139Z [inf]      req: {
2025-12-14T17:10:18.326852179Z [inf]        "method": "GET",
2025-12-14T17:10:18.326860717Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:10:18.326868221Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:10:18.326875164Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:10:18.326883007Z [inf]        "remotePort": 19444
2025-12-14T17:10:18.326890350Z [inf]      }
2025-12-14T17:10:18.327905451Z [inf]  [17:10:17 UTC] WARN: Call result not found in cache
2025-12-14T17:10:18.327911175Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:18.327917288Z [inf]  [17:10:17 UTC] INFO: request completed
2025-12-14T17:10:18.327930729Z [inf]      reqId: "req-29"
2025-12-14T17:10:18.327939674Z [inf]      res: {
2025-12-14T17:10:18.327945977Z [inf]        "statusCode": 404
2025-12-14T17:10:18.327952740Z [inf]      }
2025-12-14T17:10:18.327959200Z [inf]      responseTime: 0.5069770812988281
2025-12-14T17:10:20.384414987Z [inf]  [17:10:19 UTC] INFO: incoming request
2025-12-14T17:10:20.384428624Z [inf]      reqId: "req-2a"
2025-12-14T17:10:20.384439504Z [inf]      req: {
2025-12-14T17:10:20.384448756Z [inf]        "method": "GET",
2025-12-14T17:10:20.384456491Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:10:20.384465324Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:10:20.384474756Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:10:20.384483317Z [inf]        "remotePort": 19444
2025-12-14T17:10:20.384489565Z [inf]      }
2025-12-14T17:10:20.384498317Z [inf]  [17:10:19 UTC] WARN: Call result not found in cache
2025-12-14T17:10:20.384506388Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:20.384513152Z [inf]  [17:10:19 UTC] INFO: request completed
2025-12-14T17:10:20.384518449Z [inf]      reqId: "req-2a"
2025-12-14T17:10:20.384524928Z [inf]      res: {
2025-12-14T17:10:20.384531118Z [inf]        "statusCode": 404
2025-12-14T17:10:20.384537253Z [inf]      }
2025-12-14T17:10:20.384544800Z [inf]      responseTime: 0.7275910377502441
2025-12-14T17:10:22.432518258Z [inf]      }
2025-12-14T17:10:22.432527504Z [inf]  [17:10:21 UTC] INFO: incoming request
2025-12-14T17:10:22.432528988Z [inf]      responseTime: 0.4715590476989746
2025-12-14T17:10:22.432534436Z [inf]      reqId: "req-2b"
2025-12-14T17:10:22.432539575Z [inf]      req: {
2025-12-14T17:10:22.432543645Z [inf]        "method": "GET",
2025-12-14T17:10:22.432547742Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:10:22.432552913Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:10:22.432557343Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:10:22.432561724Z [inf]        "remotePort": 19444
2025-12-14T17:10:22.432565409Z [inf]      }
2025-12-14T17:10:22.432569717Z [inf]  [17:10:21 UTC] WARN: Call result not found in cache
2025-12-14T17:10:22.432573961Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:22.432578522Z [inf]  [17:10:21 UTC] INFO: request completed
2025-12-14T17:10:22.432582665Z [inf]      reqId: "req-2b"
2025-12-14T17:10:22.432586939Z [inf]      res: {
2025-12-14T17:10:22.432591050Z [inf]        "statusCode": 404
2025-12-14T17:10:24.496086237Z [inf]  [17:10:23 UTC] INFO: incoming request
2025-12-14T17:10:24.496095102Z [inf]      reqId: "req-2c"
2025-12-14T17:10:24.496100472Z [inf]      req: {
2025-12-14T17:10:24.496104761Z [inf]        "method": "GET",
2025-12-14T17:10:24.496109321Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:10:24.496113965Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:10:24.496118361Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:10:24.496123465Z [inf]        "remotePort": 19444
2025-12-14T17:10:24.496127497Z [inf]      }
2025-12-14T17:10:24.496132372Z [inf]  [17:10:23 UTC] WARN: Call result not found in cache
2025-12-14T17:10:24.496136761Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:24.496141281Z [inf]  [17:10:23 UTC] INFO: request completed
2025-12-14T17:10:24.496145168Z [inf]      reqId: "req-2c"
2025-12-14T17:10:24.496149447Z [inf]      res: {
2025-12-14T17:10:24.496153355Z [inf]        "statusCode": 404
2025-12-14T17:10:24.496157446Z [inf]      }
2025-12-14T17:10:24.496168627Z [inf]      responseTime: 0.47843098640441895
2025-12-14T17:10:26.528147319Z [inf]      reqId: "req-2d"
2025-12-14T17:10:26.528161399Z [inf]      res: {
2025-12-14T17:10:26.528167353Z [inf]  [17:10:25 UTC] INFO: incoming request
2025-12-14T17:10:26.528170889Z [inf]        "statusCode": 404
2025-12-14T17:10:26.528178398Z [inf]      reqId: "req-2d"
2025-12-14T17:10:26.528179534Z [inf]      }
2025-12-14T17:10:26.528188171Z [inf]      req: {
2025-12-14T17:10:26.528190213Z [inf]      responseTime: 0.4128530025482178
2025-12-14T17:10:26.528194982Z [inf]        "method": "GET",
2025-12-14T17:10:26.528202167Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:10:26.528208286Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:10:26.528213368Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:10:26.528218481Z [inf]        "remotePort": 19444
2025-12-14T17:10:26.528224097Z [inf]      }
2025-12-14T17:10:26.528229791Z [inf]  [17:10:25 UTC] WARN: Call result not found in cache
2025-12-14T17:10:26.528235394Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:26.528240118Z [inf]  [17:10:25 UTC] INFO: request completed
2025-12-14T17:10:28.582904075Z [inf]  [17:10:27 UTC] INFO: incoming request
2025-12-14T17:10:28.582925373Z [inf]      reqId: "req-2e"
2025-12-14T17:10:28.582934304Z [inf]  [17:10:27 UTC] WARN: Call result not found in cache
2025-12-14T17:10:28.582934873Z [inf]      req: {
2025-12-14T17:10:28.582944102Z [inf]        "method": "GET",
2025-12-14T17:10:28.582949438Z [inf]        "statusCode": 404
2025-12-14T17:10:28.582949452Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:28.582955004Z [inf]        "url": "/api/v1/vapi/calls/019b1dd6-b4c4-766a-b238-3e25b077f802",
2025-12-14T17:10:28.582961651Z [inf]  [17:10:27 UTC] INFO: request completed
2025-12-14T17:10:28.582964436Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:10:28.582966567Z [inf]      }
2025-12-14T17:10:28.582971747Z [inf]  [17:10:27 UTC] INFO: Webhook timeout, falling back to VAPI polling
2025-12-14T17:10:28.582972291Z [inf]      reqId: "req-2e"
2025-12-14T17:10:28.582974474Z [inf]        "remoteAddress": "100.64.0.8",
2025-12-14T17:10:28.582983488Z [inf]      res: {
2025-12-14T17:10:28.582983763Z [inf]        "remotePort": 19444
2025-12-14T17:10:28.582987432Z [inf]      responseTime: 0.5127060413360596
2025-12-14T17:10:28.582992743Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:28.582994119Z [inf]      }
2025-12-14T17:10:28.583000484Z [inf]  [17:10:27 UTC] WARN: Too many consecutive 404s - webhook appears unavailable (is ngrok running?). Falling back to VAPI polling.
2025-12-14T17:10:28.583011859Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:10:28.583023468Z [inf]      consecutive404Count: 30
2025-12-14T17:11:08.590494930Z [inf]  [17:10:57 UTC] INFO: incoming request
2025-12-14T17:11:08.590502997Z [inf]      reqId: "req-2f"
2025-12-14T17:11:08.590509668Z [inf]      req: {
2025-12-14T17:11:08.590516212Z [inf]        "method": "POST",
2025-12-14T17:11:08.590524250Z [inf]        "url": "/api/v1/vapi/webhook",
2025-12-14T17:11:08.590530876Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:11:08.590538287Z [inf]        "remoteAddress": "100.64.0.5",
2025-12-14T17:11:08.590544646Z [inf]        "remotePort": 33016
2025-12-14T17:11:08.590550942Z [inf]      }
2025-12-14T17:11:08.590557520Z [inf]  [17:10:57 UTC] INFO: VAPI webhook received
2025-12-14T17:11:08.590564418Z [inf]      type: "status-update"
2025-12-14T17:11:08.590571377Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:08.590577943Z [inf]  [17:10:57 UTC] INFO: request completed
2025-12-14T17:11:08.590585074Z [inf]      reqId: "req-2f"
2025-12-14T17:11:08.590591585Z [inf]      res: {
2025-12-14T17:11:08.590599542Z [inf]        "statusCode": 200
2025-12-14T17:11:08.590606062Z [inf]      }
2025-12-14T17:11:08.590612958Z [inf]      responseTime: 149.07511806488037
2025-12-14T17:11:08.590619518Z [inf]  [17:11:01 UTC] INFO: incoming request
2025-12-14T17:11:08.590625872Z [inf]      reqId: "req-2g"
2025-12-14T17:11:08.590633310Z [inf]      req: {
2025-12-14T17:11:08.590640214Z [inf]        "method": "POST",
2025-12-14T17:11:08.590646825Z [inf]        "url": "/api/v1/vapi/webhook",
2025-12-14T17:11:08.590653279Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:11:08.590661185Z [inf]        "remoteAddress": "100.64.0.5",
2025-12-14T17:11:08.590668133Z [inf]        "remotePort": 33016
2025-12-14T17:11:08.590674902Z [inf]      }
2025-12-14T17:11:08.590681786Z [inf]  [17:11:01 UTC] INFO: VAPI webhook received
2025-12-14T17:11:08.590689016Z [inf]      type: "end-of-call-report"
2025-12-14T17:11:08.592140475Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:08.592149720Z [inf]  [17:11:01 UTC] INFO: Call result cached (partial), triggering background enrichment
2025-12-14T17:11:08.592156698Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:08.592163195Z [inf]      status: "completed"
2025-12-14T17:11:08.592169610Z [inf]      duration: 0
2025-12-14T17:11:08.592176923Z [inf]      cost: 0
2025-12-14T17:11:08.592184012Z [inf]      dataStatus: "partial"
2025-12-14T17:11:08.592191240Z [inf]  [17:11:01 UTC] INFO: Waiting before VAPI API fetch
2025-12-14T17:11:08.592197731Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:08.592204574Z [inf]      attempt: 1
2025-12-14T17:11:08.592212244Z [inf]      delayMs: 5000
2025-12-14T17:11:08.592219702Z [inf]  [17:11:01 UTC] INFO: request completed
2025-12-14T17:11:08.592226382Z [inf]      reqId: "req-2g"
2025-12-14T17:11:08.592232955Z [inf]      res: {
2025-12-14T17:11:08.592239524Z [inf]        "statusCode": 200
2025-12-14T17:11:08.592246112Z [inf]      }
2025-12-14T17:11:08.592253281Z [inf]      responseTime: 225.45393013954163
2025-12-14T17:11:08.592260319Z [inf]  [17:11:04 UTC] INFO: Waiting for VAPI analysis processing
2025-12-14T17:11:08.592266859Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:08.592273480Z [inf]      delay: 3000
2025-12-14T17:11:08.592279992Z [inf]      enrichAttempt: 1
2025-12-14T17:11:08.592286897Z [inf]  [17:11:06 UTC] INFO: Fetching call data from VAPI API
2025-12-14T17:11:08.592293289Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:08.592300623Z [inf]      attempt: 1
2025-12-14T17:11:08.592307819Z [inf]  [17:11:06 UTC] WARN: VAPI API returned incomplete data, will retry
2025-12-14T17:11:08.592314742Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:08.592703534Z [inf]      attempt: 1
2025-12-14T17:11:08.592711294Z [inf]  [17:11:06 UTC] INFO: Waiting before VAPI API fetch
2025-12-14T17:11:08.592717795Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:08.592724200Z [inf]      attempt: 2
2025-12-14T17:11:08.592731102Z [inf]      delayMs: 10000
2025-12-14T17:11:08.592737700Z [inf]  [17:11:07 UTC] INFO: Waiting for VAPI analysis processing
2025-12-14T17:11:08.592744007Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:08.592750407Z [inf]      delay: 5000
2025-12-14T17:11:08.592756654Z [inf]      enrichAttempt: 2
2025-12-14T17:11:13.885313994Z [inf]  [17:11:12 UTC] INFO: Waiting for VAPI analysis processing
2025-12-14T17:11:13.885324617Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:13.885331070Z [inf]      delay: 8000
2025-12-14T17:11:13.885335639Z [inf]      enrichAttempt: 3
2025-12-14T17:11:16.938570239Z [inf]  [17:11:16 UTC] INFO: Fetching call data from VAPI API
2025-12-14T17:11:16.938580155Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:16.938585989Z [inf]      attempt: 2
2025-12-14T17:11:17.451861799Z [inf]  [17:11:17 UTC] WARN: VAPI API returned incomplete data, will retry
2025-12-14T17:11:17.451867568Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:17.451871439Z [inf]      attempt: 2
2025-12-14T17:11:17.451875414Z [inf]  [17:11:17 UTC] INFO: Waiting before VAPI API fetch
2025-12-14T17:11:17.451879078Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:17.451884258Z [inf]      attempt: 3
2025-12-14T17:11:17.451888211Z [inf]      delayMs: 15000
2025-12-14T17:11:21.507164066Z [inf]  [17:11:21 UTC] WARN: Analysis not ready after enrichment attempts, returning partial data
2025-12-14T17:11:21.507170201Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:21.507174976Z [inf]      hasAnalysis: false
2025-12-14T17:11:21.631650132Z [inf]        "failed": 0,
2025-12-14T17:11:21.631650189Z [inf]  [17:11:21 UTC] INFO: Call result saved to database
2025-12-14T17:11:21.631661955Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:21.631670049Z [inf]        "timeout": 0,
2025-12-14T17:11:21.631673924Z [inf]      providerId: "3df6608f-fccf-44b1-a0d3-b19f895c5714"
2025-12-14T17:11:21.631679435Z [inf]        "noAnswer": 0,
2025-12-14T17:11:21.631684349Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:11:21.631685539Z [inf]        "voicemail": 0,
2025-12-14T17:11:21.631691413Z [inf]  [17:11:21 UTC] INFO: Batch provider calls completed
2025-12-14T17:11:21.631691492Z [inf]        "duration": 113058,
2025-12-14T17:11:21.631697664Z [inf]        "averageCallDuration": 0
2025-12-14T17:11:21.631697780Z [inf]      total: 1
2025-12-14T17:11:21.631703192Z [inf]      }
2025-12-14T17:11:21.631703927Z [inf]      completed: 1
2025-12-14T17:11:21.631708946Z [inf]      method: "direct_vapi"
2025-12-14T17:11:21.631709712Z [inf]      failed: 0
2025-12-14T17:11:21.631714316Z [inf]  [17:11:21 UTC] INFO: Background batch call processing completed (real + simulated)
2025-12-14T17:11:21.631715652Z [inf]      timeout: 0
2025-12-14T17:11:21.631719963Z [inf]      noAnswer: 0
2025-12-14T17:11:21.631723849Z [inf]      voicemail: 0
2025-12-14T17:11:21.631727786Z [inf]      duration: 113058
2025-12-14T17:11:21.631733013Z [inf]      averageCallDuration: 0
2025-12-14T17:11:21.631737750Z [inf]      errorCount: 0
2025-12-14T17:11:21.631742141Z [inf]      durationSeconds: "113.06"
2025-12-14T17:11:21.631746185Z [inf]  [17:11:21 UTC] INFO: Batch provider calls completed via Direct VAPI
2025-12-14T17:11:21.631749889Z [inf]      stats: {
2025-12-14T17:11:21.631759063Z [inf]        "total": 1,
2025-12-14T17:11:21.631763385Z [inf]        "completed": 1,
2025-12-14T17:11:21.632003902Z [inf]      executionId: "d80928b0-1f32-4f17-a8a3-d326dfaad3ee"
2025-12-14T17:11:21.632010986Z [inf]      realCallsSuccess: true
2025-12-14T17:11:21.632016521Z [inf]      realCallsInDatabase: true
2025-12-14T17:11:21.632021627Z [inf]      simulatedCount: 9
2025-12-14T17:11:21.632027930Z [inf]  [17:11:21 UTC] INFO: Kestra batch completed with results in database - waiting for all provider results
2025-12-14T17:11:21.632034164Z [inf]      executionId: "d80928b0-1f32-4f17-a8a3-d326dfaad3ee"
2025-12-14T17:11:21.632040008Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:11:21.763525927Z [inf]  [17:11:21 UTC] INFO: All provider calls completed - generating recommendations
2025-12-14T17:11:21.763531827Z [inf]      executionId: "d80928b0-1f32-4f17-a8a3-d326dfaad3ee"
2025-12-14T17:11:21.763538081Z [inf]      completedCount: 10
2025-12-14T17:11:21.763544301Z [inf]      totalProviders: 10
2025-12-14T17:11:21.774985252Z [inf]  [17:11:21 UTC] INFO: Status updated to ANALYZING after confirming all provider calls completed
2025-12-14T17:11:21.775006827Z [inf]      executionId: "d80928b0-1f32-4f17-a8a3-d326dfaad3ee"
2025-12-14T17:11:21.775019823Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:11:21.813809978Z [inf]  [Filter] Excluding Home Improvement Greenville SC: call not completed (status: no_answer)
2025-12-14T17:11:21.813816616Z [inf]  [Filter] Excluding Rockler Woodworking and Hardware - Greenville: disqualified - Provider is a retail hardware store and does not offer carpentry or custom cabinet building services.
2025-12-14T17:11:21.813821234Z [inf]  [Filter] Excluding Forest Kitchen Design: no/invalid structured data or missing call_outcome
2025-12-14T17:11:21.838326024Z [inf]  [17:11:21 UTC] INFO: Generating recommendations
2025-12-14T17:11:21.838334996Z [inf]      kestraEnabled: false
2025-12-14T17:11:21.838341302Z [inf]      kestraHealthy: false
2025-12-14T17:11:21.838346194Z [inf]      callResultsCount: 10
2025-12-14T17:11:23.886628693Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:11:23.886636429Z [inf]      error: "Twilio not configured"
2025-12-14T17:11:23.886653714Z [inf]  [17:11:22 UTC] INFO: Direct Gemini recommendations generated successfully
2025-12-14T17:11:23.886664822Z [inf]      recommendationCount: 3
2025-12-14T17:11:23.886672355Z [inf]  [17:11:22 UTC] INFO: Recommendations stored in database and status updated to RECOMMENDED
2025-12-14T17:11:23.886678897Z [inf]      executionId: "d80928b0-1f32-4f17-a8a3-d326dfaad3ee"
2025-12-14T17:11:23.886685384Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:11:23.886692106Z [inf]      recommendationCount: 3
2025-12-14T17:11:23.886702525Z [inf]  [17:11:23 UTC] WARN: Twilio credentials not configured - SMS sending disabled
2025-12-14T17:11:23.886709973Z [inf]  [17:11:23 UTC] WARN: [TriggerNotification] Twilio not available, skipping notification
2025-12-14T17:11:23.886714818Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:11:23.886733580Z [inf]  [17:11:23 UTC] WARN: User notification failed
2025-12-14T17:11:32.948335755Z [inf]  [17:11:32 UTC] INFO: Fetching call data from VAPI API
2025-12-14T17:11:32.948344740Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:32.948351840Z [inf]      attempt: 3
2025-12-14T17:11:32.948358162Z [inf]  [17:11:32 UTC] WARN: VAPI API returned incomplete data, will retry
2025-12-14T17:11:32.948364570Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:32.948371551Z [inf]      attempt: 3
2025-12-14T17:11:32.948380178Z [inf]  [17:11:32 UTC] INFO: Waiting before VAPI API fetch
2025-12-14T17:11:32.948389607Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:32.948395243Z [inf]      attempt: 4
2025-12-14T17:11:32.948401282Z [inf]      delayMs: 20000
2025-12-14T17:11:38.010356229Z [inf]  [17:11:37 UTC] INFO: incoming request
2025-12-14T17:11:38.010361743Z [inf]      reqId: "req-2h"
2025-12-14T17:11:38.010366486Z [inf]      req: {
2025-12-14T17:11:38.010366823Z [inf]  [17:11:37 UTC] INFO: Using admin test phone for booking call
2025-12-14T17:11:38.010371110Z [inf]        "method": "POST",
2025-12-14T17:11:38.010376545Z [inf]        "url": "/api/v1/bookings/schedule-async",
2025-12-14T17:11:38.010379789Z [inf]      testPhone: "+13106992541"
2025-12-14T17:11:38.010381975Z [inf]        "host": "api-production-8fe4.up.railway.app",
2025-12-14T17:11:38.010386905Z [inf]        "remoteAddress": "100.64.0.6",
2025-12-14T17:11:38.010390168Z [inf]      providerPhone: "+18646278760"
2025-12-14T17:11:38.010391739Z [inf]        "remotePort": 30384
2025-12-14T17:11:38.010396671Z [inf]      }
2025-12-14T17:11:38.010401631Z [inf]  [17:11:37 UTC] INFO: Async booking initiated - processing in background
2025-12-14T17:11:38.010403676Z [inf]  [17:11:37 UTC] INFO: Making real booking call (mode: test)
2025-12-14T17:11:38.010408556Z [inf]      serviceRequestId: "1704b050-515e-44d9-b9da-172d419406e2"
2025-12-14T17:11:38.010413834Z [inf]      providerId: "69f75b70-1ee4-4141-bd02-6b8ad472717f"
2025-12-14T17:11:38.010414299Z [inf]      providerId: "69f75b70-1ee4-4141-bd02-6b8ad472717f"
2025-12-14T17:11:38.010418998Z [inf]      mode: "test"
2025-12-14T17:11:38.010423421Z [inf]      phone: "+13106992541"
2025-12-14T17:11:38.010423845Z [inf]      liveCallEnabled: true
2025-12-14T17:11:38.010428374Z [inf]      adminTestMode: true
2025-12-14T17:11:38.010432548Z [inf]  [17:11:37 UTC] INFO: request completed
2025-12-14T17:11:38.010436478Z [inf]      reqId: "req-2h"
2025-12-14T17:11:38.010440145Z [inf]      res: {
2025-12-14T17:11:38.010444181Z [inf]        "statusCode": 202
2025-12-14T17:11:38.010447939Z [inf]      }
2025-12-14T17:11:38.010452112Z [inf]      responseTime: 67.52710008621216
2025-12-14T17:11:38.010788513Z [inf]      mode: "test"
2025-12-14T17:11:39.021264299Z [inf]  [17:11:38 UTC] INFO: Booking call created, waiting for completion
2025-12-14T17:11:39.021272579Z [inf]      callId: "019b1dd8-adb4-788c-92b1-0cf38ef9e1a5"
2025-12-14T17:11:39.021278097Z [inf]      status: "queued"
2025-12-14T17:11:59.005632032Z [inf]  [17:11:52 UTC] INFO: Fetching call data from VAPI API
2025-12-14T17:11:59.005640065Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:59.005647039Z [inf]      attempt: 4
2025-12-14T17:11:59.005654505Z [inf]  [17:11:53 UTC] WARN: VAPI API returned incomplete data, will retry
2025-12-14T17:11:59.005661631Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:11:59.005667584Z [inf]      attempt: 4
2025-12-14T17:11:59.005673013Z [inf]  [17:11:53 UTC] ERROR: Max enrichment attempts reached, keeping partial data
2025-12-14T17:11:59.005679323Z [inf]      callId: "019b1dd6-b4c4-766a-b238-3e25b077f802"
2025-12-14T17:12:39.013594895Z [inf]  [17:12:31 UTC] INFO: [Booking] Fallback detection: VAPI missed confirmation, overriding to TRUE based on transcript analysis
2025-12-14T17:12:39.013601717Z [inf]      vapiBookingConfirmed: false
2025-12-14T17:12:39.013607167Z [inf]      hasDateTimeAgreement: true
2025-12-14T17:12:39.013611543Z [inf]      hasConfirmationPattern: true
2025-12-14T17:12:39.013617776Z [inf]      hasRejection: false
2025-12-14T17:12:39.013624257Z [inf]  [17:12:31 UTC] INFO: [Booking] Final booking status after analysis
2025-12-14T17:12:39.013630569Z [inf]      bookingConfirmed: true
2025-12-14T17:12:39.013636323Z [inf]      confirmedDate: "Tomorrow"
2025-12-14T17:12:39.013644716Z [inf]      confirmedTime: "1 PM"
2025-12-14T17:12:39.013652132Z [inf]  [17:12:32 UTC] INFO: Real booking call completed (mode: test)
2025-12-14T17:12:39.013658306Z [inf]      providerId: "69f75b70-1ee4-4141-bd02-6b8ad472717f"
2025-12-14T17:12:39.013662867Z [inf]      bookingConfirmed: true