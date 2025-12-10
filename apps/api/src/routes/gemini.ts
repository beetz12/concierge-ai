import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  searchProviders,
  simulateCall,
  selectBestProvider,
  type Provider,
  type InteractionLog,
} from "../services/gemini.js";
import { analyzeDirectTask, type AnalyzeDirectTaskRequest } from "../services/direct-task/index.js";

// Zod schemas for request validation
const searchProvidersSchema = z.object({
  query: z.string().min(1, "Query is required"),
  location: z.string().min(1, "Location is required"),
  coordinates: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .optional(),
  minRating: z.number().min(0).max(5).optional().default(4.5),
  maxDistance: z.number().positive().optional().default(25),
  requirePhone: z.boolean().optional().default(true),
  minReviewCount: z.number().int().min(0).optional(),
  maxResults: z.number().int().min(1).max(20).optional().default(10),
  minEnrichedResults: z.number().int().min(1).max(10).optional().default(3),
});

const simulateCallSchema = z.object({
  providerName: z.string().min(1, "Provider name is required"),
  userCriteria: z.string().min(1, "User criteria is required"),
  isDirect: z.boolean().default(false),
});

const selectBestProviderSchema = z.object({
  requestTitle: z.string().min(1, "Request title is required"),
  interactions: z.array(
    z.object({
      timestamp: z.string(),
      stepName: z.string(),
      detail: z.string(),
      transcript: z
        .array(
          z.object({
            speaker: z.string(),
            text: z.string(),
          }),
        )
        .optional(),
      status: z.enum(["success", "warning", "error", "info"]),
    }),
  ),
  providers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      phone: z.string().optional(),
      rating: z.number().optional(),
      address: z.string().optional(),
      source: z.enum(["Google Maps", "User Input"]).optional(),
    }),
  ),
});

const analyzeDirectTaskSchema = z.object({
  taskDescription: z.string().min(1, "Task description is required"),
  contactName: z.string().min(1, "Contact name is required"),
  contactPhone: z.string().optional(),
});

