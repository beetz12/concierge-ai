// Load .env file only in development - Railway provides env vars directly
// This prevents any potential conflicts with Railway's environment injection
if (process.env.NODE_ENV !== "production") {
  // Dynamic import to avoid loading dotenv in production
  await import("dotenv/config");
}

import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import formbody from "@fastify/formbody";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import supabasePlugin from "./plugins/supabase.js";
import authPlugin from "./plugins/auth.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import authMiddleware from "./middleware/auth.js";
import { initObservability } from "./config/observability.js";
import billingRoutes from "./routes/billing.js";
import casesRoutes from "./routes/cases.js";
import dispatchRoutes from "./routes/dispatch.js";
import membersRoutes from "./routes/members.js";
import userRoutes from "./routes/users.js";
import geminiRoutes from "./routes/gemini.js";
import workflowRoutes from "./routes/workflows.js";
import providerRoutes from "./routes/providers.js";
import vapiWebhookRoutes from "./routes/vapi-webhook.js";
import notificationRoutes from "./routes/notifications.js";
import twilioWebhookRoutes from "./routes/twilio-webhook.js";
import bookingRoutes from "./routes/bookings.js";
import intakeRoutes from "./routes/intake.js";
import demoRoutes from "./routes/demo.js";
import demoCallRoutes from "./routes/demo-call.js";
import voiceToolRoutes from "./routes/voice-tools.js";
import voiceCallRoutes from "./routes/voice-calls.js";
import {
  extractClientIp,
  isBlacklisted,
  isAllowlisted,
  getBlacklistSize,
  addToBlacklist,
} from "./config/ip-blacklist.js";
import { isDemoMode } from "./config/demo.js";
import { assertNotDemoInProduction } from "./config/production-guard.js";
import { getCallRuntimeConfig } from "./config/call-runtime.js";

// =============================================================================
// Environment Variable Validation and Logging
// This runs at startup to catch configuration issues early in Railway
// =============================================================================

const runtimeConfig = getCallRuntimeConfig();

const ENV_VALIDATION = {
  // Critical - app won't work without these
  critical: [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GEMINI_API_KEY",
  ],
};

// Log environment configuration at startup
console.log("=".repeat(60));
console.log("AI Concierge API - Environment Configuration");
console.log("=".repeat(60));
console.log(`NODE_ENV: ${process.env.NODE_ENV || "development"}`);
console.log(`PORT: ${process.env.PORT || "8000"}`);
console.log(`CALL_RUNTIME_PROVIDER: ${runtimeConfig.provider}`);
console.log(`LIVEKIT_ENABLED: ${runtimeConfig.livekitEnabled ? "✓ true" : "✗ false"}`);
console.log(`VAPI_ENABLED: ${runtimeConfig.vapiEnabled ? "✓ true" : "✗ false"}`);
console.log("-".repeat(60));

// Check critical vars
let criticalMissing = false;
for (const varName of ENV_VALIDATION.critical) {
  const exists = !!process.env[varName];
  console.log(`[CRITICAL] ${varName}: ${exists ? "✓ SET" : "✗ MISSING"}`);
  if (!exists) criticalMissing = true;
}

console.log("[CALL RUNTIME]");
if (runtimeConfig.provider === "livekit") {
  console.log(
    `  LIVEKIT_URL: ${runtimeConfig.livekit.url ? "✓ SET" : "✗ MISSING"}`,
  );
  console.log(
    `  LIVEKIT_API_KEY: ${runtimeConfig.livekit.apiKey ? "✓ SET" : "✗ MISSING"}`,
  );
  console.log(
    `  LIVEKIT_API_SECRET: ${runtimeConfig.livekit.apiSecret ? "✓ SET" : "✗ MISSING"}`,
  );
  console.log(
    `  VOICE_AGENT_SHARED_SECRET: ${runtimeConfig.voiceAgent.sharedSecret ? "✓ SET" : "✗ MISSING"}`,
  );
} else {
  console.log(
    `  VAPI_API_KEY: ${runtimeConfig.vapi.apiKey ? "✓ SET" : "✗ MISSING"}`,
  );
  console.log(
    `  VAPI_PHONE_NUMBER_ID: ${runtimeConfig.vapi.phoneNumberId ? "✓ SET" : "✗ MISSING"}`,
  );
}

