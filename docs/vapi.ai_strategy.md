Kestra is a **declarative workflow orchestration platform** that excels at coordinating complex, multi-step processes with built-in AI agents—perfect for your AI Concierge.[1][2]

## 🎛️ How Kestra Works (5-Minute Overview)

```
User submits request → Kestra Workflow → Multi-Step Execution → Results
```

**Core Concept:** YAML-defined workflows with **tasks** that run sequentially, in parallel, or conditionally.

```yaml
# Simple example: research → call → book
id: concierge_workflow
namespace: ai_concierge

tasks:
  - id: research_providers        # Task 1
    type: io.kestra.plugin.aiagent.AIAgent  # AI summarizes web data
  - id: call_candidates           # Task 2 (parallel)
    type: io.kestra.plugin.core.flow.ForEach
  - id: select_best               # Task 3
    type: io.kestra.plugin.aiagent.AIAgent  # AI decides
  - id: book_appointment          # Task 4
    type: io.kestra.plugin.scripts.shell.Scripts  # Vapi.ai call
```

**Key Features for Your Project:**
- **AI Agents** summarize data + make decisions (Wakanda prize)
- **Parallel execution** (call multiple plumbers simultaneously)
- **Webhooks** for real-time frontend updates
- **Memory** across agent steps
- **Error handling** + retries
- **Execution history** (your request logs)

## 🚀 Quickstart (10 Minutes)

```bash
# 1. Docker (easiest for hackathon)
docker run -d \
  -p 8080:8080 \
  -p 8081:8081 \
  -v kestra_server:/app/data \
  --name kestra \
  kestra/kestra server standalone

# 2. Open UI: http://localhost:8080
# 3. Create namespace: ai_concierge
```

## 🔗 **Vapi.ai + Kestra + Gemini = PERFECT COMBINATION** ✅

Your Vapi.ai + Gemini plan **works beautifully** with Kestra. Here's how they integrate:

```
Frontend (Next.js) 
     ↓ POST /api/trigger-workflow
Kestra Workflow
     ↓ Task 1: Research (AI Agent)
     ↓ Task 2: Vapi.ai Call (Shell Script)
     ↓ Task 3: Gemini Analysis (via API)
     ↓ Webhook → Frontend Live Update
```

## 🏗️ Complete Integration Example

### **1. Kestra Workflow (YAML)**
```yaml
# kestra/flows/concierge-complete.yaml
id: concierge_complete
namespace: ai_concierge

inputs:
  - id: service
    type: STRING
    defaults: "plumber"
  - id: location
    type: STRING
    defaults: "Greenville, SC"
  - id: min_rating
    type: FLOAT
    defaults: 4.7

tasks:
  # AI Agent researches providers (Wakanda prize)
  - id: research_providers
    type: io.kestra.plugin.aiagent.AIAgent
    config:
      provider: gemini-2.5-flash  # Your Gemini model
      maxIterations: 5
    prompt: |
      Find {{ inputs.service }} providers in {{ inputs.location }} with 
      rating >= {{ inputs.min_rating }}. Return top 3 with phone numbers.
    tools:
      - name: web_search
        description: "Search Google/Yelp for providers"

  # Parallel calls to top 3 providers via Vapi.ai
  - id: call_providers
    type: io.kestra.plugin.core.flow.ForEach
    items: "{{ outputs.research_providers.json.candidates }}"
    tasks:
      - id: vapi_call
        type: io.kestra.plugin.scripts.shell.Scripts
        containerImage: node:20-alpine
        commands:
          - npm install vapi @google/generative-ai
          - node /kestra/call-provider.js "{{ item.phone }}" "{{ inputs.service }}"
        env:
          VAPI_API_KEY: "{{ secret('VAPI_API_KEY') }}"
          GEMINI_API_KEY: "{{ secret('GEMINI_API_KEY') }}"

  # AI Agent analyzes call results + picks winner
  - id: analyze_calls
    type: io.kestra.plugin.aiagent.AIAgent
    config:
      provider: gemini-2.5-flash
    inputs:
      callResults: "{{ outputs.call_providers.value }}"
    prompt: |
      Analyze these provider call results and pick the BEST one:
      {{ inputs.callResults | toJson }}
      Consider: price, availability, professionalism.
      Output JSON: {selected: index, reason: "..."}

  # Book with selected provider
  - id: book_appointment
    type: io.kestra.plugin.scripts.shell.Scripts
    commands:
      - node /kestra/book-appointment.js "{{ outputs.analyze_calls.json.selected }}"

  # Notify user via webhook
  - id: notify_user
    type: io.kestra.plugin.core.http.Request
    uri: "{{ trigger.body.callback_url }}"
    method: POST
    body: |
      {
        "status": "COMPLETED",
        "selectedProvider": "{{ outputs.analyze_calls.json.selected }}",
        "reasoning": "{{ outputs.analyze_calls.json.reason }}"
      }
```

