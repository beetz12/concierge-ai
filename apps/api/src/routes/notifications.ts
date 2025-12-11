/**
 * Notifications Routes
 * API endpoints for user notifications (SMS via Twilio/Kestra)
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { KestraClient } from "../services/vapi/kestra.client.js";

// Zod schema for notification request
const notifyUserSchema = z.object({
  userPhone: z
    .string()
    .regex(/^\+1\d{10}$/, "Phone must be E.164 format (+1XXXXXXXXXX)"),
  userName: z.string().optional(),
  requestUrl: z.string().url().optional(),
  serviceRequestId: z.string().min(1, "Service request ID is required"),
  providers: z.array(
    z.object({
      name: z.string(),
      earliestAvailability: z.string(),
    })
  ).min(1, "At least one provider is required"),
});

export default async function notificationRoutes(fastify: FastifyInstance) {
  const kestraClient = new KestraClient(fastify.log);

  /**
   * POST /api/v1/notifications/send
   * Send SMS notification to user with top 3 provider recommendations
   */
  fastify.post(
    "/send",
    {
      schema: {
        tags: ["notifications"],
        summary: "Send SMS notification to user with provider recommendations",
        description:
          "Triggers the Kestra notify_user flow to send an SMS to the user with the top 3 recommended providers.",
        body: {
          type: "object",
          required: ["userPhone", "serviceRequestId", "providers"],
          properties: {
            userPhone: {
              type: "string",
              description: "User's phone number in E.164 format (+1XXXXXXXXXX)",
              pattern: "^\\+1\\d{10}$",
            },
            userName: {
              type: "string",
              description: "User's name for personalization",
            },
            requestUrl: {
              type: "string",
              description: "URL to view full request details",
            },
            serviceRequestId: {
              type: "string",
              description: "ID of the service request",
            },
            providers: {
              type: "array",
              description: "Array of recommended providers",
              items: {
                type: "object",
                required: ["name", "earliestAvailability"],
                properties: {
                  name: { type: "string" },
                  earliestAvailability: { type: "string" },
                },
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
                  notificationSent: { type: "boolean" },
                  executionId: { type: "string" },
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
        },
      },
    },
    async (request, reply) => {
      try {
        // Validate request body
        const validated = notifyUserSchema.parse(request.body);

        // Check if Kestra is available
        const kestraEnabled = process.env.KESTRA_ENABLED === "true";
        const kestraHealthy = kestraEnabled && (await kestraClient.healthCheck());

        if (!kestraHealthy) {
          // Kestra not available - log warning and return success (notification skipped)
          fastify.log.warn(
            { kestraEnabled, kestraHealthy },
            "Kestra not available for notifications, skipping SMS"
          );
          return reply.send({
            success: true,
            data: {
              notificationSent: false,
              method: "skipped",
              reason: "Kestra not available",
            },
          });
        }

        // Trigger Kestra notify_user flow
        const result = await kestraClient.triggerNotifyUserFlow({
          userPhone: validated.userPhone,
          userName: validated.userName,
          requestUrl: validated.requestUrl,
          providers: validated.providers,
        });

        if (!result.success) {
          fastify.log.error({ error: result.error }, "Failed to send notification");
          return reply.status(500).send({
            success: false,
            error: result.error || "Failed to send notification",
          });
        }

        return reply.send({
          success: true,
          data: {
            notificationSent: true,
            executionId: result.executionId,
            method: "kestra",
          },
        });
      } catch (error: unknown) {
        request.log.error({ error }, "Notification failed");

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
   * GET /api/v1/notifications/status
   * Check notification system status
   */
  fastify.get(
    "/status",
    {
      schema: {
        tags: ["notifications"],
        summary: "Check notification system status",
        description: "Returns information about the notification system availability",
        response: {
          200: {
            type: "object",
            properties: {
              kestraEnabled: { type: "boolean" },
              kestraHealthy: { type: "boolean" },
              twilioConfigured: { type: "boolean" },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const kestraEnabled = process.env.KESTRA_ENABLED === "true";
      const kestraHealthy = kestraEnabled && (await kestraClient.healthCheck());
      const twilioConfigured = !!(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_PHONE_NUMBER
      );

      return reply.send({
        kestraEnabled,
        kestraHealthy,
        twilioConfigured,
      });
    }
  );
}
