/**
 * Bookings Routes
 * API endpoints for scheduling appointments with providers
 */

import { FastifyInstance } from "fastify";
import { z } from "zod";
import { KestraClient } from "../services/vapi/kestra.client.js";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { DirectTwilioClient } from "../services/notifications/direct-twilio.client.js";

// Configuration for live call vs simulation
const LIVE_CALL_ENABLED = process.env.LIVE_CALL_ENABLED === "true";

// Parse admin test phones (comma-separated E.164 numbers)
// Use ADMIN_TEST_NUMBER for consistency with research phase in providers.ts
const ADMIN_TEST_PHONES_RAW = process.env.ADMIN_TEST_NUMBER;
const ADMIN_TEST_PHONES = ADMIN_TEST_PHONES_RAW
  ? ADMIN_TEST_PHONES_RAW.split(",").map((p) => p.trim()).filter(Boolean)
  : [];
const isAdminTestMode = ADMIN_TEST_PHONES.length > 0;

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
  clientAddress: z.string().optional(), // Full street address for VAPI prompts
});

/**
 * Helper: Simulate booking and persist to database
 */
async function handleSimulatedBooking(
  validated: z.infer<typeof scheduleBookingSchema>,
  supabase: any,
  fastify: FastifyInstance
) {
  fastify.log.info(
    { providerId: validated.providerId },
    "Simulating booking (LIVE_CALL_ENABLED=false)"
  );

  // Simulate successful booking
  const fakeBookingDate = validated.preferredDate || new Date().toISOString().split("T")[0];
  const fakeBookingTime = validated.preferredTime || "10:00 AM";
  const fakeConfirmationNumber = `SIMULATED-${Date.now()}`;

  // Update provider record with simulated booking
  const { error: updateProviderError } = await supabase
    .from("providers")
    .update({
      booking_confirmed: true,
      booking_date: fakeBookingDate,
      booking_time: fakeBookingTime,
      confirmation_number: fakeConfirmationNumber,
      call_status: "booking_confirmed",
      last_call_at: new Date().toISOString(),
      call_transcript: "SIMULATED BOOKING - No actual call made",
    })
    .eq("id", validated.providerId);

  if (updateProviderError) {
    fastify.log.error({ error: updateProviderError }, "Failed to update provider (simulated)");
    throw updateProviderError;
  }

  // Update service request to COMPLETED
  const { error: updateRequestError } = await supabase
    .from("service_requests")
    .update({
      selected_provider_id: validated.providerId,
      status: "COMPLETED",
      final_outcome: `Appointment confirmed (SIMULATED) with ${validated.providerName} for ${fakeBookingDate} at ${fakeBookingTime}`,
    })
    .eq("id", validated.serviceRequestId);

  if (updateRequestError) {
    fastify.log.error({ error: updateRequestError }, "Failed to update service request (simulated)");
    throw updateRequestError;
  }

  // Log interaction
  await supabase.from("interaction_logs").insert({
    request_id: validated.serviceRequestId,
    step_name: "Booking Confirmed (Simulated)",
    detail: `SIMULATED booking with ${validated.providerName}. Confirmation: ${fakeConfirmationNumber}`,
    status: "success",
  });

  // Send confirmation SMS
  try {
    const { data: request } = await supabase
      .from("service_requests")
      .select("user_phone, direct_contact_info, client_name")
      .eq("id", validated.serviceRequestId)
      .single();

    if (request?.user_phone) {
      const twilioClient = new DirectTwilioClient(fastify.log);

      if (twilioClient.isAvailable()) {
        const confirmResult = await twilioClient.sendConfirmation({
          userPhone: request.user_phone,
          userName:
            (request.direct_contact_info as any)?.user_name ||
            request.client_name ||
            validated.customerName,
          providerName: validated.providerName,
          bookingDate: fakeBookingDate,
          bookingTime: fakeBookingTime,
          confirmationNumber: fakeConfirmationNumber,
          serviceDescription: validated.serviceDescription,
        });

        if (confirmResult.success) {
          fastify.log.info({ messageSid: confirmResult.messageSid }, "Confirmation SMS sent (simulated booking)");

          // Update database to track confirmation notification
          await supabase.from("service_requests").update({
            notification_sent_at: new Date().toISOString(),
            notification_method: "sms",
          }).eq("id", validated.serviceRequestId);

          await supabase.from("interaction_logs").insert({
            request_id: validated.serviceRequestId,
            step_name: "Confirmation SMS Sent",
            detail: `Booking confirmation sent via SMS to ${request.user_phone}`,
            status: "success",
          });
        }
      }
    }
  } catch (notifyError) {
    fastify.log.error({ error: notifyError }, "Error sending confirmation (simulated)");
    // Don't fail - notification is best-effort
  }

  fastify.log.info({ providerId: validated.providerId }, "Simulated booking completed successfully");
}

