import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { TwilioClient } from "./twilio-client.js";

const server = new McpServer(
  { name: "sms-mcp", version: "0.1.0" },
  { capabilities: { logging: {} } },
);

const twilioClient = new TwilioClient();

const asToolResult = (
  text: string,
  structuredContent?: Record<string, unknown>,
): CallToolResult => ({
  content: [{ type: "text", text }],
  ...(structuredContent ? { structuredContent } : {}),
});

// ── send_sms ──────────────────────────────────────────────────

server.registerTool(
  "send_sms",
  {
    title: "Send SMS",
    description:
      "Send a text message (SMS/MMS) to a phone number via Twilio. Returns a message SID for delivery tracking.",
    inputSchema: {
      to: z.string().regex(/^\+1\d{10}$/, "E.164 US number required (e.g. +12125551234)"),
      body: z.string().min(1).max(1600),
      mediaUrl: z.array(z.string().url()).max(10).optional(),
    },
  },
  async (input) => {
    const result = await twilioClient.sendMessage(input.to, input.body, input.mediaUrl);

    if (!result.success) {
      return asToolResult(`SMS failed: ${result.error ?? "unknown error"}`);
    }

    return asToolResult(
      `SMS sent to ${input.to}. messageSid=${result.messageSid}, status=${result.messageStatus}`,
      result as Record<string, unknown>,
    );
  },
);

// ── check_sms_status ──────────────────────────────────────────

server.registerTool(
  "check_sms_status",
  {
    title: "Check SMS Status",
    description:
      "Check delivery status of a sent SMS by its Twilio message SID.",
    inputSchema: {
      messageSid: z.string(),
    },
  },
  async (input) => {
    const result = await twilioClient.getMessageStatus(input.messageSid);

    return asToolResult(
      `Message ${input.messageSid}: status=${result.status}, to=${result.to}`,
      result as Record<string, unknown>,
    );
  },
);

// ── read_sms_replies ──────────────────────────────────────────

server.registerTool(
  "read_sms_replies",
  {
    title: "Read SMS Replies",
    description:
      "Read SMS conversation with a phone number. Returns both sent and received messages sorted by date, so you can see replies to messages you sent.",
    inputSchema: {
      phone: z.string().regex(/^\+\d{1,15}$/, "E.164 phone number required"),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  async (input) => {
    const messages = await twilioClient.listMessages(input.phone, input.limit);
    const inbound = messages.filter((m) => m.direction === "inbound");
    const latest = messages[0];

    const summary = latest
      ? `${messages.length} messages (${inbound.length} inbound). Latest: [${latest.direction}] ${latest.body.substring(0, 80)}${latest.body.length > 80 ? "..." : ""}`
      : "No messages found.";

    return asToolResult(summary, { messages } as unknown as Record<string, unknown>);
  },
);

// ── search_sms ────────────────────────────────────────────────

server.registerTool(
  "search_sms",
  {
    title: "Search SMS",
    description:
      "Search all SMS messages by text content. Returns matching messages across all conversations.",
    inputSchema: {
      query: z.string(),
      limit: z.number().int().min(1).max(500).optional(),
    },
  },
  async (input) => {
    const messages = await twilioClient.searchMessages(input.query, input.limit);
    const latest = messages[0];

    const summary = latest
      ? `${messages.length} matches for "${input.query}". Latest: [${latest.direction}] ${latest.body.substring(0, 80)}${latest.body.length > 80 ? "..." : ""}`
      : `No messages matching "${input.query}".`;

    return asToolResult(summary, { messages } as unknown as Record<string, unknown>);
  },
);

// ── main ──────────────────────────────────────────────────────

const main = async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("sms-mcp running on stdio");
};

main().catch((error) => {
  console.error("Fatal error in sms-mcp:", error);
  process.exit(1);
});
