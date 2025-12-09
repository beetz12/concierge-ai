# Implementation Guide: Service Consolidation

**Practical step-by-step guide for migrating from gemini.ts to ResearchService**

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Step 1: Audit Current Usage](#step-1-audit-current-usage)
3. [Step 2: Create New Service Structure](#step-2-create-new-service-structure)
4. [Step 3: Migrate Supporting Functions](#step-3-migrate-supporting-functions)
5. [Step 4: Update Routes](#step-4-update-routes)
6. [Step 5: Update Frontend](#step-5-update-frontend)
7. [Step 6: Testing](#step-6-testing)
8. [Step 7: Deploy with Deprecation](#step-7-deploy-with-deprecation)
9. [Step 8: Monitor & Remove](#step-8-monitor--remove)

---

## Prerequisites

### Environment Setup
```bash
# 1. Create feature branch
git checkout -b feature/consolidate-research-service

# 2. Ensure dependencies are installed
pnpm install

# 3. Ensure tests pass before changes
pnpm test

# 4. Create backup of gemini.ts
cp apps/api/src/services/gemini.ts apps/api/src/services/gemini.ts.backup
```

### Required Access
- [ ] Write access to repository
- [ ] Access to production logs (for monitoring)
- [ ] Access to deployment pipeline
- [ ] Team communication channels

---

## Step 1: Audit Current Usage

### 1.1 Find Frontend Usage
```bash
# Search for geminiService imports
grep -rn "from.*geminiService" apps/web/

# Search for searchProviders calls
grep -rn "geminiService.searchProviders" apps/web/

# Search for direct API calls
grep -rn "/api/v1/gemini/search-providers" apps/web/
```

**Expected Output:**
```
apps/web/lib/services/geminiService.ts:35:export const searchProviders
apps/web/app/new/page.tsx:15:import { searchProviders } from '@/lib/services/geminiService'
```

### 1.2 Document Findings
Create a file tracking all usages:

**File:** `docs/migration-audit.txt`
```
Frontend Files Using gemini.ts searchProviders:
1. apps/web/lib/services/geminiService.ts
   - Line 35: searchProviders function definition
   - Action: Update to use workflowService

2. apps/web/app/new/page.tsx (if applicable)
   - Line 15: Import statement
   - Action: Update import

Backend Files:
1. apps/api/src/routes/gemini.ts
   - Line 4: Import searchProviders
   - Line 181: Route handler
   - Action: Add deprecation warning

2. apps/api/src/services/gemini.ts
   - Line 108-274: searchProviders implementation
   - Action: Remove after migration
```

---

## Step 2: Create New Service Structure

### 2.1 Create Directory Structure
```bash
# Create vetting service directory
mkdir -p apps/api/src/services/vetting

# Create booking service directory
mkdir -p apps/api/src/services/booking
```

### 2.2 Create Type Files

**File:** `apps/api/src/services/vetting/types.ts`
```typescript
/**
 * Types for vetting service (call simulation & provider selection)
 */

export interface CallTranscript {
  speaker: "AI" | "Provider";
  text: string;
}

export interface CallSimulationResult {
  timestamp: string;
  stepName: string;
  detail: string;
  transcript?: CallTranscript[];
  status: "success" | "warning" | "error" | "info";
  outcome: "positive" | "negative" | "neutral";
  summary: string;
}

export interface ProviderSelectionResult {
  selectedId: string | null;
  reasoning: string;
}

export interface ProviderForSelection {
  id: string;
  name: string;
  phone?: string;
  rating?: number;
  address?: string;
  source?: string;
}
```

**File:** `apps/api/src/services/booking/types.ts`
```typescript
/**
 * Types for booking service
 */

export interface AppointmentScheduleResult {
  timestamp: string;
  stepName: string;
  detail: string;
  status: "success" | "warning" | "error" | "info";
  confirmationId?: string;
}
```

---

## Step 3: Migrate Supporting Functions

### 3.1 Create Call Simulator Service

**File:** `apps/api/src/services/vetting/call-simulator.ts`
```typescript
import { GoogleGenAI } from "@google/genai";
import type { CallSimulationResult } from "./types.js";

/**
 * Call Simulator Service
 * Generates realistic phone conversation transcripts
 */

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenAI({ apiKey });
};

const cleanJson = (text: string): string => {
  if (!text) return "{}";
  const match = text.match(/(\{)[\s\S]*(\})/);
  if (match) return match[0];
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
};

/**
 * Simulate a phone call to a service provider
 */
export const simulateCall = async (
  providerName: string,
  userCriteria: string,
  isDirect: boolean = false
): Promise<CallSimulationResult> => {
  const ai = getAiClient();
  const model = "gemini-2.5-flash";

  const systemInstruction = `You are a simulator that generates a realistic phone conversation transcript between an AI Receptionist (calling on behalf of a client) and a Service Provider (${providerName}).

  Client Needs: ${userCriteria}

  Rules:
  1. The Provider should answer professionally but might be busy.
  2. The AI Receptionist must ask about availability, rates, and the specific criteria.
  3. The Provider's answers should be realistic (sometimes available, sometimes booked, sometimes expensive).
  4. Return ONLY the JSON object.`;

  const prompt = `Generate a transcript.
  Output JSON format:
  {
    "outcome": "positive" | "negative" | "neutral",
    "summary": "Short summary of findings (e.g., Available Tuesday, $150/hr).",
    "transcript": [
      {"speaker": "AI", "text": "..."},
      {"speaker": "Provider", "text": "..."}
    ]
  }`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });

    const data = JSON.parse(cleanJson(response.text || "{}"));

    return {
      timestamp: new Date().toISOString(),
      stepName: isDirect ? `Calling ${providerName}` : `Vetting ${providerName}`,
      detail: data.summary,
      transcript: data.transcript,
      status:
        data.outcome === "positive"
          ? "success"
          : data.outcome === "negative"
            ? "error"
            : "warning",
      outcome: data.outcome,
      summary: data.summary,
    };
  } catch (error: any) {
    console.error("simulateCall error:", error);
    return {
      timestamp: new Date().toISOString(),
      stepName: `Calling ${providerName}`,
      detail: "Call failed to connect or dropped.",
      status: "error",
      outcome: "negative",
      summary: "Call failed",
    };
  }
};
```

### 3.2 Create Provider Selector Service

**File:** `apps/api/src/services/vetting/provider-selector.ts`
```typescript
import { GoogleGenAI } from "@google/genai";
import type {
  ProviderSelectionResult,
  ProviderForSelection,
  CallSimulationResult,
} from "./types.js";

/**
 * Provider Selector Service
 * AI-powered analysis to select the best provider
 */

const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set");
  }
  return new GoogleGenAI({ apiKey });
};

const cleanJson = (text: string): string => {
  if (!text) return "{}";
  const match = text.match(/(\{)[\s\S]*(\})/);
  if (match) return match[0];
  return text.replace(/```json/g, "").replace(/```/g, "").trim();
};

/**
 * Analyze call results and select the best provider
 */
export const selectBestProvider = async (
  requestTitle: string,
  interactions: CallSimulationResult[],
  providers: ProviderForSelection[]
): Promise<ProviderSelectionResult> => {
  const ai = getAiClient();
  const model = "gemini-2.5-flash";

  const prompt = `
    I have researched providers for: "${requestTitle}".
    Here are the logs from my calls:
    ${JSON.stringify(interactions)}

    Here is the list of providers mapped to those calls (by name):
    ${JSON.stringify(providers)}

    Select the best provider ID based on positive outcomes and criteria match.
    If none are good, return null.

    Return JSON:
    {
      "selectedProviderId": "string or null",
      "reasoning": "Explanation of why this provider was chosen over others."
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: "application/json" },
    });

    const data = JSON.parse(cleanJson(response.text || "{}"));

    return {
      selectedId: data.selectedProviderId,
      reasoning: data.reasoning,
    };
  } catch (error: any) {
    console.error("selectBestProvider error:", error);
    return { selectedId: null, reasoning: "AI Analysis failed." };
  }
};
```

### 3.3 Create Appointment Scheduler Service

**File:** `apps/api/src/services/booking/appointment-scheduler.ts`
```typescript
import type { AppointmentScheduleResult } from "./types.js";

/**
 * Appointment Scheduler Service
 * Handles booking appointments with providers
 */

/**
 * Schedule an appointment (currently simulated)
 */
export const scheduleAppointment = async (
  providerName: string,
  details: string
): Promise<AppointmentScheduleResult> => {
  // Simulate scheduling delay
  await new Promise((resolve) => setTimeout(resolve, 1500));

  return {
    timestamp: new Date().toISOString(),
    stepName: "Booking Appointment",
    detail: `Appointment confirmed with ${providerName}. Confirmation email sent to user.`,
    status: "success",
    confirmationId: `CONF-${Date.now()}`,
  };
};
```

### 3.4 Create Index Exports

**File:** `apps/api/src/services/vetting/index.ts`
```typescript
export * from "./call-simulator.js";
export * from "./provider-selector.js";
export * from "./types.js";
```

**File:** `apps/api/src/services/booking/index.ts`
```typescript
export * from "./appointment-scheduler.js";
export * from "./types.js";
```

---

## Step 4: Update Routes

### 4.1 Update Gemini Routes to Use New Services

**File:** `apps/api/src/routes/gemini.ts`
```typescript
// OLD imports
import {
  searchProviders,  // ❌ Remove this
  simulateCall,
  selectBestProvider,
  scheduleAppointment,
} from "../services/gemini.js";

// NEW imports
import { simulateCall } from "../services/vetting/call-simulator.js";
import { selectBestProvider } from "../services/vetting/provider-selector.js";
import { scheduleAppointment } from "../services/booking/appointment-scheduler.js";

// Add deprecation warning to search-providers endpoint
fastify.post(
  "/search-providers",
  {
    schema: {
      // ... existing schema
      deprecated: true,  // Mark as deprecated in OpenAPI
    },
  },
  async (request, reply) => {
    // Add deprecation headers
    reply.header("X-Deprecated", "true");
    reply.header("X-Deprecated-By", "/api/v1/workflows/research");
    reply.header("X-Deprecated-Removal-Date", "2025-02-01");

    fastify.log.warn({
      endpoint: "/api/v1/gemini/search-providers",
      message: "Deprecated endpoint called",
      userAgent: request.headers["user-agent"],
    });

    // ... existing implementation (keep for now)
  }
);

// Update other routes to use new services (no changes to logic, just imports)
```

### 4.2 Add Deprecation Route

**File:** `apps/api/src/routes/gemini.ts` (add new endpoint)
```typescript
/**
 * GET /deprecation-notice
 * Inform users about deprecated endpoints
 */
fastify.get("/deprecation-notice", async (request, reply) => {
  return {
    deprecated: {
      "/api/v1/gemini/search-providers": {
        status: "deprecated",
        replacedBy: "/api/v1/workflows/research",
        removalDate: "2025-02-01",
        reason: "Consolidated into unified workflow API with better features",
        migrationGuide: "https://github.com/your-repo/blob/main/docs/CONSOLIDATION_IMPLEMENTATION_GUIDE.md",
      },
    },
  };
});
```

---

## Step 5: Update Frontend

### 5.1 Update geminiService to Use Workflow API

**File:** `apps/web/lib/services/geminiService.ts`
```typescript
import { Provider, InteractionLog } from "../types";

// Keep other functions, update only searchProviders

/**
 * Step 1: Search for providers using workflow API
 * @deprecated Use workflowService.searchProviders() instead
 */
export const searchProviders = async (
  query: string,
  location: string
): Promise<{ providers: Provider[]; logs: InteractionLog }> => {
  console.warn(
    "geminiService.searchProviders is deprecated. Use workflowService.searchProviders instead."
  );

  // Redirect to workflow API
  try {
    const response = await fetch("/api/v1/workflows/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service: query, location }),
    });

    if (!response.ok) {
      throw new Error(`Research failed: ${response.statusText}`);
    }

    const result = await response.json();

    return {
      providers: result.data.providers,
      logs: {
        timestamp: new Date().toISOString(),
        stepName: "Market Research",
        detail: result.data.reasoning || `Found ${result.data.providers.length} providers`,
        status: result.data.status === "success" ? "success" : "error",
      },
    };
  } catch (error: any) {
    return {
      providers: [],
      logs: {
        timestamp: new Date().toISOString(),
        stepName: "Market Research",
        detail: `Failed to find providers: ${error.message}`,
        status: "error",
      },
    };
  }
};

// Keep other functions unchanged
export { simulateCall, selectBestProvider, scheduleAppointment };
```

### 5.2 Update Page Imports (if applicable)

**File:** `apps/web/app/new/page.tsx` (example)
```typescript
// OLD import
import { searchProviders } from '@/lib/services/geminiService';

// NEW import (preferred)
import { searchProviders } from '@/lib/services/workflowService';

// Or keep using geminiService (it now proxies to workflow)
// No changes needed if using geminiService
```

---

## Step 6: Testing

### 6.1 Unit Tests for New Services

**File:** `apps/api/src/services/vetting/__tests__/call-simulator.test.ts`
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { simulateCall } from "../call-simulator";

describe("Call Simulator", () => {
  beforeEach(() => {
    // Setup test environment
  });

  it("should simulate a successful call", async () => {
    const result = await simulateCall(
      "Test Plumber",
      "Need emergency plumbing",
      false
    );

    expect(result).toHaveProperty("timestamp");
    expect(result).toHaveProperty("outcome");
    expect(result.status).toBeOneOf(["success", "warning", "error"]);
  });

  it("should handle errors gracefully", async () => {
    // Test error handling
  });
});
```

### 6.2 Integration Tests

**File:** `apps/api/src/routes/__tests__/workflows.integration.test.ts`
```typescript
import { describe, it, expect } from "vitest";
import { build } from "../app"; // Your Fastify app builder

describe("Workflow Routes", () => {
  it("should search providers via workflow API", async () => {
    const app = await build();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/workflows/research",
      payload: {
        service: "plumber",
        location: "Greenville SC",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty("success", true);
    expect(response.json().data).toHaveProperty("providers");
  });
});
```

### 6.3 End-to-End Tests

```bash
# Start development server
pnpm dev

# Test deprecated endpoint
curl -X POST http://localhost:8000/api/v1/gemini/search-providers \
  -H "Content-Type: application/json" \
  -d '{"query":"plumber","location":"Greenville SC"}' \
  -v | grep "X-Deprecated"

# Should see: X-Deprecated: true

# Test new endpoint
curl -X POST http://localhost:8000/api/v1/workflows/research \
  -H "Content-Type: application/json" \
  -d '{"service":"plumber","location":"Greenville SC"}' \
  | jq '.data.providers | length'

# Should see: 10 (or however many providers found)
```

### 6.4 Frontend Testing

```bash
# Start frontend
pnpm --filter web dev

# Navigate to http://localhost:3000/new
# Perform a search
# Open browser dev tools
# Check console for deprecation warnings
# Verify search works correctly
```

---

## Step 7: Deploy with Deprecation

### 7.1 Update Environment Variables

Ensure all environments have required variables:

```env
# Backend .env
GEMINI_API_KEY=your_key_here
GOOGLE_PLACES_API_KEY=your_key_here
KESTRA_ENABLED=false  # or true if using Kestra
KESTRA_URL=http://localhost:8080  # if enabled
```

### 7.2 Deploy to Staging

```bash
# Commit changes
git add .
git commit -m "feat: consolidate research service, deprecate gemini.ts searchProviders"

# Push to staging branch
git push origin feature/consolidate-research-service:staging

# Wait for CI/CD pipeline
# Test on staging environment
```

### 7.3 Monitor Staging

```bash
# Check logs for deprecation warnings
# Staging logs should show:
# "Deprecated endpoint called: /api/v1/gemini/search-providers"

# Verify new endpoint works
# Verify frontend works
# Check error rates
# Monitor performance
```

### 7.4 Deploy to Production

```bash
# Merge to main
git checkout main
git merge feature/consolidate-research-service
git push origin main

# Monitor production deployment
# Watch for errors
# Check deprecation warning frequency
```

---

## Step 8: Monitor & Remove

### 8.1 Monitor Usage (1 Week)

**Setup Monitoring:**
```typescript
// Add to gemini.ts search-providers route
fastify.post("/search-providers", async (request, reply) => {
  // Log usage
  fastify.log.warn({
    event: "deprecated_endpoint_usage",
    endpoint: "/api/v1/gemini/search-providers",
    ip: request.ip,
    userAgent: request.headers["user-agent"],
    timestamp: new Date().toISOString(),
  });

  // ... rest of handler
});
```

**Check Logs Daily:**
```bash
# Search production logs
grep "deprecated_endpoint_usage" logs/*.log | wc -l

# If count is 0 for 7 consecutive days, proceed with removal
```

### 8.2 Final Communication

Send notice to team:

```markdown
Subject: Deprecated Endpoint Removal - Action Required

Team,

The deprecated endpoint `/api/v1/gemini/search-providers` will be removed on [DATE].

**What to do:**
- Update any scripts/tools using the old endpoint
- Use `/api/v1/workflows/research` instead
- See migration guide: [link]

**No action needed if:**
- You're using the web frontend (already updated)
- You're not making direct API calls

Questions? Reach out to [team lead]
```

### 8.3 Remove Deprecated Code

**After 1 week with zero usage:**

```bash
# Create removal branch
git checkout -b chore/remove-deprecated-search

# Remove searchProviders from gemini.ts
# Edit apps/api/src/services/gemini.ts
# Delete lines 108-274 (searchProviders function)

# Remove search-providers route
# Edit apps/api/src/routes/gemini.ts
# Delete search-providers endpoint (lines 75-210)

# Remove geminiService.searchProviders
# Edit apps/web/lib/services/geminiService.ts
# Delete searchProviders function

# Commit and push
git add .
git commit -m "chore: remove deprecated searchProviders endpoint"
git push origin chore/remove-deprecated-search

# Create PR, get approval, merge
```

### 8.4 Update Documentation

**Update CLAUDE.md:**
```markdown
## API Endpoints

### Research
POST /api/v1/workflows/research - Search for providers ✅
GET  /api/v1/workflows/status   - Check system status ✅

### Vetting
POST /api/v1/vetting/simulate-call  - Simulate provider call ✅
POST /api/v1/vetting/select-best    - Select best provider ✅

### Booking
POST /api/v1/booking/schedule       - Schedule appointment ✅

~~POST /api/v1/gemini/search-providers~~ - ❌ REMOVED (use workflows/research)
```

### 8.5 Celebrate! 🎉

```bash
# Migration complete!
# Code is cleaner, more maintainable, and better architected

# Document lessons learned
# Update team wiki
# Add to changelog
```

---

## Troubleshooting

### Issue: Frontend searches not working

**Symptoms:**
- Search returns no results
- Console shows network errors

**Solution:**
```typescript
// Check that workflowService is properly imported
// Verify API endpoint is accessible
// Check network tab in dev tools for actual error

// Test direct API call:
curl -X POST http://localhost:8000/api/v1/workflows/research \
  -H "Content-Type: application/json" \
  -d '{"service":"plumber","location":"Greenville SC"}'
```

### Issue: Types mismatch

**Symptoms:**
- TypeScript errors
- Type 'Provider' is not assignable to type 'Provider'

**Solution:**
```typescript
// Ensure both services use the same Provider type
// Import from shared types file
import type { Provider } from "../research/types.js";
```

### Issue: Missing environment variables

**Symptoms:**
- "GEMINI_API_KEY is not set" error

**Solution:**
```bash
# Check .env file exists
ls -la apps/api/.env

# Verify key is set
grep GEMINI_API_KEY apps/api/.env

# Restart backend
pnpm --filter api dev
```

---

## Rollback Procedure

If anything goes wrong:

```bash
# 1. Revert git commit
git revert HEAD

# 2. Or restore from backup
cp apps/api/src/services/gemini.ts.backup apps/api/src/services/gemini.ts

# 3. Redeploy previous version
git push origin main

# 4. Monitor logs for stability

# 5. Investigate root cause

# 6. Create new plan
```

---

## Success Criteria

✅ **Migration is successful when:**
1. All frontend searches use `/api/v1/workflows/research`
2. Zero calls to deprecated endpoint for 7 days
3. All tests passing (unit, integration, e2e)
4. Performance metrics stable or improved
5. No increase in error rates
6. Team understands new architecture
7. Documentation updated

---

## Additional Resources

- [Full Analysis](./CONSOLIDATION_ANALYSIS.md)
- [Architecture Comparison](./ARCHITECTURE_COMPARISON.md)
- [Summary](./CONSOLIDATION_SUMMARY.md)
- [ResearchService Source](../apps/api/src/services/research/research.service.ts)
- [DirectResearchClient Source](../apps/api/src/services/research/direct-research.client.ts)

---

**Document Version:** 1.0
**Created:** 2025-12-09
**Last Updated:** 2025-12-09
**Status:** Ready for implementation
