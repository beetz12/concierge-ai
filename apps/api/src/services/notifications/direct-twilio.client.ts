/**
 * Direct Twilio Client
 * Makes direct API calls to Twilio without Kestra orchestration
 * Used as fallback when Kestra is unavailable (e.g., in Railway production)
 *
 * IMPORTANT: Uses lazy initialization pattern for Railway compatibility.
 * Environment variables are read at request time, not construction time,
 * to handle Railway's containerized environment where env vars may not
 * be available during module initialization.
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
  score?: number;
  rating?: number;
  reviewCount?: number;
  estimatedRate?: string;
  reasoning?: string;
}

interface NotificationRequest {
  userPhone: string;
  userName?: string;
  requestUrl?: string;
  providers: ProviderRecommendation[];
  /** AI's overall recommendation explaining why top provider was chosen */
  overallRecommendation?: string;
}

interface NotificationResult {
  success: boolean;
  messageSid?: string;
  messageStatus?: string;
  error?: string;
  method: "direct_twilio" | "kestra" | "skipped";
}

interface ConfirmationRequest {
  userPhone: string;
  userName?: string;
  providerName: string;
  bookingDate?: string;
  bookingTime?: string;
  confirmationNumber?: string;
  serviceDescription?: string;
}

/**
 * Internal configuration interface for lazy-loaded credentials
 */
interface TwilioConfig {
  accountSid: string | undefined;
  authToken: string | undefined;
  fromNumber: string;
  isConfigured: boolean;
}

export class DirectTwilioClient {
  // Client is lazily initialized on first use
  private client: twilio.Twilio | null = null;
  private lastConfig: TwilioConfig | null = null;

  constructor(private logger: Logger) {
    // NOTE: We intentionally do NOT read env vars here.
    // This is the lazy initialization pattern for Railway compatibility.
    // Env vars are read at request time via getConfig().
    this.logger.debug({}, "DirectTwilioClient constructed (lazy init)");
  }

  /**
   * Get Twilio configuration from environment variables.
   * Called at request time to ensure Railway env vars are available.
   * Supports both TWILIO_PHONE_NUMBER and TWILIO_PHONE_NO for compatibility.
   */
  private getConfig(): TwilioConfig {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    // Support both variable names for compatibility
    const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NO || "";

    const isConfigured = !!(accountSid && authToken && fromNumber);

    return {
      accountSid,
      authToken,
      fromNumber,
      isConfigured,
    };
  }

  /**
   * Get or create Twilio client with current environment configuration.
   * Uses lazy initialization - client is created on first request.
   */
  private getClient(): twilio.Twilio | null {
    const config = this.getConfig();

    // Log configuration status (helpful for debugging Railway issues)
    if (!this.lastConfig || this.lastConfig.isConfigured !== config.isConfigured) {
      this.logger.info(
        {
          isConfigured: config.isConfigured,
          hasAccountSid: !!config.accountSid,
          hasAuthToken: !!config.authToken,
          hasFromNumber: !!config.fromNumber,
          fromNumberSource: process.env.TWILIO_PHONE_NUMBER
            ? "TWILIO_PHONE_NUMBER"
            : process.env.TWILIO_PHONE_NO
              ? "TWILIO_PHONE_NO"
              : "none",
        },
        config.isConfigured
          ? "DirectTwilioClient: Credentials configured successfully"
          : "DirectTwilioClient: Missing Twilio credentials"
      );
      this.lastConfig = config;
    }

    if (!config.isConfigured) {
      return null;
    }

    // Create client if not exists or if credentials changed
    if (!this.client) {
      this.client = twilio(config.accountSid!, config.authToken!);
      this.logger.info({}, "DirectTwilioClient: Twilio client initialized");
    }

    return this.client;
  }

  /**
   * Check if Twilio is properly configured.
   * Reads env vars at check time for Railway compatibility.
   */
  isAvailable(): boolean {
    const config = this.getConfig();
    return config.isConfigured;
  }

