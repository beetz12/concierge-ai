# Architecture Diagrams

## 1. High-Level System Architecture

### Current State (Day 3+)
The system now features a **VAPI Fallback Architecture** that automatically detects Kestra availability and routes phone calls appropriately. This enables production deployment on Railway (without Kestra) using direct VAPI API calls.

```mermaid
graph TD
    subgraph Client
        Browser[Next.js Client]
    end

    subgraph Backend
        API[Fastify API]
        PCS[ProviderCallingService]
        KC[KestraClient]
        DVC[DirectVapiClient]
        CRS[CallResultService]
        DB[(Postgres/Supabase)]
    end

    subgraph Orchestration
        Kestra[Kestra - Docker:8082]
    end

    subgraph VoiceAI
        VAPI[VAPI.ai Platform]
    end

    Browser -->|HTTP| API
    API -->|Route| PCS
    PCS -->|Check KESTRA_ENABLED| KC
    PCS -->|Fallback| DVC
    KC -->|Trigger Flow| Kestra
    DVC -->|Direct API| VAPI
    Kestra -->|Execute Script| VAPI
    PCS -->|Update DB| CRS
    CRS -->|Write| DB
```

### VAPI Fallback Decision Flow
```mermaid
flowchart TD
    Request[Call Request] --> Check{KESTRA_ENABLED?}
    Check -->|true| Health{Kestra Healthy?}
    Check -->|false| Direct[DirectVapiClient]
    Health -->|yes| Kestra[KestraClient]
    Health -->|no| Direct
    Kestra -->|Workflow| KFlow[Kestra Flow Execution]
    Direct -->|SDK| VSDK[VAPI SDK Call]
    KFlow --> Poll1[Poll Execution Status]
    VSDK --> Poll2[Poll Call Status]
    Poll1 --> Result[CallResult]
    Poll2 --> Result
    Result --> DB[Update Database]
```

### Target State (End of Day 5) (Target State)
This diagram illustrates the complete system architecture including the new Kestra orchestration and Cline automation components.

```mermaid
graph TD
    subgraph Client [Client Side]
        Browser[Next.js Client]
        Mobile[Mobile View]
    end

    subgraph Cloud ["Cloud Infrastructure (Vercel/Supabase)"]
        API[Fastify API - Vercel]
        DB[(Supabase DB)]
        Realtime[Supabase Realtime]
    end

    subgraph Orchestration ["Workflow Engine (Docker)"]
        Kestra[Kestra Server]
        Workers[Kestra Workers]
        Docker[Docker Compose]
    end

    subgraph VoiceAI [Voice Services]
        VAPI[VAPI.ai Platform]
        PSTN[Telephony Network]
    end

    subgraph AI [AI Services]
        Gemini[Gemini Flash 2.5]
    end
    
    subgraph External [External APIs]
        GCal[Google Calendar API]
    end

    User((User)) --> Browser
    Browser -->|HTTP/REST| API
    Browser <-->|WebSocket| Realtime
    
    API -->|Read/Write| DB
    API -->|Trigger| Kestra
    
    Kestra -->|Webhook| API
    Kestra -->|Trigger Call| VAPI
    Kestra -->|Generate/Search| Gemini
    Kestra -->|Schedule Event| GCal
    
    VAPI -->|Call| PSTN
    VAPI <-->|Stream Audio| Gemini
    VAPI -->|Webhook Logs| API

    Workers -->|Execute| Kestra
    Docker -.->|Hosts| Kestra
```

## 2. Provider Calling Service Architecture

### Service Layer (`apps/api/src/services/vapi/`)

