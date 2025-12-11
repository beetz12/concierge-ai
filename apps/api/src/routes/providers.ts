/**
 * Provider Routes
 * API endpoints for provider calling functionality
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  ProviderCallingService,
  ConcurrentCallService,
  KestraClient,
} from "../services/vapi/index.js";
import type { CallRequest } from "../services/vapi/types.js";
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
  userCriteria: z.string().default(""), // Optional - empty string allowed
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
      id: z.string().optional(), // Provider ID for database linking
    }),
  ),
  serviceNeeded: z.string().min(1, "Service type is required"),
  userCriteria: z.string().default(""), // Optional - empty string allowed
  problemDescription: z.string().optional(), // Detailed problem description
  clientName: z.string().optional(), // Client's name for personalized greeting
  location: z.string().min(1, "Location is required"),
  urgency: z
    .enum(["immediate", "within_24_hours", "within_2_days", "flexible"])
    .default("within_2_days"),
  serviceRequestId: z.string().optional(),
  maxConcurrent: z.number().int().min(1).max(10).optional(),
  customPrompt: generatedPromptSchema.optional(), // Gemini-generated dynamic prompt
});

// Recommendation schema for analyzing call results
const recommendationSchema = z.object({
  callResults: z.array(z.any()), // CallResult[] from vapi/types.ts
  originalCriteria: z.string().default(""), // Optional - empty string allowed
  serviceRequestId: z.string().min(1, "Service request ID is required"),
});

// Booking schema for scheduling appointments
const bookingSchema = z.object({
  providerId: z.string().min(1, "Provider ID is required"),
  providerName: z.string().min(1, "Provider name is required"),
  providerPhone: z
    .string()
    .regex(/^\+1\d{10}$/, "Phone must be E.164 format (+1XXXXXXXXXX)"),
  serviceNeeded: z.string().min(1, "Service type is required"),
  serviceRequestId: z.string().min(1, "Service request ID is required"),
  clientName: z.string().optional(),
  clientPhone: z.string().optional(),
  location: z.string().min(1, "Location is required"),
  preferredDateTime: z.string().optional(),
  additionalNotes: z.string().optional(),
});

export default async function providerRoutes(fastify: FastifyInstance) {
  // Create service instances with fastify logger
  const callingService = new ProviderCallingService(fastify.log);
  const concurrentCallService = new ConcurrentCallService(fastify.log);
  const recommendationService = new RecommendationService();
  const kestraClient = new KestraClient(fastify.log);

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
          providerId: provider.id,
          serviceNeeded: validated.serviceNeeded,
          userCriteria: validated.userCriteria,
          problemDescription: validated.problemDescription,
          clientName: validated.clientName,
          location: validated.location,
          urgency: validated.urgency,
          serviceRequestId: validated.serviceRequestId,
          customPrompt: validated.customPrompt,
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
   * POST /api/v1/providers/batch-call-async
   *
   * Async batch call endpoint - Returns 202 Accepted immediately.
   * Calls run in background, results delivered via Supabase real-time subscriptions.
   *
   * 2025 Best Practice: HTTP 202 Accepted pattern for long-running operations
   */
  fastify.post(
    "/batch-call-async",
    {
      schema: {
        tags: ["providers"],
        summary: "Start provider calls asynchronously",
        description: "Returns immediately with execution ID. Monitor progress via real-time subscriptions or polling endpoint.",
        body: {
          type: "object",
          required: ["providers", "serviceNeeded", "location"],
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
                  id: {
                    type: "string",
                    description: "Provider ID for database linking",
                  },
                },
              },
            },
            serviceNeeded: {
              type: "string",
              description: "Type of service needed (e.g., plumbing, electrical)",
            },
            userCriteria: {
              type: "string",
              description: "User requirements and criteria for the service",
              default: "",
            },
            problemDescription: {
              type: "string",
              description: "Detailed problem description",
            },
            clientName: {
              type: "string",
              description: "Client's name for personalized greeting",
            },
            location: {
              type: "string",
              description: "Service location (city, state)",
            },
            urgency: {
              type: "string",
              enum: ["immediate", "within_24_hours", "within_2_days", "flexible"],
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
            customPrompt: {
              type: "object",
              description: "Optional: Gemini-generated dynamic prompt",
              properties: {
                systemPrompt: { type: "string" },
                firstMessage: { type: "string" },
                closingScript: { type: "string" },
              },
            },
          },
        },
        response: {
          202: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  executionId: { type: "string" },
                  status: { type: "string" },
                  providersQueued: { type: "number" },
                  message: { type: "string" },
                  statusUrl: { type: "string" },
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
        const validated = batchCallSchema.parse(request.body);

        // Generate execution ID for tracking
        const executionId = crypto.randomUUID();

        fastify.log.info(
          { executionId, providerCount: validated.providers.length },
          "Starting async batch call"
        );

        // Create Supabase client
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Build request objects for each provider
        const requests: CallRequest[] = validated.providers.map((p) => ({
          providerName: p.name,
          providerPhone: p.phone,
          providerId: p.id,
          serviceNeeded: validated.serviceNeeded,
          userCriteria: validated.userCriteria,
          problemDescription: validated.problemDescription,
          clientName: validated.clientName,
          location: validated.location,
          urgency: validated.urgency,
          customPrompt: validated.customPrompt,
          serviceRequestId: validated.serviceRequestId,
        }));

        // Mark all providers as "queued" immediately (triggers real-time)
        const providerIds = validated.providers.map((p) => p.id).filter(Boolean);
        if (providerIds.length > 0) {
          await supabase
            .from("providers")
            .update({ call_status: "queued" })
            .in("id", providerIds);
        }

        // Log the execution start
        if (validated.serviceRequestId) {
          await supabase.from("interaction_logs").insert({
            request_id: validated.serviceRequestId,
            step_name: "Batch Calls Started",
            detail: `Queued ${validated.providers.length} providers for calling (execution: ${executionId})`,
            status: "info",
          });
        }

        // Start background processing - DO NOT AWAIT
        setImmediate(async () => {
          try {
            fastify.log.info({ executionId }, "Background batch call processing started");

            await callingService.callProvidersBatch(requests, {
              maxConcurrent: validated.maxConcurrent || 5,
            });

            fastify.log.info({ executionId }, "Background batch call processing completed");
          } catch (error) {
            fastify.log.error(
              { executionId, error },
              "Background batch call processing failed"
            );

            // Log error to database for visibility
            if (validated.serviceRequestId) {
              await supabase.from("interaction_logs").insert({
                request_id: validated.serviceRequestId,
                step_name: "Batch Calls Error",
                detail: `Background processing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
                status: "error",
              });
            }
          }
        });

        // Return 202 Accepted immediately
        return reply.status(202).send({
          success: true,
          data: {
            executionId,
            status: "accepted",
            providersQueued: validated.providers.length,
            message: "Calls started. Monitor progress via real-time subscriptions.",
            statusUrl: `/api/v1/providers/batch-status/${validated.serviceRequestId}`,
          },
        });
      } catch (error) {
        fastify.log.error({ error }, "Failed to start async batch call");

        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: "Validation failed",
            details: error.errors,
          });
        }

        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  );

  /**
   * GET /api/v1/providers/batch-status/:serviceRequestId
   *
   * Status polling endpoint for clients without real-time support.
   * Returns current state of all provider calls for a request.
   */
  fastify.get(
    "/batch-status/:serviceRequestId",
    {
      schema: {
        tags: ["providers"],
        summary: "Get batch call status",
        description: "Returns current state of all provider calls. Use for polling fallback when real-time unavailable.",
        params: {
          type: "object",
          properties: {
            serviceRequestId: { type: "string", format: "uuid" },
          },
          required: ["serviceRequestId"],
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
                  stats: {
                    type: "object",
                    properties: {
                      total: { type: "number" },
                      queued: { type: "number" },
                      inProgress: { type: "number" },
                      completed: { type: "number" },
                    },
                  },
                  providers: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        callStatus: { type: "string" },
                        calledAt: { type: "string" },
                      },
                    },
                  },
                },
              },
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
        const { serviceRequestId } = request.params as { serviceRequestId: string };

        // Create Supabase client
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const { data: providers, error } = await supabase
          .from("providers")
          .select("id, name, call_status, called_at, call_duration_minutes")
          .eq("request_id", serviceRequestId);

        if (error) {
          throw error;
        }

        const providerList = providers || [];
        const finalStatuses = ["completed", "failed", "no_answer", "voicemail", "error", "busy"];

        const stats = {
          total: providerList.length,
          queued: providerList.filter((p) => p.call_status === "queued").length,
          inProgress: providerList.filter((p) => p.call_status === "in_progress").length,
          completed: providerList.filter((p) =>
            p.call_status && finalStatuses.includes(p.call_status)
          ).length,
        };

        const allComplete = stats.completed === stats.total && stats.total > 0;

        return reply.send({
          success: true,
          data: {
            status: allComplete ? "completed" : stats.inProgress > 0 ? "in_progress" : "queued",
            stats,
            providers: providerList.map((p) => ({
              id: p.id,
              name: p.name,
              callStatus: p.call_status,
              calledAt: p.called_at,
            })),
          },
        });
      } catch (error) {
        fastify.log.error({ error }, "Failed to get batch status");
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
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

        // Check if Kestra is enabled (primary path for hackathon)
        const kestraEnabled = process.env.KESTRA_ENABLED === "true";
        const kestraHealthy = kestraEnabled && (await kestraClient.healthCheck());

        request.log.info(
          { kestraEnabled, kestraHealthy },
          "Recommendation routing decision"
        );

        if (kestraHealthy) {
          // Use Kestra workflow (primary path)
          request.log.info("Using Kestra recommend_providers workflow");

          const kestraResult = await kestraClient.triggerRecommendProvidersFlow({
            callResults: validated.callResults,
            originalCriteria: validated.originalCriteria,
            serviceRequestId: validated.serviceRequestId,
          });

          if (!kestraResult.success) {
            request.log.warn(
              { error: kestraResult.error },
              "Kestra recommendation failed, falling back to direct Gemini"
            );
            // Fall through to direct Gemini
          } else {
            return reply.send({
              success: true,
              data: kestraResult.recommendations,
              method: "kestra",
              executionId: kestraResult.executionId,
            });
          }
        }

        // Fallback: Direct Gemini API call
        request.log.info("Using direct Gemini API for recommendations");

        const recommendations = await recommendationService.generateRecommendations(
          validated
        );

        return reply.send({
          success: true,
          data: recommendations,
          method: "direct_gemini",
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

  /**
   * POST /api/v1/providers/book
   * Book an appointment with a selected provider
   */
  fastify.post(
    "/book",
    {
      schema: {
        tags: ["providers"],
        summary: "Book an appointment with a selected provider",
        description:
          "Calls the provider back via VAPI.ai to schedule a confirmed appointment time. Updates the service request and provider records with booking outcome.",
        body: {
          type: "object",
          required: [
            "providerId",
            "providerName",
            "providerPhone",
            "serviceNeeded",
            "serviceRequestId",
            "location",
          ],
          properties: {
            providerId: {
              type: "string",
              description: "UUID of the provider in the database",
            },
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
              description: "Type of service being booked",
            },
            serviceRequestId: {
              type: "string",
              description: "UUID of the service request",
            },
            clientName: {
              type: "string",
              description: "Optional: Client's name for the appointment",
            },
            clientPhone: {
              type: "string",
              description: "Optional: Client's callback phone number",
            },
            location: {
              type: "string",
              description: "Service location (city, state)",
            },
            preferredDateTime: {
              type: "string",
              description:
                "Optional: Preferred appointment date/time (e.g., 'Tomorrow at 2pm')",
            },
            additionalNotes: {
              type: "string",
              description:
                "Optional: Additional notes or requirements for the booking",
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
                  bookingConfirmed: { type: "boolean" },
                  callId: { type: "string" },
                  confirmedDate: { type: "string" },
                  confirmedTime: { type: "string" },
                  confirmationNumber: { type: "string" },
                  callOutcome: { type: "string" },
                  transcript: { type: "string" },
                  summary: { type: "string" },
                  nextSteps: { type: "string" },
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
        const validated = bookingSchema.parse(request.body);

        request.log.info(
          {
            providerId: validated.providerId,
            providerName: validated.providerName,
            serviceRequestId: validated.serviceRequestId,
          },
          "Initiating booking call",
        );

        // Import booking config
        const { createBookingAssistantConfig } = await import(
          "../services/vapi/booking-assistant-config.js"
        );

        // Create booking assistant configuration
        const bookingConfig = createBookingAssistantConfig({
          providerName: validated.providerName,
          providerPhone: validated.providerPhone,
          serviceNeeded: validated.serviceNeeded,
          clientName: validated.clientName,
          clientPhone: validated.clientPhone,
          location: validated.location,
          preferredDateTime: validated.preferredDateTime,
          serviceRequestId: validated.serviceRequestId,
          providerId: validated.providerId,
          additionalNotes: validated.additionalNotes,
        });

        // Build call parameters directly
        const callParams: any = {
          phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
          customer: {
            number: validated.providerPhone,
            name: validated.providerName,
          },
          assistant: bookingConfig,
        };

        // Use VAPI SDK directly for booking calls
        const { VapiClient } = await import("@vapi-ai/server-sdk");
        const vapi = new VapiClient({ token: process.env.VAPI_API_KEY! });

        request.log.info(
          { provider: validated.providerName, phone: validated.providerPhone },
          "Creating booking call via VAPI",
        );

        // Create the call
        const callResponse = await vapi.calls.create(callParams);

        // Extract call from response (handle different SDK response types)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let call: any;
        if (Array.isArray(callResponse)) {
          call = callResponse[0];
        } else if ((callResponse as any).id) {
          call = callResponse;
        } else if ((callResponse as any).data?.id) {
          call = (callResponse as any).data;
        } else {
          throw new Error("Unexpected response format from VAPI calls.create");
        }

        request.log.info(
          { callId: call.id, status: call.status },
          "Booking call created, waiting for completion",
        );

        // Poll for completion
        const maxAttempts = 60; // 5 minutes
        let attempts = 0;
        let completedCall: any = null;

        while (attempts < maxAttempts) {
          const callData = await vapi.calls.get({ id: call.id });

          // Extract call from response (handle different SDK response types)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let currentCall: any;
          if (Array.isArray(callData)) {
            currentCall = callData[0];
          } else if ((callData as any).id) {
            currentCall = callData;
          } else if ((callData as any).data?.id) {
            currentCall = (callData as any).data;
          } else {
            throw new Error("Unexpected response format from VAPI calls.get");
          }

          if (!["queued", "ringing", "in-progress"].includes(currentCall.status)) {
            completedCall = currentCall;
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 5000));
          attempts++;
        }

        if (!completedCall) {
          throw new Error(`Booking call ${call.id} timed out after ${maxAttempts * 5} seconds`);
        }

        request.log.info(
          { callId: completedCall.id, status: completedCall.status },
          "Booking call completed",
        );

        // Extract structured data from call result
        const analysis = completedCall.analysis || {};
        const structuredData = analysis.structuredData || {};
        const bookingConfirmed = structuredData.booking_confirmed || false;

        // Extract transcript
        const transcript = completedCall.artifact?.transcript || "";
        const transcriptStr =
          typeof transcript === "string" ? transcript : JSON.stringify(transcript);

        // Update database with booking result
        const { createClient: createSupabaseClient } = await import(
          "@supabase/supabase-js"
        );
        const supabase = createSupabaseClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );

        // Update provider record with booking details
        const { error: updateProviderError } = await supabase
          .from("providers")
          .update({
            booking_confirmed: bookingConfirmed,
            booking_date: structuredData.confirmed_date,
            booking_time: structuredData.confirmed_time,
            confirmation_number: structuredData.confirmation_number,
            last_call_at: new Date().toISOString(),
            call_transcript: transcriptStr,
          })
          .eq("id", validated.providerId);

        if (updateProviderError) {
          request.log.error(
            { error: updateProviderError },
            "Failed to update provider record",
          );
        }

        // If booking confirmed, update service request
        if (bookingConfirmed) {
          const { error: updateRequestError } = await supabase
            .from("service_requests")
            .update({
              selected_provider_id: validated.providerId,
              status: "COMPLETED",
              final_outcome: `Appointment confirmed with ${validated.providerName} for ${structuredData.confirmed_date || "TBD"} at ${structuredData.confirmed_time || "TBD"}`,
            })
            .eq("id", validated.serviceRequestId);

          if (updateRequestError) {
            request.log.error(
              { error: updateRequestError },
              "Failed to update service request",
            );
          }

          // Create interaction log
          await supabase.from("interaction_logs").insert({
            request_id: validated.serviceRequestId,
            step_name: "Booking Confirmed",
            detail: `Successfully booked appointment with ${validated.providerName}. Confirmation: ${structuredData.confirmation_number || "N/A"}`,
            status: "success",
          });
        } else {
          // Booking failed - log it
          await supabase.from("interaction_logs").insert({
            request_id: validated.serviceRequestId,
            step_name: "Booking Failed",
            detail: `Failed to confirm booking with ${validated.providerName}. Outcome: ${structuredData.call_outcome || "unknown"}`,
            status: "warning",
          });
        }

        return reply.send({
          success: true,
          data: {
            bookingConfirmed,
            callId: completedCall.id,
            confirmedDate: structuredData.confirmed_date || "",
            confirmedTime: structuredData.confirmed_time || "",
            confirmationNumber: structuredData.confirmation_number || "",
            callOutcome: structuredData.call_outcome || "unknown",
            transcript: transcriptStr,
            summary: analysis.summary || "",
            nextSteps: structuredData.next_steps || "",
          },
        });
      } catch (error: unknown) {
        request.log.error({ error }, "Booking call failed");

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
