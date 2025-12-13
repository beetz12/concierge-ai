# frontend logs
 DEBUG: injectProviderAPI - Wallet Standard API not available
r.onload @ content.js:2
 Download the React DevTools for a better development experience: https://react.dev/link/react-devtools
 [HMR] connected
 [Fast Refresh] rebuilding
forward-logs-shared.ts:95 [Fast Refresh] done in 187ms
forward-logs-shared.ts:95 Detected `scroll-behavior: smooth` on the `<html>` element. To disable smooth scrolling during route transitions, add `data-scroll-behavior="smooth"` to your <html> element. Learn more: https://nextjs.org/docs/messages/missing-data-scroll-behavior
warn @ forward-logs-shared.ts:95
forward-logs-shared.ts:95 Address selected: Object
page.tsx:175 [Concierge] Persisted 10 providers to database with UUIDs
page.tsx:232 [Concierge] Starting calls to 10 providers
page.tsx:237 [Concierge] Generating context-aware prompts with Gemini...
page.tsx:721 Real-time update: {schema: 'public', table: 'service_requests', commit_timestamp: '2025-12-13T15:49:33.010Z', eventType: 'UPDATE', new: {…}, …}
page.tsx:726 [Subscription] Status change: CALLING → CALLING
AppProvider.tsx:52 Cannot update a component (`AppProvider`) while rendering a different component (`RequestDetails`). To locate the bad setState() call inside `RequestDetails`, follow the stack trace as described in https://react.dev/link/setstate-in-render
error @ intercept-console-error.ts:42
scheduleUpdateOnFiber @ react-dom-client.development.js:17722
dispatchSetStateInternal @ react-dom-client.development.js:9494
dispatchSetState @ react-dom-client.development.js:9451
addRequest @ AppProvider.tsx:52
RequestDetails.useEffect.channel @ page.tsx:773
basicStateReducer @ react-dom-client.development.js:8255
updateReducerImpl @ react-dom-client.development.js:8365
updateReducer @ react-dom-client.development.js:8288
useState @ react-dom-client.development.js:28623
exports.useState @ react.development.js:1309
RequestDetails @ page.tsx:106
react_stack_bottom_frame @ react-dom-client.development.js:28016
renderWithHooks @ react-dom-client.development.js:7982
updateFunctionComponent @ react-dom-client.development.js:10499
beginWork @ react-dom-client.development.js:12134
runWithFiberInDEV @ react-dom-client.development.js:984
performUnitOfWork @ react-dom-client.development.js:18995
workLoopSync @ react-dom-client.development.js:18823
renderRootSync @ react-dom-client.development.js:18804
performWorkOnRoot @ react-dom-client.development.js:17833
performWorkOnRootViaSchedulerTask @ react-dom-client.development.js:20382
performWorkUntilDeadline @ scheduler.development.js:45
<RequestDetails>
exports.jsx @ react-jsx-runtime.development.js:342
ClientPageRoot @ client-page.tsx:83
react_stack_bottom_frame @ react-dom-client.development.js:28016
renderWithHooksAgain @ react-dom-client.development.js:8082
renderWithHooks @ react-dom-client.development.js:7994
updateFunctionComponent @ react-dom-client.development.js:10499
beginWork @ react-dom-client.development.js:12083
runWithFiberInDEV @ react-dom-client.development.js:984
performUnitOfWork @ react-dom-client.development.js:18995
workLoopConcurrentByScheduler @ react-dom-client.development.js:18989
renderRootConcurrent @ react-dom-client.development.js:18971
performWorkOnRoot @ react-dom-client.development.js:17832
performWorkOnRootViaSchedulerTask @ react-dom-client.development.js:20382
performWorkUntilDeadline @ scheduler.development.js:45
"use client"
Function.all @ VM45 <anonymous>:1
Function.all @ VM45 <anonymous>:1
initializeElement @ react-server-dom-turbopack-client.browser.development.js:1919
"use server"
ResponseInstance @ react-server-dom-turbopack-client.browser.development.js:2742
createResponseFromOptions @ react-server-dom-turbopack-client.browser.development.js:4594
exports.createFromFetch @ react-server-dom-turbopack-client.browser.development.js:4965
createFromNextFetch @ fetch-server-response.ts:487
createFetch @ fetch-server-response.ts:373
fetchServerResponse @ fetch-server-response.ts:195
navigateDynamicallyWithNoPrefetch @ navigation.ts:473
navigate @ navigation.ts:206
navigateReducer @ navigate-reducer.ts:165
clientReducer @ router-reducer.ts:30
action @ app-router-instance.ts:227
runAction @ app-router-instance.ts:107
dispatchAction @ app-router-instance.ts:184
dispatch @ app-router-instance.ts:225
(anonymous) @ use-action-queue.ts:51
startTransition @ react-dom-client.development.js:9208
dispatch @ use-action-queue.ts:50
dispatchAppRouterAction @ use-action-queue.ts:22
dispatchNavigateAction @ app-router-instance.ts:296
(anonymous) @ app-router-instance.ts:379
startTransition @ react.development.js:554
push @ app-router-instance.ts:378
handleSubmit @ page.tsx:103
await in handleSubmit
executeDispatch @ react-dom-client.development.js:20541
runWithFiberInDEV @ react-dom-client.development.js:984
processDispatchQueue @ react-dom-client.development.js:20591
(anonymous) @ react-dom-client.development.js:21162
batchedUpdates$1 @ react-dom-client.development.js:3375
dispatchEventForPluginEventSystem @ react-dom-client.development.js:20745
dispatchEvent @ react-dom-client.development.js:25671
dispatchDiscreteEvent @ react-dom-client.development.js:25639
page.tsx:250 [Concierge] Generated home_service prompts for electrician
page.tsx:309 [Concierge] Starting BATCH call to 10 providers via /api/v1/providers/batch-call-async...
page.tsx:312 [Concierge] Providers: Ron Pyle Electrical @ +18645936613, Dipple Plumbing, Electrical, Heating & Air @ +18646607491, National Electric & Emergency Services @ +18649183321, Holder Electric Supply Inc. @ +18642717111, GE Handyman @ +18644288555, Priority Electrical Service @ +18648349955, Key Electric @ +18648638009, Pollard Electric LLC @ +18643040989, Quality Electrical Contractors @ +18644775507, Fountain Electric & Services | Greenville, SC @ +18644128550
page.tsx:385 [Concierge] Batch call initiated for 10 providers - UI will update via real-time subscriptions
page.tsx:436 [Concierge] Calls initiated, transitioning to ANALYZING. Real-time will handle results.
page.tsx:447 [Concierge] Request 94b72eba-7823-4ea1-abdc-cbd8937117fe now in ANALYZING state. Waiting for calls to complete via real-time.
page.tsx:353 [Concierge] Calls accepted (execution: f66f564f-8f34-4e4d-8406-5345090e7f73). Providers queued: 2
page.tsx:935 Interaction log added: {schema: 'public', table: 'interaction_logs', commit_timestamp: '2025-12-13T15:49:41.195Z', eventType: 'INSERT', new: {…}, …}
page.tsx:1068 [useEffect] Status is ANALYZING, checking for recommendations...
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 0/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
forward-logs-shared.ts:95 JSON parse error: SyntaxError: Unexpected token 'M', "Mon: 8:00 "... is not valid JSON
page.tsx:789 Provider change received: {schema: 'public', table: 'providers', commit_timestamp: '2025-12-13T15:49:42.183Z', eventType: 'UPDATE', new: {…}, …}
forward-logs-shared.ts:95 JSON parse error: SyntaxError: Unexpected token 'M', "Mon: Open "... is not valid JSON
page.tsx:789 Provider change received: {schema: 'public', table: 'providers', commit_timestamp: '2025-12-13T15:49:42.190Z', eventType: 'UPDATE', new: {…}, …}
page.tsx:245 [Recommendations] Stale fetch, ignoring results
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 0/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 1/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 1/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 2/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:1089 [Fallback] Polling for recommendations after 5s
page.tsx:245 [Recommendations] Stale fetch, ignoring results
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 2/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 3/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 3/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 4/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 4/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 5/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 5/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 6/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 6/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 7/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 7/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 8/8]
page.tsx:269 [Recommendations] Call progress: 0/2 calls completed [retry 8/8]
forward-logs-shared.ts:95 JSON parse error: SyntaxError: Unexpected token 'M', "Mon: Open "... is not valid JSON
page.tsx:789 Provider change received: {schema: 'public', table: 'providers', commit_timestamp: '2025-12-13T15:50:40.831Z', eventType: 'UPDATE', new: {…}, …}
page.tsx:935 Interaction log added: {schema: 'public', table: 'interaction_logs', commit_timestamp: '2025-12-13T15:50:41.024Z', eventType: 'INSERT', new: {…}, …}
page.tsx:269 [Recommendations] Call progress: 1/2 calls completed [retry 0/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 1/2 calls completed [retry 1/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 1/2 calls completed [retry 2/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 1/2 calls completed [retry 3/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 1/2 calls completed [retry 4/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 1/2 calls completed [retry 5/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 1/2 calls completed [retry 6/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 1/2 calls completed [retry 7/8]
page.tsx:275 [Recommendations] Calls still in progress, retrying in 2s...
page.tsx:269 [Recommendations] Call progress: 1/2 calls completed [retry 8/8]
forward-logs-shared.ts:95 JSON parse error: SyntaxError: Unexpected token 'M', "Mon: 8:00 "... is not valid JSON
page.tsx:789 Provider change received: {schema: 'public', table: 'providers', commit_timestamp: '2025-12-13T15:51:09.643Z', eventType: 'UPDATE', new: {…}, …}
page.tsx:935 Interaction log added: {schema: 'public', table: 'interaction_logs', commit_timestamp: '2025-12-13T15:51:09.951Z', eventType: 'INSERT', new: {…}, …}
page.tsx:269 [Recommendations] Call progress: 2/2 calls completed [retry 0/8]
page.tsx:287 [Recommendations] All calls complete. Current status: ANALYZING
page.tsx:292 [Recommendations] Generating recommendations from completed calls
page.tsx:437 [DEBUG] Completed providers data: (2) [{…}, {…}]
page.tsx:464 [Filter] Excluding Dipple Plumbing, Electrical, Heating & Air: disqualified - Mailbox full, unable to leave a message or speak to anyone.
page.tsx:527 [Recommendations] Displayed: 1 providers with scores: Ron Pyle Electrical:76
page.tsx:935 Interaction log added: {schema: 'public', table: 'interaction_logs', commit_timestamp: '2025-12-13T15:51:13.024Z', eventType: 'INSERT', new: {…}, …}
page.tsx:935 Interaction log added: {schema: 'public', table: 'interaction_logs', commit_timestamp: '2025-12-13T15:51:19.744Z', eventType: 'INSERT', new: {…}, …}


# backend logs
    reqId: "req-u"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:06 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:06 UTC] INFO: request completed
    reqId: "req-u"
    res: {
      "statusCode": 404
    }
    responseTime: 0.33766698837280273
[15:50:08 UTC] INFO: incoming request
    reqId: "req-v"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:08 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:08 UTC] INFO: request completed
    reqId: "req-v"
    res: {
      "statusCode": 404
    }
    responseTime: 0.20295798778533936
[15:50:08 UTC] INFO: incoming request
    reqId: "req-w"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:08 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:08 UTC] INFO: request completed
    reqId: "req-w"
    res: {
      "statusCode": 404
    }
    responseTime: 0.0947909951210022
[15:50:10 UTC] INFO: incoming request
    reqId: "req-x"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:10 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:10 UTC] INFO: request completed
    reqId: "req-x"
    res: {
      "statusCode": 404
    }
    responseTime: 0.8915420174598694
[15:50:10 UTC] INFO: incoming request
    reqId: "req-y"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:10 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:10 UTC] INFO: request completed
    reqId: "req-y"
    res: {
      "statusCode": 404
    }
    responseTime: 3.065541982650757
[15:50:12 UTC] INFO: incoming request
    reqId: "req-z"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:12 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:12 UTC] INFO: request completed
    reqId: "req-z"
    res: {
      "statusCode": 404
    }
    responseTime: 0.421875
[15:50:12 UTC] INFO: incoming request
    reqId: "req-10"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:12 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:12 UTC] INFO: request completed
    reqId: "req-10"
    res: {
      "statusCode": 404
    }
    responseTime: 0.21037501096725464