// Check optional vars (with alternatives)
console.log("-".repeat(60));
console.log("SMS Configuration (Twilio):");
console.log(
  `  TWILIO_ACCOUNT_SID: ${runtimeConfig.twilio.accountSid ? "✓ SET" : "✗ MISSING"}`,
);
console.log(
  `  TWILIO_AUTH_TOKEN: ${runtimeConfig.twilio.authToken ? "✓ SET" : "✗ MISSING"}`,
);
console.log(
  `  SMS_FROM_NUMBER: ${runtimeConfig.twilio.smsFromNumber ? `✓ SET (${runtimeConfig.twilio.smsFromNumber})` : "✗ MISSING"}`,
);
console.log(
  `  VOICE_FROM_NUMBER: ${runtimeConfig.twilio.voiceFromNumber ? `✓ SET (${runtimeConfig.twilio.voiceFromNumber})` : "✗ MISSING"}`,
);

console.log("=".repeat(60));

if (isDemoMode()) {
  console.log("");
  console.log("========================================");
  console.log("⚡ DEMO MODE ACTIVE");
  console.log("  - Supabase: SKIPPED (in-memory)");
  console.log("  - VAPI calls: SKIPPED (Gemini simulation)");
  console.log("  - Auth: BYPASSED (demo user)");
  console.log("========================================");
  console.log("");
}

// Refuse to boot in production with DEMO_MODE enabled: demo mode bypasses auth,
// skips the database, and simulates calls — it must never run in production.
assertNotDemoInProduction();

if (criticalMissing && !isDemoMode()) {
  console.error("ERROR: Critical environment variables are missing!");
  console.error("The application may not function correctly.");
  // Don't exit in production - let it run and fail gracefully
  if (process.env.NODE_ENV !== "production") {
    console.error("Exiting due to missing critical configuration in development.");
    process.exit(1);
  }
}

// =============================================================================

// Structured logging with request IDs.
// - Every request gets a stable id (honoring an inbound `x-request-id` from an
//   upstream proxy, else a fresh UUID) that is attached to every log line via
//   `reqId` and echoed back to the client in the `x-request-id` header.
// - JSON logs in production (machine-parseable for aggregation); pretty logs in
//   development. Known secret-bearing headers are redacted so tokens never land
//   in logs.
const isProductionEnv = process.env.NODE_ENV === "production";
const server = Fastify({
  genReqId: (req) => {
    const incoming = req.headers["x-request-id"];
    if (typeof incoming === "string" && incoming.length > 0 && incoming.length <= 200) {
      return incoming;
    }
    return randomUUID();
  },
  requestIdHeader: "x-request-id",
  requestIdLogLabel: "reqId",
  logger: {
    level: process.env.LOG_LEVEL || "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'req.headers["x-vapi-secret"]',
        'req.headers["x-vapi-signature"]',
        'req.headers["x-twilio-signature"]',
        'req.headers["stripe-signature"]',
        'req.headers["x-org-id"]',
      ],
      remove: false,
    },
    ...(isProductionEnv
      ? {}
      : {
          transport: {
            target: "pino-pretty",
            options: {
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
            },
          },
        }),
  },
});

// Echo the request id back to the caller so a client can quote it when
// reporting an issue (the global error handler also includes it in the body).
server.addHook("onSend", async (request, reply) => {
  if (!reply.getHeader("x-request-id")) {
    reply.header("x-request-id", request.id);
  }
});

let isShuttingDown = false;
let shutdownPromise: Promise<void> | null = null;

