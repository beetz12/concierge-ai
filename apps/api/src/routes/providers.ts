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
import type { CallRequest, CallResult } from "../services/vapi/types.js";
import { RecommendationService } from "../services/recommendations/recommend.service.js";
import { triggerUserNotification } from "../services/notifications/index.js";
import { DirectTwilioClient } from "../services/notifications/direct-twilio.client.js";

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
  clientAddress: z.string().optional(), // Full street address for VAPI prompts
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
  clientAddress: z.string().optional(), // Full street address for VAPI prompts
  urgency: z
    .enum(["immediate", "within_24_hours", "within_2_days", "flexible"])
    .default("within_2_days"),
  serviceRequestId: z.string().optional(),
  maxConcurrent: z.number().int().min(1).max(10).optional(),
  customPrompt: generatedPromptSchema.optional(), // Gemini-generated dynamic prompt
  preferredContact: z.enum(["phone", "text"]).optional(), // User's preferred contact method
  userPhone: z.string().optional(), // User's phone number for notifications
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
  clientAddress: z.string().optional(), // Full street address for VAPI prompts
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
          clientAddress: validated.clientAddress,
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
            preferredContact: {
              type: "string",
              enum: ["phone", "text"],
              description: "User's preferred contact method for recommendations",
            },
            userPhone: {
              type: "string",
              description: "User's phone number for notifications",
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
        let validated = batchCallSchema.parse(request.body);

        // Load test phone configuration from backend environment
        const adminTestPhonesRaw = process.env.ADMIN_TEST_NUMBER;
        const adminTestPhones = adminTestPhonesRaw
          ? adminTestPhonesRaw.split(",").map((p) => p.trim()).filter(Boolean)
          : [];
        const isAdminTestMode = adminTestPhones.length > 0;

        // Apply test phone substitution if in test mode
        if (isAdminTestMode) {
          request.log.info(
            { adminTestPhones, providerCount: validated.providers.length },
            "Test mode active - substituting provider phones with admin test phones"
          );

          // Limit providers to number of test phones and substitute phone numbers
          const limitedProviders = validated.providers.slice(0, adminTestPhones.length);
          validated = {
            ...validated,
            providers: limitedProviders.map((p, idx) => ({
              ...p,
              phone: adminTestPhones[idx % adminTestPhones.length]!,
            })),
          };

          request.log.info(
            { substitutedProviders: validated.providers.map(p => ({ name: p.name, phone: p.phone })) },
            "Phone numbers substituted for test mode"
          );
        }

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
          clientAddress: validated.clientAddress,
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

            const batchResult = await callingService.callProvidersBatch(requests, {
              maxConcurrent: validated.maxConcurrent || 5,
            }) as { success: boolean; resultsInDatabase?: boolean; stats?: { completed?: number } };

            fastify.log.info(
              { executionId, success: batchResult.success, resultsInDatabase: batchResult.resultsInDatabase },
              "Background batch call processing completed"
            );

            // If resultsInDatabase flag is set, results were saved via Kestra callbacks
            // Wait for all providers to have results, then generate recommendations
            if (batchResult.resultsInDatabase && validated.serviceRequestId) {
              fastify.log.info(
                { executionId, serviceRequestId: validated.serviceRequestId },
                "Kestra batch completed with results in database - waiting for all provider results"
              );

              // Determine actual status based on results
              const totalProviders = validated.providers.length;
              const errorCount = (batchResult as any).errors?.length || 0;
              const successCount = (batchResult as any).stats?.completed || 0;
              const allFailed = errorCount === totalProviders || successCount === 0;
              const partialSuccess = errorCount > 0 && errorCount < totalProviders;

              // Log actual status to interaction_logs
              await supabase.from("interaction_logs").insert({
                request_id: validated.serviceRequestId,
                step_name: allFailed ? "Batch Calls Failed" : "Batch Calls Completed",
                detail: allFailed
                  ? `All ${totalProviders} provider calls failed. ${(batchResult as any).errors?.[0]?.error || "VAPI API error"}`
                  : partialSuccess
                  ? `${successCount}/${totalProviders} calls succeeded. ${errorCount} failed.`
                  : `All ${totalProviders} provider calls completed successfully.`,
                status: allFailed ? "error" : partialSuccess ? "warning" : "success",
              });

              // If ALL calls failed, update service request to FAILED immediately
              if (allFailed && validated.serviceRequestId) {
                await supabase
                  .from("service_requests")
                  .update({
                    status: "FAILED",
                    final_outcome: `All provider calls failed: ${(batchResult as any).errors?.[0]?.error || "VAPI API error"}`,
                  })
                  .eq("id", validated.serviceRequestId);

                fastify.log.error(
                  { executionId, errorCount, errors: (batchResult as any).errors },
                  "All provider calls failed - marked service request as FAILED"
                );
                return; // Exit background processing early
              }

              // Step 1: Poll for all providers to have final call_status (max 30 seconds)
              const finalStatuses = ["completed", "failed", "error", "timeout", "no_answer", "voicemail", "busy"];
              let allProvidersComplete = false;
              let pollAttempts = 0;
              const maxPollAttempts = 15; // 15 attempts * 2 seconds = 30 seconds max

              while (!allProvidersComplete && pollAttempts < maxPollAttempts) {
                pollAttempts++;

                const { data: providers, error: fetchError } = await supabase
                  .from("providers")
                  .select("id, call_status, call_result, call_summary, name, phone, rating, review_count")
                  .eq("request_id", validated.serviceRequestId);

                if (fetchError) {
                  fastify.log.error({ error: fetchError }, "Failed to fetch providers for recommendation check");
                  break;
                }

                if (!providers || providers.length === 0) {
                  fastify.log.warn({ serviceRequestId: validated.serviceRequestId }, "No providers found");
                  break;
                }

                const calledProviders = providers.filter(p => p.call_status);
                const completedProviders = providers.filter(p =>
                  p.call_status && finalStatuses.includes(p.call_status)
                );

                fastify.log.debug(
                  {
                    pollAttempt: pollAttempts,
                    total: providers.length,
                    called: calledProviders.length,
                    completed: completedProviders.length
                  },
                  "Polling provider completion status"
                );

                // All called providers have reached final status
                if (calledProviders.length > 0 && completedProviders.length === calledProviders.length) {
                  allProvidersComplete = true;
                  fastify.log.info(
                    {
                      executionId,
                      completedCount: completedProviders.length,
                      totalProviders: providers.length
                    },
                    "All provider calls completed - generating recommendations"
                  );

                  // Step 2: Update status to ANALYZING (now that we've confirmed all calls completed)
                  await supabase
                    .from("service_requests")
                    .update({
                      status: "ANALYZING",
                    })
                    .eq("id", validated.serviceRequestId);

                  fastify.log.info(
                    { executionId, serviceRequestId: validated.serviceRequestId },
                    "Status updated to ANALYZING after confirming all provider calls completed"
                  );

                  // Step 3: Transform provider data to CallResult format for recommendations API
                  // Fetch service request for context
                  const { data: serviceRequest } = await supabase
                    .from("service_requests")
                    .select("title, criteria, location")
                    .eq("id", validated.serviceRequestId)
                    .single();

                  const callResults = completedProviders.map(p => {
                    const callResultData = p.call_result as any;
                    return {
                      // Provider metadata for scoring
                      providerId: p.id,
                      rating: p.rating ?? undefined,
                      reviewCount: p.review_count ?? undefined,
                      // Call result data
                      status: p.call_status,
                      callId: callResultData?.callId || "",
                      callMethod: "direct_vapi" as const,
                      duration: callResultData?.duration || 0,
                      endedReason: callResultData?.endedReason || "",
                      transcript: callResultData?.transcript || "",
                      analysis: {
                        summary: p.call_summary || callResultData?.summary || "",
                        structuredData: callResultData || {},
                        successEvaluation: "",
                      },
                      provider: {
                        name: p.name,
                        phone: p.phone || "",
                        service: serviceRequest?.title || validated.serviceNeeded,
                        location: serviceRequest?.location || validated.location,
                      },
                      request: {
                        criteria: serviceRequest?.criteria || validated.userCriteria,
                        urgency: validated.urgency,
                      },
                    };
                  });

                  // Step 4: Generate recommendations (Kestra or Direct Gemini)
                  try {
                    const kestraEnabled = process.env.KESTRA_ENABLED === "true";
                    const kestraHealthy = kestraEnabled && await kestraClient.healthCheck();

                    fastify.log.info(
                      { kestraEnabled, kestraHealthy, callResultsCount: callResults.length },
                      "Generating recommendations"
                    );

                    let recommendationResult: Awaited<ReturnType<typeof recommendationService.generateRecommendations>> | null = null;

                    if (kestraHealthy) {
                      // Use Kestra workflow
                      const kestraResult = await kestraClient.triggerRecommendProvidersFlow({
                        callResults,
                        originalCriteria: serviceRequest?.criteria || validated.userCriteria || "",
                        serviceRequestId: validated.serviceRequestId,
                      });

                      if (kestraResult.success && kestraResult.recommendations?.recommendations?.length > 0) {
                        recommendationResult = kestraResult.recommendations;
                        fastify.log.info(
                          { executionId: kestraResult.executionId, recommendationCount: kestraResult.recommendations.recommendations.length },
                          "Kestra recommendations generated successfully"
                        );
                      } else {
                        fastify.log.warn(
                          { error: kestraResult.error },
                          "Kestra recommendation failed, falling back to direct Gemini"
                        );
                      }
                    }

                    // Fallback to Direct Gemini if Kestra unavailable or failed
                    if (!recommendationResult) {
                      const directResult = await recommendationService.generateRecommendations({
                        callResults,
                        originalCriteria: serviceRequest?.criteria || validated.userCriteria || "",
                        serviceRequestId: validated.serviceRequestId,
                      });

                      if (directResult?.recommendations?.length > 0) {
                        recommendationResult = directResult;
                        fastify.log.info(
                          { recommendationCount: directResult.recommendations.length },
                          "Direct Gemini recommendations generated successfully"
                        );
                      }
                    }

                    // Step 5: Store recommendations and update status
                    if (recommendationResult && recommendationResult.recommendations.length > 0) {
                      // Store recommendations in database
                      const { error: updateError } = await supabase
                        .from("service_requests")
                        .update({
                          status: "RECOMMENDED",
                          recommendations: recommendationResult,
                        })
                        .eq("id", validated.serviceRequestId);

                      if (updateError) {
                        fastify.log.error(
                          { error: updateError, serviceRequestId: validated.serviceRequestId },
                          "Failed to store recommendations in database - updating status to FAILED"
                        );
                        // Update status to FAILED since we couldn't store recommendations
                        await supabase
                          .from("service_requests")
                          .update({
                            status: "FAILED",
                            final_outcome: `Failed to store recommendations: ${updateError.message || "Database error"}`,
                          })
                          .eq("id", validated.serviceRequestId);

                        await supabase.from("interaction_logs").insert({
                          request_id: validated.serviceRequestId,
                          step_name: "Recommendation Storage Failed",
                          detail: `Failed to save recommendations to database: ${updateError.message || "Unknown error"}`,
                          status: "error",
                        });
                      } else {
                        fastify.log.info(
                          {
                            executionId,
                            serviceRequestId: validated.serviceRequestId,
                            recommendationCount: recommendationResult.recommendations.length,
                          },
                          "Recommendations stored in database and status updated to RECOMMENDED"
                        );

                        await supabase.from("interaction_logs").insert({
                          request_id: validated.serviceRequestId,
                          step_name: "Recommendations Generated",
                          detail: `AI analyzed all call results and generated ${recommendationResult.recommendations.length} provider recommendations.`,
                          status: "success",
                        });

                        // Step 6: Send user notification (ONLY if storage succeeded)
                        if (validated.userPhone && recommendationResult.recommendations.length > 0) {
                          try {
                            const notificationResult = await triggerUserNotification(
                              {
                                serviceRequestId: validated.serviceRequestId,
                                userPhone: validated.userPhone,
                                userName: validated.clientName,
                                preferredContact: validated.preferredContact || "text",
                                serviceNeeded: validated.serviceNeeded,
                                location: validated.location,
                                providers: recommendationResult.recommendations.slice(0, 3).map((r) => ({
                                  name: r.providerName,
                                  earliestAvailability: r.earliestAvailability || "Contact for availability",
                                  score: r.score,
                                  rating: r.rating,
                                  reviewCount: r.reviewCount,
                                  estimatedRate: r.estimatedRate,
                                  reasoning: r.reasoning,
                                })),
                                overallRecommendation: recommendationResult.overallRecommendation,
                              },
                              fastify.log
                            );

                            if (notificationResult.success) {
                              fastify.log.info(
                                {
                                  serviceRequestId: validated.serviceRequestId,
                                  method: notificationResult.method,
                                },
                                "User notification sent successfully"
                              );

                              await supabase.from("interaction_logs").insert({
                                request_id: validated.serviceRequestId,
                                step_name: "User Notified",
                                detail: `User notified via ${notificationResult.method} about ${recommendationResult.recommendations.length} recommended providers.`,
                                status: "success",
                              });
                            } else {
                              fastify.log.warn(
                                {
                                  serviceRequestId: validated.serviceRequestId,
                                  error: notificationResult.error,
                                },
                                "User notification failed"
                              );
                            }
                          } catch (notifyError) {
                            const errorMsg = notifyError instanceof Error ? notifyError.message : String(notifyError);
                            fastify.log.error(
                              { error: errorMsg, serviceRequestId: validated.serviceRequestId },
                              "Error sending user notification"
                            );
                            // Don't fail the whole flow if notification fails
                          }
                        } else if (!validated.userPhone) {
                          fastify.log.info(
                            { serviceRequestId: validated.serviceRequestId },
                            "Skipping notification - no user phone provided"
                          );
                        }
                      }
                    } else {
                      fastify.log.warn(
                        { executionId, serviceRequestId: validated.serviceRequestId },
                        "Failed to generate recommendations - updating status to FAILED"
                      );
                      // Update status to FAILED when no recommendations generated
                      await supabase
                        .from("service_requests")
                        .update({
                          status: "FAILED",
                          final_outcome: "AI was unable to generate provider recommendations from call results",
                        })
                        .eq("id", validated.serviceRequestId);

                      await supabase.from("interaction_logs").insert({
                        request_id: validated.serviceRequestId,
                        step_name: "Recommendation Generation Failed",
                        detail: "AI analysis completed but no recommendations could be generated from the call results.",
                        status: "error",
                      });
                    }
                  } catch (recError) {
                    // Serialize error properly (Error objects log as {} by default)
                    const errorMsg = recError instanceof Error ? recError.message : String(recError);
                    const errorStack = recError instanceof Error ? recError.stack : undefined;
                    fastify.log.error(
                      { errorMessage: errorMsg, errorStack, serviceRequestId: validated.serviceRequestId },
                      "Error generating recommendations - updating status to FAILED"
                    );
                    // Update status to FAILED on exception
                    if (validated.serviceRequestId) {
                      await supabase
                        .from("service_requests")
                        .update({
                          status: "FAILED",
                          final_outcome: `Recommendation generation error: ${errorMsg}`,
                        })
                        .eq("id", validated.serviceRequestId);

                      await supabase.from("interaction_logs").insert({
                        request_id: validated.serviceRequestId,
                        step_name: "Recommendation Generation Error",
                        detail: `An error occurred during recommendation generation: ${errorMsg}`,
                        status: "error",
                      });
                    }
                  }
                } else {
                  // Wait 2 seconds before next poll
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }
              }

              if (!allProvidersComplete) {
                fastify.log.error(
                  { executionId, pollAttempts, serviceRequestId: validated.serviceRequestId },
                  "Timed out waiting for all providers to complete - updating status to FAILED"
                );

                // Update status to FAILED
                await supabase
                  .from("service_requests")
                  .update({
                    status: "FAILED",
                    final_outcome: "Provider calls timed out after 30 seconds without completing",
                  })
                  .eq("id", validated.serviceRequestId);

                return; // Exit the background process
              }
            }
          } catch (error) {
            fastify.log.error(
              { executionId, error },
              "Background batch call processing failed"
            );

            const errorMessage = error instanceof Error ? error.message : "Unknown error";

            // Update service request status to FAILED (triggers real-time subscription)
            if (validated.serviceRequestId) {
              await supabase
                .from("service_requests")
                .update({
                  status: "FAILED",
                  final_outcome: `Failed to complete provider calls: ${errorMessage}`,
                })
                .eq("id", validated.serviceRequestId);
            }

            // Mark all queued/in_progress providers as error
            const providerIds = validated.providers.map((p) => p.id).filter(Boolean);
            if (providerIds.length > 0) {
              await supabase
                .from("providers")
                .update({ call_status: "error" })
                .in("id", providerIds)
                .in("call_status", ["queued", "in_progress"]);
            }

            // Log error to interaction_logs for audit trail
            if (validated.serviceRequestId) {
              await supabase.from("interaction_logs").insert({
                request_id: validated.serviceRequestId,
                step_name: "Batch Calls Error",
                detail: `Background processing failed: ${errorMessage}`,
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
   * POST /api/v1/providers/save-call-result
   * Save call result from Kestra workflow to database
   * This enables real-time updates to frontend via Supabase subscriptions
   */
  fastify.post(
    "/save-call-result",
    {
      schema: {
        tags: ["providers"],
        summary: "Save call result from Kestra",
        description: "Called by Kestra after each VAPI call completes to persist results",
        body: {
          type: "object",
          required: ["providerId", "serviceRequestId", "callResult"],
          properties: {
            providerId: { type: "string" },
            serviceRequestId: { type: "string" },
            callResult: {
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
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
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
        const { providerId, serviceRequestId, callResult } = request.body as {
          providerId: string;
          serviceRequestId: string;
          callResult: any;
        };

        request.log.info(
          { providerId, serviceRequestId, status: callResult.status },
          "Saving Kestra call result to database"
        );

        // Create Supabase client
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Update provider with call result
        const { error: providerError } = await supabase
          .from("providers")
          .update({
            call_status: callResult.status || "completed",
            call_result: callResult,
            call_transcript: callResult.transcript || "",
            call_summary: callResult.analysis?.summary || "",
            call_duration_minutes: callResult.duration || 0,
            call_id: callResult.callId || null,
            call_method: "kestra",
            called_at: new Date().toISOString(),
          })
          .eq("id", providerId);

        if (providerError) {
          request.log.error({ error: providerError }, "Failed to update provider");
          return reply.status(500).send({ success: false, error: providerError.message });
        }

        // Create interaction log for real-time updates
        const logStatus = callResult.status === "completed" ? "success" :
                         callResult.status === "error" ? "error" : "warning";

        const { error: logError } = await supabase
          .from("interaction_logs")
          .insert({
            request_id: serviceRequestId,
            step_name: `Calling ${callResult.provider?.name || "Provider"}`,
            status: logStatus,
            detail: callResult.analysis?.summary || `Call ${callResult.status}`,
            transcript: callResult.transcript ? [{ role: "transcript", content: callResult.transcript }] : null,
            call_id: callResult.callId || null,
          });

        if (logError) {
          request.log.warn({ error: logError }, "Failed to create interaction log (non-fatal)");
        }

        return reply.send({ success: true });
      } catch (error) {
        request.log.error({ error }, "Error saving call result");
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
          "Uses Gemini 2.5 Flash to analyze call results from multiple providers and recommend the top 3 based on availability, rates, criteria match, call quality, and professionalism.",
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
            // Validate that we have actual recommendations data
            if (!kestraResult.recommendations ||
                !kestraResult.recommendations.recommendations ||
                kestraResult.recommendations.recommendations.length === 0) {
              request.log.warn(
                {
                  executionId: kestraResult.executionId,
                  hasRecommendations: !!kestraResult.recommendations,
                  hasRecommendationsArray: !!(kestraResult.recommendations?.recommendations),
                  recommendationsLength: kestraResult.recommendations?.recommendations?.length || 0
                },
                "Kestra returned success but empty/invalid recommendations - falling back to direct Gemini"
              );
              // Fall through to direct Gemini fallback below
            } else {
              return reply.send({
                success: true,
                data: kestraResult.recommendations,
                method: "kestra",
                executionId: kestraResult.executionId,
              });
            }
          }
        }

        // Fallback: Direct Gemini API call
        request.log.info("Using direct Gemini API for recommendations");

        const recommendations = await recommendationService.generateRecommendations(
          validated
        );

        // Ensure we never return undefined data with success: true
        if (!recommendations || !recommendations.recommendations || recommendations.recommendations.length === 0) {
          request.log.error(
            {
              hasRecommendations: !!recommendations,
              hasRecommendationsArray: !!(recommendations?.recommendations),
              recommendationsLength: recommendations?.recommendations?.length || 0
            },
            "Direct Gemini API returned invalid recommendations data"
          );
          throw new Error("Failed to generate valid recommendations from AI service");
        }

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

        // Load test phone configuration from backend environment (same as research phase)
        const adminTestPhonesRaw = process.env.ADMIN_TEST_NUMBER;
        const adminTestPhones = adminTestPhonesRaw
          ? adminTestPhonesRaw.split(",").map((p) => p.trim()).filter(Boolean)
          : [];
        const isAdminTestMode = adminTestPhones.length > 0;

        // Determine the actual phone number to call
        let phoneToCall = validated.providerPhone;
        if (isAdminTestMode) {
          // Use first test phone for booking calls
          phoneToCall = adminTestPhones[0]!;
          request.log.info(
            {
              originalPhone: validated.providerPhone,
              testPhone: phoneToCall,
              providerName: validated.providerName,
            },
            "Admin test mode: substituting provider phone with test phone for booking call"
          );
        }

        request.log.info(
          {
            providerId: validated.providerId,
            providerName: validated.providerName,
            serviceRequestId: validated.serviceRequestId,
            phoneToCall,
            isAdminTestMode,
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
          clientAddress: validated.clientAddress,
          preferredDateTime: validated.preferredDateTime,
          serviceRequestId: validated.serviceRequestId,
          providerId: validated.providerId,
          additionalNotes: validated.additionalNotes,
        });

        // Build call parameters directly (use phoneToCall which may be test phone)
        const callParams: any = {
          phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
          customer: {
            number: phoneToCall,
            name: validated.providerName,
          },
          assistant: bookingConfig,
        };

        // Use VAPI SDK directly for booking calls
        const { VapiClient } = await import("@vapi-ai/server-sdk");
        const vapi = new VapiClient({ token: process.env.VAPI_API_KEY! });

        request.log.info(
          { provider: validated.providerName, phone: phoneToCall, isAdminTestMode },
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
        let bookingConfirmed = structuredData.booking_confirmed || false;

        // Extract transcript
        const transcript = completedCall.artifact?.transcript || "";
        const transcriptStr =
          typeof transcript === "string" ? transcript : JSON.stringify(transcript);

        // Fallback detection: If VAPI didn't detect confirmation but transcript shows agreement
        if (!bookingConfirmed && transcriptStr) {
          const transcriptLower = transcriptStr.toLowerCase();

          // Check for date/time agreement patterns in transcript
          const hasDateTimeAgreement =
            // Provider offered a time
            (/i can do|available|works for me|how about|let's do/i.test(transcriptLower) &&
            // And a day/time was mentioned
            /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|today)/i.test(transcriptLower) &&
            /(\d{1,2}(?::\d{2})?\s*(?:am|pm)|morning|afternoon|evening|noon)/i.test(transcriptLower));

          // Check for confirmation patterns
          const hasConfirmationPattern =
            /(?:just to confirm|perfect|excellent|great|sounds good|see you|appointment.*(?:set|scheduled|confirmed))/i.test(transcriptLower);

          // Check there's no rejection
          const hasRejection =
            /(?:not available|can't help|unavailable|no longer|sorry.*can't|decline)/i.test(transcriptLower);

          if (hasDateTimeAgreement && hasConfirmationPattern && !hasRejection) {
            request.log.info(
              {
                vapiBookingConfirmed: bookingConfirmed,
                hasDateTimeAgreement,
                hasConfirmationPattern,
                hasRejection,
              },
              "[Booking] Fallback detection: VAPI missed confirmation, overriding to TRUE based on transcript analysis"
            );
            bookingConfirmed = true;

            // Try to extract date/time if VAPI didn't
            if (!structuredData.confirmed_date) {
              const dateMatch = transcriptLower.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next\s+\w+)/i);
              if (dateMatch) {
                structuredData.confirmed_date = dateMatch[0].charAt(0).toUpperCase() + dateMatch[0].slice(1);
              }
            }
            if (!structuredData.confirmed_time) {
              const timeMatch = transcriptLower.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
              if (timeMatch) {
                structuredData.confirmed_time = timeMatch[0].toUpperCase();
              }
            }
          }
        }

        request.log.info(
          {
            bookingConfirmed,
            confirmedDate: structuredData.confirmed_date,
            confirmedTime: structuredData.confirmed_time,
            callOutcome: structuredData.call_outcome,
          },
          "[Booking] Final booking status after analysis"
        );

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
        request.log.info(
          { bookingConfirmed, serviceRequestId: validated.serviceRequestId },
          "[Booking] Checking if booking confirmed for SMS notification"
        );

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

          // Send booking confirmation SMS to user
          request.log.info("[Booking] Starting SMS confirmation process");
          try {
            const { data: serviceRequest, error: fetchError } = await supabase
              .from("service_requests")
              .select("user_phone, direct_contact_info")
              .eq("id", validated.serviceRequestId)
              .single();

            request.log.info(
              {
                hasServiceRequest: !!serviceRequest,
                userPhone: serviceRequest?.user_phone,
                fetchError: fetchError?.message,
              },
              "[Booking] Fetched service request for SMS"
            );

            if (serviceRequest?.user_phone) {
              const twilioClient = new DirectTwilioClient(request.log);
              const isTwilioAvailable = twilioClient.isAvailable();

              request.log.info(
                { isTwilioAvailable },
                "[Booking] Twilio client availability check"
              );

              if (isTwilioAvailable) {
                const confirmResult = await twilioClient.sendConfirmation({
                  userPhone: serviceRequest.user_phone,
                  userName:
                    (serviceRequest.direct_contact_info as any)?.user_name ||
                    validated.clientName ||
                    "Customer",
                  providerName: validated.providerName,
                  bookingDate: structuredData.confirmed_date,
                  bookingTime: structuredData.confirmed_time,
                  confirmationNumber: structuredData.confirmation_number,
                  serviceDescription: validated.serviceNeeded,
                });

                if (confirmResult.success) {
                  request.log.info(
                    {
                      messageSid: confirmResult.messageSid,
                      userPhone: serviceRequest.user_phone,
                      providerName: validated.providerName,
                    },
                    "[Booking] Confirmation SMS sent to user"
                  );

                  // Update database to track confirmation notification
                  await supabase
                    .from("service_requests")
                    .update({
                      notification_sent_at: new Date().toISOString(),
                      notification_method: "sms",
                    })
                    .eq("id", validated.serviceRequestId);

                  await supabase.from("interaction_logs").insert({
                    request_id: validated.serviceRequestId,
                    step_name: "Booking Confirmation SMS Sent",
                    detail: `Booking confirmation sent via SMS to ${serviceRequest.user_phone}. Date: ${structuredData.confirmed_date || "TBD"}, Time: ${structuredData.confirmed_time || "TBD"}`,
                    status: "success",
                  });
                } else {
                  request.log.error(
                    { error: confirmResult.error },
                    "[Booking] Confirmation SMS failed"
                  );
                }
              } else {
                request.log.warn("[Booking] Twilio client not available for confirmation SMS");
              }
            } else {
              request.log.warn(
                { serviceRequestId: validated.serviceRequestId },
                "[Booking] No user phone found for confirmation SMS"
              );
            }
          } catch (notifyError) {
            request.log.error(
              { error: notifyError },
              "[Booking] Error sending confirmation SMS"
            );
            // Don't fail the booking - confirmation SMS is best-effort
          }
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