[15:50:14 UTC] INFO: incoming request
    reqId: "req-11"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:14 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:14 UTC] INFO: request completed
    reqId: "req-11"
    res: {
      "statusCode": 404
    }
    responseTime: 0.7770829796791077
[15:50:14 UTC] INFO: incoming request
    reqId: "req-12"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:14 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:14 UTC] INFO: request completed
    reqId: "req-12"
    res: {
      "statusCode": 404
    }
    responseTime: 0.4889589548110962
[15:50:14 UTC] INFO: incoming request
    reqId: "req-13"
    req: {
      "method": "POST",
      "url": "/api/v1/vapi/webhook",
      "host": "2ce8048103bc.ngrok-free.app",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63212
    }
[15:50:14 UTC] INFO: VAPI webhook received
    type: "status-update"
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:14 UTC] INFO: request completed
    reqId: "req-13"
    res: {
      "statusCode": 200
    }
    responseTime: 44.88004195690155
[15:50:16 UTC] INFO: incoming request
    reqId: "req-14"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:16 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:16 UTC] INFO: request completed
    reqId: "req-14"
    res: {
      "statusCode": 404
    }
    responseTime: 0.8168749809265137
[15:50:16 UTC] INFO: incoming request
    reqId: "req-15"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:16 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:16 UTC] INFO: request completed
    reqId: "req-15"
    res: {
      "statusCode": 404
    }
    responseTime: 0.19466596841812134
