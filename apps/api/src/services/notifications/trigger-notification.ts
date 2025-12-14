/**
 * Trigger Notification Service
 *
 * Coordinates user notifications after recommendations are generated.
 * Supports both phone calls (VAPI) and SMS (Twilio) based on user preference.
 */

import { createClient } from "@supabase/supabase-js";
import type { FastifyBaseLogger } from "fastify";
import { DirectTwilioClient } from "./direct-twilio.client.js";
import { UserNotificationService } from "./user-notification.service.js";

export interface TriggerNotificationParams {
  serviceRequestId: string;
  userPhone: string;
  userName?: string;
  preferredContact: "phone" | "text";
  serviceNeeded?: string;
  location?: string;
  providers: Array<{
    name: string;
    earliestAvailability: string;
  }>;
}

export interface TriggerNotificationResult {
  success: boolean;
  method: "vapi" | "sms" | "already_sent" | "skipped";
  messageSid?: string;
  callId?: string;
  error?: string;
}

/**
 * Trigger user notification after recommendations are ready
 * Handles deduplication, sends via preferred contact method, and updates database
 */
export async function triggerUserNotification(
  params: TriggerNotificationParams,
  logger: FastifyBaseLogger
): Promise<TriggerNotificationResult> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    logger.error({}, "[TriggerNotification] Supabase credentials not configured");
    return {
      success: false,
      method: "skipped",
      error: "Supabase not configured",
    };
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check if notification was already sent (deduplication)
  const { data: request, error: fetchError } = await supabase
    .from("service_requests")
    .select("notification_sent_at, notification_method")
    .eq("id", params.serviceRequestId)
    .single();

  if (fetchError) {
    logger.error(
      { error: fetchError, serviceRequestId: params.serviceRequestId },
      "[TriggerNotification] Failed to fetch service request"
    );
    return {
      success: false,
      method: "skipped",
      error: "Failed to fetch service request",
    };
  }

  if (request?.notification_sent_at) {
    logger.info(
      {
        serviceRequestId: params.serviceRequestId,
        sentAt: request.notification_sent_at,
        method: request.notification_method,
      },
      "[TriggerNotification] Notification already sent, skipping"
    );
    return {
      success: true,
      method: "already_sent",
    };
  }

  // No providers to recommend
  if (!params.providers || params.providers.length === 0) {
    logger.warn(
      { serviceRequestId: params.serviceRequestId },
      "[TriggerNotification] No providers to notify about, skipping"
    );
    return {
      success: false,
      method: "skipped",
      error: "No providers to recommend",
    };
  }

  let result: TriggerNotificationResult;

  if (params.preferredContact === "phone") {
    // Use VAPI phone call
    result = await sendVapiNotification(params, logger);
  } else {
    // Use SMS (default)
    result = await sendSmsNotification(params, logger);
  }

  // Update database with notification status if successful
  if (result.success) {
    const { error: updateError } = await supabase
      .from("service_requests")
      .update({
        notification_sent_at: new Date().toISOString(),
        notification_method: result.method,
      })
      .eq("id", params.serviceRequestId);

    if (updateError) {
      logger.error(
        { error: updateError, serviceRequestId: params.serviceRequestId },
        "[TriggerNotification] Failed to update notification status"
      );
    } else {
      logger.info(
        {
          serviceRequestId: params.serviceRequestId,
          method: result.method,
        },
        "[TriggerNotification] Notification status updated in database"
      );
    }
  }

  return result;
}

/**
 * Send notification via VAPI phone call
 */
async function sendVapiNotification(
  params: TriggerNotificationParams,
  logger: FastifyBaseLogger
): Promise<TriggerNotificationResult> {
  const notificationService = new UserNotificationService(logger);

  if (!notificationService.isAvailable()) {
    logger.warn(
      { serviceRequestId: params.serviceRequestId },
      "[TriggerNotification] VAPI not available, falling back to SMS"
    );
    return sendSmsNotification(params, logger);
  }

  try {
    logger.info(
      {
        userPhone: params.userPhone,
        serviceRequestId: params.serviceRequestId,
        providerCount: params.providers.length,
      },
      "[TriggerNotification] Sending VAPI phone notification"
    );

    const result = await notificationService.callUser({
      userPhone: params.userPhone,
      userName: params.userName,
      serviceRequestId: params.serviceRequestId,
      serviceNeeded: params.serviceNeeded || "Service Request",
      location: params.location || "",
      recommendations: params.providers.map((p, index) => ({
        rank: index + 1,
        providerName: p.name,
        availability: p.earliestAvailability,
      })),
    });

    if (result.success) {
      return {
        success: true,
        method: "vapi",
        callId: result.callId,
      };
    }

    // If VAPI call failed, fall back to SMS
    logger.warn(
      { error: result.error, serviceRequestId: params.serviceRequestId },
      "[TriggerNotification] VAPI call failed, falling back to SMS"
    );
    return sendSmsNotification(params, logger);
  } catch (error) {
    logger.error(
      { error, serviceRequestId: params.serviceRequestId },
      "[TriggerNotification] VAPI notification error, falling back to SMS"
    );
    return sendSmsNotification(params, logger);
  }
}

/**
 * Send notification via SMS
 */
async function sendSmsNotification(
  params: TriggerNotificationParams,
  logger: FastifyBaseLogger
): Promise<TriggerNotificationResult> {
  const twilioClient = new DirectTwilioClient(logger);

  if (!twilioClient.isAvailable()) {
    logger.warn(
      { serviceRequestId: params.serviceRequestId },
      "[TriggerNotification] Twilio not available, skipping notification"
    );
    return {
      success: false,
      method: "skipped",
      error: "Twilio not configured",
    };
  }

  try {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const requestUrl = `${frontendUrl}/request/${params.serviceRequestId}`;

    logger.info(
      {
        userPhone: params.userPhone,
        serviceRequestId: params.serviceRequestId,
        providerCount: params.providers.length,
      },
      "[TriggerNotification] Sending SMS notification"
    );

    const result = await twilioClient.sendNotification({
      userPhone: params.userPhone,
      userName: params.userName,
      providers: params.providers.map((p) => ({
        name: p.name,
        earliestAvailability: p.earliestAvailability,
      })),
      requestUrl,
    });

    return {
      success: result.success,
      method: "sms",
      messageSid: result.messageSid,
      error: result.error,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(
      { error: errorMessage, serviceRequestId: params.serviceRequestId },
      "[TriggerNotification] SMS notification error"
    );
    return {
      success: false,
      method: "sms",
      error: errorMessage,
    };
  }
}