### **2. Vapi.ai Node.js Script (called by Kestra)**
```javascript
// kestra/call-provider.js
const Vapi = require('vapi');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const vapi = new Vapi(process.env.VAPI_API_KEY);
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function callProvider(phoneNumber, service) {
  // Create Vapi assistant with Gemini
  const assistant = await vapi.assistants.create({
    name: `Concierge for ${service}`,
    voice: {
      provider: 'playht',
      voiceId: 'jennifer'
    },
    model: {
      provider: 'gemini',
      model: 'gemini-2.5-flash',
      apiKey: process.env.GEMINI_API_KEY,
      transcriber: {
        provider: 'deepgram',
        language: 'en'
      }
    },
    systemPrompt: `
      You are calling a ${service} on behalf of a customer in Greenville, SC.
      
      Customer needs: leaking toilet repair ASAP (within 2 days), reputable provider.
      
      During the call, ask:
      1. Availability in next 2 days?
      2. Estimated cost for toilet repair?
      3. Are you licensed/insured?
      4. Typical response time?
      5. Recent customer feedback?
      
      Be professional, polite, and concise. End call with "Thank you, I'll confirm with customer."
      
      Output structured JSON response at end with: availability, price, licensed, notes.
    `
  });

  // Make outbound call
  const call = await vapi.calls.createServerCall({
    phoneNumber,
    assistantId: assistant.id
  });

  // Wait for call to complete + get transcript
  const result = await waitForCallCompletion(call.id);
  
  console.log(JSON.stringify({
    phone: phoneNumber,
    transcript: result.transcript,
    availability: result.availability,
    price: result.price,
    meetsCriteria: result.meetsCriteria
  }));
}

callProvider(process.argv[2], process.argv[3]);
```

### **3. Next.js API Trigger (Your Frontend)**
```typescript
// app/api/trigger-concierge/route.ts
import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  // Trigger Kestra workflow
  const response = await fetch('http://localhost:8081/api/v1/executions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.KESTRA_TOKEN}`,
      'Content-Type': 'application/yaml'
    },
    body: yaml.dump({
      namespace: 'ai_concierge',
      flowId: 'concierge_complete',
      inputs: {
        service: body.service,
        location: body.location,
        min_rating: body.min_rating
      },
      trigger: {
        body: {
          callback_url: `${process.env.NEXT_PUBLIC_URL}/api/kestra-webhook`
        }
      }
    })
  });

  const execution = await response.json();
  
  // Return to frontend immediately
  return Response.json({ 
    executionId: execution.uid,
    status: 'started' 
  });
}
```

### **4. Real-Time Updates (Socket.io)**
```typescript
// Webhook endpoint receives Kestra updates
app.post('/api/kestra-webhook', (req, res) => {
  io.emit('kestra-update', {
    executionId: req.body.executionId,
    status: req.body.status,
    progress: req.body.progress,
    data: req.body.data  // Provider info, transcripts, etc.
  });
  res.status(200).send('OK');
});
```

## 🎯 **Why This Architecture Wins**

| Component | Tool | Why Perfect |
|-----------|------|-------------|
| **Orchestration** | Kestra | AI agents + parallel execution + history |
| **Voice AI** | Vapi.ai + Gemini | Real-time conversation + transcription |
| **Frontend Updates** | Socket.io | Live dashboard (research → calling → booked) |
| **Provider Research** | Kestra AI Agent | Summarizes Yelp/Google (Wakanda prize) |

## ⏱️ **Hackathon Timeline**

```
Hour 0-1:   Docker Kestra + test simple workflow
Hour 1-3:   Build research_providers.yaml (AI agent)
Hour 3-6:   Vapi.ai integration script + call_providers.yaml
Hour 6-8:   Frontend trigger + Socket.io dashboard
Hour 8-10:  Full end-to-end: form → research → calls → booking
```

## 🔧 **Running Locally**

```bash
# Terminal 1: Kestra
docker run -p 8080:8080 -p 8081:8081 kestra/kestra server standalone

# Terminal 2: Next.js
npm run dev

# Terminal 3: Test workflow via UI
# http://localhost:8080 → ai_concierge → concierge_complete
```

**Your Vapi.ai + Gemini plan is unchanged—Kestra just orchestrates it beautifully.** The AI agents handle research/decision-making (for the prize), while Vapi handles the actual phone conversations.[1]

Need the full `call-provider.js` script or Kestra UI screenshots?