[15:50:18 UTC] INFO: incoming request
    reqId: "req-16"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:18 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:18 UTC] INFO: request completed
    reqId: "req-16"
    res: {
      "statusCode": 404
    }
    responseTime: 1.4238750338554382
[15:50:18 UTC] INFO: incoming request
    reqId: "req-17"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:18 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:18 UTC] INFO: request completed
    reqId: "req-17"
    res: {
      "statusCode": 404
    }
    responseTime: 0.5845829844474792
[15:50:20 UTC] INFO: incoming request
    reqId: "req-18"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:20 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:20 UTC] INFO: request completed
    reqId: "req-18"
    res: {
      "statusCode": 404
    }
    responseTime: 0.7355419993400574
[15:50:20 UTC] INFO: incoming request
    reqId: "req-19"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:20 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:20 UTC] INFO: request completed
    reqId: "req-19"
    res: {
      "statusCode": 404
    }
    responseTime: 0.40929102897644043
[15:50:22 UTC] INFO: incoming request
    reqId: "req-1a"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:22 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:22 UTC] INFO: request completed
    reqId: "req-1a"
    res: {
      "statusCode": 404
    }
    responseTime: 0.42604100704193115
[15:50:22 UTC] INFO: incoming request
    reqId: "req-1b"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:22 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:22 UTC] INFO: request completed
    reqId: "req-1b"
    res: {
      "statusCode": 404
    }
    responseTime: 0.6085840463638306
