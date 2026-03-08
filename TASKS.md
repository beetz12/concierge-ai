# API ESLint Warning Backlog — Remediation Plan

**Goal:** Eliminate the API warning backlog so `pnpm lint` passes without weakening the current rule intent.
**Architecture:** Fix the warning backlog in the order that gives the biggest signal reduction first: declare env usage for Turbo, replace high-volume `any` hotspots with explicit parsed types, then clear the remaining unused-variable and `prefer-const` warnings and re-run repo lint.
**Files affected:** ~20 files (mostly under `apps/api/src`, plus `turbo.json` and API docs)
**Key decisions:** Keep `turbo/no-undeclared-env-vars` enabled, do not suppress `@typescript-eslint/no-explicit-any`, and split cleanup by route/service clusters so tasks stay small and verifiable.
**Beads epic:** `TBD`

---

## Context Recovery

> Read this section first if resuming from a compacted or new session.
> It contains the breadcrumbs needed to understand the full task without re-exploring.

- **Current lint state:** `apps/api` has 209 warnings across 37 files. Top rules are `turbo/no-undeclared-env-vars` (122), `@typescript-eslint/no-explicit-any` (72), `@typescript-eslint/no-unused-vars` (13), and `prefer-const` (2).
- **Highest-volume files:** `apps/api/src/routes/providers.ts` (23), `apps/api/src/routes/bookings.ts` (22), `apps/api/src/services/calls/booking-call.service.ts` (15), `apps/api/src/routes/twilio-webhook.ts` (12), `apps/api/src/services/notifications/user-notification.service.ts` (12), `apps/api/src/services/vapi/kestra.client.ts` (12), `apps/api/src/services/research/kestra-research.client.ts` (11).
- **Env var inventory to declare:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `KESTRA_ENABLED`, `GEMINI_API_KEY`, `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`, `TWILIO_PHONE_NUMBER`, `ADMIN_TEST_NUMBER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `VOICE_AGENT_SERVICE_URL`, `VAPI_ADVANCED_SCREENING`, `PORT`, `CORS_ORIGIN`, `BACKEND_URL`, `TWILIO_PHONE_NO`, `GOOGLE_PLACES_API_KEY`, `KESTRA_MODE`, `KESTRA_CLOUD_URL`, `KESTRA_CLOUD_TENANT`, `KESTRA_API_TOKEN`, `KESTRA_LOCAL_URL`, `KESTRA_NAMESPACE`, `KESTRA_LOCAL_USERNAME`, `KESTRA_LOCAL_PASSWORD`, `KESTRA_HEALTH_CHECK_TIMEOUT`, `KESTRA_URL`, `DEMO_MODE`, `API_URL`, `DEV_USER_ID`, `DEV_USER_EMAIL`, `DEV_USER_NAME`, `SUPABASE_JWT_SECRET`, `REQUIRE_AUTH`, `LIVE_CALL_ENABLED`, `VAPI_USE_REALTIME`, `VAPI_REALTIME_VOICE`, `VAPI_WEBHOOK_URL`.
- **Type cleanup pattern:** most `any` warnings come from external API payloads and route body/result handling. Use `unknown` + Zod parsing or narrow record interfaces instead of widening back to `any`.
- **Existing runtime context:** the repo is LiveKit-first for internal dispatch, but real PSTN calling today still depends on the VAPI path. Twilio in the current codebase is primarily SMS/webhook infrastructure.
- **Beads state:** Beads is already initialized, CLAUDE.md and README are already wired, and `bd ready --json` is empty. This plan is for a new epic, not setup work.

---

## Phase 0: Warning Inventory and Shared Guardrails

### [ ] Task 0.1: Close the Turbo env declaration gap
**Bead ID:** `TBD`
**Files:** `turbo.json`, `README.md`, `apps/api/README.md`, `apps/api/.env.example` if present
**What:** Add the full API env inventory to `turbo.json` so `turbo/no-undeclared-env-vars` only flags truly new drift. While doing that, normalize docs around aliases like `TWILIO_PHONE_NUMBER` vs `TWILIO_PHONE_NO` and runtime-specific vars like `VOICE_AGENT_SERVICE_URL`.
**Verify:** `pnpm --filter api exec eslint src -f json` reports zero `turbo/no-undeclared-env-vars` warnings.

> **Notes:** This is the fastest path to removing 122 warnings. The inventory is already captured in Context Recovery; do not rediscover it by hand. Keep rule enforcement on.

### [ ] Task 0.2: Establish typed payload patterns for external/dynamic data
**Bead ID:** `TBD`
**Files:** `apps/api/src/routes/providers.ts`, `apps/api/src/routes/bookings.ts`, `apps/api/src/services/calls/booking-call.service.ts`, optional shared type/helper under `apps/api/src/utils/` or `apps/api/src/types/`
**What:** Introduce a consistent replacement pattern for `any` in external payloads: `unknown` at boundaries, Zod parsing where shape is known, and minimal typed records where the external API remains partially dynamic.
**Verify:** At least one representative route and one representative service are converted with no new type assertions to `any`, and the pattern is reusable for the rest of the backlog.

> **Notes:** The biggest risk is “remove lint warning by hiding uncertainty.” Do not replace `any` with giant permissive interfaces. Prefer small typed projections that match the fields actually used.

---

## Phase 1: Route Hotspot Cleanup

### [ ] Task 1.1: Clean `providers.ts` warning cluster
**Bead ID:** `TBD`
**Files:** `apps/api/src/routes/providers.ts`
**Depends on:** Task 0.1, Task 0.2
**What:** Remove the 23 warnings in `providers.ts`, focusing on route-level payload typing, unused variables like `concurrentCallService`, and dynamic result handling for batch calling, recommendation, and persistence flows.
**Verify:** `pnpm --filter api exec eslint apps/api/src/routes/providers.ts` returns zero warnings.

> **Notes:** This file is the largest single warning source. Keep the provider persistence pattern intact: provider IDs must remain DB UUIDs, not Google Place IDs. Do not break route response shapes while tightening types.

### [ ] Task 1.2: Clean `bookings.ts` warning cluster
**Bead ID:** `TBD`
**Files:** `apps/api/src/routes/bookings.ts`
**Depends on:** Task 0.1, Task 0.2
**What:** Remove the 22 warnings in `bookings.ts`, especially route body/result `any` usage and runtime-specific env access tied to LiveKit/VAPI booking dispatch.
**Verify:** `pnpm --filter api exec eslint apps/api/src/routes/bookings.ts` returns zero warnings.

> **Notes:** This file now routes through `BookingCallService`. Keep the `livekit` vs `vapi` branching behavior unchanged while replacing dynamic payloads with parsed/narrowed structures.

### [ ] Task 1.3: Clean webhook and notification route warnings
**Bead ID:** `TBD`
**Files:** `apps/api/src/routes/twilio-webhook.ts`, `apps/api/src/routes/notifications.ts`, `apps/api/src/plugins/auth.ts`
**Depends on:** Task 0.1, Task 0.2
**What:** Remove route-layer warnings in the Twilio SMS webhook, notification endpoints, and auth plugin, including the unused `reply` parameter and webhook payload `any` usage.
**Verify:** `pnpm --filter api exec eslint apps/api/src/routes/twilio-webhook.ts apps/api/src/routes/notifications.ts apps/api/src/plugins/auth.ts` returns zero warnings.

> **Notes:** `twilio-webhook.ts` explicitly expects a real Account SID starting with `AC`, not a Twilio API key. Keep that validation and the booking-trigger side effects intact.

---

## Phase 2: Service Hotspot Cleanup

### [ ] Task 2.1: Clean call-dispatch service warnings
**Bead ID:** `TBD`
**Files:** `apps/api/src/services/calls/booking-call.service.ts`, `apps/api/src/services/calls/runtime-router.service.ts`
**Depends on:** Task 0.1, Task 0.2
**What:** Replace `any` in booking dispatch response normalization and ensure `VOICE_AGENT_SERVICE_URL` access is covered by the env declaration task.
**Verify:** `pnpm --filter api exec eslint apps/api/src/services/calls/booking-call.service.ts apps/api/src/services/calls/runtime-router.service.ts` returns zero warnings.

> **Notes:** `booking-call.service.ts` still normalizes VAPI SDK response shapes using `any`. Keep the VAPI fallback path working while tightening the normalization logic.

### [ ] Task 2.2: Clean research, Gemini, simulation, and notification service warnings
**Bead ID:** `TBD`
**Files:** `apps/api/src/services/gemini.ts`, `apps/api/src/services/simulation/simulated-call.service.ts`, `apps/api/src/services/direct-task/analyzer.ts`, `apps/api/src/services/notifications/user-notification.service.ts`, `apps/api/src/services/notifications/direct-twilio.client.ts`, `apps/api/src/services/places/google-places.service.ts`, `apps/api/src/services/research/direct-research.client.ts`, `apps/api/src/services/research/enrichment.service.ts`, `apps/api/src/services/research/prompt-analyzer.ts`, `apps/api/src/services/intake/question-generator.ts`, `apps/api/src/services/recommendations/recommend.service.ts`
**Depends on:** Task 0.1, Task 0.2
**What:** Remove mid-volume `any`, `unused-vars`, and `prefer-const` warnings across the AI/research/notification service layer.
**Verify:** Running ESLint on the listed files returns zero warnings.

> **Notes:** `gemini.ts` contains the only `prefer-const` warnings. `recommend.service.ts` and `simulation/simulated-call.service.ts` also have easy `unused-vars` cleanup. Do not mix functional behavior changes into this task.

### [ ] Task 2.3: Clean infrastructure and Kestra client warnings
**Bead ID:** `TBD`
**Files:** `apps/api/src/services/vapi/kestra.client.ts`, `apps/api/src/services/research/kestra-research.client.ts`, `apps/api/src/services/vapi/direct-vapi.client.ts`, `apps/api/src/services/vapi/provider-calling.service.ts`, `apps/api/src/services/vapi/call-result.service.ts`, `apps/api/src/lib/jwt.ts`, `apps/api/src/lib/supabase.ts`, `apps/api/src/plugins/supabase.ts`, `apps/api/src/index.ts`, `apps/api/src/config/demo.ts`
**Depends on:** Task 0.1, Task 0.2
**What:** Remove remaining env-var drift, unused vars, and `any` usage in the infrastructure/client layer, especially the two Kestra clients and shared auth/database modules.
**Verify:** Running ESLint on the listed files returns zero warnings.

> **Notes:** These files are warning-dense because they touch many env vars. After Task 0.1, the remaining work should mostly be `any` and `unused-vars`, not Turbo rule noise.

---

## Phase 3: Final Verification and Documentation

### [ ] Task 3.1: Make `pnpm lint` pass and document the cleanup boundary
**Bead ID:** `TBD`
**Files:** `README.md`, `apps/api/README.md`, `TASKS.md`
**Depends on:** Task 1.1, Task 1.2, Task 1.3, Task 2.1, Task 2.2, Task 2.3
**What:** Run full repo lint, fix any residual API warnings missed by earlier tasks, and document the resolved lint boundary plus any intentional remaining exclusions outside `apps/api`.
**Verify:** `pnpm lint` exits 0.

> **Notes:** Earlier validation showed repo lint can fail outside `apps/api` too, but this epic is specifically for the API warning backlog. If a non-API blocker appears during final verification, create a follow-up bead instead of expanding this epic silently.

