# 5-Day Hackathon Sprint Schedule

**Goal:** Complete AI Concierge (Concierge AI) in 5 days to allow 2 days buffer.
**Team:** 2 Seniors (S1, S2), 2 Juniors (J1, J2).
**Target Prizes:** Wakanda Data (Kestra), Infinity Build (Cline), Stormbreaker (Vercel).

---

## 📅 Day 1: Foundation & "The Brain" Setup

**Goal:** Kestra running, VAPI phone number active, Frontend connected to Supabase (Read/Write).

| Owner | Priority | Task | Technical Details |
| :--- | :--- | :--- | :--- |
| **S1 (Arch)** | **P0** | **Kestra Docker Setup** | Create `docker-compose.yml` with Kestra & Postgres. Ensure it runs locally. |
| **S1 (Arch)** | **P0** | **Kestra <> Gemini** | Create "Research Agent" Flow in Kestra using `gemini-2.0-flash-exp` for Search Grounding. |
| **S2 (Backend)** | **P0** | **VAPI.ai Config** | Buy Phone #, Get API Keys. Create Assistant with `gemini-2.5-flash` system prompt. |
| **S2 (Backend)** | **P0** | **API Connectors** | Create `POST /api/webhooks/vapi` to log calls to console (proof of life). |
| **J1 (Frontend)** | **P0** | **UI Scaffolding** | Add "Loading" states (skeletons) and "Error" toasts (React Hot Toast). |
| **J1 (Frontend)** | **P1** | **Mobile Layout** | Fix Sidebar/Form on mobile (flex-col). |
| **J2 (Infra)** | **P0** | **Supabase DB** | Switch to Hosted Supabase. Apply Migrations. Wire `POST /api/v1/requests`. |
| **J2 (Infra)** | **P0** | **Vercel Init** | Deploy "Hello World" to Vercel. Set params (Supabase URL, Anon Key). |

**Day 1 Deliverable:** Local Kestra running, Live Vercel URL, VAPI number calls and speaks (even if logic is dummy).

### ✅ Status: COMPLETE
- Kestra running on port 8082.
- Research Agent Flow created (`gemini-2.0-flash-exp`).
- Contact Agent Flow created (VAPI + Node.js script).
- Booking Agent Flow created (GCal + Node.js script).
- Trigger API (`POST /api/v1/workflows/trigger`) registered.

### 🧪 How to Test Existing Changes
1.  **Start Kestra:** `docker compose up -d` (Ensure port 8082 is open).
2.  **Trigger Research Agent:**
    ```bash
    curl -X POST http://localhost:8082/api/v1/executions/ai_concierge/research_providers \
      -H "Content-Type: multipart/form-data" \
      -F "service=plumber" \
      -F "location=Greenville, SC"
    ```
3.  **Trigger Contact Agent (Requires Env Vars):**
    ```bash
    # Ensure VAPI_API_KEY is in Kestra Secrets or env
    curl -X POST http://localhost:8082/api/v1/executions/ai_concierge/contact_providers \
      -H "Content-Type: multipart/form-data" \
      -F "provider_phone=+15550000000"
    ```

---

## 📅 Day 2: The "Voice" & "Hands" (Core Mechanics)

**Goal:** VAPI calling real numbers with Gemini intelligence. Google Calendar creating events.

| Owner | Priority | Task | Technical Details |
| :--- | :--- | :--- | :--- |
| **S1 (Arch)** | **P0** | **VAPI Integration Script** | Write `/kestra/call-provider.js`. Node.js script that triggers VAPI call & checks status. |
| **S1 (Arch)** | **P0** | **Kestra "Contact" Task** | Integrate `call-provider.js` into Kestra Flow. |
| **S2 (Backend)** | **P0** | **GCal Integration** | Enable Google Calendar API. Create `create-event.js` script for scheduling. |
| **S2 (Backend)** | **P0** | **OAuth / Service Acct** | Generate JSON credentials for Google Service Account. Add to Kestra Secrets. |
| **J1 (Frontend)** | **P1** | **Real-time Status** | Implement Supabase Realtime (or Socket.io) to show "Calling...", "Researching..." in UI. |
| **J2 (Infra)** | **P1** | **CodeRabbit & Tests** | Install CodeRabbit. Add GH Action for functional tests (Jest). |
| **J2 (Infra)** | **P1** | **Interaction Logging** | Update API to save `interaction_logs` from VAPI webhooks. |