[15:50:24 UTC] INFO: incoming request
    reqId: "req-1c"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:24 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:24 UTC] INFO: request completed
    reqId: "req-1c"
    res: {
      "statusCode": 404
    }
    responseTime: 0.769333004951477
[15:50:24 UTC] INFO: incoming request
    reqId: "req-1d"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:24 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:24 UTC] INFO: request completed
    reqId: "req-1d"
    res: {
      "statusCode": 404
    }
    responseTime: 0.46929097175598145
[15:50:26 UTC] INFO: incoming request
    reqId: "req-1e"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:26 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:26 UTC] INFO: request completed
    reqId: "req-1e"
    res: {
      "statusCode": 404
    }
    responseTime: 0.48774999380111694
[15:50:26 UTC] INFO: incoming request
    reqId: "req-1f"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:26 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:26 UTC] INFO: request completed
    reqId: "req-1f"
    res: {
      "statusCode": 404
    }
    responseTime: 0.2991250157356262
[15:50:28 UTC] INFO: incoming request
    reqId: "req-1g"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:28 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:28 UTC] INFO: request completed
    reqId: "req-1g"
    res: {
      "statusCode": 404
    }
    responseTime: 0.4641669988632202
[15:50:28 UTC] INFO: incoming request
    reqId: "req-1h"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:28 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:28 UTC] INFO: request completed
    reqId: "req-1h"
    res: {
      "statusCode": 404
    }
    responseTime: 0.3980410099029541
