/**
 * Direct Twilio Client
 * Makes direct API calls to Twilio without Kestra orchestration
 * Used as fallback when Kestra is unavailable (e.g., in Railway production)
 */

import twilio from "twilio";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

interface ProviderRecommendation {
  name: string;
  earliestAvailability: string;
}

interface NotificationRequest {
  userPhone: string;
  userName?: string;
  requestUrl?: string;
  providers: ProviderRecommendation[];
}

interface NotificationResult {
  success: boolean;
  messageSid?: string;
  messageStatus?: string;
  error?: string;
  method: "direct_twilio" | "kestra" | "skipped";
}

export class DirectTwilioClient {
  private client: twilio.Twilio | null = null;
  private fromNumber: string;
  private isConfigured: boolean;

  constructor(private logger: Logger) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER || "";

    this.isConfigured = !!(accountSid && authToken && this.fromNumber);

    if (this.isConfigured) {
      this.client = twilio(accountSid, authToken);
      this.logger.info({}, "DirectTwilioClient initialized");
    } else {
      this.logger.warn(
        {},
        "Twilio credentials not configured - SMS sending disabled"
      );
    }
  }

  /**
   * Check if Twilio is properly configured
   */
  isAvailable(): boolean {
    return this.isConfigured && this.client !== null;
  }

  /**
   * Send an SMS notification to the user with provider recommendations
   */
  async sendNotification(
    request: NotificationRequest
  ): Promise<NotificationResult> {
    if (!this.isAvailable() || !this.client) {
      this.logger.warn({}, "Twilio not configured, skipping SMS");
      return {
        success: false,
        error: "Twilio not configured",
        method: "direct_twilio",
      };
    }

    const messageBody = this.formatSmsMessage(
      request.userName || "Customer",
      request.providers,
      request.requestUrl
    );

    this.logger.info(
      {
        to: request.userPhone,
        userName: request.userName,
        providerCount: request.providers.length,
      },
      "Sending SMS notification via Twilio"
    );

    try {
      const message = await this.client.messages.create({
        body: messageBody,
        to: request.userPhone,
        from: this.fromNumber,
      });

      this.logger.info(
        {
          messageSid: message.sid,
          status: message.status,
          to: request.userPhone,
        },
        "SMS sent successfully"
      );

      return {
        success: true,
        messageSid: message.sid,
        messageStatus: message.status,
        method: "direct_twilio",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        { error: errorMessage, to: request.userPhone },
        "Failed to send SMS"
      );

      return {
        success: false,
        error: errorMessage,
        method: "direct_twilio",
      };
    }
  }

  /**
   * Format the SMS message with top 3 provider recommendations
   */
  private formatSmsMessage(
    userName: string,
    providers: ProviderRecommendation[],
    requestUrl?: string
  ): string {
    let message = `Hi ${userName}! AI Concierge found your top providers:\n\n`;

    if (providers.length === 0) {
      message += "No providers matched your criteria.\n";
    } else {
      providers.slice(0, 3).forEach((provider, index) => {
        const name = provider.name || "Unknown";
        const availability =
          provider.earliestAvailability || "Contact for availability";
        message += `${index + 1}. ${name} - ${availability}\n`;
      });
    }

    message += `\nReply 1, 2, or 3 to book`;

    if (requestUrl) {
      message += `, or visit:\n${requestUrl}`;
    }

    return message;
  }
}

export type { NotificationRequest, NotificationResult, ProviderRecommendation };