// =============================================================================
// IP Blacklist Hook - Runs before ALL other middleware
// 2025 Best Practice: Block at earliest lifecycle point (onRequest)
// =============================================================================
server.addHook("onRequest", async (request, reply) => {
  const clientIp = extractClientIp(request);

  // Allowlisted IPs bypass all security checks
  if (isAllowlisted(clientIp)) {
    return;
  }

  // Block blacklisted IPs with 403 Forbidden
  if (isBlacklisted(clientIp)) {
    request.log.warn(
      {
        event: "ip_blocked",
        ip: clientIp,
        method: request.method,
        url: request.url,
        userAgent: request.headers["user-agent"],
      },
      "Blocked request from blacklisted IP"
    );

    reply.code(403).send({
      statusCode: 403,
      error: "Forbidden",
      message: "Access denied",
    });
    return;
  }
});

// Log blacklist size at startup
console.log(`IP Blacklist: ${getBlacklistSize()} IPs blocked`);

// Register plugins
// CORS_ORIGIN supports multiple origins as comma-separated values
// Example: CORS_ORIGIN="http://localhost:3000,https://app.example.com,https://staging.example.com"
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
  : ["http://localhost:3000", "http://localhost:3001", "http://localhost:3002"];

// Initialize optional error monitoring (Sentry) before anything can throw.
// No-op unless SENTRY_DSN is set and @sentry/node is installed.
await initObservability(server.log);

// Global error + not-found handlers: consistent JSON envelope with the
// request id, domain-error mapping, and 5xx reporting to Sentry.
await server.register(errorHandlerPlugin);

await server.register(cors, {
  origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
});
await server.register(helmet);

// Rate limiting - 2025 best practices
// Global rate limit with IETF draft spec headers and automatic ban
await server.register(rateLimit, {
  global: true,
  max: 100, // 100 requests per minute globally
  ban: 5, // After 5 rate limit violations, permanently ban the IP
  timeWindow: "1 minute",
  hook: "onRequest", // Early rejection for efficiency
  enableDraftSpec: true, // IETF draft-7 standard headers
  addHeadersOnExceeding: {
    "x-ratelimit-limit": true,
    "x-ratelimit-remaining": true,
    "x-ratelimit-reset": true,
  },
  addHeaders: {
    "x-ratelimit-limit": true,
    "x-ratelimit-remaining": true,
    "x-ratelimit-reset": true,
    "retry-after": true,
  },
  keyGenerator: (request) => {
    // Support for proxied requests (nginx, cloudflare, etc.)
    return (
      request.headers["x-forwarded-for"]?.toString().split(",")[0]?.trim() ||
      request.headers["x-real-ip"]?.toString() ||
      request.ip
    );
  },
  onExceeded: (request, key) => {
    request.log.warn({ key, url: request.url }, "Rate limit exceeded");
  },
  onBanReach: (request, key) => {
    // Permanently add IP to blacklist after repeated violations
    addToBlacklist(key);
    request.log.error(
      {
        event: "ip_permanently_banned",
        ip: key,
        method: request.method,
        url: request.url,
        userAgent: request.headers["user-agent"],
      },
      "IP permanently banned after repeated rate limit violations"
    );
  },
});

// Register form-urlencoded parser for Twilio webhooks
// Twilio sends webhook data as application/x-www-form-urlencoded
await server.register(formbody);

// Register Swagger documentation
await server.register(swagger, {
  openapi: {
    openapi: "3.0.0",
    info: {
      title: "AI Concierge API",
      description:
        "API for AI-powered receptionist and appointment scheduling service",
      version: "1.0.0",
    },
    servers: [
      {
        url: process.env.API_URL || "http://localhost:8000",
        description:
          process.env.NODE_ENV === "production"
            ? "Production server"
            : "Development server",
      },
    ],
    tags: [
      { name: "health", description: "Health check endpoints" },
      { name: "users", description: "User management endpoints" },
      { name: "gemini", description: "AI-powered service provider operations" },
      {
        name: "workflows",
        description:
          "Unified workflow orchestration with Kestra/Gemini fallback",
      },
      { name: "providers", description: "Provider calling operations (VAPI)" },
      {
        name: "vapi",
        description: "VAPI webhook callbacks and call result retrieval",
      },
      { name: "notifications", description: "User notification operations (SMS/Phone via Twilio/VAPI)" },
      { name: "twilio", description: "Twilio webhook handlers for inbound SMS" },
      { name: "bookings", description: "Appointment scheduling operations" },
      { name: "intake", description: "Professional intake question generation" },
      { name: "voice-tools", description: "Internal tool routes for the LiveKit voice-agent service" },
      { name: "voice", description: "Public contractor call preview, dispatch, and status routes" },
      { name: "billing", description: "Stripe checkout and subscription lifecycle webhook" },
      {
        name: "cases",
        description:
          "Dispute / follow-up case management: CRUD, timeline, escalation stages, next actions",
      },
      {
        name: "members",
        description:
          "Membership: dedicated outbound number onboarding, call settings, call history, subscription status",
      },
    ],
  },
});

