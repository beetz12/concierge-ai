/**
 * Twilio Webhook Routes
 *
 * Handles inbound SMS from users responding to provider recommendations.
 * Users can reply "1", "2", or "3" to select a provider.
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import twilio from "twilio";

// Twilio webhook payload schema
const twilioWebhookSchema = z.object({
  MessageSid: z.string(),
  From: z.string(),
  To: z.string(),
  Body: z.string(),
  NumMedia: z.string().optional(),
});

export default async function twilioWebhookRoutes(fastify: FastifyInstance) {
  const supabase = createSupabaseClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Initialize Twilio client for sending responses
  // Only initialize if Account SID is valid (must start with "AC", not "SK" which is API Key format)
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const isValidAccountSid = accountSid?.startsWith('AC');

  const twilioClient = isValidAccountSid && authToken
    ? twilio(accountSid, authToken)
    : null;

  if (accountSid && !isValidAccountSid) {
    fastify.log.warn(
      { accountSidPrefix: accountSid.substring(0, 2) },
      "Twilio Account SID must start with 'AC'. Found API Key format instead. SMS webhook responses disabled."
    );
  }

  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || "";

  /**
   * POST /api/v1/twilio/webhook
   * Handles inbound SMS from Twilio
   */
  fastify.post(
    "/webhook",
    {
      schema: {
        tags: ["twilio"],
        summary: "Twilio inbound SMS webhook",
        description: "Handles user responses to provider recommendation SMS messages",
      },
    },
    async (request, reply) => {
      try {
        // Parse and validate webhook payload
        const payload = twilioWebhookSchema.parse(request.body);
        const { From: userPhone, Body: messageBody, MessageSid } = payload;

        fastify.log.info(
          { userPhone, messageBody: messageBody.substring(0, 50), MessageSid },
          "[TwilioWebhook] Received inbound SMS"
        );

        // Parse user selection (expecting "1", "2", or "3")
        const trimmedBody = messageBody.trim().toLowerCase();
        const selection = parseInt(trimmedBody, 10);

        // Find the user's most recent service request with recommendations
        const { data: serviceRequest, error: findError } = await supabase
          .from("service_requests")
          .select(`
            id,
            title,
            status,
            user_phone,
            notification_method,
            sms_message_sid
          `)
          .eq("user_phone", userPhone)
          .in("status", ["RECOMMENDATIONS_SENT", "CALLING", "RESEARCHING"])
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (findError || !serviceRequest) {
          fastify.log.warn(
            { userPhone, error: findError },
            "[TwilioWebhook] No pending service request found for user"
          );

          // Send helpful response
          if (twilioClient) {
            await twilioClient.messages.create({
              to: userPhone,
              from: twilioPhoneNumber,
              body: "Hi! We couldn't find a pending request. Visit concierge.ai to start a new search.",
            });
          }

          return reply.type("text/xml").send("<Response></Response>");
        }

        // Get the top 3 providers for this request
        const { data: providers, error: providersError } = await supabase
          .from("providers")
          .select("id, name, phone, call_status, earliest_availability")
          .eq("request_id", serviceRequest.id)
          .order("created_at", { ascending: true })
          .limit(3);

        if (providersError || !providers || providers.length === 0) {
          fastify.log.warn(
            { serviceRequestId: serviceRequest.id },
            "[TwilioWebhook] No providers found for service request"
          );

          if (twilioClient) {
            await twilioClient.messages.create({
              to: userPhone,
              from: twilioPhoneNumber,
              body: "We're still researching providers for you. Please wait for our recommendations.",
            });
          }

          return reply.type("text/xml").send("<Response></Response>");
        }

        // Validate selection
        if (isNaN(selection) || selection < 1 || selection > providers.length) {
          // Send help message
          const providerList = providers
            .map((p, i) => `${i + 1}. ${p.name}`)
            .join("\n");

          if (twilioClient) {
            await twilioClient.messages.create({
              to: userPhone,
              from: twilioPhoneNumber,
              body: `Please reply with 1, 2, or 3 to select a provider:\n\n${providerList}`,
            });
          }

          return reply.type("text/xml").send("<Response></Response>");
        }

        // Get selected provider (already validated to be within bounds)
        const selectedProvider = providers[selection - 1];

        if (!selectedProvider) {
          fastify.log.error(
            { selection, providersLength: providers.length },
            "[TwilioWebhook] Selected provider not found"
          );
          return reply.type("text/xml").send("<Response></Response>");
        }

        fastify.log.info(
          {
            serviceRequestId: serviceRequest.id,
            selection,
            providerId: selectedProvider.id,
            providerName: selectedProvider.name,
          },
          "[TwilioWebhook] User selected provider"
        );

        // Update service request with selection
        const { error: updateError } = await supabase
          .from("service_requests")
          .update({
            user_selection: selection,
            selected_provider_id: selectedProvider.id,
            status: "BOOKING",
          })
          .eq("id", serviceRequest.id);

        if (updateError) {
          fastify.log.error(
            { error: updateError },
            "[TwilioWebhook] Failed to update service request"
          );
        }

        // Log the interaction
        await supabase.from("interaction_logs").insert({
          request_id: serviceRequest.id,
          step_name: "User Selection via SMS",
          detail: `User replied "${selection}" to select ${selectedProvider.name}`,
          status: "success",
        });

        // Auto-trigger booking call to provider
        try {
          const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';

          // Get full request details for booking
          const { data: fullRequest } = await supabase
            .from('service_requests')
            .select('*, providers(*)')
            .eq('id', serviceRequest.id)
            .single();

          if (fullRequest && selectedProvider) {
            // Fire and forget - don't wait for booking to complete
            fetch(`${backendUrl}/api/v1/providers/book`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                serviceRequestId: fullRequest.id,
                providerId: selectedProvider.id,
                providerPhone: selectedProvider.phone,
                providerName: selectedProvider.name,
                serviceNeeded: fullRequest.title || fullRequest.description || 'service',
                clientName: fullRequest.direct_contact_info?.user_name || fullRequest.client_name || 'Customer',
                clientPhone: fullRequest.user_phone,
                location: fullRequest.location || '',
                preferredDateTime: selectedProvider.earliest_availability || '',
                additionalNotes: '',
              })
            }).then(res => {
              if (!res.ok) {
                console.error('[Twilio Webhook] Booking trigger failed:', res.status);
              } else {
                console.log('[Twilio Webhook] Booking triggered successfully');
              }
            }).catch(err => {
              console.error('[Twilio Webhook] Booking trigger error:', err);
            });

            // Log the booking trigger
            await supabase.from('interaction_logs').insert({
              request_id: serviceRequest.id,
              step_name: 'Booking Auto-Triggered',
              detail: `Booking automatically triggered for ${selectedProvider.name} via SMS selection`,
              status: 'info',
            });
          }
        } catch (bookingError) {
          fastify.log.error(
            { error: bookingError },
            '[Twilio Webhook] Error triggering booking'
          );
          // Don't fail the webhook response - booking is best-effort
        }

        // Send confirmation SMS
        if (twilioClient) {
          await twilioClient.messages.create({
            to: userPhone,
            from: twilioPhoneNumber,
            body: `Great choice! I'm booking ${selectedProvider.name} for you now. You'll receive a confirmation shortly.`,
          });
        }

        // Return empty TwiML response (we handle responses ourselves)
        return reply.type("text/xml").send("<Response></Response>");
      } catch (error) {
        fastify.log.error({ error }, "[TwilioWebhook] Error processing webhook");

        if (error instanceof z.ZodError) {
          return reply.status(400).type("text/xml").send("<Response></Response>");
        }

        return reply.status(500).type("text/xml").send("<Response></Response>");
      }
    }
  );

  /**
   * GET /api/v1/twilio/status
   * Check Twilio webhook status
   */
  fastify.get(
    "/status",
    {
      schema: {
        tags: ["twilio"],
        summary: "Check Twilio webhook status",
        response: {
          200: {
            type: "object",
            properties: {
              twilioConfigured: { type: "boolean" },
              webhookReady: { type: "boolean" },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      const twilioConfigured = !!(
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_PHONE_NUMBER
      );

      return reply.send({
        twilioConfigured,
        webhookReady: twilioConfigured,
      });
    }
  );
}
