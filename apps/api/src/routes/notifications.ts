/**
 * Notifications Routes
 * API endpoints for user notifications (SMS via Twilio/Kestra)
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { KestraClient } from "../services/vapi/kestra.client.js";
import { DirectTwilioClient } from "../services/notifications/index.js";
import { UserNotificationService } from "../services/notifications/user-notification.service.js";

// Zod schema for notification request
const notifyUserSchema = z.object({
  userPhone: z
    .string()
    .regex(/^\+1\d{10}$/, "Phone must be E.164 format (+1XXXXXXXXXX)"),
  userName: z.string().optional(),
  requestUrl: z.string().url().optional(),
  serviceRequestId: z.string().min(1, "Service request ID is required"),
  preferredContact: z.enum(["phone", "text"]).default("text"),
  serviceNeeded: z.string().optional(),
  location: z.string().optional(),
  providers: z.array(
    z.object({
      name: z.string(),
      earliestAvailability: z.string(),
    })
  ).min(1, "At least one provider is required"),
});

export default async function notificationRoutes(fastify: FastifyInstance) {
  const kestraClient = new KestraClient(fastify.log);
  const twilioClient = new DirectTwilioClient(fastify.log);
  const userNotificationService = new UserNotificationService(fastify.log);

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
            preferredContact: {
              type: "string",
              enum: ["phone", "text"],
              description: "User's preferred contact method (default: text)",
            },
            serviceNeeded: {
              type: "string",
              description: "Description of the service needed",
            },
            location: {
              type: "string",
              description: "Location for the service",
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

        // Initialize Supabase client for database updates
        const supabase = createSupabaseClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Route based on user preference
        if (validated.preferredContact === "phone" && userNotificationService.isAvailable()) {
          // Use VAPI to call the user
          fastify.log.info(
            { userPhone: validated.userPhone, preferredContact: validated.preferredContact },
            "Using VAPI to notify user via phone call"
          );

          const vapiResult = await userNotificationService.callUser({
            userPhone: validated.userPhone,
            userName: validated.userName,
            serviceRequestId: validated.serviceRequestId,
            recommendations: validated.providers.map((p, i) => ({
              rank: i + 1,
              providerName: p.name,
              availability: p.earliestAvailability,
            })),
            serviceNeeded: validated.serviceNeeded || "service",
            location: validated.location || "",
            requestUrl: validated.requestUrl,
          });

          // Update database with notification result
          await supabase.from("service_requests").update({
            notification_sent_at: new Date().toISOString(),
            notification_method: "vapi",
            user_selection: vapiResult.selectedProvider || null,
          }).eq("id", validated.serviceRequestId);

          // Log the interaction
          await supabase.from("interaction_logs").insert({
            request_id: validated.serviceRequestId,
            step_name: "User Notification via Phone",
            detail: `VAPI call ${vapiResult.callId}: ${vapiResult.callOutcome}${vapiResult.selectedProvider ? ` - selected provider ${vapiResult.selectedProvider}` : ''}`,
            status: vapiResult.success ? "success" : "failed",
          });

          return reply.send({
            success: vapiResult.success,
            data: {
              notificationSent: true,
              callId: vapiResult.callId,
              selectedProvider: vapiResult.selectedProvider,
              callOutcome: vapiResult.callOutcome,
              method: "vapi_call",
            },
          });
        }

        // Default to SMS (existing flow)
        fastify.log.info(
          { userPhone: validated.userPhone, preferredContact: validated.preferredContact },
          "Using SMS to notify user"
        );

        // Check if Kestra is available
        const kestraEnabled = process.env.KESTRA_ENABLED === "true";
        const kestraHealthy = kestraEnabled && (await kestraClient.healthCheck());

        // STRICT MODE: If Kestra explicitly enabled but unhealthy, throw error
        if (kestraEnabled && !kestraHealthy) {
          request.log.error({}, "Kestra enabled but unavailable for notifications - not falling back");
          throw new Error("Kestra explicitly enabled (KESTRA_ENABLED=true) but unavailable. Fix Kestra or disable it.");
        }

        if (!kestraHealthy) {
          // Kestra not available - try direct Twilio fallback
          fastify.log.info(
            { kestraEnabled, kestraHealthy },
            "Kestra not available for notifications, using direct Twilio fallback"
          );

          // Check if Twilio is configured
          if (!twilioClient.isAvailable()) {
            fastify.log.warn({}, "Twilio not configured, skipping SMS");
            return reply.send({
              success: true,
              data: {
                notificationSent: false,
                method: "skipped",
                reason: "Neither Kestra nor Twilio available",
              },
            });
          }

          // Send via direct Twilio
          const twilioResult = await twilioClient.sendNotification({
            userPhone: validated.userPhone,
            userName: validated.userName,
            requestUrl: validated.requestUrl,
            providers: validated.providers,
          });

          if (!twilioResult.success) {
            fastify.log.error(
              { error: twilioResult.error },
              "Direct Twilio notification failed"
            );
            return reply.status(500).send({
              success: false,
              error: twilioResult.error || "Failed to send notification via Twilio",
            });
          }

          return reply.send({
            success: true,
            data: {
              notificationSent: true,
              messageSid: twilioResult.messageSid,
              method: "direct_twilio",
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
