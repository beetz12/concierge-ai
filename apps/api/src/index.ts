// Load .env file only in development - Railway provides env vars directly
// This prevents any potential conflicts with Railway's environment injection
if (process.env.NODE_ENV !== "production") {
  // Dynamic import to avoid loading dotenv in production
  await import("dotenv/config");
}

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import formbody from "@fastify/formbody";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import supabasePlugin from "./plugins/supabase.js";
import userRoutes from "./routes/users.js";
import geminiRoutes from "./routes/gemini.js";
import workflowRoutes from "./routes/workflows.js";
import providerRoutes from "./routes/providers.js";
import vapiWebhookRoutes from "./routes/vapi-webhook.js";
import notificationRoutes from "./routes/notifications.js";
import twilioWebhookRoutes from "./routes/twilio-webhook.js";
import bookingRoutes from "./routes/bookings.js";

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

if (criticalMissing) {
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

// Health check endpoint
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
