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

        // PRIORITY 1: Find pending request with recommendations (what user is replying to)
        const { data: serviceRequest, error: findError } = await supabase
          .from("service_requests")
          .select(`
            id,
            title,
            status,
            user_phone,
            notification_method,
            sms_message_sid,
            recommendations
          `)
          .eq("user_phone", userPhone)
          .in("status", ["RECOMMENDED", "BOOKING", "CALLING", "ANALYZING"])
          .not("recommendations", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        // If no pending request with recommendations, check for completed booking
        if (findError || !serviceRequest) {
          // PRIORITY 2: Check for recently completed booking
          const { data: completedRequest } = await supabase
            .from("service_requests")
            .select(`
              id,
              title,
              status,
              final_outcome,
              selected_provider_id,
              providers!service_requests_selected_provider_id_fkey (
                name,
                booking_date,
                booking_time
              )
            `)
            .eq("user_phone", userPhone)
            .eq("status", "COMPLETED")
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (completedRequest) {
            fastify.log.info(
              { userPhone, serviceRequestId: completedRequest.id },
              "[TwilioWebhook] No pending request - found completed booking"
            );

            // Extract provider info from the join
            const provider = completedRequest.providers as any;
            const providerName = provider?.name || "your selected provider";
            const bookingDate = provider?.booking_date || "";
            const bookingTime = provider?.booking_time || "";

            // Build confirmation message
            let confirmationMsg = `Great news! Your appointment is already confirmed with ${providerName}.`;
            if (bookingDate || bookingTime) {
              confirmationMsg += ` Scheduled for ${bookingDate || "TBD"}${bookingTime ? ` at ${bookingTime}` : ""}.`;
            }
            if (completedRequest.final_outcome) {
              confirmationMsg = completedRequest.final_outcome;
            }
            confirmationMsg += " Thank you for using AI Concierge!";

            fastify.log.info(
              { userPhone, message: confirmationMsg, twilioPhoneNumber, hasTwilioClient: !!twilioClient },
              "[TwilioWebhook] Sending already-confirmed message"
            );

            if (twilioClient) {
              try {
                const sentMessage = await twilioClient.messages.create({
                  to: userPhone,
                  from: twilioPhoneNumber,
                  body: confirmationMsg,
                });
                fastify.log.info(
                  { messageSid: sentMessage.sid, status: sentMessage.status },
                  "[TwilioWebhook] Already-confirmed SMS sent successfully"
                );
              } catch (smsError) {
                fastify.log.error(
                  { error: smsError instanceof Error ? smsError.message : smsError },
                  "[TwilioWebhook] Failed to send already-confirmed SMS"
                );
              }
            } else {
              fastify.log.warn("[TwilioWebhook] Twilio client not available for already-confirmed message");
            }

            return reply.type("text/xml").send("<Response></Response>");
          }

          // PRIORITY 3: No pending or completed requests found
          fastify.log.warn(
            { userPhone, error: findError },
            "[TwilioWebhook] No pending or completed service request found for user"
          );

          // Send helpful response
          if (twilioClient) {
            await twilioClient.messages.create({
              to: userPhone,
              from: twilioPhoneNumber,
              body: "Hi! We couldn't find an active request. Visit concierge.ai to start a new search.",
            });
          } else {
            fastify.log.warn("[TwilioWebhook] Twilio client not available");
          }

          return reply.type("text/xml").send("<Response></Response>");
        }

        // Found pending request with recommendations - continue processing selection
        fastify.log.info(
          { userPhone, serviceRequestId: serviceRequest.id, status: serviceRequest.status },
          "[TwilioWebhook] Found pending request with recommendations"
        );

        // Extract providers from the recommendations JSONB field
        // This contains the AI-ranked top providers that were sent in the SMS
        interface RecommendedProvider {
          providerId: string;
          providerName: string;
          phone: string;
          score?: number;
          rating?: number;
          earliestAvailability?: string;
        }

        const recommendationsData = serviceRequest.recommendations as {
          recommendations?: RecommendedProvider[];
        } | null;

        const recommendedProviders = recommendationsData?.recommendations || [];

        // Map to the format expected by the rest of the code
        const providers = recommendedProviders.slice(0, 3).map((rec) => ({
          id: rec.providerId,
          name: rec.providerName,
          phone: rec.phone,
          call_status: "completed" as const,
          earliest_availability: rec.earliestAvailability || "Contact for availability",
        }));

        if (providers.length === 0) {
          fastify.log.warn(
            { serviceRequestId: serviceRequest.id, recommendationsData },
            "[TwilioWebhook] Service request has recommendations field but no providers in array"
          );

          if (twilioClient) {
            await twilioClient.messages.create({
              to: userPhone,
              from: twilioPhoneNumber,
              body: "We're still researching providers for you. Please wait for our recommendations.",
            });
          } else {
            fastify.log.warn("[TwilioWebhook] Twilio client not available");
          }

          return reply.type("text/xml").send("<Response></Response>");
        }

        fastify.log.info(
          { serviceRequestId: serviceRequest.id, providerCount: providers.length },
          "[TwilioWebhook] Found recommended providers from JSONB"
        );

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
          // Use localhost for internal API calls (not ngrok external URL)
          const backendUrl = 'http://localhost:8000';

          // Check for ADMIN_TEST_NUMBER to substitute test phone
          const adminTestPhonesRaw = process.env.ADMIN_TEST_NUMBER;
          const adminTestPhones = adminTestPhonesRaw
            ? adminTestPhonesRaw.split(",").map((p) => p.trim()).filter(Boolean)
            : [];
          const isAdminTestMode = adminTestPhones.length > 0;

          // Determine phone to call - use test phone if in test mode
          let phoneToCall = selectedProvider.phone;
          if (isAdminTestMode && adminTestPhones[0]) {
            phoneToCall = adminTestPhones[0];
            fastify.log.info(
              {
                originalPhone: selectedProvider.phone,
                testPhone: phoneToCall,
                providerName: selectedProvider.name,
              },
              "[TwilioWebhook] Admin test mode: substituting provider phone with test phone"
            );
          }

          // Get full request details for booking (no providers join needed - we have selectedProvider from recommendations)
          const { data: fullRequest, error: fullRequestError } = await supabase
            .from('service_requests')
            .select('*')
            .eq('id', serviceRequest.id)
            .single();

          if (fullRequestError) {
            fastify.log.error(
              { error: fullRequestError, serviceRequestId: serviceRequest.id },
              "[TwilioWebhook] Failed to fetch full request for booking"
            );
          }

          if (fullRequest && selectedProvider) {
            // Build booking payload
            const bookingPayload = {
              serviceRequestId: fullRequest.id,
              providerId: selectedProvider.id,
              providerPhone: phoneToCall, // Use test phone or real phone
              providerName: selectedProvider.name,
              serviceNeeded: fullRequest.title || fullRequest.description || 'service',
              clientName: (fullRequest.direct_contact_info as any)?.user_name || 'Customer',
              clientPhone: fullRequest.user_phone,
              location: fullRequest.location || '',
              preferredDateTime: selectedProvider.earliest_availability || '',
              additionalNotes: '',
            };

            // Log the booking trigger attempt with full payload
            fastify.log.info(
              {
                backendUrl,
                endpoint: '/api/v1/providers/book',
                payload: bookingPayload,
                isAdminTestMode,
              },
              "[TwilioWebhook] Triggering booking call to provider"
            );

            // Make the booking request (fire-and-forget but with proper logging)
            fetch(`${backendUrl}/api/v1/providers/book`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(bookingPayload),
            }).then(async (res) => {
              if (!res.ok) {
                const errorBody = await res.text().catch(() => 'Unable to read response body');
                fastify.log.error(
                  {
                    status: res.status,
                    statusText: res.statusText,
                    errorBody,
                    serviceRequestId: fullRequest.id,
                  },
                  "[TwilioWebhook] Booking trigger failed"
                );
              } else {
                const successBody = await res.json().catch(() => ({}));
                fastify.log.info(
                  {
                    status: res.status,
                    response: successBody,
                    serviceRequestId: fullRequest.id,
                    providerName: selectedProvider.name,
                  },
                  "[TwilioWebhook] Booking triggered successfully"
                );
              }
            }).catch((err) => {
              fastify.log.error(
                {
                  error: err.message || err,
                  serviceRequestId: fullRequest.id,
                  backendUrl,
                },
                "[TwilioWebhook] Booking trigger network error"
              );
            });

            // Log the booking trigger to database
            await supabase.from('interaction_logs').insert({
              request_id: serviceRequest.id,
              step_name: 'Booking Auto-Triggered',
              detail: `Booking automatically triggered for ${selectedProvider.name} via SMS selection (phone: ${phoneToCall})`,
              status: 'info',
            });
          } else {
            fastify.log.warn(
              {
                hasFullRequest: !!fullRequest,
                hasSelectedProvider: !!selectedProvider,
                serviceRequestId: serviceRequest.id,
              },
              "[TwilioWebhook] Missing data for booking trigger"
            );
          }
        } catch (bookingError) {
          fastify.log.error(
            { error: bookingError },
            '[TwilioWebhook] Error triggering booking'
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
