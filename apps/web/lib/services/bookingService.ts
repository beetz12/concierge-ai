/**
 * Booking Service
 * Handles notifications and appointment scheduling
 */

// API base URLs - uses Next.js rewrite to proxy to backend
const NOTIFICATIONS_API = "/api/v1/notifications";
const BOOKINGS_API = "/api/v1/bookings";

/**
 * Notification request parameters
 */
export interface NotifyUserRequest {
  userPhone: string;
  userName?: string;
  requestUrl?: string;
  serviceRequestId: string;
  providers: Array<{
    name: string;
    earliestAvailability: string;
  }>;
}

/**
 * Notification response
 */
export interface NotifyUserResponse {
  success: boolean;
  data?: {
    notificationSent: boolean;
    executionId?: string;
    method: string;
    reason?: string;
  };
  error?: string;
}

/**
 * Booking request parameters
 */
export interface ScheduleBookingRequest {
  serviceRequestId: string;
  providerId: string;
  providerPhone: string;
  providerName: string;
  serviceDescription?: string;
  preferredDate?: string;
  preferredTime?: string;
  customerName?: string;
  customerPhone?: string;
  location?: string;
}

/**
 * Booking response
 */
export interface ScheduleBookingResponse {
  success: boolean;
  data?: {
    bookingInitiated: boolean;
    executionId?: string;
    bookingStatus: string;
    method: string;
  };
  error?: string;
}

/**
 * System status response
 */
export interface SystemStatusResponse {
  kestraEnabled: boolean;
  kestraHealthy: boolean;
  twilioConfigured?: boolean;
  vapiConfigured?: boolean;
}

/**
 * Send SMS notification to user with provider recommendations
 */
export async function notifyUser(
  request: NotifyUserRequest
): Promise<NotifyUserResponse> {
  try {
    const response = await fetch(`${NOTIFICATIONS_API}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
      };
    }

    return data;
  } catch (error) {
    console.error("Failed to send notification:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Schedule appointment with selected provider
 */
export async function scheduleBooking(
  request: ScheduleBookingRequest
): Promise<ScheduleBookingResponse> {
  try {
    const response = await fetch(`${BOOKINGS_API}/schedule`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP ${response.status}`,
      };
    }

    return data;
  } catch (error) {
    console.error("Failed to schedule booking:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check notification system status
 */
export async function getNotificationStatus(): Promise<SystemStatusResponse | null> {
  try {
    const response = await fetch(`${NOTIFICATIONS_API}/status`);
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error("Failed to get notification status:", error);
    return null;
  }
}

/**
 * Check booking system status
 */
export async function getBookingStatus(): Promise<SystemStatusResponse | null> {
  try {
    const response = await fetch(`${BOOKINGS_API}/status`);
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    console.error("Failed to get booking status:", error);
    return null;
  }
}
