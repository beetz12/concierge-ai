// Load .env file only in development - Railway provides env vars directly
// This prevents any potential conflicts with Railway's environment injection
if (process.env.NODE_ENV !== "production") {
  // Dynamic import to avoid loading dotenv in production
  await import("dotenv/config");
}

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import formbody from "@fastify/formbody";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import supabasePlugin from "./plugins/supabase.js";
import authPlugin from "./plugins/auth.js";
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
import {
  extractClientIp,
  isBlacklisted,
  isAllowlisted,
  getBlacklistSize,
  addToBlacklist,
} from "./config/ip-blacklist.js";
import { isDemoMode } from "./config/demo.js";

// =============================================================================
// Environment Variable Validation and Logging
// This runs at startup to catch configuration issues early in Railway
// =============================================================================

const ENV_VALIDATION = {
  // Critical - app won't work without these
  critical: [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GEMINI_API_KEY",
  ],
  // Important for full functionality
  important: [
    "VAPI_API_KEY",
    "VAPI_PHONE_NUMBER_ID",
  ],
  // Optional services (Twilio for SMS)
  optional: [
    { name: "TWILIO_ACCOUNT_SID", description: "Twilio Account SID for SMS" },
    { name: "TWILIO_AUTH_TOKEN", description: "Twilio Auth Token for SMS" },
    { name: "TWILIO_PHONE_NUMBER", alt: "TWILIO_PHONE_NO", description: "Twilio phone number for SMS" },
  ],
};

// Log environment configuration at startup
console.log("=".repeat(60));
console.log("AI Concierge API - Environment Configuration");
console.log("=".repeat(60));
console.log(`NODE_ENV: ${process.env.NODE_ENV || "development"}`);
console.log(`PORT: ${process.env.PORT || "8000"}`);
console.log("-".repeat(60));

// Check critical vars
let criticalMissing = false;
for (const varName of ENV_VALIDATION.critical) {
  const exists = !!process.env[varName];
  console.log(`[CRITICAL] ${varName}: ${exists ? "✓ SET" : "✗ MISSING"}`);
  if (!exists) criticalMissing = true;
}

// Check important vars
for (const varName of ENV_VALIDATION.important) {
  const exists = !!process.env[varName];
  console.log(`[IMPORTANT] ${varName}: ${exists ? "✓ SET" : "⚠ MISSING"}`);
}

// Check optional vars (with alternatives)
console.log("-".repeat(60));
console.log("SMS Configuration (Twilio):");
for (const opt of ENV_VALIDATION.optional) {
  const primary = process.env[opt.name];
  const alt = opt.alt ? process.env[opt.alt] : undefined;
  const exists = !!(primary || alt);
  const source = primary ? opt.name : alt ? opt.alt : "none";
  console.log(`  ${opt.name}: ${exists ? `✓ SET (via ${source})` : "✗ MISSING"}`);
}

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

const server = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
});

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

// Register Twilio Webhook routes
await server.register(twilioWebhookRoutes, { prefix: "/api/v1/twilio" });

// Register Booking routes
await server.register(bookingRoutes, { prefix: "/api/v1/bookings" });

// Register Intake routes
await server.register(intakeRoutes, { prefix: "/api/v1/intake" });

// Register Demo routes
await server.register(demoRoutes, { prefix: "/api/v1/demo" });

// Start server with port fallback
const start = async () => {
  const basePort = parseInt(process.env.PORT || "8000", 10);
  const maxRetries = 10;

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
        console.log(`⚠️  Port ${port} is in use, trying ${port + 1}...`);
        continue;
      }
      server.log.error(err);
      process.exit(1);
    }
  }

  console.error(`❌ Could not find an available port after ${maxRetries} attempts`);
  process.exit(1);
};

start();