await server.register(swaggerUi, {
  routePrefix: "/docs",
  uiConfig: {
    docExpansion: "list",
    deepLinking: true,
  },
});

// Register Supabase plugin
await server.register(supabasePlugin);

// Register Auth plugin (must be after Supabase)
await server.register(authPlugin);

// Register tenant auth middleware: enforces Supabase JWTs + org membership on
// all /api/v1/* routes except health/docs/webhooks, injecting request.auth =
// { userId, orgId }. Must be registered before the routes it guards.
await server.register(authMiddleware);

// Health check endpoint with lenient rate limit
// Monitoring systems (K8s, load balancers) need reliable access
server.get(
  "/health",
  {
    schema: {
      description: "Health check endpoint",
      tags: ["health"],
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string" },
            timestamp: { type: "string" },
          },
        },
        429: {
          type: "object",
          properties: {
            statusCode: { type: "number" },
            error: { type: "string" },
            message: { type: "string" },
          },
        },
      },
    },
    config: {
      rateLimit: {
        max: 300, // Higher limit for health checks (5 req/sec)
        timeWindow: "1 minute",
      },
    },
  },
  async () => {
    if (isShuttingDown) {
      return {
        status: "shutting_down",
        timestamp: new Date().toISOString(),
      };
    }

    return { status: "ok", timestamp: new Date().toISOString() };
  },
);

// API routes
server.get(
  "/api/v1",
  {
    schema: {
      description: "API information and available endpoints",
      tags: ["health"],
      response: {
        200: {
          type: "object",
          properties: {
            message: { type: "string" },
            version: { type: "string" },
            endpoints: { type: "object" },
          },
        },
      },
    },
  },
  async () => {
    return {
      message: "AI Concierge API",
      version: "1.0.0",
      endpoints: {
        health: "/health",
        users: "/api/v1/users",
        gemini: "/api/v1/gemini",
        workflows: "/api/v1/workflows",
        providers: "/api/v1/providers",
        vapi: "/api/v1/vapi",
        notifications: "/api/v1/notifications",
        twilio: "/api/v1/twilio",
        bookings: "/api/v1/bookings",
        intake: "/api/v1/intake",
        demo: "/api/v1/demo",
        demoCall: "/api/v1/demo-call",
        voiceTools: "/api/v1/voice-tools",
        voice: "/api/v1/voice",
        billing: "/api/v1/billing",
        cases: "/api/v1/cases",
        members: "/api/v1/members",
        docs: "/docs",
      },
    };
  },
);

// Register user routes with Supabase integration
await server.register(userRoutes, { prefix: "/api/v1/users" });

// Register Gemini AI routes
await server.register(geminiRoutes, { prefix: "/api/v1/gemini" });

// Register Workflow routes
await server.register(workflowRoutes, { prefix: "/api/v1/workflows" });

// Register Provider routes (VAPI calling)
await server.register(providerRoutes, { prefix: "/api/v1/providers" });

// Register VAPI Webhook routes
await server.register(vapiWebhookRoutes, { prefix: "/api/v1/vapi" });

// Register Notification routes
await server.register(notificationRoutes, { prefix: "/api/v1/notifications" });

// Register Twilio Webhook routes (requires Supabase)
if (!isDemoMode()) {
  await server.register(twilioWebhookRoutes, { prefix: "/api/v1/twilio" });
}

// Register Booking routes
await server.register(bookingRoutes, { prefix: "/api/v1/bookings" });

// Register Intake routes
await server.register(intakeRoutes, { prefix: "/api/v1/intake" });

