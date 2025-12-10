/**
 * VAPI Webhook Routes
 * Receives webhook callbacks from VAPI when calls complete
 * Stores results in cache for retrieval by Kestra scripts
 *
 * ENRICHMENT FLOW:
 * 1. Webhook received → cache immediately (dataStatus='partial')
 * 2. Return 200 OK to VAPI immediately
 * 3. Background: Wait 3-5s → fetch from VAPI REST API → update cache (dataStatus='complete')
 * 4. Script polls → gets complete data
 */

import { FastifyInstance, FastifyBaseLogger } from "fastify";
import { z } from "zod";
import { WebhookCacheService } from "../services/vapi/webhook-cache.service.js";
import {
  VAPIApiClient,
  VAPICallResponse,
} from "../services/vapi/vapi-api.client.js";
import type {
  CallResult,
  CallRequest,
  StructuredCallData,
} from "../services/vapi/types.js";
import { CallResultService } from "../services/vapi/call-result.service.js";

// Zod schemas for VAPI webhook payloads
// Based on VAPI.ai webhook event structure
const vapiWebhookMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "function"]),
  message: z.string(),
  time: z.number(),
  endTime: z.number().optional(),
  secondsFromStart: z.number().optional(),
});

const vapiWebhookCallSchema = z.object({
  id: z.string(),
  orgId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  type: z.enum(["webCall", "inboundPhoneCall", "outboundPhoneCall"]),
  status: z.enum(["queued", "ringing", "in-progress", "forwarding", "ended"]),
  endedReason: z.string().optional(),
  messages: z.array(vapiWebhookMessageSchema).optional(),
  transcript: z.string().optional(),
  recordingUrl: z.string().optional(),
  summary: z.string().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  cost: z.number().optional(),
  costBreakdown: z
    .object({
      transport: z.number().optional(),
      stt: z.number().optional(),
      llm: z.number().optional(),
      tts: z.number().optional(),
      vapi: z.number().optional(),
      total: z.number().optional(),
      llmPromptTokens: z.number().optional(),
      llmCompletionTokens: z.number().optional(),
      ttsCharacters: z.number().optional(),
    })
    .optional(),
  analysis: z
    .object({
      summary: z.string().optional(),
      structuredData: z.record(z.unknown()).optional(),
      successEvaluation: z.string().optional(),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
  phoneNumber: z
    .object({
      number: z.string().optional(),
    })
    .optional(),
  customer: z
    .object({
      number: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
});

const vapiWebhookSchema = z.object({
  message: z.object({
    type: z.enum([
      "call-end",
      "end-of-call-report",
      "status-update",
      "transcript",
      "hang",
      "function-call",
      "speech-update",
      "metadata",
      "conversation-update",
    ]),
    call: vapiWebhookCallSchema.optional(),
    timestamp: z.string().optional(),
  }),
});

// Singleton instances
let webhookCache: WebhookCacheService | null = null;
let vapiApiClient: VAPIApiClient | null = null;
let callResultService: CallResultService | null = null;

// Background fetch configuration
const FETCH_DELAYS_MS = [3000, 5000, 8000]; // Retry delays: 3s, 5s, 8s
const MAX_FETCH_ATTEMPTS = 3;

export default async function vapiWebhookRoutes(fastify: FastifyInstance) {
  // Initialize cache service once
  if (!webhookCache) {
    webhookCache = new WebhookCacheService(fastify.log);
  }

  // Initialize VAPI API client for background enrichment
  if (!vapiApiClient && process.env.VAPI_API_KEY) {
    vapiApiClient = new VAPIApiClient(process.env.VAPI_API_KEY, fastify.log);
    fastify.log.info(
      {},
      "VAPI API client initialized for background enrichment",
    );
  }

  // Initialize call result service for DB persistence
  if (!callResultService) {
    callResultService = new CallResultService(fastify.log);
    fastify.log.info({}, "CallResultService initialized for DB persistence");
  }

  /**
   * POST /api/v1/vapi/webhook
   * Receive webhook events from VAPI
   */
  fastify.post(
    "/webhook",
    {
      schema: {
        tags: ["vapi"],
        summary: "Receive VAPI webhook callbacks",
        description:
          "Endpoint for VAPI.ai to send webhook events when calls complete. Stores results in cache for retrieval.",
        body: {
          type: "object",
          properties: {
            message: {
              type: "object",
              properties: {
                type: { type: "string" },
                call: { type: "object" },
                timestamp: { type: "string" },
              },
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              callId: { type: "string" },
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
        },
      },
    },
    async (request, reply) => {
      try {
        // Validate webhook payload
        const validated = vapiWebhookSchema.parse(request.body);
        const { message } = validated;

        fastify.log.info(
          {
            type: message.type,
            callId: message.call?.id,
            timestamp: message.timestamp,
          },
          "VAPI webhook received",
        );

        // Only process end-of-call events
        if (
          message.type !== "end-of-call-report" &&
          message.type !== "call-end"
        ) {
          return reply.send({
            success: true,
            message:
              "Webhook received but not processed (not an end-of-call event)",
            callId: message.call?.id || "unknown",
          });
        }

        if (!message.call) {
          return reply.status(400).send({
            success: false,
            error: "Missing call data in webhook payload",
            details: [],
          });
        }

        const call = message.call;

        // Transform VAPI webhook data into CallResult format
        const callResult: CallResult = transformVapiWebhookToCallResult(call);

        // Set initial status as 'partial' - background fetch will enrich to 'complete'
        callResult.dataStatus = "partial";
        callResult.webhookReceivedAt = new Date().toISOString();

        // Store in cache immediately
        webhookCache!.set(call.id, callResult);

        fastify.log.info(
          {
            callId: call.id,
            status: callResult.status,
            duration: callResult.duration,
            cost: callResult.cost,
            dataStatus: callResult.dataStatus,
          },
          "Call result cached (partial), triggering background enrichment",
        );

        // Trigger background fetch to enrich data from VAPI API (non-blocking)
        if (vapiApiClient) {
          triggerBackgroundEnrichment(call.id, fastify.log).catch((err) => {
            fastify.log.error(
              { error: err, callId: call.id },
              "Background enrichment failed",
            );
          });
        } else {
          fastify.log.warn(
            { callId: call.id },
            "VAPI API client not configured, skipping enrichment",
          );
          // Mark as complete since we can't enrich
          webhookCache!.updateFetchStatus(call.id, "complete");
        }

        // Return immediately to VAPI (don't block on background fetch)
        return reply.send({
          success: true,
          message:
            "Webhook processed and cached, background enrichment triggered",
          callId: call.id,
        });
      } catch (error: unknown) {
        fastify.log.error({ error }, "Failed to process VAPI webhook");

        // Handle Zod validation errors
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: "Invalid webhook payload",
            details: error.errors,
          });
        }

        // Don't return 500 to VAPI - acknowledge receipt even if processing fails
        // This prevents VAPI from retrying endlessly
        return reply.send({
          success: false,
          message: "Webhook received but processing failed",
          callId: "unknown",
        });
      }
    },
  );

  /**
   * GET /api/v1/vapi/calls/:callId
   * Retrieve a cached call result by ID
   */
  fastify.get<{ Params: { callId: string } }>(
    "/calls/:callId",
    {
      schema: {
        tags: ["vapi"],
        summary: "Retrieve cached call result",
        description:
          "Get call result from cache by call ID. Used by Kestra scripts to poll for results.",
        params: {
          type: "object",
          properties: {
            callId: {
              type: "string",
              description: "VAPI call ID to retrieve",
            },
          },
          required: ["callId"],
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
                  analysis: { type: "object" },
                  provider: { type: "object" },
                  request: { type: "object" },
                  cost: { type: "number" },
                },
              },
            },
          },
          404: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { callId } = request.params;

      fastify.log.debug({ callId }, "Retrieving call result from cache");

      const result = webhookCache!.get(callId);

      if (!result) {
        fastify.log.warn({ callId }, "Call result not found in cache");
        return reply.status(404).send({
          success: false,
          error: "Call result not found",
          message: `No cached result found for call ID: ${callId}. It may have expired or not been received yet.`,
        });
      }

      return reply.send({
        success: true,
        data: result,
      });
    },
  );

  /**
   * GET /api/v1/vapi/cache/stats
   * Get cache statistics (for debugging)
   */
  fastify.get(
    "/cache/stats",
    {
      schema: {
        tags: ["vapi"],
        summary: "Get webhook cache statistics",
        description:
          "Returns statistics about the webhook cache including size and entries (debugging only)",
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              stats: {
                type: "object",
                properties: {
                  size: { type: "number" },
                  entries: { type: "array" },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const stats = webhookCache!.getStats();

      return reply.send({
        success: true,
        stats,
      });
    },
  );

  /**
   * DELETE /api/v1/vapi/calls/:callId
   * Remove a specific call result from cache
   */
  fastify.delete<{ Params: { callId: string } }>(
    "/calls/:callId",
    {
      schema: {
        tags: ["vapi"],
        summary: "Delete cached call result",
        description: "Remove a specific call result from the cache",
        params: {
          type: "object",
          properties: {
            callId: {
              type: "string",
              description: "VAPI call ID to delete",
            },
          },
          required: ["callId"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { callId } = request.params;

      const deleted = webhookCache!.delete(callId);

      return reply.send({
        success: true,
        message: deleted
          ? `Call result ${callId} deleted from cache`
          : `Call result ${callId} not found in cache`,
      });
    },
  );
}

/**
 * Background enrichment: Fetch complete data from VAPI REST API
 * Called asynchronously after webhook is received and cached
 */
async function triggerBackgroundEnrichment(
  callId: string,
  logger: FastifyBaseLogger,
): Promise<void> {
  if (!vapiApiClient || !webhookCache) {
    logger.error({ callId }, "Cannot enrich: services not initialized");
    return;
  }

  // Mark as fetching
  webhookCache.updateFetchStatus(callId, "fetching");

  for (let attempt = 0; attempt < MAX_FETCH_ATTEMPTS; attempt++) {
    try {
      // Wait before fetching (gives VAPI time to process transcript/analysis)
      const delay =
        FETCH_DELAYS_MS[attempt] || FETCH_DELAYS_MS[FETCH_DELAYS_MS.length - 1];
      logger.info(
        { callId, attempt: attempt + 1, delayMs: delay },
        "Waiting before VAPI API fetch",
      );
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Fetch from VAPI REST API
      logger.info(
        { callId, attempt: attempt + 1 },
        "Fetching call data from VAPI API",
      );
      const vapiCall = await vapiApiClient.getCall(callId);

      // Check if data is complete
      if (vapiApiClient.isDataComplete(vapiCall)) {
        // Get existing cached data to merge with
        const existingResult = webhookCache.get(callId);
        if (existingResult) {
          const enrichedData = vapiApiClient.mergeCallData(
            existingResult,
            vapiCall,
          );
          webhookCache.set(callId, enrichedData);

          logger.info(
            {
              callId,
              transcriptLength: enrichedData.transcript.length,
              hasSummary: !!enrichedData.analysis.summary,
              dataStatus: enrichedData.dataStatus,
            },
            "Call data enriched successfully from VAPI API",
          );

          // Persist enriched data to database if IDs are available
          await persistCallResultToDatabase(enrichedData, vapiCall, logger);
        } else {
          // Cache expired or deleted - store fresh data
          const freshResult = vapiApiClient.transformToCallResult(vapiCall);
          webhookCache.set(callId, freshResult);
          logger.info(
            { callId },
            "Created fresh call result from VAPI API (cache was empty)",
          );

          // Persist fresh data to database if IDs are available
          await persistCallResultToDatabase(freshResult, vapiCall, logger);
        }
        return; // Success!
      }

      logger.warn(
        { callId, attempt: attempt + 1 },
        "VAPI API returned incomplete data, will retry",
      );
    } catch (error: unknown) {
      logger.error(
        {
          callId,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to fetch from VAPI API",
      );
    }
  }

  // Max attempts reached - mark as failed but keep partial data
  logger.error(
    { callId },
    "Max enrichment attempts reached, keeping partial data",
  );
  webhookCache.updateFetchStatus(
    callId,
    "fetch_failed",
    "Max attempts reached",
  );
}

/**
 * Transform VAPI webhook call data into CallResult format
 */
function transformVapiWebhookToCallResult(
  call: z.infer<typeof vapiWebhookCallSchema>,
): CallResult {
  // Calculate duration in minutes
  let duration = 0;
  if (call.startedAt && call.endedAt) {
    const start = new Date(call.startedAt).getTime();
    const end = new Date(call.endedAt).getTime();
    duration = (end - start) / 1000 / 60; // Convert to minutes
  }

  // Determine status based on endedReason
  let status: CallResult["status"] = "completed";
  if (call.endedReason) {
    const reason = call.endedReason.toLowerCase();
    if (reason.includes("no") || reason.includes("voicemail")) {
      status = "voicemail";
    } else if (reason.includes("error") || reason.includes("failed")) {
      status = "error";
    } else if (reason.includes("timeout")) {
      status = "timeout";
    }
  }

  // Extract structured data from analysis or metadata
  const structuredData: StructuredCallData = {
    availability: "unclear",
    estimated_rate: "unknown",
    single_person_found: false,
    all_criteria_met: false,
    call_outcome: status === "completed" ? "positive" : "no_answer",
    recommended: false,
  };

  // Try to extract structured data from analysis
  if (call.analysis?.structuredData) {
    Object.assign(structuredData, call.analysis.structuredData);
  }

  // Extract provider and request info from metadata
  const metadata = call.metadata || {};
  const providerName = (metadata.providerName as string) || "Unknown Provider";
  const providerPhone =
    call.customer?.number || call.phoneNumber?.number || "unknown";
  const serviceNeeded = (metadata.serviceNeeded as string) || "unknown";
  const location = (metadata.location as string) || "unknown";
  const userCriteria = (metadata.userCriteria as string) || "";
  const urgency = (metadata.urgency as string) || "flexible";

  // Extract and format messages array
  const messages = call.messages || [];
  const formattedMessages = messages.map((msg) => ({
    role: msg.role,
    message: msg.message,
    time: msg.time,
  }));

  return {
    status,
    callId: call.id,
    callMethod: "direct_vapi", // Webhooks come from VAPI calls
    duration,
    endedReason: call.endedReason || "unknown",
    transcript: call.transcript || "",
    analysis: {
      summary: call.analysis?.summary || call.summary || "No summary available",
      structuredData,
      successEvaluation: call.analysis?.successEvaluation || "unknown",
    },
    provider: {
      name: providerName,
      phone: providerPhone,
      service: serviceNeeded,
      location,
    },
    request: {
      criteria: userCriteria,
      urgency,
    },
    cost: call.cost || call.costBreakdown?.total || 0,
    messages: formattedMessages,
  };
}

/**
 * Persist call result to database
 * Extracts IDs from VAPI call metadata and calls CallResultService
 */
async function persistCallResultToDatabase(
  result: CallResult,
  vapiCall: VAPICallResponse,
  logger: FastifyBaseLogger,
): Promise<void> {
  if (!callResultService) {
    logger.warn(
      { callId: result.callId },
      "CallResultService not initialized, skipping DB persistence",
    );
    return;
  }

  // Extract IDs from VAPI call metadata
  const metadata = vapiCall.metadata || {};
  const providerId = metadata.providerId as string | undefined;
  const serviceRequestId = metadata.serviceRequestId as string | undefined;

  // Skip if no IDs available (call wasn't initiated with DB linking)
  if (!providerId && !serviceRequestId) {
    logger.debug(
      {
        callId: result.callId,
      },
      "No providerId or serviceRequestId in metadata, skipping DB persistence",
    );
    return;
  }

  // Build CallRequest from metadata
  const request: CallRequest = {
    providerName: (metadata.providerName as string) || result.provider.name,
    providerPhone: vapiCall.customer?.number || result.provider.phone,
    serviceNeeded:
      (metadata.serviceNeeded as string) || result.provider.service,
    userCriteria: (metadata.userCriteria as string) || result.request.criteria,
    location: (metadata.location as string) || result.provider.location,
    urgency: ((metadata.urgency as string) ||
      result.request.urgency) as CallRequest["urgency"],
    serviceRequestId,
    providerId,
  };

  logger.info(
    {
      callId: result.callId,
      providerId,
      serviceRequestId,
      status: result.status,
      meetsRequirements: result.analysis.structuredData.all_criteria_met,
      earliestAvailability:
        result.analysis.structuredData.earliest_availability,
    },
    "Persisting call result to database",
  );

  try {
    await callResultService.saveCallResult(result, request);
    logger.info(
      { callId: result.callId },
      "Call result persisted to database successfully",
    );
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        callId: result.callId,
      },
      "Failed to persist call result to database",
    );
    // Don't throw - background persistence failures shouldn't break the flow
  }
}
