/**
 * Provider Routes
 * API endpoints for provider calling functionality
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ProviderCallingService,
  ConcurrentCallService,
} from "../services/vapi/index.js";
import { RecommendationService } from "../services/recommendations/recommend.service.js";

// Schema for Gemini-generated custom prompts
const generatedPromptSchema = z.object({
  systemPrompt: z.string(),
  firstMessage: z.string(),
  closingScript: z.string(),
});

// Zod schema for request validation
const callProviderSchema = z.object({
  providerName: z.string().min(1, "Provider name is required"),
  providerPhone: z
    .string()
    .regex(/^\+1\d{10}$/, "Phone must be E.164 format (+1XXXXXXXXXX)"),
  serviceNeeded: z.string().min(1, "Service type is required"),
  userCriteria: z.string().min(1, "User criteria is required"),
  problemDescription: z.string().optional(),
  clientName: z.string().optional(),
  location: z.string().min(1, "Location is required"),
  urgency: z.enum([
    "immediate",
    "within_24_hours",
    "within_2_days",
    "flexible",
  ]),
  serviceRequestId: z.string().optional(), // Accepts any string ID (UUID or task-xxx format)
  providerId: z.string().optional(), // Accepts any string ID
  customPrompt: generatedPromptSchema.optional(), // Gemini-generated dynamic prompt for Direct Tasks
});

// Batch call schema for calling multiple providers concurrently
const batchCallSchema = z.object({
  providers: z.array(
    z.object({
      name: z.string().min(1, "Provider name is required"),
      phone: z
        .string()
        .regex(/^\+1\d{10}$/, "Phone must be E.164 format (+1XXXXXXXXXX)"),
    }),
  ),
  serviceNeeded: z.string().min(1, "Service type is required"),
  userCriteria: z.string().min(1, "User criteria is required"),
  location: z.string().min(1, "Location is required"),
  urgency: z
    .enum(["immediate", "within_24_hours", "within_2_days", "flexible"])
    .default("within_2_days"),
  serviceRequestId: z.string().optional(),
  maxConcurrent: z.number().int().min(1).max(10).optional(),
});

// Recommendation schema for analyzing call results
const recommendationSchema = z.object({
  callResults: z.array(z.any()), // CallResult[] from vapi/types.ts
  originalCriteria: z.string().min(1, "Original criteria is required"),
  serviceRequestId: z.string().min(1, "Service request ID is required"),
});

export default async function providerRoutes(fastify: FastifyInstance) {
  // Create service instances with fastify logger
  const callingService = new ProviderCallingService(fastify.log);
  const concurrentCallService = new ConcurrentCallService(fastify.log);
  const recommendationService = new RecommendationService();

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
            problemDescription: {
              type: "string",
              description: "Optional: Detailed problem description",
            },
            clientName: {
              type: "string",
              description: "Optional: Client's name for personalized greeting",
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
            customPrompt: {
              type: "object",
              description: "Optional: Gemini-generated dynamic prompt for Direct Tasks",
              properties: {
                systemPrompt: { type: "string" },
                firstMessage: { type: "string" },
                closingScript: { type: "string" },
              },
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

  /**
   * POST /api/v1/providers/batch-call
   * Call multiple providers concurrently
   */
  fastify.post(
    "/batch-call",
    {
      schema: {
        tags: ["providers"],
        summary: "Call multiple providers concurrently",
        description:
          "Initiates concurrent phone calls to multiple service providers with controlled concurrency. Uses Kestra orchestration when available, falls back to direct VAPI calls otherwise.",
        body: {
          type: "object",
          required: [
            "providers",
            "serviceNeeded",
            "userCriteria",
            "location",
          ],
          properties: {
            providers: {
              type: "array",
              description: "Array of providers to call",
              items: {
                type: "object",
                required: ["name", "phone"],
                properties: {
                  name: {
                    type: "string",
                    description: "Name of the service provider",
                  },
                  phone: {
                    type: "string",
                    description: "Phone number in E.164 format (+1XXXXXXXXXX)",
                    pattern: "^\\+1\\d{10}$",
                  },
                },
              },
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
              default: "within_2_days",
              description: "How urgent is the service needed",
            },
            serviceRequestId: {
              type: "string",
              description: "Optional: Link to service_requests table",
            },
            maxConcurrent: {
              type: "integer",
              minimum: 1,
              maximum: 10,
              description: "Maximum concurrent calls (default: 5)",
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
                  results: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        status: { type: "string" },
                        callId: { type: "string" },
                        callMethod: { type: "string" },
                        duration: { type: "number" },
                        endedReason: { type: "string" },
                        transcript: { type: "string" },
                        analysis: { type: "object" },
                        provider: { type: "object" },
                        request: { type: "object" },
                      },
                    },
                  },
                  stats: {
                    type: "object",
                    properties: {
                      total: { type: "number" },
                      completed: { type: "number" },
                      failed: { type: "number" },
                      timeout: { type: "number" },
                      noAnswer: { type: "number" },
                      voicemail: { type: "number" },
                      duration: { type: "number" },
                      averageCallDuration: { type: "number" },
                    },
                  },
                  errors: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        provider: { type: "string" },
                        phone: { type: "string" },
                        error: { type: "string" },
                      },
                    },
                  },
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
        const validated = batchCallSchema.parse(request.body);

        // Transform validated data to CallRequest[] format
        const requests = validated.providers.map((provider) => ({
          providerName: provider.name,
          providerPhone: provider.phone,
          serviceNeeded: validated.serviceNeeded,
          userCriteria: validated.userCriteria,
          location: validated.location,
          urgency: validated.urgency,
          serviceRequestId: validated.serviceRequestId,
        }));

        // Initiate batch calls using ProviderCallingService
        const result = await callingService.callProvidersBatch(requests, {
          maxConcurrent: validated.maxConcurrent,
        });

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: unknown) {
        request.log.error({ error }, "Batch provider calls failed");

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
   * POST /api/v1/providers/recommend
   * Analyze call results and recommend top 3 providers
   */
  fastify.post(
    "/recommend",
    {
      schema: {
        tags: ["providers"],
        summary: "Analyze call results and recommend top 3 providers",
        description:
          "Uses Gemini 2.0 Flash to analyze call results from multiple providers and recommend the top 3 based on availability, rates, criteria match, call quality, and professionalism.",
        body: {
          type: "object",
          required: ["callResults", "originalCriteria", "serviceRequestId"],
          properties: {
            callResults: {
              type: "array",
              description: "Array of call results from provider calls",
              items: {
                type: "object",
                properties: {
                  status: { type: "string" },
                  callId: { type: "string" },
                  duration: { type: "number" },
                  transcript: { type: "string" },
                  analysis: { type: "object" },
                  provider: { type: "object" },
                },
              },
            },
            originalCriteria: {
              type: "string",
              description: "Original user criteria/requirements",
            },
            serviceRequestId: {
              type: "string",
              description: "ID of the service request",
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
                  recommendations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        providerName: { type: "string" },
                        phone: { type: "string" },
                        score: { type: "number" },
                        reasoning: { type: "string" },
                        criteriaMatched: {
                          type: "array",
                          items: { type: "string" },
                        },
                        earliestAvailability: { type: "string" },
                        estimatedRate: { type: "string" },
                        callQualityScore: { type: "number" },
                        professionalismScore: { type: "number" },
                      },
                    },
                  },
                  overallRecommendation: { type: "string" },
                  analysisNotes: { type: "string" },
                  stats: {
                    type: "object",
                    properties: {
                      totalCalls: { type: "number" },
                      qualifiedProviders: { type: "number" },
                      disqualifiedProviders: { type: "number" },
                      failedCalls: { type: "number" },
                    },
                  },
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
        const validated = recommendationSchema.parse(request.body);

        // Generate recommendations
        const recommendations = await recommendationService.generateRecommendations(
          validated
        );

        return reply.send({
          success: true,
          data: recommendations,
        });
      } catch (error: unknown) {
        request.log.error({ error }, "Provider recommendation failed");

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
}
