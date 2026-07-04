# Deployment Guide - AI Concierge API

This guide covers deploying the AI Concierge backend (`apps/api`) to production.
It documents the container build, the full environment-variable matrix, the
external services the API depends on, and the production hardening (structured
logging, per-org rate limiting, webhook signature verification, error
monitoring) added in the production-readiness slice.

Bottom line: build the image from the repo root with the provided Dockerfile,
supply the required environment variables (Supabase + Gemini at minimum, plus
the selected call backend's credentials), set the webhook secrets so inbound
webhooks are authenticated, and point a process supervisor at the container's
`/health` endpoint.

---

## 1. Architecture recap

- `apps/api` - Fastify 5 API (this deployment target).
- `apps/web` - Next.js frontend (deploy separately, e.g. Vercel).
- `apps/voice-agent` - LiveKit voice worker (separate long-running process;
  only when `CALL_BACKEND=livekit`).
- `apps/voice-mcp`, `apps/sms-mcp` - MCP servers (local/agent tooling; not part
  of the hosted API surface).
- Supabase (PostgreSQL + Auth + Storage) - managed database with RLS.

The API selects its outbound-call backend at runtime via `CALL_BACKEND`
(`livekit` default, or `retell` / `vapi` / `mock`). See the "CallBackend"
section of the root `CLAUDE.md`.

---

## 2. Container build

The Dockerfile lives at `apps/api/Dockerfile` and MUST be built from the repo
root (the pnpm workspace + lockfile are part of the build context):

```bash
# From the repository root:
docker build -f apps/api/Dockerfile -t concierge-api:latest .
```

It is a multi-stage build:

1. `base` - `node:22-slim` + pnpm pinned to the workspace version via corepack.
2. `deps` - frozen full-workspace install (manifests copied first for caching).
3. `build` - `pnpm --filter api build` (compiles `apps/api` to `dist/`).
4. `prod-deps` - a separate production-only install (`--prod --filter api...`).
5. `runtime` - `node:22-slim` with prod `node_modules` + compiled `dist/`,
   running as a non-root `nodejs` user, exposing port `8000`, with a
   container-native `HEALTHCHECK` hitting `/health`.

Run it:

```bash
docker run --rm -p 8000:8000 --env-file apps/api/.env.prod concierge-api:latest
```

`.dockerignore` (repo root) keeps `node_modules`, build output, and every
`.env*` file (except `.env.example`) out of the image, so no secrets are baked
in.

### Platform notes

- **Railway / Render / Fly.io / Cloud Run**: point the build at
  `apps/api/Dockerfile` with the repo root as context. Set env vars in the
  platform dashboard (do not commit `.env`). The container listens on `$PORT`
  (default 8000).
- **Health checks**: use `GET /health` (returns `{ "status": "ok" }`; returns
  `{ "status": "shutting_down" }` during graceful shutdown). The API also
  handles `SIGINT`/`SIGTERM` for graceful drain.

---

## 3. Environment variable matrix

Legend: **Required** = the API is non-functional without it in that mode.
**Recommended** = required for a secure/complete production deployment.
**Optional** = feature-gated or has a safe default.

`apps/api/.env.example` is the canonical, exhaustive list; this table groups it
by concern.

### 3.1 Core server

| Variable | Req? | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | Recommended | `development` | Set to `production` for JSON logs + prod behavior. |
| `PORT` | Optional | `8000` | Listen port. |
| `CORS_ORIGIN` | Recommended | localhost list | Comma-separated allowed web origins. |
| `LOG_LEVEL` | Optional | `info` | `fatal`..`trace`. Every log line carries a `reqId`. |
| `PUBLIC_BASE_URL` | Recommended | derived | Public URL of the API; used to verify webhook signatures behind a proxy. |
| `API_URL` / `APP_URL` | Optional | localhost | Used in generated links. |
| `ENABLE_RESEARCH_AND_BOOK` | Optional | `false` | Feature flag for the legacy Research-and-Book calling flow. When not exactly `"true"`, `POST /providers/call`, `/providers/batch-call`, `/providers/batch-call-async`, `/providers/book`, and the Twilio SMS auto-book trigger return 403 / skip without dialing. Disabled for v1. |

### 3.2 Supabase (database + auth)

| Variable | Req? | Notes |
|---|---|---|
| `SUPABASE_URL` | **Required** | Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** | Service role key (bypasses RLS - backend only). |
| `SUPABASE_JWT_SECRET` | **Required** | Verifies user JWTs in the auth middleware. |
| `REQUIRE_AUTH` | Recommended | `true` in production. |

Run migrations against the production database before first boot:
`supabase db push` (or apply `supabase/migrations/*.sql`). Regenerate types with
`supabase gen types typescript --linked > packages/types/database.ts` when the
schema changes.

### 3.3 AI + discovery

| Variable | Req? | Notes |
|---|---|---|
| `GEMINI_API_KEY` | **Required** | Core AI (search, analysis, simulation). |
| `GOOGLE_PLACES_API_KEY` | **Required** | Places-first provider discovery. |
| `GOOGLE_MAPS_API_KEY` | Optional | Direct Maps/geocoding paths. |
| `BRAVE_SEARCH_API_KEY` | Optional | Web-reputation enrichment (prod-recommended). |

### 3.4 Call backend selection

| Variable | Req? | Notes |
|---|---|---|
| `CALL_BACKEND` | Recommended | `livekit` (default) \| `retell` \| `vapi` \| `mock`. |

**LiveKit** (`CALL_BACKEND=livekit`): `LIVEKIT_URL`, `LIVEKIT_API_KEY`,
`LIVEKIT_API_SECRET`, `LIVEKIT_AGENT_NAME`, `VOICE_AGENT_SHARED_SECRET`
(shared with the voice-agent worker), and SIP vars for real PSTN dialing
(`LIVEKIT_SIP_OUTBOUND_TRUNK_ID`, `LIVEKIT_SIP_FROM_NUMBER`).

**Retell** (`CALL_BACKEND=retell`): `RETELL_API_KEY` (required),
`RETELL_FROM_NUMBER`, and the optional agent/voice pins
(`RETELL_AGENT_ID`, `RETELL_LLM_ID`, `RETELL_AGENT_NAME`, `RETELL_VOICE_ID`,
`RETELL_TRANSFER_NUMBER`, `RETELL_ARTIFACTS_DIR`, `RETELL_API_BASE_URL`).

**VAPI** (`CALL_BACKEND=vapi`, and the legacy Research-and-Book pipeline):
`VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`. The Research-and-Book routes that use
this pipeline are gated behind `ENABLE_RESEARCH_AND_BOOK` (default off — see
3.1); leave it unset for v1.

### 3.5 Webhooks (signature verification)

Inbound webhooks are authenticated when their secret is configured. When the
secret is set, an unsigned/badly-signed request is **rejected**; when unset,
verification is skipped with a warning (dev only). Set these in production:

| Variable | Verifies | Notes |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | Stripe billing webhook | `stripe.webhooks.constructEvent`. |
| `TWILIO_AUTH_TOKEN` | Twilio inbound SMS webhook | `X-Twilio-Signature` (also used for sending). |
| `VAPI_WEBHOOK_SECRET` | VAPI webhook | `X-Vapi-Secret` shared-secret header. |

`PUBLIC_BASE_URL` (or `x-forwarded-proto`/`x-forwarded-host` from your proxy)
must reflect the exact public URL the provider signs against, or Twilio
verification will fail.

### 3.6 Telephony / SMS (Twilio)

| Variable | Req? | Notes |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Recommended | Must start with `AC`. |
| `TWILIO_AUTH_TOKEN` | Recommended | Also verifies webhook signatures. |
| `TWILIO_PHONE_NUMBER` | Recommended | Sending number (E.164). `TWILIO_PHONE_NO` is a legacy alias. |
| `TWILIO_VOICE_PHONE_NUMBER` | Optional | Dedicated voice caller id. |
| `ADMIN_TEST_NUMBER` | Optional | Redirect outbound provider calls to test numbers. |

### 3.7 Billing (Stripe)

Billing routes return `503` when unset; safe to omit until billing launches.
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`,
`STRIPE_PRICE_PRO`.

### 3.8 Rate limiting

| Variable | Default | Notes |
|---|---|---|
| `DISPATCH_RATE_LIMIT_PER_MINUTE` | `30` | Per-org sustained dispatch/preflight limit. |
| `DISPATCH_RATE_LIMIT_BURST` | = per-minute | Burst capacity. |

A separate global IP rate limit (100 req/min, auto-ban after repeated abuse)
is always on (see `apps/api/src/index.ts`).

### 3.9 Error monitoring (optional)

Fully opt-in. Only active when `SENTRY_DSN` is set **and** `@sentry/node` is
installed (`pnpm --filter api add @sentry/node`). The API builds and runs
identically without it.

| Variable | Notes |
|---|---|
| `SENTRY_DSN` | Enables Sentry when set + package installed. |
| `SENTRY_ENVIRONMENT` | Defaults to `NODE_ENV`. |
| `SENTRY_TRACES_SAMPLE_RATE` | `0` by default. |

### 3.10 Kestra (optional orchestration)

`KESTRA_ENABLED` (default `false`) and the `KESTRA_*` connection vars. The
research path falls back to direct Gemini calls when Kestra is disabled.

### 3.11 Demo mode

`DEMO_MODE=true` runs with only `GEMINI_API_KEY` (no Supabase, VAPI, or auth) -
for demos, not production.

---

## 4. Production hardening reference

Added in the production-readiness slice (all in `apps/api`):

- **Structured logging + request IDs** (`src/index.ts`): `genReqId` honors an
  inbound `x-request-id` (else a UUID), logs it as `reqId`, echoes it in the
  response header, and redacts secret-bearing headers. JSON logs under
  `NODE_ENV=production`.
- **Global error handler** (`src/plugins/error-handler.ts`): consistent JSON
  envelope `{ statusCode, error, message, requestId }`; domain-error mapping;
  5xx details hidden and reported to Sentry.
- **Per-org rate limiting** (`src/services/rate-limit/token-bucket.ts`): an
  interface-wrapped token bucket on `/api/v1/dispatch/*`, keyed on the
  authenticated org; returns `429` with `retry-after` + `x-ratelimit-*`.
- **Webhook signature verification** (`src/services/webhooks/signature.ts`):
  Twilio, VAPI, and Stripe (in-route) - fail-closed when the secret is set.
- **Capability-gated routes** (`src/routes/voice-calls.ts`): supervision,
  pause, and resume return `501 Not Implemented` when the selected backend does
  not support them.

---

## 5. Pre-launch checklist

1. Provision the production Supabase project; apply `supabase/migrations/*.sql`.
2. Set all **Required** and **Recommended** env vars (section 3).
3. Set the three webhook secrets and configure each provider's webhook URL to
   `https://<your-api>/api/v1/{stripe|twilio|vapi}/webhook` with the matching
   secret/header.
4. Build and run the container; confirm `GET /health` returns `200`.
5. Confirm `GET /docs` serves the OpenAPI UI.
6. Review `docs/production-readiness.md` and the compliance open questions
   (`docs/compliance/open-legal-questions.md`) - a telecom attorney sign-off is
   required before placing real outbound calls (Q1, Q5, Q12).
