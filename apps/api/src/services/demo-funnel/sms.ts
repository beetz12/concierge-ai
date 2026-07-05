/**
 * OTP SMS delivery for the demo funnel.
 *
 * Wraps {@link DirectTwilioClient.sendRawSms}. When DEMO_MODE=true or Twilio
 * is not configured it NEVER attempts network: the code is logged at info
 * level and the result is marked `simulated: true` so the route can tell the
 * UI (and tests) that no real SMS left the building.
 */

import { DirectTwilioClient } from "../notifications/direct-twilio.client.js";
import { isDemoMode } from "../../config/demo.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface OtpSmsResult {
  sent: boolean;
  simulated?: boolean;
  error?: string;
}

export interface OtpSmsSender {
  sendOtp(to: string, code: string): Promise<OtpSmsResult>;
}

const otpMessage = (code: string): string =>
  `${code} is your Concierge AI demo verification code. It expires in 10 minutes.`;

export class TwilioOtpSmsSender implements OtpSmsSender {
  private readonly twilio: DirectTwilioClient;

  constructor(private readonly logger: Logger) {
    this.twilio = new DirectTwilioClient(logger);
  }

  async sendOtp(to: string, code: string): Promise<OtpSmsResult> {
    // No network in DEMO_MODE or without Twilio credentials: surface the code
    // in the logs so a local tester can complete the funnel end to end.
    if (isDemoMode() || !this.twilio.isAvailable()) {
      this.logger.info(
        { event: "demo_funnel_otp_simulated", to, code },
        "Simulated OTP SMS (DEMO_MODE or Twilio not configured)",
      );
      return { sent: true, simulated: true };
    }

    const result = await this.twilio.sendRawSms({ to, body: otpMessage(code) });
    if (!result.success) {
      return { sent: false, error: result.error };
    }
    return { sent: true };
  }
}
