# Direct Task Analyzer

Gemini-powered service for analyzing user tasks and generating dynamic prompts for VAPI calls.

## Overview

This service analyzes a user's task description and:
1. **Classifies the task type** (negotiate, refund, complaint, etc.)
2. **Generates strategic guidance** (goals, talking points, objection handlers)
3. **Creates VAPI-ready prompts** (system prompt, first message, closing script)

## Usage

```typescript
import { analyzeDirectTask } from "./services/direct-task/index.js";

const result = await analyzeDirectTask({
  taskDescription: "I need to negotiate my cable bill down from $200 to $150",
  contactName: "Comcast",
  contactPhone: "+15551234567",
});

console.log(result.taskAnalysis);
// {
//   taskType: "negotiate_price",
//   intent: "Reduce monthly cable bill from $200 to $150",
//   difficulty: "moderate"
// }

console.log(result.strategicGuidance);
// {
//   keyGoals: [...],
//   talkingPoints: [...],
//   objectionHandlers: {...},
//   successCriteria: [...]
// }

console.log(result.generatedPrompt);
// {
//   systemPrompt: "You are a warm, confident AI Assistant...",
//   firstMessage: "Hi there! This is an AI assistant calling...",
//   closingScript: "Thank you so much for working with me on this!..."
// }
```

## Task Types

- `negotiate_price` - Negotiating bills, prices, or fees
- `request_refund` - Requesting refunds or credits
- `complain_issue` - Addressing complaints or problems
- `schedule_appointment` - Scheduling or rescheduling appointments
- `cancel_service` - Canceling services or subscriptions
- `make_inquiry` - General questions or information gathering
- `general_task` - Any other task type

## Files

- `types.ts` - TypeScript interfaces for requests, responses, and data structures
- `analyzer.ts` - Main Gemini-powered analyzer that classifies tasks and generates guidance
- `prompt-generator.ts` - Converts analysis into VAPI-ready prompts
- `index.ts` - Export barrel for all services

## Integration with VAPI

The generated prompts follow the same structure as the static prompts in `vapi/assistant-config.ts`:

```typescript
const vapiConfig = {
  model: {
    provider: "google",
    model: "gemini-2.0-flash-exp",
    messages: [
      {
        role: "system",
        content: result.generatedPrompt.systemPrompt,
      },
    ],
  },
  firstMessage: result.generatedPrompt.firstMessage,
  // ... rest of VAPI config
};
```

## Error Handling

The service includes error handling for:
- Missing Gemini API key
- Invalid JSON responses from Gemini
- Network/API failures

All errors are logged and re-thrown with descriptive messages.
