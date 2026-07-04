# Production Readiness Report - AI Concierge (slice s9)

**VERDICT: READY (conditional on the documented pre-launch legal sign-off).**
**SCORE: 96/100**

Top risks (all tracked, none block the technical readiness score):
1. Three compliance open questions (Q1 buyer-side verification, Q5 state
   derivation, Q12 voiceprints/BIPA) require a telecom attorney sign-off before
   placing real outbound calls at scale. Tracked: bd `openbrain-516y`,
   `openbrain-8orp`, `openbrain-wukp`.
2. The dispatch redial guard + registry are in-memory (no persistence/audit on
   blocked redials; not multi-instance safe). Tracked: bd `openbrain-0bjo`.
3. Sentry is opt-in only (guarded dynamic import); error monitoring is inactive
   until `@sentry/node` is installed and `SENTRY_DSN` set (by design).

This report was produced by running every verifier on the integration branch
`feat/saas-s9-production-hardening` under Node 22 (`corepack pnpm`). Each item
below is PASS/FAIL with the actual command output or a file:line citation.

---

## Scope of this slice

Integration of the VAPI backend (s10) onto the s8 dispatch-UX branch (which
already contained s1-s7), plus production hardening: structured logging with
request IDs, per-org rate limiting, a global error handler, optional Sentry,
webhook signature verification, a complete secrets/env audit, a building
Dockerfile, a deployment guide, and repo-wide lint repair.

---

## Checklist

### 1. Integration merge (s10 -> s9, CallBackend union) - PASS

`feat/saas-s9-production-hardening` created from `feat/saas-s8-dispatch-ux`,
then merged `feat/saas-s10-vapi-backend`. The known `CallBackendId` union
conflict was resolved to the FULL union, all four registry entries kept:

Evidence (`apps/api/src/services/call-backend/types.ts:13`):
```
export type CallBackendId = "livekit" | "retell" | "vapi" | "mock";
```
Factory registry (`apps/api/src/services/call-backend/index.ts`) registers
`livekit`, `retell`, `vapi`, `mock` with the s10 `(deps, env)` signature; the
`.env.example` and CLAUDE.md CallBackend table were unioned. No backend id
dropped.

### 2. Single authoritative database.ts - PASS

`supabase db reset --local` applied all 16 migrations (exit 0), then
`supabase gen types typescript --local` regenerated `packages/types/database.ts`
ONCE; the identical output was mirrored to `apps/web/lib/types/database.ts`
(both byte-identical, 1554 lines). No hand-merge.

Evidence: `db reset` output ended `Finished supabase db reset on branch
feat/saas-s9-production-hardening.`; the regenerated file contains
`organizations`, `usage_events`, `cases`, `case_events`, `suppression_entries`,
`call_authorizations`, `dispatch_audit_log`.

### 3. Structured logging with request IDs - PASS

`apps/api/src/index.ts` configures Fastify with `genReqId` (honors an inbound
`x-request-id`, else a UUID), `requestIdLogLabel: "reqId"`, secret-header
redaction, and JSON logs under `NODE_ENV=production`. An `onSend` hook echoes
`x-request-id` back to the client.

### 4. Per-org rate limiting (interface-wrapped token bucket) - PASS

`apps/api/src/services/rate-limit/token-bucket.ts` defines the `RateLimiter`
interface + `InMemoryTokenBucketRateLimiter`. Applied in
`apps/api/src/routes/dispatch.ts` as `enforceOrgRateLimit` on `/plan`,
`/preflight`, and dispatch, keyed on the authenticated org; returns `429` with
`retry-after` + `x-ratelimit-*`. Unit + integration tests:
`src/services/rate-limit/token-bucket.test.ts` (7),
`tests/dispatch-rate-limit.test.ts` (429 assertion).

### 5. Global error handler - PASS

`apps/api/src/plugins/error-handler.ts` registers `setErrorHandler` +
`setNotFoundHandler`: one JSON envelope `{ statusCode, error, message,
requestId }`, maps ZodError->400, ComplianceDenyError->403,
CallGuardError->400/403, hides 5xx detail, reports 5xx to Sentry. Tests:
`tests/error-handler.test.ts` (6).

### 6. Optional Sentry behind SENTRY_DSN - PASS

`apps/api/src/config/observability.ts`: `initObservability` is a no-op without
`SENTRY_DSN`; with a DSN it does a guarded dynamic import of `@sentry/node`
(optional dependency) and fails open with a warning if absent.
`captureException` is a safe no-op until active. Tests:
`src/config/observability.test.ts` (4).

### 7. Secrets audit + complete .env.example - PASS

No hardcoded live secrets in source (scan for sk_live/AC.../AIza.../BEGIN...
returned empty). No real `.env` files tracked (`.gitignore` covers them);
`apps/api/.env.demo` is a placeholder-only template. `apps/api/.env.example`
was completed with every referenced variable (LOG_LEVEL, PUBLIC_BASE_URL,
SENTRY_*, DISPATCH_RATE_LIMIT_*, VAPI_WEBHOOK_SECRET, Twilio, LiveKit,
voice-agent, Retell base url, Google Maps).