[15:50:29 UTC] INFO: incoming request
    reqId: "req-1i"
    req: {
      "method": "POST",
      "url": "/api/v1/vapi/webhook",
      "host": "2ce8048103bc.ngrok-free.app",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63288
    }
[15:50:29 UTC] INFO: VAPI webhook received
    type: "status-update"
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:29 UTC] INFO: request completed
    reqId: "req-1i"
    res: {
      "statusCode": 200
    }
    responseTime: 1.5102919936180115
[15:50:30 UTC] INFO: incoming request
    reqId: "req-1j"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:30 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:30 UTC] INFO: request completed
    reqId: "req-1j"
    res: {
      "statusCode": 404
    }
    responseTime: 0.5989579558372498
[15:50:30 UTC] INFO: incoming request
    reqId: "req-1k"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:30 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:30 UTC] INFO: request completed
    reqId: "req-1k"
    res: {
      "statusCode": 404
    }
    responseTime: 0.49608302116394043
[15:50:32 UTC] INFO: incoming request
    reqId: "req-1l"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:32 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:32 UTC] INFO: request completed
    reqId: "req-1l"
    res: {
      "statusCode": 404
    }
    responseTime: 1.5334999561309814
[15:50:32 UTC] INFO: incoming request
    reqId: "req-1m"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:32 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:32 UTC] INFO: request completed
    reqId: "req-1m"
    res: {
      "statusCode": 404
    }
    responseTime: 0.7778329849243164
[15:50:34 UTC] INFO: incoming request
    reqId: "req-1n"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:34 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:34 UTC] INFO: request completed
    reqId: "req-1n"
    res: {
      "statusCode": 404
    }
    responseTime: 0.8211669921875
[15:50:34 UTC] INFO: incoming request
    reqId: "req-1o"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:34 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:34 UTC] INFO: request completed
    reqId: "req-1o"
    res: {
      "statusCode": 404
    }
    responseTime: 0.4166250228881836
[15:50:34 UTC] INFO: incoming request
    reqId: "req-1p"
    req: {
      "method": "POST",
      "url": "/api/v1/vapi/webhook",
      "host": "2ce8048103bc.ngrok-free.app",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63288
    }
[15:50:34 UTC] INFO: VAPI webhook received
    type: "end-of-call-report"
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:34 UTC] INFO: Call result cached (partial), triggering background enrichment
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
    status: "completed"
    duration: 0
    cost: 0
    dataStatus: "partial"