| File | Purpose |
|------|---------|
| `types.ts` | Shared type definitions (CallRequest, CallResult, StructuredCallData) |
| `assistant-config.ts` | VAPI assistant configuration (mirrors Kestra's call-provider.js) |
| `direct-vapi.client.ts` | Direct VAPI SDK integration with polling |
| `kestra.client.ts` | Kestra workflow trigger and status polling |
| `call-result.service.ts` | Database updates for providers and interaction_logs |
| `provider-calling.service.ts` | Main orchestrator (routes between Kestra/DirectVAPI) |
| `index.ts` | Service exports |

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/providers/call` | POST | Initiate phone call to provider |
| `/api/v1/providers/call/status` | GET | Check system status (active method, health) |

### Environment Configuration

```bash
# Kestra Configuration
KESTRA_ENABLED=false              # Set true for local/staging with Kestra
KESTRA_URL=http://localhost:8082
KESTRA_NAMESPACE=ai_concierge
KESTRA_HEALTH_CHECK_TIMEOUT=3000

# VAPI Configuration
VAPI_API_KEY=your-key
VAPI_PHONE_NUMBER_ID=your-phone-id
```

---

## 3. Kestra Workflow Logic (The "Brain")

### Current State
Individual flows exist and are now callable via fallback services when Kestra is unavailable.

- `research_agent.yaml`: Functional (Gemini Search) - **Now with Direct Gemini fallback via ResearchService**.
- `contact_agent.yaml`: Functional (VAPI Script) - **Now with Direct VAPI fallback via ProviderCallingService**.
- `booking_agent.yaml`: Functional (GCal Script).

### Research Agent Fallback Flow
```mermaid
flowchart TD
    Request[Research Request] --> Check{KESTRA_ENABLED?}
    Check -->|true| Health{Kestra Healthy?}
    Check -->|false| Direct[DirectResearchClient]
    Health -->|yes| Kestra[KestraResearchClient]
    Health -->|no| Direct
    Kestra -->|Flow| KFlow[research_providers Flow]
    Direct -->|API| Gemini[Gemini + Maps Grounding]
    KFlow --> Result[ResearchResult]
    Gemini --> Result
    Result --> Providers[Provider List]
```

### Target State
The core "Concierge" agentic workflow.

```mermaid
flowchart LR
    Start([User Request]) --> Research
    
    subgraph Agents
        Research["Research Agent<br/>(Gemini Search)"]
        Contact["Contact Agent<br/>(VAPI.ai + Kestra Script)"]
        Analysis["Analysis Agent<br/>(Evaluation)"]
        Booking["Booking Agent<br/>(Google Calendar API)"]
    end
    
    Research -->|List of Providers| Contact
    Contact -->|Call Transcripts| Analysis
    Analysis -->|Best Option| Booking
    Booking -->|Confirmation| End([Notify User])
    
    Research -.->|Queries| Gemini[Gemini Grounding]
    Contact -.->|Phone Calls| VAPI[VAPI.ai]
    VAPI -.->|Voice Stream| Gemini
    Booking -.->|Create Event| GCal[Google Calendar]
```

## 3. Data Flow & Real-Time Updates
How the user gets feedback without reloading.

```mermaid
sequenceDiagram
    participant User
    participant UI as Next.js UI
    participant API
    participant Kestra
    participant SB as Supabase

    User->>UI: Submit Request
    UI->>API: POST /requests
    API->>SB: INSERT Request
    API->>Kestra: Trigger Workflow
    API-->>UI: 202 Accepted
    
    loop Workflow Steps
        Kestra->>Kestra: Execute Step
        Kestra->>API: Webhook (Status Update)
        API->>SB: UPDATE Request Log
        SB-->>UI: Realtime Event (Update)
        UI-->>User: Show Progress
    end
    
    Kestra->>API: Webhook (Complete)
    API->>SB: UPDATE Status = Completed
    SB-->>UI: Realtime Event (Done)
    UI-->>User: Show Result
```

## 4. Infrastructure & DevOps Pipeline
The CI/CD process for the team.

```mermaid
graph LR
    Dev[Developer] -->|Push| GitHub
    
    subgraph CI [CI/CD]
        CodeRabbit[CodeRabbit AI]
        Actions[GitHub Actions]
    end
    
    subgraph Deploy [Deployment]
        Preview[Vercel Preview]
        Prod[Vercel Production]
    end
    
    GitHub --> CodeRabbit
    GitHub --> Actions
    Actions --> Preview
    Actions -->|Merge| Prod
    
    subgraph Local [Local Dev]
        Docker[Docker Compose]
        LocalDB[(Local Supabase)]
    end
    
    Dev -.-> Docker
```

## 5. Domain Model (ER Diagram)
The database schema supporting the application.

```mermaid
erDiagram
    USERS ||--o{ REQUESTS : creates
    REQUESTS ||--|{ INTERACTION_LOGS : has
    REQUESTS ||--o{ PROVIDERS : considers
    REQUESTS ||--|| APP_STATE : tracks

    USERS {
        uuid id PK
        string email
        string created_at
    }

    REQUESTS {
        uuid id PK
        uuid user_id FK
        string content
        string status
        json criteria
        timestamp created_at
    }

    PROVIDERS {
        uuid id PK
        uuid request_id FK
        string name
        string phone
        float rating
        string address
        string call_status
        jsonb call_result
        text call_transcript
        text call_summary
        decimal call_duration_minutes
        decimal call_cost
        text call_method
        text call_id
        timestamp called_at
    }

    INTERACTION_LOGS {
        uuid id PK
        uuid request_id FK
        uuid provider_id FK
        string type
        string content
        string sentiment
        timestamp timestamp
    }
```

### Call Tracking Columns (providers table)

| Column | Type | Description |
|--------|------|-------------|
| `call_status` | TEXT | Current call state (queued, ringing, in-progress, ended, error) |
| `call_result` | JSONB | Structured analysis (availability, rate, criteria_met, etc.) |
| `call_transcript` | TEXT | Full conversation transcript |
| `call_summary` | TEXT | AI-generated summary |
| `call_duration_minutes` | DECIMAL | Call length |
| `call_cost` | DECIMAL | VAPI cost |
| `call_method` | TEXT | 'kestra' or 'direct_vapi' |
| `call_id` | TEXT | VAPI call ID for reference |
| `called_at` | TIMESTAMPTZ | When call was initiated |

---

## 6. Production Deployment Architecture

### Railway (Production - No Kestra)
```mermaid
graph LR
    subgraph Railway
        API[Fastify API]
        DVC[DirectVapiClient]
    end

    subgraph External
        VAPI[VAPI.ai]
        Supabase[(Supabase)]
    end

    API --> DVC
    DVC -->|SDK| VAPI
    API -->|Read/Write| Supabase
```

**Configuration:**
```bash
KESTRA_ENABLED=false
VAPI_API_KEY=your-prod-key
VAPI_PHONE_NUMBER_ID=your-prod-phone-id
```

### Local/Staging (With Kestra)
```mermaid
graph LR
    subgraph Docker
        API[Fastify API]
        Kestra[Kestra:8082]
        KC[KestraClient]
    end

    subgraph External
        VAPI[VAPI.ai]
        Supabase[(Supabase)]
    end

    API --> KC
    KC --> Kestra
    Kestra -->|Script| VAPI
    API -->|Read/Write| Supabase
```

**Configuration:**
```bash
KESTRA_ENABLED=true
KESTRA_URL=http://localhost:8082
```