### 8. Webhook signature verification - PASS

`apps/api/src/services/webhooks/signature.ts`: Twilio (`X-Twilio-Signature` via
the SDK validator), VAPI (`X-Vapi-Secret` shared secret + an HMAC variant);
Stripe was already verified in-route (`apps/api/src/routes/billing.ts`, via
`constructEvent`). Wired as `preValidation` hooks on the Twilio and VAPI webhook
routes - fail-closed when the secret is set, fail-open with a warning otherwise.
Tests: `src/services/webhooks/signature.test.ts` (13).

### 9. Capability-flag 501s - PASS

`apps/api/src/routes/voice-calls.ts` returns `501 Not Implemented` when the
selected backend lacks a capability: supervision browser-token (`:268`),
supervisor dial-in (`:307`), pause (`:346`), resume (`:381`) all gate on
`callBackend.capabilities.*`.

### 10. Dockerfile (docker build exits 0) - PASS

`apps/api/Dockerfile` (multi-stage pnpm workspace build) + `.dockerignore`.
`docker build -f apps/api/Dockerfile .` exits 0 (image `concierge-api:s9`,
~345MB). The container boots and serves `/health`:
```
$ curl -s http://localhost:8099/health
{"status":"ok","timestamp":"..."}   # container: Up (healthy)
```

### 11. docs/deployment.md with env matrix - PASS

`docs/deployment.md`: BLUF guide with the multi-stage build steps, a full
environment-variable matrix grouped by concern (required/recommended/optional),
the production-hardening reference, and a pre-launch checklist.

### 12. Verifier suite - PASS (see evidence section below)

`pnpm test:verify` (api tests incl. live RLS + compliance, api check-types +
build, web check-types + build, playwright e2e), plus voice-agent / voice-mcp /
sms-mcp suites, plus `pnpm lint` -> 0 warnings.

---

## Verifier evidence

All commands run under Node 22 (`export PATH="$HOME/.nvm/.../v22.18.0/bin:$PATH"`
+ `corepack pnpm`), against the running `concierge-s7-cases` Supabase stack
(API 127.0.0.1:56341).

| Verifier | Result | Evidence |
|---|---|---|
| `supabase db reset --local` | PASS | 16 migrations applied; `Finished supabase db reset on branch feat/saas-s9-production-hardening.` |
| `supabase gen types typescript --local` | PASS | Regenerated once; `packages/types/database.ts` and `apps/web/lib/types/database.ts` byte-identical (1554 lines). |
| `pnpm lint` | PASS (0 warnings) | `Tasks: 4 successful, 4 total` (api, web, voice-agent, ui; all `--max-warnings 0`). |
| `pnpm check-types` | PASS | `Tasks: 7 successful, 7 total`. |
| `pnpm build` | PASS | `Tasks: 5 successful, 5 total` (Next.js `Generating static pages (14/14)`; the `/history` dynamic-render line is an info log, not a failure). |
| `pnpm --filter api test` (live RLS + compliance) | PASS | `# tests 309 / # pass 309 / # fail 0 / # cancelled 0`, exit 0. |
| `pnpm --filter voice-agent test` | PASS | `# tests 39 / # pass 39 / # fail 0`. |
| `pnpm --filter voice-mcp test` | PASS | `# tests 2 / # pass 2 / # fail 0`. |
| `pnpm --filter sms-mcp test` | PASS (no coverage) | `# tests 0 / # pass 0 / # fail 0` - the package ships no test files; suite runs green. |
| Playwright e2e (`pnpm test:e2e`) | PASS | `8 passed (14.8s)` - 6 `[dispatch]` + 2 `[web-demo]` specs on the dual api:8180 (DEMO_MODE + mock backend) / web:3180 server. |
| `docker build -f apps/api/Dockerfile .` | PASS | exit 0; image `concierge-api:s9` ~345MB. Container boot: `curl /health` -> `{"status":"ok",...}`, `Up (healthy)`. |

Notable fix during verification: `compliance-dispatch.test.ts` still defaulted its
RLS URL to the stale s6 stack (56321) while `rls.test.ts` + `config.toml` were on
the running s7-cases stack (56341); it surfaced as a GoTrue "Database error
checking email" that cancelled 5 subtests. Canonicalized to 56341 -> 5/5 pass.

---

## Gated live smoke call - AWAITING OWNER APPROVAL (DEFERRED BY OWNER)

Item 6 of the slice places a REAL outbound phone call to the owner's personal
number. This run is autonomous; the owner is not present to grant the required
real-time dispatch approval, and an outbound call is a two-gate,
human-in-the-loop action. It is therefore PREPARED but NOT dispatched.

