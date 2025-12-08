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
  fastify.post('/search-providers', async (request, reply) => {
    try {
      const body = searchProvidersSchema.parse(request.body);
      const result = await searchProviders(body.query, body.location, body.coordinates);
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
  fastify.post('/simulate-call', async (request, reply) => {
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
  fastify.post('/select-best-provider', async (request, reply) => {
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
  fastify.post('/schedule-appointment', async (request, reply) => {
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
