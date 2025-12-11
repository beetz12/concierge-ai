/**
 * Notifications Service Module
 * Exports notification-related services and types
 */

export { DirectTwilioClient } from "./direct-twilio.client.js";
export type {
  NotificationRequest,
  NotificationResult,
  ProviderRecommendation,
} from "./direct-twilio.client.js";

export { UserNotificationService } from "./user-notification.service.js";
export type {
  UserNotificationRequest,
  UserNotificationResult,
} from "../vapi/user-notification-assistant-config.js";