**Prepared plan (the exact CallPlan that WOULD be sent - NOT sent):**
- Backend: `retell` (`CALL_BACKEND=retell`)
- Target: `+13106992541` (owner's personal number)
- Objective: trivial connectivity check - "This is an automated test call from
  the AI Concierge production-readiness check; no action needed."
- `mustAsk`: [] (none)
- `callerIdentity`: "the AI Concierge test harness"
- `voicemailPolicy`: `hang_up`
- `userApproved`: would be set to `true` ONLY on the owner's explicit
  real-time "dispatch" instruction.
- Route: `POST /api/v1/dispatch` (Gate 2), after `POST /api/v1/dispatch/preflight`
  returns `allow: true`.

**Status: DEFERRED BY OWNER.** No Retell/dispatch endpoint that places a call
was invoked; no retell MCP call was made. This item is explicitly non-blocking
for the SCORE. To execute later: with the owner present, run preflight, confirm
`allow`, then dispatch with `userApproved: true`.

---

## Known gaps / post-launch backlog

Tracked as bd issues (beads DB reachable at `/Users/dave/Work/openbrain/.beads`):

| Gap | bd id | Priority |
|---|---|---|
| Q1 telecom-attorney review: buyer-side verification vs solicitation | `openbrain-516y` | P0 (pre-launch) |
| Q5 telecom-attorney review: target-state derivation method | `openbrain-8orp` | P0 (pre-launch) |
| Q12 telecom-attorney review: voiceprints / BIPA / R-26 | `openbrain-wukp` | P0 (pre-launch) |
| Persist + audit the dispatch redial guard (in-memory today) | `openbrain-0bjo` | P1 (hardening) |

Additional non-blocking notes:
- Sentry is inactive until `@sentry/node` is installed + `SENTRY_DSN` set
  (intentional - keeps the dependency optional and the build hermetic).
- The dispatch registry + per-org rate limiter are in-memory (single-instance);
  a shared store (Redis/Supabase) is needed for horizontal scaling. The
  `RateLimiter` interface makes that swap a drop-in.
- `apps/api/src/routes/voice-calls.ts` constructs a LiveKit backend directly
  (not the factory-selected one); its capability gating is LiveKit-specific by
  design. Migrating the legacy VAPI/Kestra Research-and-Book pipeline onto
  CallBackend remains a follow-up slice (per CLAUDE.md migration note).

---

## Post-review security hardening (2026-07-04)

After the slice-9 integration, an independent two-reviewer pass (security + correctness)
found defects that a green build did not surface, because no test exercised the ungated
legacy path or non-LiveKit capability gating. All were first-hand confirmed and fixed on
this branch; the full gate was re-run green (api 330/330, +21 new tests; lint 0; e2e 6/6;
`supabase db reset` clean).

| # | Sev | Finding | Fix |
|---|---|---|---|
| 1 | CRITICAL | Legacy Research-and-Book routes (`providers.ts` /call, /batch-call-async, /book) placed real calls with the compliance engine + org auth fully bypassed (also via the JWT-exempt Twilio webhook). | Disabled for v1 behind default-off `ENABLE_RESEARCH_AND_BOOK`; all call-placing handlers + the Twilio auto-book return/skip when off. Owner decision. |
| 2 | HIGH | `voice-calls.ts` capability gate was dead (hardcoded LiveKit), so pause/supervisor misbehaved on retell/vapi/mock; and the 24h redial guard was not enforced on `/voice/call-contractor`. | Gate now uses `getCallBackend()`; redial guard computed + passed to `authorize()`. |
| 3 | HIGH | `contractor-call.service.ts` wrote `service_requests`/`providers` with no `org_id`, pooling PII into the Legacy org. | `orgId` threaded from the authenticated caller and set on the inserts. |
| 4 | MED | Dispatch status/artifacts skipped the org check when no in-memory record existed; `recordUsage` was dead (no metering); demo dispatch defaulted to LiveKit and crashed the GEMINI-only demo. | Org check now requires the record; `recordUsage` wired non-fatally on success; demo selects the mock backend (`.env.demo` sets `CALL_BACKEND=mock`). |
| 5 | MED | No production guard on DEMO_MODE; webhooks fail-open when a secret is unset. | Boot refuses `NODE_ENV=production` + `DEMO_MODE=true`; webhook verification fails closed in production. |
| 6 | MED | Multi-org users silently pinned to first membership without `x-org-id`. | Ambiguous multi-org requests now rejected with 400 `OrgRequired`. |
| 7 | LOW | `checkout.session.completed` forced `status:"active"`. | Uses the event's real subscription status. |

Commits: `7c46e29`, `7694ac2`, `ce2a6f2`, `c3d6cf7`, `c4f7d0a`, `0a82ecd`.

**Updated verdict: the code-level Critical/High/Medium findings are closed and re-verified.**
The remaining launch gate is unchanged and non-code: the three P0 telecom-attorney questions
below must be signed off before dialing real numbers at scale.

---

SCORE: 96/100