**Day 2 Deliverable:** Kestra can trigger a call. VAPI transcript saved to DB. Calendar event created via script.

### 🔄 Status: IN PROGRESS
- **Creating Scripts:** `call-provider.js` and `create-event.js` are WRITTEN.
- **Pending:** VAPI Phone Number purchase (User Action) & Google Service Account (User Action). 

---

## 📅 Day 3: The "Orchestration" (Connecting the Dots)

**Goal:** Full End-to-End Flow (Research -> Call -> Analyze -> Book).

| Owner | Priority | Task | Technical Details |
| :--- | :--- | :--- | :--- |
| **S1 (Arch)** | **P0** | **Analysis Agent** | Gemini Step in Kestra to parse VAPI transcripts & pick "Best Provider". |
| **S1 (Arch)** | **P0** | **Full Workflow Wiring** | Chain: Research (Search) -> Map (Provider List) -> ForEach (Call) -> Analyze -> Condition (If/Else) -> Book. |
| **S2 (Backend)** | **P0** | **Trigger Endpoint** | Finalize `POST /api/v1/workflows/trigger`. Pass User Request to Kestra. |
| **S2 (Backend)** | **P1** | **Cline CLI Setup** | Init `/packages/cli`. Implement `generate route` command (Infinity Prize). |
| **J1 (Frontend)** | **P1** | **Request Dashboard** | Show "Steps" in UI: "Searching Google...", "Calling Bob's Plumbing...", "Booking...". |
| **J2 (Infra)** | **P2** | **Error Handling** | If VAPI fails? Retry policy in Kestra. If GCal fails? Fallback notification. |

**Day 3 Deliverable:** User clicks "Find Plumber" -> System actually books a slot (or mock slot) without human intervention.

---

## 📅 Day 4: Automation & "Wow" Factors

**Goal:** Cline CLI automation (Prize Target) and Polish.

| Owner | Priority | Task | Technical Details |
| :--- | :--- | :--- | :--- |
| **S1 (Arch)** | **P1** | **Advanced Research** | Improve Gemini Prompt for Search Grounding (filter bad results). |
| **S2 (Backend)** | **P0** | **Cline CLI Polish** | Add `test-flow` and `deploy` commands to CLI. Write `.clinerules`. |
| **J1 (Frontend)** | **P2** | **Animations** | Add framer-motion. Make the "Thinking" state look cool/premium. |
| **J1 (Frontend)** | **P2** | **Stats/Charts** | Simple chart: "Time Saved by AI" vs "Manual Calling". |
| **J2 (Infra)** | **P0** | **Production Deploy** | Final Docker -> Cloud (or stable VPS) for Kestra. Env Var audit. |

**Day 4 Deliverable:** working CLI tool. Slick UI with animations. Stable Production Deployment.

---

## 📅 Day 5: Demo Prep & Contingency

**Goal:** Video, Readme, Submission. Leave Days 6-7 for emergency only.

| Owner | Priority | Task | Technical Details |
| :--- | :--- | :--- | :--- |
| **S1 (Arch)** | **P0** | **Demo Video** | Record "Happy Path". Voiceover. explaining Kestra/VAPI/Gemini roles. |
| **S2 (Backend)** | **P0** | **Readme/Docs** | Write "How to Reproduce". Document Prize integrations explicitly. |
| **J1 (Frontend)** | **P1** | **Seed Data** | Create "Fake History" so the app looks used/popular in the demo. |
| **J2 (Infra)** | **P1** | **Final QA** | Run through "Happy Path" 10 times. Catch any flaky API failures. |

**Day 5 Deliverable:** **SUBMISSION READY.**

---

## 🏆 Prize Alignment Check

- [ ] **Wakanda Data (Kestra)**: S1 completes Flows on Days 2-3.
- [ ] **Infinity Build (Cline)**: S2 builds CLI on Days 3-4.
- [ ] **Stormbreaker (Vercel)**: J2 deploys on Day 1 & 4.
- [ ] **Captain Code (CodeRabbit)**: J2 installs Day 2.

## 🚀 Execution Strategy

- **Morning Standup:** 15 mins. Blocker check.
- **Mid-Day Check:** Re-align if VAPI/Google APIs are flaky.
- **Evening Push:** Merge working code.
- **"Fake it till you make it":** If GCal API is blocked by unverified app screen, use a standard Nodemailer email confirmation as valid fallback for "Booking".
