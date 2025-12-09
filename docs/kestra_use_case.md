# When to Use Kestra vs Direct API Calls

**Date**: 2025-12-08
**Context**: AI Concierge project architecture decision

---

## Current State: Direct API Calls Are Sufficient

For our current MVP/hackathon implementation, **Kestra adds unnecessary overhead**:

### With Kestra

```
Frontend → API → Kestra → VAPI/Gemini → API → Database
```

### With Direct Calls (Current)

```
Frontend → API → VAPI/Gemini → Database
```

Same result, fewer moving parts. The fallback system we built is the more pragmatic architecture for now.

---

## When Kestra Becomes Valuable

Kestra shines in complex, long-running workflows with business logic.

### Example: "Smart Concierge" with Real-World Complexity

**User Request:**

> "Find me a plumber for a leaking pipe. I need someone licensed, insured, available this week, under $150/hour. If no one meets all criteria, I'll accept 3 out of 4. Don't call anyone before 9am or after 6pm. If I don't respond to confirm within 2 hours, auto-book the best option."

**Workflow Steps:**

```
1. Research providers (Gemini)
2. Filter by business hours (wait if outside 9am-6pm)
3. Call Provider A
   ├─ No answer? → Retry in 30 min (up to 3x)
   ├─ Voicemail? → Mark for callback, try Provider B
   └─ Answered? → Evaluate against criteria
4. Call Provider B, C, D in parallel (if A didn't qualify)
5. Score all results against criteria (strict → relaxed)
6. Send user notification with top 3 options
7. PAUSE workflow - wait for user response (up to 2 hours)
8. If user responds → book their choice
9. If timeout → auto-book best match
10. Send confirmation + add to Google Calendar
11. 24 hours before: send reminder
12. After appointment: request feedback for ML training
```

---

## Why Direct API Calls Struggle with Complex Workflows

### 1. State Management Nightmare

```typescript
// Where do you store "we're waiting for user response"?
// What if the server restarts during the 2-hour wait?
// How do you resume at step 7 after a deployment?
```

### 2. Retry Logic Explosion

```typescript
// This gets ugly fast:
async function callWithRetry(provider, attempt = 1) {
  try {
    const result = await vapiCall(provider);
    if (result.status === "no_answer" && attempt < 3) {
      await sleep(30 * 60 * 1000); // 30 min - blocks a worker!
      return callWithRetry(provider, attempt + 1);
    }
    return result;
  } catch (e) {
    // More retry logic...
  }
}
```

### 3. Business Hours Logic

```typescript
// Scattered throughout your codebase:
if (isOutsideBusinessHours()) {
  // Schedule for later... but how? Cron job? Database flag?
  // What timezone? What about holidays?
}
```

### 4. Human-in-the-Loop

```typescript
// How do you "pause" an API call for 2 hours?
// You can't. You need:
// - Database to track state
// - Webhook to resume
// - Timeout checker (another cron job?)
// - Logic to handle "user never responded"
```

---

## How Kestra Solves This Elegantly

```yaml
id: smart_concierge_booking
namespace: ai_concierge

inputs:
  - id: user_request
    type: STRING
  - id: user_id
    type: STRING
  - id: criteria
    type: JSON

tasks:
  # Step 1: Research
  - id: research
    type: io.kestra.plugin.ai.agent.AIAgent
    provider: gemini-2.5-flash
    prompt: "Find providers for: {{ inputs.user_request }}"

  # Step 2: Wait for business hours (built-in!)
  - id: wait_for_business_hours
    type: io.kestra.plugin.core.flow.WaitFor
    condition: "{{ now().hour >= 9 and now().hour < 18 }}"
    interval: PT15M # Check every 15 minutes

  # Step 3-4: Parallel calls with individual retry
  - id: call_providers
    type: io.kestra.plugin.core.flow.EachParallel
    items: "{{ outputs.research.providers }}"
    tasks:
      - id: call_single_provider
        type: io.kestra.plugin.core.flow.Retry
        maxAttempts: 3
        delay: PT30M # 30 minute delay between retries
        tasks:
          - id: vapi_call
            type: io.kestra.plugin.scripts.node.Script
            script: "{{ read('call-provider.js') }}"

  # Step 5: Score results
  - id: score_results
    type: io.kestra.plugin.ai.agent.AIAgent
    prompt: "Score these results against criteria: {{ inputs.criteria }}"

  # Step 6: Notify user
  - id: notify_user
    type: io.kestra.plugin.notifications.slack.SlackIncomingWebhook
    message: "Found {{ outputs.score_results.matches }} providers!"

  # Step 7: PAUSE and wait for user (the magic!)
  - id: wait_for_user_decision
    type: io.kestra.plugin.core.flow.Pause
    timeout: PT2H # 2 hour timeout
    onTimeout:
      - id: auto_book_best
        type: io.kestra.plugin.core.flow.Subflow
        flowId: book_appointment
        inputs:
          provider: "{{ outputs.score_results.best_match }}"

  # Step 8-9: Book based on user choice or auto
  - id: book_appointment
    type: io.kestra.plugin.scripts.node.Script
    script: "{{ read('book-appointment.js') }}"

  # Step 10: Calendar integration
  - id: add_to_calendar
    type: io.kestra.plugin.gcp.calendar.CreateEvent

  # Step 11: Schedule reminder (runs 24h before!)
  - id: schedule_reminder
    type: io.kestra.plugin.core.flow.Subflow
    flowId: send_reminder
    schedule:
      at: "{{ outputs.book_appointment.datetime | dateAdd(-1, 'days') }}"

  # Step 12: Schedule feedback request
  - id: schedule_feedback
    type: io.kestra.plugin.core.flow.Subflow
    flowId: request_feedback
    schedule:
      at: "{{ outputs.book_appointment.datetime | dateAdd(2, 'hours') }}"
```