[15:50:34 UTC] INFO: Waiting before VAPI API fetch
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
    attempt: 1
    delayMs: 5000
[15:50:34 UTC] INFO: request completed
    reqId: "req-1p"
    res: {
      "statusCode": 200
    }
    responseTime: 2.734833002090454
[15:50:36 UTC] INFO: incoming request
    reqId: "req-1q"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:36 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:36 UTC] INFO: request completed
    reqId: "req-1q"
    res: {
      "statusCode": 404
    }
    responseTime: 0.4591670036315918
[15:50:36 UTC] INFO: incoming request
    reqId: "req-1r"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:36 UTC] INFO: request completed
    reqId: "req-1r"
    res: {
      "statusCode": 200
    }
    responseTime: 1.0954580307006836
[15:50:38 UTC] INFO: incoming request
    reqId: "req-1s"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:38 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:38 UTC] INFO: request completed
    reqId: "req-1s"
    res: {
      "statusCode": 404
    }
    responseTime: 0.39991599321365356
[15:50:38 UTC] INFO: incoming request
    reqId: "req-1t"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:38 UTC] INFO: request completed
    reqId: "req-1t"
    res: {
      "statusCode": 200
    }
    responseTime: 0.2693750262260437
[15:50:39 UTC] INFO: Fetching call data from VAPI API
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
    attempt: 1
[15:50:40 UTC] INFO: incoming request
    reqId: "req-1u"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cb3-7660-aa69-1ae063abd6e9",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:40 UTC] WARN: Call result not found in cache
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:40 UTC] INFO: request completed
    reqId: "req-1u"
    res: {
      "statusCode": 404
    }
    responseTime: 0.6552090048789978
[15:50:40 UTC] INFO: incoming request
    reqId: "req-1v"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63026
    }
[15:50:40 UTC] INFO: request completed
    reqId: "req-1v"
    res: {
      "statusCode": 200
    }
    responseTime: 0.34675002098083496
[15:50:40 UTC] WARN: Too many consecutive 404s - webhook appears unavailable (is ngrok running?). Falling back to VAPI polling.
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
    consecutive404Count: 30
[15:50:40 UTC] INFO: Webhook timeout, falling back to VAPI polling
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:40 UTC] INFO: Call data enriched successfully from VAPI API
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
    transcriptLength: 258
    hasSummary: true
    dataStatus: "complete"
[15:50:40 UTC] INFO: Persisting call result to database
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
    providerId: "49244f7e-c615-47e9-962e-4f93cc42ad51"
    serviceRequestId: "94b72eba-7823-4ea1-abdc-cbd8937117fe"
    status: "completed"
    meetsRequirements: false
[15:50:40 UTC] INFO: Call result saved to database
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
    providerId: "49244f7e-c615-47e9-962e-4f93cc42ad51"
    serviceRequestId: "94b72eba-7823-4ea1-abdc-cbd8937117fe"
[15:50:40 UTC] INFO: Call result persisted to database successfully
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:50:42 UTC] INFO: incoming request
    reqId: "req-1w"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:42 UTC] INFO: request completed
    reqId: "req-1w"
    res: {
      "statusCode": 200
    }
    responseTime: 0.49020904302597046
[15:50:44 UTC] INFO: incoming request
    reqId: "req-1x"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:44 UTC] INFO: request completed
    reqId: "req-1x"
    res: {
      "statusCode": 200
    }
    responseTime: 0.7297919988632202
[15:50:46 UTC] INFO: incoming request
    reqId: "req-1y"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:46 UTC] INFO: request completed
    reqId: "req-1y"
    res: {
      "statusCode": 200
    }
    responseTime: 0.7425829768180847
[15:50:48 UTC] INFO: incoming request
    reqId: "req-1z"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:48 UTC] INFO: request completed
    reqId: "req-1z"
    res: {
      "statusCode": 200
    }
    responseTime: 0.3389589786529541
