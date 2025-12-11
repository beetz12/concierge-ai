/**
 * Bookings Routes
 * API endpoints for scheduling appointments with providers
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { KestraClient } from "../services/vapi/kestra.client.js";

// Zod schema for booking request
const scheduleBookingSchema = z.object({
  serviceRequestId: z.string().min(1, "Service request ID is required"),
  providerId: z.string().min(1, "Provider ID is required"),
  providerPhone: z
    .string()
    .regex(/^\+1\d{10}$/, "Phone must be E.164 format (+1XXXXXXXXXX)"),
  providerName: z.string().min(1, "Provider name is required"),
  serviceDescription: z.string().optional(),
  preferredDate: z.string().optional(),
  preferredTime: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z
    .string()
    .regex(/^\+1\d{10}$/, "Phone must be E.164 format (+1XXXXXXXXXX)")
    .optional(),
  location: z.string().optional(),
});

export default async function bookingRoutes(fastify: FastifyInstance) {
  const kestraClient = new KestraClient(fastify.log);

  /**
   * POST /api/v1/bookings/schedule
   * Schedule an appointment with a selected provider
   */
  fastify.post(
    "/schedule",
    {
      schema: {
        tags: ["bookings"],
        summary: "Schedule an appointment with a provider",
        description:
          "Triggers the Kestra schedule_service flow to make a booking call to the selected provider.",
        body: {
          type: "object",
          required: ["serviceRequestId", "providerId", "providerPhone", "providerName"],
          properties: {
            serviceRequestId: {
              type: "string",
              description: "ID of the service request",
            },
            providerId: {
              type: "string",
              description: "ID of the selected provider",
            },
            providerPhone: {
              type: "string",
              description: "Provider's phone number in E.164 format (+1XXXXXXXXXX)",
              pattern: "^\\+1\\d{10}$",
            },
            providerName: {
              type: "string",
              description: "Provider's business name",
            },
            serviceDescription: {
              type: "string",
              description: "Description of the service being booked",
            },
            preferredDate: {
              type: "string",
              description: "Customer's preferred appointment date",
            },
            preferredTime: {
              type: "string",
              description: "Customer's preferred appointment time",
            },
            customerName: {
              type: "string",
              description: "Customer's name for the appointment",
            },
            customerPhone: {
              type: "string",
              description: "Customer's callback phone number",
              pattern: "^\\+1\\d{10}$",
            },
            location: {
              type: "string",
              description: "Service location/address",
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
                  bookingInitiated: { type: "boolean" },
                  executionId: { type: "string" },
                  bookingStatus: { type: "string" },
                  method: { type: "string" },
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
          503: {
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
        // Validate request body
        const validated = scheduleBookingSchema.parse(request.body);

        // Check if Kestra is available
        const kestraEnabled = process.env.KESTRA_ENABLED === "true";
        const kestraHealthy = kestraEnabled && (await kestraClient.healthCheck());

        if (!kestraHealthy) {
          // Kestra not available - return error
          fastify.log.error(
            { kestraEnabled, kestraHealthy },
            "Kestra not available for booking calls"
          );
          return reply.status(503).send({
            success: false,
            error: "Booking service unavailable. Please try again later.",
          });
        }

        // Log the booking attempt
        fastify.log.info(
          {
            serviceRequestId: validated.serviceRequestId,
            providerId: validated.providerId,
            providerName: validated.providerName,
          },
          "Initiating booking call"
        );

        // Trigger Kestra schedule_service flow
        const result = await kestraClient.triggerScheduleServiceFlow({
          providerPhone: validated.providerPhone,
          providerName: validated.providerName,
          serviceDescription: validated.serviceDescription,
          preferredDate: validated.preferredDate,
          preferredTime: validated.preferredTime,
          customerName: validated.customerName,
          customerPhone: validated.customerPhone,
          location: validated.location,
        });

        if (!result.success) {
          fastify.log.error({ error: result.error }, "Failed to initiate booking");
          return reply.status(500).send({
            success: false,
            error: result.error || "Failed to initiate booking call",
          });
        }

        // TODO: Update service_request and provider records in database
        // - Set service_request.status to 'booking' or 'completed'
        // - Set service_request.selected_provider_id
        // - Update provider.call_status

        return reply.send({
          success: true,
          data: {
            bookingInitiated: true,
            executionId: result.executionId,
            bookingStatus: result.bookingStatus || "call_initiated",
            method: "kestra",
          },
        });
      } catch (error: unknown) {
        request.log.error({ error }, "Booking failed");

        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: "Validation error",
            details: error.errors,
          });
        }

        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: errorMessage,
        });
      }
    }
  );

  /**
   * GET /api/v1/bookings/status
   * Check booking system status
   */
  fastify.get(
    "/status",
    {
      schema: {
        tags: ["bookings"],
        summary: "Check booking system status",
        description: "Returns information about the booking system availability",
        response: {
          200: {
            type: "object",
            properties: {
              kestraEnabled: { type: "boolean" },
              kestraHealthy: { type: "boolean" },
              vapiConfigured: { type: "boolean" },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const kestraEnabled = process.env.KESTRA_ENABLED === "true";
      const kestraHealthy = kestraEnabled && (await kestraClient.healthCheck());
      const vapiConfigured = !!(
        process.env.VAPI_API_KEY && process.env.VAPI_PHONE_NUMBER_ID
      );

      return reply.send({
        kestraEnabled,
        kestraHealthy,
        vapiConfigured,
      });
    }
  );
}