/**
 * Helper: Make real booking call via VAPI
 */
async function handleRealBookingCall(
  validated: z.infer<typeof scheduleBookingSchema>,
  phoneToCall: string,
  supabase: any,
  fastify: FastifyInstance
) {
  const callMode = phoneToCall !== validated.providerPhone ? "test" : "production";
  fastify.log.info(
    { providerId: validated.providerId, phone: phoneToCall, mode: callMode },
    `Making real booking call (mode: ${callMode})`
  );

  // Import booking config and VAPI client
  const { createBookingAssistantConfig } = await import(
    "../services/vapi/booking-assistant-config.js"
  );
  const { VapiClient } = await import("@vapi-ai/server-sdk");
  const vapi = new VapiClient({ token: process.env.VAPI_API_KEY! });

  // Create booking assistant configuration
  const bookingConfig = createBookingAssistantConfig({
    providerName: validated.providerName,
    providerPhone: phoneToCall,
    serviceNeeded: validated.serviceDescription || "service",
    clientName: validated.customerName,
    clientPhone: validated.customerPhone,
    location: validated.location || "",
    clientAddress: validated.clientAddress, // Full street address for VAPI
    preferredDateTime:
      validated.preferredDate && validated.preferredTime
        ? `${validated.preferredDate} at ${validated.preferredTime}`
        : validated.preferredDate || validated.preferredTime || "as soon as possible",
    serviceRequestId: validated.serviceRequestId,
    providerId: validated.providerId,
  });

  // Build call parameters
  const callParams: any = {
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
    customer: {
      number: phoneToCall,
      name: validated.providerName,
    },
    assistant: bookingConfig,
  };

  // Create the call
  const callResponse = await vapi.calls.create(callParams);

  // Extract call from response
  let call: any;
  if (Array.isArray(callResponse)) {
    call = callResponse[0];
  } else if ((callResponse as any).id) {
    call = callResponse;
  } else if ((callResponse as any).data?.id) {
    call = (callResponse as any).data;
  } else {
    throw new Error("Unexpected response format from VAPI calls.create");
  }

  fastify.log.info({ callId: call.id, status: call.status }, "Booking call created, waiting for completion");

  // Poll for completion
  const maxAttempts = 60;
  let attempts = 0;
  let completedCall: any = null;

  while (attempts < maxAttempts) {
    const callData = await vapi.calls.get({ id: call.id });

    let currentCall: any;
    if (Array.isArray(callData)) {
      currentCall = callData[0];
    } else if ((callData as any).id) {
      currentCall = callData;
    } else if ((callData as any).data?.id) {
      currentCall = (callData as any).data;
    } else {
      throw new Error("Unexpected response format from VAPI calls.get");
    }

    if (!["queued", "ringing", "in-progress"].includes(currentCall.status)) {
      completedCall = currentCall;
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
    attempts++;
  }

  if (!completedCall) {
    throw new Error(`Booking call ${call.id} timed out after ${maxAttempts * 5} seconds`);
  }

  // Extract structured data from call result
  const analysis = completedCall.analysis || {};
  const structuredData = analysis.structuredData || {};
  let bookingConfirmed = structuredData.booking_confirmed || false;

  // Extract transcript
  const transcript = completedCall.artifact?.transcript || "";
  const transcriptStr = typeof transcript === "string" ? transcript : JSON.stringify(transcript);

  // Fallback detection: If VAPI didn't detect confirmation but transcript shows agreement
  // (Same logic as /api/v1/providers/book for consistency)
  if (!bookingConfirmed && transcriptStr) {
    const transcriptLower = transcriptStr.toLowerCase();

    // Check for date/time agreement patterns in transcript
    const hasDateTimeAgreement =
      // Provider offered a time
      (/i can do|available|works for me|how about|let's do/i.test(transcriptLower) &&
      // And a day/time was mentioned
      /(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next week|today)/i.test(transcriptLower) &&
      /(\d{1,2}(?::\d{2})?\s*(?:am|pm)|morning|afternoon|evening|noon)/i.test(transcriptLower));

    // Check for confirmation patterns
    const hasConfirmationPattern =
      /(?:just to confirm|perfect|excellent|great|sounds good|see you|appointment.*(?:set|scheduled|confirmed))/i.test(transcriptLower);

    // Check there's no rejection
    const hasRejection =
      /(?:not available|can't help|unavailable|no longer|sorry.*can't|decline)/i.test(transcriptLower);

    if (hasDateTimeAgreement && hasConfirmationPattern && !hasRejection) {
      fastify.log.info(
        {
          vapiBookingConfirmed: false,
          hasDateTimeAgreement,
          hasConfirmationPattern,
          hasRejection,
        },
        "[Booking] Fallback detection: VAPI missed confirmation, overriding to TRUE based on transcript analysis"
      );
      bookingConfirmed = true;

      // Try to extract date/time if VAPI didn't
      if (!structuredData.confirmed_date) {
        const dateMatch = transcriptLower.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|next\s+\w+)/i);
        if (dateMatch) {
          structuredData.confirmed_date = dateMatch[0].charAt(0).toUpperCase() + dateMatch[0].slice(1);
        }
      }
      if (!structuredData.confirmed_time) {
        const timeMatch = transcriptLower.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
        if (timeMatch) {
          structuredData.confirmed_time = timeMatch[0].toUpperCase();
        }
      }
    }
  }

  fastify.log.info(
    {
      bookingConfirmed,
      confirmedDate: structuredData.confirmed_date,
      confirmedTime: structuredData.confirmed_time,
      callOutcome: structuredData.call_outcome,
    },
    "[Booking] Final booking status after analysis"
  );

  // Update provider record with booking details
  const { error: updateProviderError } = await supabase
    .from("providers")
    .update({
      booking_confirmed: bookingConfirmed,
      booking_date: structuredData.confirmed_date,
      booking_time: structuredData.confirmed_time,
      confirmation_number: structuredData.confirmation_number,
      call_status: bookingConfirmed ? "booking_confirmed" : "booking_failed",
      last_call_at: new Date().toISOString(),
      call_transcript: transcriptStr,
    })
    .eq("id", validated.providerId);

  if (updateProviderError) {
    fastify.log.error({ error: updateProviderError }, "Failed to update provider record");
    throw updateProviderError;
  }

  // If booking confirmed, update service request
  if (bookingConfirmed) {
    const { error: updateRequestError } = await supabase
      .from("service_requests")
      .update({
        selected_provider_id: validated.providerId,
        status: "COMPLETED",
        final_outcome: `Appointment confirmed with ${validated.providerName} for ${structuredData.confirmed_date || "TBD"} at ${structuredData.confirmed_time || "TBD"}`,
      })
      .eq("id", validated.serviceRequestId);

    if (updateRequestError) {
      fastify.log.error({ error: updateRequestError }, "Failed to update service request");
      throw updateRequestError;
    }

    // Create interaction log
    await supabase.from("interaction_logs").insert({
      request_id: validated.serviceRequestId,
      step_name: "Booking Confirmed",
      detail: `Successfully booked appointment with ${validated.providerName}. Confirmation: ${structuredData.confirmation_number || "N/A"}`,
      status: "success",
    });

    // Send confirmation notification to user
    try {
      const { data: request } = await supabase
        .from("service_requests")
        .select("user_phone, direct_contact_info, client_name")
        .eq("id", validated.serviceRequestId)
        .single();

      if (request?.user_phone) {
        const twilioClient = new DirectTwilioClient(fastify.log);

        if (twilioClient.isAvailable()) {
          const confirmResult = await twilioClient.sendConfirmation({
            userPhone: request.user_phone,
            userName:
              (request.direct_contact_info as any)?.user_name ||
              request.client_name ||
              validated.customerName,
            providerName: validated.providerName,
            bookingDate: structuredData.confirmed_date,
            bookingTime: structuredData.confirmed_time,
            confirmationNumber: structuredData.confirmation_number,
            serviceDescription: validated.serviceDescription,
          });

          if (confirmResult.success) {
            fastify.log.info({ messageSid: confirmResult.messageSid }, "Confirmation SMS sent");

            // Update database to track confirmation notification
            await supabase.from("service_requests").update({
              notification_sent_at: new Date().toISOString(),
              notification_method: "sms",
            }).eq("id", validated.serviceRequestId);

            await supabase.from("interaction_logs").insert({
              request_id: validated.serviceRequestId,
              step_name: "Confirmation SMS Sent",
              detail: `Booking confirmation sent via SMS to ${request.user_phone}`,
              status: "success",
            });
          } else {
            fastify.log.error({ error: confirmResult.error }, "Confirmation SMS failed");
          }
        }
      }
    } catch (notifyError) {
      fastify.log.error({ error: notifyError }, "Error sending confirmation");
      // Don't fail the booking - confirmation is best-effort
    }
  } else {
    // Booking failed - update status back to RECOMMENDED so user can retry
    const { error: updateRequestError } = await supabase
      .from("service_requests")
      .update({
        status: "RECOMMENDED",
      })
      .eq("id", validated.serviceRequestId);

    if (updateRequestError) {
      fastify.log.error({ error: updateRequestError }, "Failed to update service request after booking failure");
    }

    // Log the failure
    await supabase.from("interaction_logs").insert({
      request_id: validated.serviceRequestId,
      step_name: "Booking Failed",
      detail: `Failed to confirm booking with ${validated.providerName}. Outcome: ${structuredData.call_outcome || "unknown"}`,
      status: "warning",
    });
  }

  fastify.log.info(
    { providerId: validated.providerId, bookingConfirmed },
    `Real booking call completed (mode: ${callMode})`
  );
}

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

        // STRICT MODE: If Kestra explicitly enabled but unhealthy, throw error
        if (kestraEnabled && !kestraHealthy) {
          request.log.error({}, "Kestra enabled but unavailable for booking - not falling back");
          throw new Error("Kestra explicitly enabled (KESTRA_ENABLED=true) but unavailable. Fix Kestra or disable it.");
        }

        if (!kestraHealthy) {
          // Kestra not available - use direct VAPI fallback
          fastify.log.info(
            { kestraEnabled, kestraHealthy },
            "Kestra not available for booking calls, using direct VAPI fallback"
          );

          // Check if VAPI is configured
          if (!process.env.VAPI_API_KEY || !process.env.VAPI_PHONE_NUMBER_ID) {
            return reply.status(503).send({
              success: false,
              error: "Neither Kestra nor VAPI configured. Booking service unavailable.",
            });
          }

          // Import booking config and VAPI client
          const { createBookingAssistantConfig } = await import(
            "../services/vapi/booking-assistant-config.js"
          );
          const { VapiClient } = await import("@vapi-ai/server-sdk");
          const vapi = new VapiClient({ token: process.env.VAPI_API_KEY });

          // Create booking assistant configuration
          const bookingConfig = createBookingAssistantConfig({
            providerName: validated.providerName,
            providerPhone: validated.providerPhone,
            serviceNeeded: validated.serviceDescription || "service",
            clientName: validated.customerName,
            clientPhone: validated.customerPhone,
            location: validated.location || "",
            clientAddress: validated.clientAddress, // Full street address for VAPI
            preferredDateTime: validated.preferredDate && validated.preferredTime
              ? `${validated.preferredDate} at ${validated.preferredTime}`
              : validated.preferredDate || validated.preferredTime || "as soon as possible",
            serviceRequestId: validated.serviceRequestId,
            providerId: validated.providerId,
          });

          // Build call parameters
          const callParams: any = {
            phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
            customer: {
              number: validated.providerPhone,
              name: validated.providerName,
            },
            assistant: bookingConfig,
          };

          fastify.log.info(
            { provider: validated.providerName, phone: validated.providerPhone },
            "Creating booking call via direct VAPI"
          );

          // Create the call
          const callResponse = await vapi.calls.create(callParams);

          // Extract call from response
          let call: any;
          if (Array.isArray(callResponse)) {
            call = callResponse[0];
          } else if ((callResponse as any).id) {
            call = callResponse;
          } else if ((callResponse as any).data?.id) {
            call = (callResponse as any).data;
          } else {
            throw new Error("Unexpected response format from VAPI calls.create");
          }

          fastify.log.info(
            { callId: call.id, status: call.status },
            "Booking call created, waiting for completion"
          );

          // Poll for completion
          const maxAttempts = 60;
          let attempts = 0;
          let completedCall: any = null;

          while (attempts < maxAttempts) {
            const callData = await vapi.calls.get({ id: call.id });

            let currentCall: any;
            if (Array.isArray(callData)) {
              currentCall = callData[0];
            } else if ((callData as any).id) {
              currentCall = callData;
            } else if ((callData as any).data?.id) {
              currentCall = (callData as any).data;
            } else {
              throw new Error("Unexpected response format from VAPI calls.get");
            }

            if (!["queued", "ringing", "in-progress"].includes(currentCall.status)) {
              completedCall = currentCall;
              break;
            }

            await new Promise((resolve) => setTimeout(resolve, 5000));
            attempts++;
          }

          if (!completedCall) {
            throw new Error(`Booking call ${call.id} timed out after ${maxAttempts * 5} seconds`);
          }

          // Extract structured data from call result
          const analysis = completedCall.analysis || {};
          const structuredData = analysis.structuredData || {};
          const bookingConfirmed = structuredData.booking_confirmed || false;

          // Extract transcript
          const transcript = completedCall.artifact?.transcript || "";
          const transcriptStr =
            typeof transcript === "string" ? transcript : JSON.stringify(transcript);

          // Update database with booking result
          const supabase = createSupabaseClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          );

          // Update provider record with booking details
          const { error: updateProviderError } = await supabase
            .from("providers")
            .update({
              booking_confirmed: bookingConfirmed,
              booking_date: structuredData.confirmed_date,
              booking_time: structuredData.confirmed_time,
              confirmation_number: structuredData.confirmation_number,
              last_call_at: new Date().toISOString(),
              call_transcript: transcriptStr,
            })
            .eq("id", validated.providerId);

          if (updateProviderError) {
            fastify.log.error(
              { error: updateProviderError },
              "Failed to update provider record"
            );
          }

          // If booking confirmed, update service request
          if (bookingConfirmed) {
            const { error: updateRequestError } = await supabase
              .from("service_requests")
              .update({
                selected_provider_id: validated.providerId,
                status: "COMPLETED",
                final_outcome: `Appointment confirmed with ${validated.providerName} for ${structuredData.confirmed_date || "TBD"} at ${structuredData.confirmed_time || "TBD"}`,
              })
              .eq("id", validated.serviceRequestId);

            if (updateRequestError) {
              fastify.log.error(
                { error: updateRequestError },
                "Failed to update service request"
              );
            }

            // Create interaction log
            await supabase.from("interaction_logs").insert({
              request_id: validated.serviceRequestId,
              step_name: "Booking Confirmed",
              detail: `Successfully booked appointment with ${validated.providerName}. Confirmation: ${structuredData.confirmation_number || "N/A"}`,
              status: "success",
            });

            // Send confirmation notification to user
            try {
              // Fetch service request to get user phone and contact info
              const { data: request } = await supabase
                .from("service_requests")
                .select("user_phone, direct_contact_info, client_name")
                .eq("id", validated.serviceRequestId)
                .single();

              if (request?.user_phone) {
                const twilioClient = new DirectTwilioClient(fastify.log);

                if (twilioClient.isAvailable()) {
                  const confirmResult = await twilioClient.sendConfirmation({
                    userPhone: request.user_phone,
                    userName:
                      (request.direct_contact_info as any)?.user_name ||
                      request.client_name ||
                      validated.customerName,
                    providerName: validated.providerName,
                    bookingDate: structuredData.confirmed_date,
                    bookingTime: structuredData.confirmed_time,
                    confirmationNumber: structuredData.confirmation_number,
                    serviceDescription: validated.serviceDescription,
                  });

                  if (confirmResult.success) {
                    fastify.log.info(
                      { messageSid: confirmResult.messageSid },
                      "Confirmation SMS sent"
                    );

                    // Update database to track confirmation notification
                    await supabase.from("service_requests").update({
                      notification_sent_at: new Date().toISOString(),
                      notification_method: "sms",
                    }).eq("id", validated.serviceRequestId);

                    // Log the confirmation
                    await supabase.from("interaction_logs").insert({
                      request_id: validated.serviceRequestId,
                      step_name: "Confirmation SMS Sent",
                      detail: `Booking confirmation sent via SMS to ${request.user_phone}`,
                      status: "success",
                    });
                  } else {
                    fastify.log.error(
                      { error: confirmResult.error },
                      "Confirmation SMS failed"
                    );
                  }
                }
              }
            } catch (notifyError) {
              fastify.log.error(
                { error: notifyError },
                "Error sending confirmation"
              );
              // Don't fail the booking response - confirmation is best-effort
            }
          } else {
            // Booking failed - log it
            await supabase.from("interaction_logs").insert({
              request_id: validated.serviceRequestId,
              step_name: "Booking Failed",
              detail: `Failed to confirm booking with ${validated.providerName}. Outcome: ${structuredData.call_outcome || "unknown"}`,
              status: "warning",
            });
          }

          return reply.send({
            success: true,
            data: {
              bookingInitiated: true,
              bookingConfirmed,
              executionId: completedCall.id,
              bookingStatus: bookingConfirmed ? "confirmed" : structuredData.call_outcome || "call_completed",
              method: "direct_vapi",
              confirmedDate: structuredData.confirmed_date || "",
              confirmedTime: structuredData.confirmed_time || "",
              confirmationNumber: structuredData.confirmation_number || "",
            },
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
          serviceRequestId: validated.serviceRequestId,
          providerId: validated.providerId,
        });

        if (!result.success) {
          fastify.log.error({ error: result.error }, "Failed to initiate booking");
          return reply.status(500).send({
            success: false,
            error: result.error || "Failed to initiate booking call",
          });
        }

        // Update database to reflect booking in progress
        const supabase = createSupabaseClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Update service request status to BOOKING
        const { error: updateRequestError } = await supabase
          .from("service_requests")
          .update({
            status: "BOOKING",
            selected_provider_id: validated.providerId,
          })
          .eq("id", validated.serviceRequestId);

        if (updateRequestError) {
          fastify.log.error(
            { error: updateRequestError },
            "Failed to update service request status"
          );
        }

        // Update provider call status
        const { error: updateProviderError } = await supabase
          .from("providers")
          .update({
            call_status: "booking_in_progress",
            last_call_at: new Date().toISOString(),
          })
          .eq("id", validated.providerId);

        if (updateProviderError) {
          fastify.log.error(
            { error: updateProviderError },
            "Failed to update provider call status"
          );
        }

        // Create interaction log for booking attempt
        await supabase.from("interaction_logs").insert({
          request_id: validated.serviceRequestId,
          step_name: "Booking Call Started",
          detail: `Initiated booking call to ${validated.providerName} via Kestra. Execution ID: ${result.executionId}`,
          status: "in_progress",
        });

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
   * POST /api/v1/bookings/schedule-async
   * Schedule an appointment asynchronously (fire-and-forget)
   */
  fastify.post(
    "/schedule-async",
    {
      schema: {
        tags: ["bookings"],
        summary: "Schedule an appointment asynchronously",
        description:
          "Immediately returns 202 Accepted and processes the booking call in the background. Supports test mode and simulation.",
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
          202: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              data: {
                type: "object",
                properties: {
                  serviceRequestId: { type: "string" },
                  providerId: { type: "string" },
                  mode: { type: "string" },
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
        const validated = scheduleBookingSchema.parse(request.body);

        // Create Supabase client for status update
        const supabase = createSupabaseClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Immediately update service request status to BOOKING
        const { error: updateRequestError } = await supabase
          .from("service_requests")
          .update({
            status: "BOOKING",
            selected_provider_id: validated.providerId,
          })
          .eq("id", validated.serviceRequestId);

        if (updateRequestError) {
          fastify.log.error(
            { error: updateRequestError },
            "Failed to update service request status to BOOKING"
          );
          return reply.status(500).send({
            success: false,
            error: "Failed to initiate booking process",
          });
        }

        // Determine booking mode
        let bookingMode: string;
        if (LIVE_CALL_ENABLED !== true) {
          bookingMode = "simulated";
        } else if (isAdminTestMode) {
          bookingMode = "test";
        } else {
          bookingMode = "production";
        }

        fastify.log.info(
          {
            serviceRequestId: validated.serviceRequestId,
            providerId: validated.providerId,
            mode: bookingMode,
            liveCallEnabled: LIVE_CALL_ENABLED,
            adminTestMode: isAdminTestMode,
          },
          "Async booking initiated - processing in background"
        );

        // Return 202 Accepted immediately
        reply.status(202).send({
          success: true,
          message: "Booking call initiated and processing in background",
          data: {
            serviceRequestId: validated.serviceRequestId,
            providerId: validated.providerId,
            mode: bookingMode,
          },
        });

        // Process booking in background using setImmediate
        setImmediate(async () => {
          try {
            if (LIVE_CALL_ENABLED !== true) {
              // Simulate booking
              await handleSimulatedBooking(validated, supabase, fastify);
            } else if (isAdminTestMode) {
              // Use test phone instead of real provider phone
              const testPhone = ADMIN_TEST_PHONES[0]!; // Safe because isAdminTestMode checks array length
              fastify.log.info(
                { testPhone, providerPhone: validated.providerPhone },
                "Using admin test phone for booking call"
              );
              await handleRealBookingCall(validated, testPhone, supabase, fastify);
            } else {
              // Use real provider phone
              await handleRealBookingCall(
                validated,
                validated.providerPhone,
                supabase,
                fastify
              );
            }
          } catch (backgroundError) {
            // Log the error and update status back to RECOMMENDED for retry
            fastify.log.error(
              { error: backgroundError, serviceRequestId: validated.serviceRequestId },
              "Background booking process failed"
            );

            try {
              // Revert status to RECOMMENDED so user can retry
              await supabase
                .from("service_requests")
                .update({
                  status: "RECOMMENDED",
                })
                .eq("id", validated.serviceRequestId);

              // Log the error
              await supabase.from("interaction_logs").insert({
                request_id: validated.serviceRequestId,
                step_name: "Booking Error",
                detail: `Background booking failed: ${backgroundError instanceof Error ? backgroundError.message : "Unknown error"}`,
                status: "error",
              });
            } catch (recoveryError) {
              fastify.log.error(
                { error: recoveryError },
                "Failed to revert booking status after error"
              );
            }
          }
        });
      } catch (error: unknown) {
        request.log.error({ error }, "Async booking validation failed");

        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: "Validation error",
            details: error.errors,
          });
        }

        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return reply.status(500).send({
          success: false,
          error: errorMessage,
        });
      }
    }
  );

  /**
   * POST /api/v1/bookings/save-booking-result
   * Save booking result from Kestra workflow
   * Called by schedule-booking.js after call completes
   */
  const saveBookingResultSchema = z.object({
    serviceRequestId: z.string().min(1, "Service request ID is required"),
    providerId: z.string().min(1, "Provider ID is required"),
    bookingResult: z.object({
      status: z.enum(["completed", "timeout", "error"]),
      callId: z.string().optional(),
      duration: z.number().optional(),
      endedReason: z.string().optional(),
      booking_confirmed: z.boolean(),
      confirmed_date: z.string().nullable().optional(),
      confirmed_time: z.string().nullable().optional(),
      confirmation_number: z.string().nullable().optional(),
      call_outcome: z.string().optional(),
      special_instructions: z.string().nullable().optional(),
      booking_failure_reason: z.string().nullable().optional(),
      transcript: z.string().optional(),
      analysis: z.object({
        summary: z.string().optional(),
        structuredData: z.record(z.unknown()).optional(),
        successEvaluation: z.string().optional(),
      }).optional(),
      provider: z.object({
        name: z.string(),
        phone: z.string(),
      }).optional(),
      appointment: z.object({
        service: z.string().optional(),
        location: z.string().optional(),
        customer: z.string().optional(),
        customerPhone: z.string().optional(),
        preferredDate: z.string().optional(),
        preferredTime: z.string().optional(),
      }).optional(),
      error: z.string().optional(),
    }),
  });

  fastify.post(
    "/save-booking-result",
    {
      schema: {
        tags: ["bookings"],
        summary: "Save booking result from Kestra workflow",
        description:
          "Called by the Kestra schedule-booking.js script after a booking call completes. Persists the result to the database.",
        body: {
          type: "object",
          required: ["serviceRequestId", "providerId", "bookingResult"],
          properties: {
            serviceRequestId: {
              type: "string",
              description: "ID of the service request",
            },
            providerId: {
              type: "string",
              description: "ID of the provider",
            },
            bookingResult: {
              type: "object",
              description: "The booking call result from VAPI",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: { type: "string" },
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
        const validated = saveBookingResultSchema.parse(request.body);
        const { serviceRequestId, providerId, bookingResult } = validated;

        fastify.log.info(
          {
            serviceRequestId,
            providerId,
            status: bookingResult.status,
            booking_confirmed: bookingResult.booking_confirmed,
          },
          "Saving booking result from Kestra"
        );

        const supabase = createSupabaseClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const bookingConfirmed = bookingResult.booking_confirmed || false;
        const transcript = bookingResult.transcript || "";

        // Update provider record with booking details
        const { error: updateProviderError } = await supabase
          .from("providers")
          .update({
            booking_confirmed: bookingConfirmed,
            booking_date: bookingResult.confirmed_date || null,
            booking_time: bookingResult.confirmed_time || null,
            confirmation_number: bookingResult.confirmation_number || null,
            call_status: bookingConfirmed ? "booking_confirmed" : "booking_failed",
            last_call_at: new Date().toISOString(),
            call_transcript: transcript,
            call_id: bookingResult.callId || null,
          })
          .eq("id", providerId);

        if (updateProviderError) {
          fastify.log.error(
            { error: updateProviderError },
            "Failed to update provider record"
          );
        }

        // Update service request based on booking outcome
        if (bookingConfirmed) {
          const { error: updateRequestError } = await supabase
            .from("service_requests")
            .update({
              selected_provider_id: providerId,
              status: "COMPLETED",
              final_outcome: `Appointment confirmed with ${bookingResult.provider?.name || "provider"} for ${bookingResult.confirmed_date || "TBD"} at ${bookingResult.confirmed_time || "TBD"}`,
            })
            .eq("id", serviceRequestId);

          if (updateRequestError) {
            fastify.log.error(
              { error: updateRequestError },
              "Failed to update service request"
            );
          }

          // Create interaction log for successful booking
          await supabase.from("interaction_logs").insert({
            request_id: serviceRequestId,
            step_name: "Booking Confirmed",
            detail: `Successfully booked appointment with ${bookingResult.provider?.name || "provider"}. Confirmation: ${bookingResult.confirmation_number || "N/A"}. Date: ${bookingResult.confirmed_date || "TBD"} at ${bookingResult.confirmed_time || "TBD"}`,
            status: "success",
            transcript: transcript,
            call_id: bookingResult.callId || null,
          });

          // Send confirmation notification to user
          try {
            const { data: request } = await supabase
              .from("service_requests")
              .select("user_phone, direct_contact_info, client_name")
              .eq("id", serviceRequestId)
              .single();

            if (request?.user_phone) {
              const twilioClient = new DirectTwilioClient(fastify.log);

              if (twilioClient.isAvailable()) {
                const confirmResult = await twilioClient.sendConfirmation({
                  userPhone: request.user_phone,
                  userName:
                    (request.direct_contact_info as any)?.user_name ||
                    request.client_name ||
                    bookingResult.appointment?.customer,
                  providerName: bookingResult.provider?.name || "Provider",
                  bookingDate: bookingResult.confirmed_date || undefined,
                  bookingTime: bookingResult.confirmed_time || undefined,
                  confirmationNumber: bookingResult.confirmation_number || undefined,
                  serviceDescription: bookingResult.appointment?.service,
                });

                if (confirmResult.success) {
                  fastify.log.info(
                    { messageSid: confirmResult.messageSid },
                    "Confirmation SMS sent via Kestra callback"
                  );

                  // Update database to track confirmation notification
                  await supabase.from("service_requests").update({
                    notification_sent_at: new Date().toISOString(),
                    notification_method: "sms",
                  }).eq("id", serviceRequestId);

                  await supabase.from("interaction_logs").insert({
                    request_id: serviceRequestId,
                    step_name: "Confirmation SMS Sent",
                    detail: `Booking confirmation sent via SMS to ${request.user_phone}`,
                    status: "success",
                  });
                } else {
                  fastify.log.error(
                    { error: confirmResult.error },
                    "Confirmation SMS failed"
                  );
                }
              }
            }
          } catch (notifyError) {
            fastify.log.error(
              { error: notifyError },
              "Error sending confirmation from Kestra callback"
            );
          }
        } else {
          // Booking failed - update status and log
          const failureReason = bookingResult.booking_failure_reason || bookingResult.call_outcome || "unknown";

          const { error: updateRequestError } = await supabase
            .from("service_requests")
            .update({
              status: "RECOMMENDED", // Return to recommended state so user can try another provider
            })
            .eq("id", serviceRequestId);

          if (updateRequestError) {
            fastify.log.error(
              { error: updateRequestError },
              "Failed to update service request status after booking failure"
            );
          }

          await supabase.from("interaction_logs").insert({
            request_id: serviceRequestId,
            step_name: "Booking Failed",
            detail: `Failed to confirm booking with ${bookingResult.provider?.name || "provider"}. Reason: ${failureReason}`,
            status: "warning",
            transcript: transcript,
            call_id: bookingResult.callId || null,
          });
        }

        // Handle timeout and error cases specifically
        if (bookingResult.status === "timeout") {
          await supabase.from("interaction_logs").insert({
            request_id: serviceRequestId,
            step_name: "Booking Call Timeout",
            detail: `Booking call to ${bookingResult.provider?.name || "provider"} timed out`,
            status: "error",
          });
        } else if (bookingResult.status === "error") {
          await supabase.from("interaction_logs").insert({
            request_id: serviceRequestId,
            step_name: "Booking Call Error",
            detail: `Booking call failed with error: ${bookingResult.error || "Unknown error"}`,
            status: "error",
          });
        }

        return reply.send({
          success: true,
          message: bookingConfirmed
            ? "Booking confirmed and saved"
            : "Booking result saved (not confirmed)",
        });
      } catch (error: unknown) {
        request.log.error({ error }, "Failed to save booking result");

        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            success: false,
            error: `Validation error: ${error.errors.map((e) => e.message).join(", ")}`,
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