export default async function geminiRoutes(fastify: FastifyInstance) {
  /**
   * POST /search-providers
   * Search for service providers using Google Maps grounding
   */
  fastify.post(
    "/search-providers",
    {
      schema: {
        description: "Search for service providers using Google Maps grounding",
        tags: ["gemini"],
        body: {
          type: "object",
          required: ["query", "location"],
          properties: {
            query: {
              type: "string",
              description: "Search query for service type",
            },
            location: { type: "string", description: "Location to search in" },
            coordinates: {
              type: "object",
              properties: {
                latitude: { type: "number" },
                longitude: { type: "number" },
              },
            },
            minRating: {
              type: "number",
              description: "Minimum rating (0-5)",
              default: 4.5,
            },
            maxDistance: {
              type: "number",
              description: "Maximum distance in miles",
              default: 25,
            },
            requirePhone: {
              type: "boolean",
              description: "Only return providers with phone",
              default: true,
            },
            minReviewCount: {
              type: "number",
              description: "Minimum number of reviews",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of providers to return (1-20)",
              default: 10,
            },
            minEnrichedResults: {
              type: "number",
              description: "Minimum providers with phone after enrichment (1-10)",
              default: 3,
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              providers: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    name: { type: "string" },
                    phone: { type: "string" },
                    rating: { type: "number" },
                    reviewCount: { type: "number" },
                    address: { type: "string" },
                    distance: { type: "number" },
                    distanceText: { type: "string" },
                    hoursOfOperation: { type: "string" },
                    isOpenNow: { type: "boolean" },
                    googleMapsUri: { type: "string" },
                    reason: { type: "string" },
                    source: { type: "string" },
                  },
                },
              },
              totalFound: { type: "number" },
              filteredCount: { type: "number" },
              logs: {
                type: "object",
                properties: {
                  timestamp: { type: "string" },
                  stepName: { type: "string" },
                  detail: { type: "string" },
                  status: { type: "string" },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
              details: { type: "array" },
            },
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = searchProvidersSchema.parse(request.body);
        const result = await searchProviders(
          body.query,
          body.location,
          body.coordinates as
            | { latitude: number; longitude: number }
            | undefined,
          {
            minRating: body.minRating,
            maxDistance: body.maxDistance,
            requirePhone: body.requirePhone,
            minReviewCount: body.minReviewCount,
            maxResults: body.maxResults,
          }
        );
        return result;
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: "Validation Error",
            details: error.errors,
          });
        }
        fastify.log.error(error);
        return reply.status(500).send({
          error: "Internal Server Error",
          message: error.message,
        });
      }
    },
  );

  /**
   * POST /simulate-call
   * Simulate a phone call to a provider
   */
  fastify.post(
    "/simulate-call",
    {
      schema: {
        description: "Simulate a phone call to a service provider",
        tags: ["gemini"],
        body: {
          type: "object",
          required: ["providerName", "userCriteria"],
          properties: {
            providerName: {
              type: "string",
              description: "Name of the provider to call",
            },
            userCriteria: {
              type: "string",
              description: "User requirements and criteria",
            },
            isDirect: {
              type: "boolean",
              description: "Whether this is a direct call task",
              default: false,
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              timestamp: { type: "string" },
              stepName: { type: "string" },
              detail: { type: "string" },
              transcript: { type: "array" },
              status: { type: "string" },
            },
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
              details: { type: "array" },
            },
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = simulateCallSchema.parse(request.body);
        const result = await simulateCall(
          body.providerName,
          body.userCriteria,
          body.isDirect,
        );
        return result;
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: "Validation Error",
            details: error.errors,
          });
        }
        fastify.log.error(error);
        return reply.status(500).send({
          error: "Internal Server Error",
          message: error.message,
        });
      }
    },
  );

  /**
   * POST /select-best-provider
   * Analyze call results and select the best provider
   */
  fastify.post(
    "/select-best-provider",
    {
      schema: {
        description:
          "Analyze call results and select the best provider using AI",
        tags: ["gemini"],
        body: {
          type: "object",
          required: ["requestTitle", "interactions", "providers"],
          properties: {
            requestTitle: {
              type: "string",
              description: "Title of the service request",
            },
            interactions: {
              type: "array",
              description: "Array of interaction logs from provider calls",
              items: {
                type: "object",
                properties: {
                  timestamp: { type: "string" },
                  stepName: { type: "string" },
                  detail: { type: "string" },
                  transcript: { type: "array" },
                  status: {
                    type: "string",
                    enum: ["success", "warning", "error", "info"],
                  },
                },
              },
            },
            providers: {
              type: "array",
              description: "Array of providers to analyze",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  phone: { type: "string" },
                  rating: { type: "number" },
                  address: { type: "string" },
                  source: {
                    type: "string",
                    enum: ["Google Maps", "User Input"],
                  },
                },
              },
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              selectedId: { type: "string", nullable: true },
              reasoning: { type: "string" },
            },
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
              details: { type: "array" },
            },
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = selectBestProviderSchema.parse(request.body);
        const result = await selectBestProvider(
          body.requestTitle,
          body.interactions as InteractionLog[],
          body.providers as Provider[],
        );
        return result;
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: "Validation Error",
            details: error.errors,
          });
        }
        fastify.log.error(error);
        return reply.status(500).send({
          error: "Internal Server Error",
          message: error.message,
        });
      }
    },
  );

  /**
   * POST /analyze-direct-task
   * Analyze a direct task and generate a dynamic VAPI prompt
   */
  fastify.post(
    "/analyze-direct-task",
    {
      schema: {
        description: "Analyze a direct task and generate dynamic VAPI prompt using Gemini",
        tags: ["gemini"],
        body: {
          type: "object",
          required: ["taskDescription", "contactName"],
          properties: {
            taskDescription: {
              type: "string",
              description: "What the user wants the AI to do",
            },
            contactName: {
              type: "string",
              description: "Name of the contact to call",
            },
            contactPhone: {
              type: "string",
              description: "Phone number of the contact (optional)",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              taskAnalysis: {
                type: "object",
                properties: {
                  taskType: { type: "string" },
                  intent: { type: "string" },
                  difficulty: { type: "string" },
                },
              },
              strategicGuidance: {
                type: "object",
                properties: {
                  keyGoals: { type: "array", items: { type: "string" } },
                  talkingPoints: { type: "array", items: { type: "string" } },
                  objectionHandlers: { type: "object" },
                  successCriteria: { type: "array", items: { type: "string" } },
                },
              },
              generatedPrompt: {
                type: "object",
                properties: {
                  systemPrompt: { type: "string" },
                  firstMessage: { type: "string" },
                  closingScript: { type: "string" },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
              details: { type: "array" },
            },
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = analyzeDirectTaskSchema.parse(request.body);
        const result = await analyzeDirectTask(body);
        return result;
      } catch (error: any) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: "Validation Error",
            details: error.errors,
          });
        }
        fastify.log.error(error);
        return reply.status(500).send({
          error: "Internal Server Error",
          message: error.message,
        });
      }
    },
  );
}