---

## Key Advantages Comparison

| Challenge                       | Direct Code                      | Kestra                               |
| ------------------------------- | -------------------------------- | ------------------------------------ |
| **Wait 30 min between retries** | Blocks a worker or needs cron    | `delay: PT30M` (built-in)            |
| **Pause for 2 hours**           | Impossible without DB + webhooks | `type: Pause, timeout: PT2H`         |
| **Business hours only**         | Custom logic everywhere          | `WaitFor` with condition             |
| **Parallel calls**              | `Promise.all` + error handling   | `EachParallel` with auto-aggregation |
| **Server restart mid-workflow** | Lost state, manual recovery      | Auto-resume from last step           |
| **Schedule future task**        | Separate cron system             | `schedule.at` inline                 |
| **Audit trail**                 | Build your own logging           | Automatic execution history          |
| **Modify workflow**             | Redeploy code                    | Edit YAML, instant update            |

---

## Architecture Comparison

### Without Kestra (Current Simple Architecture)

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Cron Job  │     │  Database   │     │  API Server │
│  (retries)  │────▶│  (state)    │◀────│  (logic)    │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────┐
│         Custom state machine in TypeScript          │
│   (hundreds of lines, hard to visualize/debug)      │
└─────────────────────────────────────────────────────┘
```

### With Kestra (Complex Workflow Architecture)

```
┌─────────────────────────────────────────────────────┐
│                   Kestra Dashboard                   │
│  ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐   ┌─────┐   │
│  │Step1│──▶│Step2│──▶│Step3│──▶│Step4│──▶│Step5│   │
│  └─────┘   └─────┘   └─────┘   └─────┘   └─────┘   │
│     ✓         ✓         ⏸️        ○         ○       │
│                     (paused,                        │
│                   waiting for                       │
│                   user input)                       │
└─────────────────────────────────────────────────────┘
```

---

## Decision Matrix

| Scenario                                         | Recommendation   |
| ------------------------------------------------ | ---------------- |
| Simple request → response flows                  | Direct API calls |
| Everything completes in seconds/minutes          | Direct API calls |
| No human approval steps                          | Direct API calls |
| MVP/hackathon timeline                           | Direct API calls |
| Workflows span hours or days                     | **Kestra**       |
| Human-in-the-loop decisions                      | **Kestra**       |
| Complex retry/backoff logic                      | **Kestra**       |
| Multiple parallel paths with aggregation         | **Kestra**       |
| Scheduled future actions (reminders, follow-ups) | **Kestra**       |
| Audit/compliance requirements                    | **Kestra**       |
| Non-developers need to modify workflows          | **Kestra**       |

---

## Our Current Implementation

We've implemented a **fallback system** that:

- Uses Kestra when available (local/staging with Docker)
- Falls back to direct API calls when Kestra is unavailable (production/Railway)

This gives us the best of both worlds:

- Simple deployment for MVP (no Kestra dependency)
- Option to use Kestra for complex workflows in the future

### Fallback Services

- `ProviderCallingService` → Routes between Kestra and Direct VAPI
- `ResearchService` → Routes between Kestra and Direct Gemini

### Environment Control

```bash
KESTRA_ENABLED=false  # Production (Railway) - uses direct calls
KESTRA_ENABLED=true   # Local/Staging - uses Kestra if healthy
```

---

## Future Considerations

When the product grows to need:

- Multiple workflow variations (residential vs commercial)
- Complex retry/fallback logic
- Human approval steps
- Compliance requirements (audit trails)
- Non-technical team members editing workflows

...then migrating fully to Kestra orchestration makes sense.

For now, the fallback architecture is the right choice.
