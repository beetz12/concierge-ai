import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  searchProviders,
  simulateCall,
  selectBestProvider,
  scheduleAppointment,
  type Provider,
  type InteractionLog,
} from '../services/gemini.js';

// Zod schemas for request validation
const searchProvidersSchema = z.object({
  query: z.string().min(1, 'Query is required'),
  location: z.string().min(1, 'Location is required'),
  coordinates: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .optional(),
});

const simulateCallSchema = z.object({
  providerName: z.string().min(1, 'Provider name is required'),
  userCriteria: z.string().min(1, 'User criteria is required'),
  isDirect: z.boolean().default(false),
});

const selectBestProviderSchema = z.object({
  requestTitle: z.string().min(1, 'Request title is required'),
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
          })
        )
        .optional(),
      status: z.enum(['success', 'warning', 'error', 'info']),
    })
  ),
  providers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      phone: z.string().optional(),
      rating: z.number().optional(),
      address: z.string().optional(),
      source: z.enum(['Google Maps', 'User Input']).optional(),
    })
  ),
});

const scheduleAppointmentSchema = z.object({
  providerName: z.string().min(1, 'Provider name is required'),
  details: z.string().min(1, 'Details are required'),
});

export default async function geminiRoutes(fastify: FastifyInstance) {
  /**
   * POST /search-providers
   * Search for service providers using Google Maps grounding
   */
  fastify.post('/search-providers', {
    schema: {
      description: 'Search for service providers using Google Maps grounding',
      tags: ['gemini'],
      body: {
        type: 'object',
        required: ['query', 'location'],
        properties: {
          query: { type: 'string', description: 'Search query for service type' },
          location: { type: 'string', description: 'Location to search in' },
          coordinates: {
            type: 'object',
            properties: {
              latitude: { type: 'number' },
              longitude: { type: 'number' },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            providers: { type: 'array' },
            rawResponse: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'array' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const body = searchProvidersSchema.parse(request.body);
      const result = await searchProviders(
        body.query,
        body.location,
        body.coordinates as { latitude: number; longitude: number } | undefined
      );
      return result;
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Validation Error',
          details: error.errors,
        });
      }
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  /**
   * POST /simulate-call
   * Simulate a phone call to a provider
   */
  fastify.post('/simulate-call', {
    schema: {
      description: 'Simulate a phone call to a service provider',
      tags: ['gemini'],
      body: {
        type: 'object',
        required: ['providerName', 'userCriteria'],
        properties: {
          providerName: { type: 'string', description: 'Name of the provider to call' },
          userCriteria: { type: 'string', description: 'User requirements and criteria' },
          isDirect: { type: 'boolean', description: 'Whether this is a direct call task', default: false },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            transcript: { type: 'array' },
            outcome: { type: 'object' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'array' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const body = simulateCallSchema.parse(request.body);
      const result = await simulateCall(body.providerName, body.userCriteria, body.isDirect);
      return result;
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Validation Error',
          details: error.errors,
        });
      }
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  /**
   * POST /select-best-provider
   * Analyze call results and select the best provider
   */
  fastify.post('/select-best-provider', {
    schema: {
      description: 'Analyze call results and select the best provider using AI',
      tags: ['gemini'],
      body: {
        type: 'object',
        required: ['requestTitle', 'interactions', 'providers'],
        properties: {
          requestTitle: { type: 'string', description: 'Title of the service request' },
          interactions: {
            type: 'array',
            description: 'Array of interaction logs from provider calls',
            items: {
              type: 'object',
              properties: {
                timestamp: { type: 'string' },
                stepName: { type: 'string' },
                detail: { type: 'string' },
                transcript: { type: 'array' },
                status: { type: 'string', enum: ['success', 'warning', 'error', 'info'] },
              },
            },
          },
          providers: {
            type: 'array',
            description: 'Array of providers to analyze',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                phone: { type: 'string' },
                rating: { type: 'number' },
                address: { type: 'string' },
                source: { type: 'string', enum: ['Google Maps', 'User Input'] },
              },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            selectedProvider: { type: 'object' },
            reasoning: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'array' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const body = selectBestProviderSchema.parse(request.body);
      const result = await selectBestProvider(
        body.requestTitle,
        body.interactions as InteractionLog[],
        body.providers as Provider[]
      );
      return result;
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Validation Error',
          details: error.errors,
        });
      }
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });

  /**
   * POST /schedule-appointment
   * Schedule an appointment with a provider (simulated)
   */
  fastify.post('/schedule-appointment', {
    schema: {
      description: 'Schedule an appointment with a selected provider (simulated)',
      tags: ['gemini'],
      body: {
        type: 'object',
        required: ['providerName', 'details'],
        properties: {
          providerName: { type: 'string', description: 'Name of the provider' },
          details: { type: 'string', description: 'Appointment details and requirements' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            appointment: { type: 'object' },
            confirmationMessage: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'array' },
          },
        },
        500: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    try {
      const body = scheduleAppointmentSchema.parse(request.body);
      const result = await scheduleAppointment(body.providerName, body.details);
      return result;
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          error: 'Validation Error',
          details: error.errors,
        });
      }
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: error.message,
      });
    }
  });
}
