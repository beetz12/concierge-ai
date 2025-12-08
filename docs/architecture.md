# Architecture Diagrams

## 1. High-Level System Architecture (Target State)
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
        Gemini[Gemini Flash 2.0]
        Maps[Google Maps API]
    end

    User((User)) --> Browser
    Browser -->|HTTP/REST| API
    Browser <-->|WebSocket| Realtime
    
    API -->|Read/Write| DB
    API -->|Trigger| Kestra
    
    Kestra -->|Webhook| API
    Kestra -->|Trigger Call| VAPI
    Kestra -->|Search| Maps
    
    VAPI -->|Call| PSTN
    VAPI <-->|Stream Audio| Gemini
    VAPI -->|Webhook Logs| API

    Workers -->|Execute| Kestra
    Docker -.->|Hosts| Kestra
```

## 2. Kestra Workflow Logic (The "Brain")
The core "Concierge" agentic workflow.

```mermaid
flowchart LR
    Start([User Request]) --> Research
    
    subgraph Agents
        Research["Research Agent<br/>(Google Maps)"]
        Contact["Contact Agent<br/>(VAPI.ai + Gemini)"]
        Analysis["Analysis Agent<br/>(Evaluation)"]
        Booking["Booking Agent<br/>(VAPI.ai Scheduling)"]
    end
    
    Research -->|List of Providers| Contact
    Contact -->|Call Transcripts| Analysis
    Analysis -->|Best Option| Booking
    Booking -->|Confirmation| End([Notify User])
    
    Research -.->|Queries| GoogleMaps[Google Maps]
    Contact -.->|Phone Calls| VAPI[VAPI.ai]
    VAPI -.->|Voice Stream| Gemini[Gemini Realtime]
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