[15:50:50 UTC] INFO: incoming request
    reqId: "req-20"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:50 UTC] INFO: request completed
    reqId: "req-20"
    res: {
      "statusCode": 200
    }
    responseTime: 0.3404160141944885
[15:50:52 UTC] INFO: incoming request
    reqId: "req-21"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:52 UTC] INFO: request completed
    reqId: "req-21"
    res: {
      "statusCode": 200
    }
    responseTime: 1.832207977771759
[15:50:54 UTC] INFO: incoming request
    reqId: "req-22"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:54 UTC] INFO: request completed
    reqId: "req-22"
    res: {
      "statusCode": 200
    }
    responseTime: 1.7699170112609863
[15:50:56 UTC] INFO: incoming request
    reqId: "req-23"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:56 UTC] INFO: request completed
    reqId: "req-23"
    res: {
      "statusCode": 200
    }
    responseTime: 2.291374981403351
[15:50:58 UTC] INFO: incoming request
    reqId: "req-24"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:50:58 UTC] INFO: request completed
    reqId: "req-24"
    res: {
      "statusCode": 200
    }
    responseTime: 0.34425002336502075
[15:50:58 UTC] INFO: incoming request
    reqId: "req-25"
    req: {
      "method": "POST",
      "url": "/api/v1/vapi/webhook",
      "host": "2ce8048103bc.ngrok-free.app",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63444
    }
[15:50:58 UTC] INFO: VAPI webhook received
    type: "status-update"
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:50:58 UTC] INFO: request completed
    reqId: "req-25"
    res: {
      "statusCode": 200
    }
    responseTime: 1.6515420079231262
[15:51:00 UTC] INFO: incoming request
    reqId: "req-26"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:51:00 UTC] INFO: request completed
    reqId: "req-26"
    res: {
      "statusCode": 200
    }
    responseTime: 1.0170000195503235
[15:51:02 UTC] INFO: incoming request
    reqId: "req-27"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:51:02 UTC] INFO: request completed
    reqId: "req-27"
    res: {
      "statusCode": 200
    }
    responseTime: 0.6792089939117432
[15:51:02 UTC] INFO: incoming request
    reqId: "req-28"
    req: {
      "method": "POST",
      "url": "/api/v1/vapi/webhook",
      "host": "2ce8048103bc.ngrok-free.app",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63444
    }
[15:51:02 UTC] INFO: VAPI webhook received
    type: "end-of-call-report"
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:51:02 UTC] INFO: Call result cached (partial), triggering background enrichment
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
    status: "completed"
    duration: 0
    cost: 0
    dataStatus: "partial"
[15:51:02 UTC] INFO: Waiting before VAPI API fetch
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
    attempt: 1
    delayMs: 5000
[15:51:02 UTC] INFO: request completed
    reqId: "req-28"
    res: {
      "statusCode": 200
    }
    responseTime: 90.90779197216034
[15:51:03 UTC] INFO: Call data complete, returning
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
    enrichAttempt: 0
[15:51:04 UTC] INFO: incoming request
    reqId: "req-29"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:51:04 UTC] INFO: request completed
    reqId: "req-29"
    res: {
      "statusCode": 200
    }
    responseTime: 0.8324999809265137
[15:51:06 UTC] INFO: incoming request
    reqId: "req-2a"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:51:06 UTC] INFO: request completed
    reqId: "req-2a"
    res: {
      "statusCode": 200
    }
    responseTime: 1.0281250476837158
[15:51:07 UTC] INFO: Fetching call data from VAPI API
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
    attempt: 1
[15:51:08 UTC] INFO: incoming request
    reqId: "req-2b"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:51:08 UTC] INFO: request completed
    reqId: "req-2b"
    res: {
      "statusCode": 200
    }
    responseTime: 0.5288329720497131
