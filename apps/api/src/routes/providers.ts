/**
 * Provider Routes
 * API endpoints for provider calling functionality
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ProviderCallingService } from "../services/vapi/index.js";

// Zod schema for request validation
const callProviderSchema = z.object({
  providerName: z.string().min(1, "Provider name is required"),
  providerPhone: z
    .string()
    .regex(/^\+1\d{10}$/, "Phone must be E.164 format (+1XXXXXXXXXX)"),
  serviceNeeded: z.string().min(1, "Service type is required"),
  userCriteria: z.string().min(1, "User criteria is required"),
  location: z.string().min(1, "Location is required"),
  urgency: z.enum([
    "immediate",
    "within_24_hours",
    "within_2_days",
    "flexible",
  ]),
  serviceRequestId: z.string().optional(), // Accepts any string ID (UUID or task-xxx format)
  providerId: z.string().optional(), // Accepts any string ID
});

export default async function providerRoutes(fastify: FastifyInstance) {
  // Create service instance with fastify logger
  const callingService = new ProviderCallingService(fastify.log);

  /**
   * POST /api/v1/providers/call
   * Initiate a phone call to a service provider
   */
  fastify.post(
    "/call",
    {
      schema: {
        tags: ["providers"],
        summary: "Initiate a phone call to a service provider",
        description:
          "Makes a real phone call via VAPI.ai to gather availability and pricing information from a service provider. Automatically uses Kestra orchestration when available, falls back to direct VAPI calls otherwise.",
        body: {
          type: "object",
          required: [
            "providerName",
            "providerPhone",
            "serviceNeeded",
            "userCriteria",
            "location",
            "urgency",
          ],
          properties: {
            providerName: {
              type: "string",
              description: "Name of the service provider",
            },
            providerPhone: {
              type: "string",
              description: "Phone number in E.164 format (+1XXXXXXXXXX)",
              pattern: "^\\+1\\d{10}$",
            },
            serviceNeeded: {
              type: "string",
              description:
                "Type of service needed (e.g., plumbing, electrical)",
            },
            userCriteria: {
              type: "string",
              description: "User requirements and criteria for the service",
            },
            location: {
              type: "string",
              description: "Service location (city, state)",
            },
            urgency: {
              type: "string",
              enum: [
                "immediate",
                "within_24_hours",
                "within_2_days",
                "flexible",
              ],
              description: "How urgent is the service needed",
            },
            serviceRequestId: {
              type: "string",
              description: "Optional: Link to service_requests table (UUID or task-xxx format)",
            },
            providerId: {
              type: "string",
              description: "Optional: Link to providers table (UUID or any string ID)",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  status: { type: "string" },
                  callId: { type: "string" },
                  callMethod: { type: "string" },
                  duration: { type: "number" },
                  endedReason: { type: "string" },
                  transcript: { type: "string" },
                  analysis: {
                    type: "object",
                    properties: {
                      summary: { type: "string" },
                      structuredData: { type: "object" },
                      successEvaluation: { type: "string" },
                    },
                  },
                  provider: { type: "object" },
                  request: { type: "object" },
                  cost: { type: "number" },
                  error: { type: "string" },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "string" },
              details: { type: "array" },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        // Validate request body with Zod
        const validated = callProviderSchema.parse(request.body);

        // Initiate the call
        const result = await callingService.callProvider(validated);

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: unknown) {
        request.log.error({ error }, "Provider call failed");

        // Handle Zod validation errors
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: "Validation error",
            details: error.errors,
          });
        }

        // Handle other errors
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: errorMessage,
        });
      }
    },
  );

  /**
   * GET /api/v1/providers/call/status
   * Check provider calling system status
   */
  fastify.get(
    "/call/status",
    {
      schema: {
        tags: ["providers"],
        summary: "Check provider calling system status",
        description:
          "Returns information about the current calling method (Kestra or direct VAPI) and system health",
        response: {
          200: {
            type: "object",
            properties: {
              kestraEnabled: { type: "boolean" },
              kestraUrl: { type: ["string", "null"] },
              kestraHealthy: { type: "boolean" },
              vapiConfigured: { type: "boolean" },
              fallbackAvailable: { type: "boolean" },
              activeMethod: { type: "string" },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const status = await callingService.getSystemStatus();
        return reply.send(status);
      } catch (error: unknown) {
        request.log.error({ error }, "Failed to get system status");
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: errorMessage,
        });
      }
    },
  );
}