  /**
   * Send an SMS notification to the user with provider recommendations
   */
  async sendNotification(
    request: NotificationRequest
  ): Promise<NotificationResult> {
    const config = this.getConfig();
    const client = this.getClient();

    if (!client || !config.isConfigured) {
      this.logger.warn(
        {
          hasAccountSid: !!config.accountSid,
          hasAuthToken: !!config.authToken,
          hasFromNumber: !!config.fromNumber,
        },
        "Twilio not configured, skipping SMS"
      );
      return {
        success: false,
        error: "Twilio not configured",
        method: "direct_twilio",
      };
    }

    const messageBody = this.formatSmsMessage(
      request.userName || "Customer",
      request.providers,
      request.overallRecommendation
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
      const message = await client.messages.create({
        body: messageBody,
        to: request.userPhone,
        from: config.fromNumber,
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
   * Send a booking confirmation SMS notification to the user
   */
  async sendConfirmation(
    request: ConfirmationRequest
  ): Promise<NotificationResult> {
    const config = this.getConfig();
    const client = this.getClient();

    if (!client || !config.isConfigured) {
      this.logger.warn(
        {
          hasAccountSid: !!config.accountSid,
          hasAuthToken: !!config.authToken,
          hasFromNumber: !!config.fromNumber,
        },
        "Twilio not configured, skipping confirmation SMS"
      );
      return {
        success: false,
        error: "Twilio not configured",
        method: "direct_twilio",
      };
    }

    const messageBody = this.formatConfirmationMessage(request);

    this.logger.info(
      {
        to: request.userPhone,
        userName: request.userName,
        provider: request.providerName,
      },
      "Sending booking confirmation SMS via Twilio"
    );

    try {
      const message = await client.messages.create({
        body: messageBody,
        to: request.userPhone,
        from: config.fromNumber,
      });

      this.logger.info(
        {
          messageSid: message.sid,
          status: message.status,
          to: request.userPhone,
        },
        "Confirmation SMS sent successfully"
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
        "Failed to send confirmation SMS"
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
   * Creates an urgent, detailed message that encourages immediate action
   */
  private formatSmsMessage(
    userName: string,
    providers: ProviderRecommendation[],
    overallRecommendation?: string
  ): string {
    if (providers.length === 0) {
      return `Hi ${userName}, unfortunately no providers matched your criteria. Please try again with different requirements. - AI Concierge`;
    }

    // Start with urgency
    let message = `ACTION NEEDED: ${userName}, your AI Concierge found ${providers.length} qualified provider${providers.length > 1 ? "s" : ""}!\n\n`;

    // Feature the top recommendation prominently
    const topProvider = providers[0]!; // Safe: we checked providers.length > 0 above
    message += `TOP PICK: ${topProvider.name}\n`;

    // Add rating if available
    if (topProvider.rating) {
      const stars = "★".repeat(Math.round(topProvider.rating));
      message += `${stars} ${topProvider.rating.toFixed(1)}`;
      if (topProvider.reviewCount) {
        message += ` (${topProvider.reviewCount} reviews)`;
      }
      message += `\n`;
    }

    // Add availability
    message += `Available: ${topProvider.earliestAvailability || "Contact for details"}\n`;

    // Add estimated rate if available
    if (topProvider.estimatedRate) {
      message += `Est. Rate: ${topProvider.estimatedRate}\n`;
    }

    // Add AI reasoning for top pick
    if (topProvider.reasoning) {
      // Truncate reasoning to keep SMS concise
      const shortReason = topProvider.reasoning.length > 100
        ? topProvider.reasoning.substring(0, 97) + "..."
        : topProvider.reasoning;
      message += `Why: ${shortReason}\n`;
    }

    // Add other options if available
    if (providers.length > 1) {
      message += `\nOTHER OPTIONS:\n`;
      providers.slice(1, 3).forEach((provider, index) => {
        let providerLine = `${index + 2}. ${provider.name}`;
        if (provider.rating) {
          providerLine += ` (${provider.rating.toFixed(1)}★)`;
        }
        providerLine += ` - ${provider.earliestAvailability || "Contact"}\n`;
        message += providerLine;
      });
    }

    // Add AI's overall recommendation if available
    if (overallRecommendation) {
      // Truncate to keep message manageable
      const shortOverall = overallRecommendation.length > 120
        ? overallRecommendation.substring(0, 117) + "..."
        : overallRecommendation;
      message += `\nAI RECOMMENDATION: ${shortOverall}\n`;
    }

    // Strong call to action with urgency - dynamic based on provider count
    if (providers.length === 1) {
      // Single provider: use YES keyword for cleaner UX
      message += `\nReply YES to book ${topProvider.name} now!\n\n- AI Concierge`;
    } else if (providers.length === 2) {
      message += `\nReply 1 or 2 NOW to book before slots fill up!\n\n- AI Concierge`;
    } else {
      message += `\nReply 1, 2, or 3 NOW to book before slots fill up!\n\n- AI Concierge`;
    }

    return message;
  }

  /**
   * Format the booking confirmation SMS message
   */
  private formatConfirmationMessage(request: ConfirmationRequest): string {
    const {
      userName,
      providerName,
      bookingDate,
      bookingTime,
      confirmationNumber,
    } = request;

    let message = `Hi${userName ? ` ${userName}` : ""}! Great news - your appointment is confirmed!\n\n`;
    message += `Provider: ${providerName}\n`;

    if (bookingDate) {
      message += `Date: ${bookingDate}\n`;
    }
    if (bookingTime) {
      message += `Time: ${bookingTime}\n`;
    }
    if (confirmationNumber) {
      message += `Confirmation #: ${confirmationNumber}\n`;
    }

    message += `\nWe'll send you a reminder before your appointment.\n\n- AI Concierge`;

    return message;
  }
}

export type {
  NotificationRequest,
  NotificationResult,
  ProviderRecommendation,
  ConfirmationRequest,
};