[15:51:08 UTC] INFO: Call data enriched successfully from VAPI API
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
    transcriptLength: 943
    hasSummary: true
    dataStatus: "complete"
[15:51:08 UTC] INFO: Persisting call result to database
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
    providerId: "dd8dd50a-6ceb-4bb9-a8a0-329b277fc9e5"
    serviceRequestId: "94b72eba-7823-4ea1-abdc-cbd8937117fe"
    status: "completed"
    meetsRequirements: true
    earliestAvailability: "Monday around 10 o'clock"
[15:51:09 UTC] INFO: Call result saved to database
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
    providerId: "dd8dd50a-6ceb-4bb9-a8a0-329b277fc9e5"
    serviceRequestId: "94b72eba-7823-4ea1-abdc-cbd8937117fe"
[15:51:09 UTC] INFO: Call result persisted to database successfully
    callId: "019b1867-4cb3-7660-aa69-1ae063abd6e9"
[15:51:10 UTC] INFO: incoming request
    reqId: "req-2c"
    req: {
      "method": "GET",
      "url": "/api/v1/vapi/calls/019b1867-4cc4-7ffa-8e4f-0c65e9555bcd",
      "host": "localhost:8000",
      "remoteAddress": "127.0.0.1",
      "remotePort": 63008
    }
[15:51:10 UTC] INFO: request completed
    reqId: "req-2c"
    res: {
      "statusCode": 200
    }
    responseTime: 0.5285829901695251
[15:51:12 UTC] WARN: Webhook result timeout, will fall back to polling
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
    timeoutMs: 90000
[15:51:12 UTC] INFO: Webhook timeout, falling back to VAPI polling
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
[15:51:12 UTC] INFO: Call data complete, returning
    callId: "019b1867-4cc4-7ffa-8e4f-0c65e9555bcd"
    enrichAttempt: 0
[15:51:12 UTC] INFO: Batch provider calls completed
    total: 2
    completed: 2
    failed: 0
    timeout: 0
    noAnswer: 0
    voicemail: 0
    duration: 91696
    averageCallDuration: 0
    errorCount: 0
    durationSeconds: "91.70"
[15:51:12 UTC] INFO: Batch provider calls completed via Direct VAPI
    stats: {
      "total": 2,
      "completed": 2,
      "failed": 0,
      "timeout": 0,
      "noAnswer": 0,
      "voicemail": 0,
      "duration": 91696,
      "averageCallDuration": 0
    }
    method: "direct_vapi"
[15:51:12 UTC] INFO: Background batch call processing completed
    executionId: "f66f564f-8f34-4e4d-8406-5345090e7f73"
    success: true
    resultsInDatabase: true
[15:51:12 UTC] INFO: Kestra batch completed with results in database - waiting for all provider results
    executionId: "f66f564f-8f34-4e4d-8406-5345090e7f73"
    serviceRequestId: "94b72eba-7823-4ea1-abdc-cbd8937117fe"
[15:51:13 UTC] INFO: All provider calls completed - generating recommendations
    executionId: "f66f564f-8f34-4e4d-8406-5345090e7f73"
    completedCount: 2
    totalProviders: 10
[15:51:13 UTC] INFO: Status updated to ANALYZING after confirming all provider calls completed
    executionId: "f66f564f-8f34-4e4d-8406-5345090e7f73"
    serviceRequestId: "94b72eba-7823-4ea1-abdc-cbd8937117fe"
[15:51:13 UTC] INFO: Generating recommendations
    kestraEnabled: false
    kestraHealthy: false
    callResultsCount: 2
[15:51:19 UTC] INFO: Direct Gemini recommendations generated successfully
    recommendationCount: 2
[15:51:19 UTC] INFO: Status updated to RECOMMENDED
    executionId: "f66f564f-8f34-4e4d-8406-5345090e7f73"
    serviceRequestId: "94b72eba-7823-4ea1-abdc-cbd8937117fe"