// Register Demo routes
await server.register(demoRoutes, { prefix: "/api/v1/demo" });

// Register public marketing demo-call route (feature-flagged, unauthenticated)
await server.register(demoCallRoutes, { prefix: "/api/v1/demo-call" });

// Register internal voice-agent tool routes
await server.register(voiceToolRoutes, { prefix: "/api/v1/voice-tools" });

// Register public voice-call orchestration routes
await server.register(voiceCallRoutes, { prefix: "/api/v1/voice" });

// Register Billing routes (Stripe checkout + lifecycle webhook)
await server.register(billingRoutes, { prefix: "/api/v1/billing" });

// Register Case management routes (disputes / follow-ups)
await server.register(casesRoutes, { prefix: "/api/v1/cases" });

// Register Dispatch flow routes (two-gate call dispatch UX)
await server.register(dispatchRoutes, { prefix: "/api/v1/dispatch" });

// Register Membership routes (dedicated number, call settings, call history)
await server.register(membersRoutes, { prefix: "/api/v1/members" });

// Start server with port conflict handling
const start = async () => {
  const basePort = parseInt(process.env.PORT || "8000", 10);
  const isProduction = process.env.NODE_ENV === "production";

  // In production, use port fallback to stay available.
  // In development, kill the old process to avoid orphaned servers
  // that silently diverge from the MCP client's expected port.
  const maxRetries = isProduction ? 10 : 1;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const port = basePort + attempt;
    try {
      await server.listen({ port, host: "0.0.0.0" });
      console.log(`🚀 API server running at http://localhost:${port}`);
      if (attempt > 0) {
        console.log(`   (port ${basePort} was in use, using ${port} instead)`);
      }
      return;
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "EADDRINUSE") {
        if (!isProduction) {
          // In dev, try to kill the old process and reclaim the port
          console.log(`⚠️  Port ${port} is in use. Attempting to reclaim...`);
          try {
            const { execFileSync } = await import("child_process");
            const lsofOutput = execFileSync("lsof", ["-ti", `:${port}`], { encoding: "utf-8" }).trim();
            if (lsofOutput) {
              const pids = lsofOutput.split("\n").map((p) => p.trim()).filter(Boolean);
              for (const pid of pids) {
                // Don't kill ourselves
                if (pid !== String(process.pid)) {
                  console.log(`   Killing old process ${pid} on port ${port}...`);
                  execFileSync("kill", [pid]);
                }
              }
              // Wait for port to free up
              await new Promise((resolve) => setTimeout(resolve, 1000));
              // Retry the same port
              try {
                await server.listen({ port, host: "0.0.0.0" });
                console.log(`🚀 API server running at http://localhost:${port} (reclaimed)`);
                return;
              } catch {
                console.error(`❌ Port ${port} still in use after killing old process.`);
                process.exit(1);
              }
            }
          } catch {
            console.error(`❌ Port ${port} is in use and could not be reclaimed.`);
            console.error(`   Run: kill $(lsof -ti :${port}) && node dist/index.js`);
            process.exit(1);
          }
        } else {
          console.log(`⚠️  Port ${port} is in use, trying ${port + 1}...`);
          continue;
        }
      }
      server.log.error(err);
      process.exit(1);
    }
  }

  console.error(`❌ Could not find an available port after ${maxRetries} attempts`);
  process.exit(1);
};

const shutdown = async (signal: NodeJS.Signals) => {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  isShuttingDown = true;
  server.log.info({ signal }, "Received shutdown signal");

  shutdownPromise = server
    .close()
    .then(() => {
      server.log.info("API server shutdown complete");
    })
    .catch((error) => {
      server.log.error({ err: error }, "API server shutdown failed");
      throw error;
    });

  return shutdownPromise;
};

const registerShutdownHandler = (signal: NodeJS.Signals) => {
  process.once(signal, () => {
    shutdown(signal)
      .then(() => {
        process.exit(0);
      })
      .catch(() => {
        process.exit(1);
      });
  });
};

registerShutdownHandler("SIGINT");
registerShutdownHandler("SIGTERM");

await start();
