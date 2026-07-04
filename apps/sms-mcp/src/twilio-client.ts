/**
 * Twilio SMS Client — standalone, no backend API required.
 *
 * Uses lazy initialization pattern (getConfig / getClient) so that
 * environment variables are read at request time, not at module load.
 * All logging goes to stderr because stdout is reserved for MCP JSON-RPC.
 */

import twilio from "twilio";
import type { NormalizedMessage } from "./types.js";

interface TwilioConfig {
  accountSid: string | undefined;
  authToken: string | undefined;
  fromNumber: string;
  isConfigured: boolean;
}

export class TwilioClient {
  private client: twilio.Twilio | null = null;
  private lastConfigured: boolean | null = null;

  // ── lazy helpers ──────────────────────────────────────────────

  private getConfig(): TwilioConfig {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER ?? "";
    const isConfigured = !!(accountSid && authToken && fromNumber);
    return { accountSid, authToken, fromNumber, isConfigured };
  }

  private getClient(): twilio.Twilio {
    const config = this.getConfig();

    if (this.lastConfigured !== config.isConfigured) {
      console.error(
        `[sms-mcp] Twilio ${config.isConfigured ? "configured" : "NOT configured"} ` +
          `(sid=${!!config.accountSid}, token=${!!config.authToken}, from=${!!config.fromNumber})`
      );
      this.lastConfigured = config.isConfigured;
    }

    if (!config.isConfigured) {
      throw new Error(
        "Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER."
      );
    }

    if (!this.client) {
      this.client = twilio(config.accountSid!, config.authToken!);
      console.error("[sms-mcp] Twilio client initialized");
    }

    return this.client;
  }

  // ── public API ────────────────────────────────────────────────

  async sendMessage(
    to: string,
    body: string,
    mediaUrl?: string[]
  ): Promise<{
    success: boolean;
    messageSid?: string;
    messageStatus?: string;
    error?: string;
  }> {
    try {
      const client = this.getClient();
      const config = this.getConfig();

      console.error(`[sms-mcp] Sending SMS to ${to} (${body.length} chars)`);

      const message = await client.messages.create({
        to,
        body,
        from: config.fromNumber,
        ...(mediaUrl?.length ? { mediaUrl } : {}),
      });

      console.error(`[sms-mcp] Sent messageSid=${message.sid} status=${message.status}`);

      return {
        success: true,
        messageSid: message.sid,
        messageStatus: message.status,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[sms-mcp] sendMessage error: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async getMessageStatus(messageSid: string): Promise<{
    success: boolean;
    messageSid: string;
    status: string;
    to: string;
    from: string;
    dateSent: string | null;
    errorCode: number | null;
    errorMessage: string | null;
  }> {
    try {
      const client = this.getClient();
      const msg = await client.messages(messageSid).fetch();

      return {
        success: true,
        messageSid: msg.sid,
        status: msg.status,
        to: msg.to,
        from: msg.from,
        dateSent: msg.dateSent ? msg.dateSent.toISOString() : null,
        errorCode: msg.errorCode ?? null,
        errorMessage: msg.errorMessage ?? null,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[sms-mcp] getMessageStatus error: ${errorMessage}`);
      return {
        success: false,
        messageSid,
        status: "error",
        to: "",
        from: "",
        dateSent: null,
        errorCode: null,
        errorMessage,
      };
    }
  }

  async listMessages(phone: string, limit = 20): Promise<NormalizedMessage[]> {
    const client = this.getClient();
    const config = this.getConfig();

    console.error(`[sms-mcp] Listing messages with ${phone} (limit=${limit})`);

    const [inbound, outbound] = await Promise.all([
      client.messages.list({ to: config.fromNumber, from: phone, limit }),
      client.messages.list({ from: config.fromNumber, to: phone, limit }),
    ]);

    const seen = new Set<string>();
    const allMessages = [...inbound, ...outbound].filter((msg) => {
      if (seen.has(msg.sid)) return false;
      seen.add(msg.sid);
      return true;
    });

    allMessages.sort(
      (a, b) => (b.dateSent?.getTime() ?? 0) - (a.dateSent?.getTime() ?? 0)
    );

    console.error(`[sms-mcp] Found ${allMessages.length} messages with ${phone}`);

    return allMessages.map((msg) => ({
      id: msg.sid,
      from: msg.from,
      to: msg.to,
      body: msg.body,
      dateSent: msg.dateSent?.toISOString() ?? null,
      direction: (msg.to === config.fromNumber ? "inbound" : "outbound") as
        | "inbound"
        | "outbound",
      status: msg.status,
    }));
  }

  async searchMessages(query: string, limit = 250): Promise<NormalizedMessage[]> {
    const client = this.getClient();
    const config = this.getConfig();

    console.error(`[sms-mcp] Searching messages for "${query}" (limit=${limit})`);

    const [inbound, outbound] = await Promise.all([
      client.messages.list({ to: config.fromNumber, limit }),
      client.messages.list({ from: config.fromNumber, limit }),
    ]);

    const seen = new Set<string>();
    const allMessages = [...inbound, ...outbound].filter((msg) => {
      if (seen.has(msg.sid)) return false;
      seen.add(msg.sid);
      return true;
    });

    const qLower = query.toLowerCase();
    const matching = allMessages.filter(
      (msg) => msg.body && msg.body.toLowerCase().includes(qLower)
    );

    matching.sort(
      (a, b) => (b.dateSent?.getTime() ?? 0) - (a.dateSent?.getTime() ?? 0)
    );

    console.error(`[sms-mcp] Found ${matching.length} matches for "${query}"`);

    return matching.map((msg) => ({
      id: msg.sid,
      from: msg.from,
      to: msg.to,
      body: msg.body,
      dateSent: msg.dateSent?.toISOString() ?? null,
      direction: (msg.to === config.fromNumber ? "inbound" : "outbound") as
        | "inbound"
        | "outbound",
      status: msg.status,
    }));
  }
}
