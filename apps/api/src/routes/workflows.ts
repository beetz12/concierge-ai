/**
 * Workflow Routes
 * Unified API endpoints for the concierge workflow with Kestra/Direct fallback
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ResearchService } from '../services/research/index.js';
import type {
  ResearchResult,
  SystemStatus,
} from '../services/research/types.js';

// Zod schemas for request validation
const researchSchema = z.object({
  service: z.string().min(1, 'Service type is required'),
  location: z.string().min(1, 'Location is required'),
  daysNeeded: z.number().int().positive().optional().default(2),
  minRating: z.number().min(0).max(5).optional().default(4.5),
  serviceRequestId: z.string().uuid().optional(),
});

export default async function workflowRoutes(fastify: FastifyInstance) {
  // Create service instance with fastify logger
  const researchService = new ResearchService(fastify.log);

  /**
   * POST /api/v1/workflows/research
   * Search for providers using Kestra or direct Gemini fallback
   */
  fastify.post(
    '/research',
    {
      schema: {
        tags: ['workflows'],
        summary: 'Search for service providers with intelligent fallback',
        description:
          'Searches for service providers using Kestra orchestration when available, automatically falls back to direct Gemini API with Google Maps grounding if Kestra is unavailable. Returns top providers matching the criteria.',
        body: {
          type: 'object',
          required: ['service', 'location'],
          properties: {
            service: {
              type: 'string',
              description: 'Type of service needed (e.g., plumber, electrician, HVAC)',
              minLength: 1,
            },
            location: {
              type: 'string',
              description: 'Location for the service (city, state)',
              minLength: 1,
            },
            daysNeeded: {
              type: 'number',
              description: 'How soon the service is needed (in days)',
              minimum: 1,
              default: 2,
            },
            minRating: {
              type: 'number',
              description: 'Minimum rating requirement (0-5)',
              minimum: 0,
              maximum: 5,
              default: 4.5,
            },
            serviceRequestId: {
              type: 'string',
              format: 'uuid',
              description: 'Optional: Link to service_requests table',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  status: {
                    type: 'string',
                    enum: ['success', 'error'],
                    description: 'Status of the research operation',
                  },
                  method: {
                    type: 'string',
                    enum: ['kestra', 'direct_gemini'],
                    description: 'Which method was used for research',
                  },
                  providers: {
                    type: 'array',
                    description: 'List of providers found',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        phone: { type: 'string' },
                        rating: { type: 'number' },
                        address: { type: 'string' },
                        reason: { type: 'string' },
                        source: {
                          type: 'string',
                          enum: ['kestra', 'gemini_maps', 'user_input'],
                        },
                      },
                    },
                  },
                  reasoning: {
                    type: 'string',
                    description: 'AI reasoning for provider selection',
                  },
                  error: {
                    type: 'string',
                    description: 'Error message if status is error',
                  },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
              details: { type: 'array' },
            },
          },
          500: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        // Validate request body with Zod
        const validated = researchSchema.parse(request.body);

        // Call the research service
        const result = await researchService.search(validated);

        return reply.send({
          success: result.status === 'success',
          data: result,
        });
      } catch (error: unknown) {
        request.log.error({ error }, 'Research workflow failed');

        // Handle Zod validation errors
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: 'Validation error',
            details: error.errors,
          });
        }

        // Handle other errors
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({
          success: false,
          error: errorMessage,
        });
      }
    }
  );

  /**
   * GET /api/v1/workflows/status
   * Check workflow system status
   */
  fastify.get(
    '/status',
    {
      schema: {
        tags: ['workflows'],
        summary: 'Check workflow system status',
        description:
          'Returns information about the current workflow system configuration, including Kestra availability, Gemini configuration, and which research method is active.',
        response: {
          200: {
            type: 'object',
            properties: {
              kestraEnabled: {
                type: 'boolean',
                description: 'Whether Kestra is configured',
              },
              kestraUrl: {
                type: ['string', 'null'],
                description: 'Kestra server URL if configured',
              },
              kestraHealthy: {
                type: 'boolean',
                description: 'Whether Kestra is reachable and healthy',
              },
              geminiConfigured: {
                type: 'boolean',
                description: 'Whether Gemini API is configured',
              },
              activeResearchMethod: {
                type: 'string',
                enum: ['kestra', 'direct_gemini'],
                description: 'Current active research method',
              },
            },
          },
          500: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        // Get system status from research service
        const status = await researchService.getSystemStatus();

        return reply.send(status);
      } catch (error: unknown) {
        request.log.error({ error }, 'Failed to get workflow system status');
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return reply.status(500).send({
          success: false,
          error: errorMessage,
        });
      }
    }
  );
}
