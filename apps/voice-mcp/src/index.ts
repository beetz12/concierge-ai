import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { VoiceApiClient, inputSchemas, summarizeStatus } from "./client.js";

const server = new McpServer(
  { name: "concierge-voice-mcp", version: "0.1.0" },
  { capabilities: { logging: {} } },
);

const client = new VoiceApiClient();

const asToolResult = (
  text: string,
  structuredContent?: Record<string, unknown>,
): CallToolResult => ({
  content: [{ type: "text", text }],
  ...(structuredContent ? { structuredContent } : {}),
});

server.registerTool(
  "preview_call",
  {
    title: "Preview Call",
    description:
      "Preview a contractor call plan before dispatching a live call through the concierge voice API.",
    inputSchema: inputSchemas.previewCall,
  },
  async (input) => {
    const result = await client.previewCall(input);
    return asToolResult(
      `Preview ready for ${input.contractorName}. Opener: ${
        typeof result === "object" && result && "preview" in result && result.preview &&
        typeof result.preview === "object" && "openingPrompt" in result.preview
          ? String(result.preview.openingPrompt)
          : "unavailable"
      }`,
      result as Record<string, unknown>,
    );
  },
);

server.registerTool(
  "dispatch_call",
  {
    title: "Dispatch Call",
    description:
      "Dispatch a live contractor call through the concierge voice API and return the session identifiers.",
    inputSchema: inputSchemas.dispatchCall,
  },
  async (input) => {
    const result = await client.dispatchCall(input);
    const sessionId =
      typeof result === "object" && result && "sessionId" in result ? String(result.sessionId) : "unknown";
    const dispatchId =
      typeof result === "object" && result && "dispatchId" in result ? String(result.dispatchId) : "unknown";
    return asToolResult(
      `Call dispatched for ${input.contractorName}. sessionId=${sessionId}, dispatchId=${dispatchId}`,
      result as Record<string, unknown>,
    );
  },
);

server.registerTool(
  "get_call_status",
  {
    title: "Get Call Status",
    description:
      "Fetch the normalized status, events, and result for a contractor call session.",
    inputSchema: inputSchemas.getCallStatus,
  },
  async (input) => {
    const result = await client.getCallStatus(input);
    return asToolResult(
      `Call ${input.sessionId}: ${summarizeStatus(result)}`,
      result as Record<string, unknown>,
    );
  },
);

server.registerTool(
  "get_call_artifacts",
  {
    title: "Get Call Artifacts",
    description:
      "Fetch transcript and artifact paths for a completed contractor call session.",
    inputSchema: inputSchemas.getCallArtifacts,
  },
  async (input) => {
    const result = await client.getCallArtifacts(input);
    return asToolResult(
      `Artifacts for ${input.sessionId}: transcriptPath=${result.result.transcriptPath || "none"}, recordingPath=${result.result.recordingPath || "none"}`,
      result as Record<string, unknown>,
    );
  },
);

server.registerTool(
  "create_browser_monitor",
  {
    title: "Create Browser Monitor",
    description:
      "Create a LiveKit browser token for live call monitoring. Use canPublishAudio=false for listen-only.",
    inputSchema: inputSchemas.createBrowserMonitor,
  },
  async (input) => {
    const result = await client.createBrowserMonitor(input);
    return asToolResult(
      `Browser monitor created for ${input.sessionId}. participantIdentity=${
        typeof result === "object" && result && "participantIdentity" in result
          ? String(result.participantIdentity)
          : "unknown"
      }`,
      result as Record<string, unknown>,
    );
  },
);

server.registerTool(
  "join_supervisor_call",
  {
    title: "Join Supervisor Call",
    description:
      "Dial a third-party phone number into an active contractor call as a second SIP participant.",
    inputSchema: inputSchemas.joinSupervisorCall,
  },
  async (input) => {
    const result = await client.joinSupervisorCall(input);
    return asToolResult(
      `Supervisor call joined for ${input.sessionId} at ${input.phoneNumber}.`,
      result as Record<string, unknown>,
    );
  },
);

server.registerTool(
  "pause_call",
  {
    title: "Pause Call",
    description:
      "Pause the active voice agent so a supervisor can listen or speak without the agent continuing.",
    inputSchema: inputSchemas.pauseCall,
  },
  async (input) => {
    const result = await client.pauseCall(input);
    return asToolResult(
      `Paused agent for ${input.sessionId}.`,
      result as Record<string, unknown>,
    );
  },
);

server.registerTool(
  "resume_call",
  {
    title: "Resume Call",
    description: "Resume a paused voice agent session.",
    inputSchema: inputSchemas.resumeCall,
  },
  async (input) => {
    const result = await client.resumeCall(input);
    return asToolResult(
      `Resumed agent for ${input.sessionId}.`,
      result as Record<string, unknown>,
    );
  },
);

const main = async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("concierge-voice-mcp running on stdio");
};

main().catch((error) => {
  console.error("Fatal error in concierge-voice-mcp:", error);
  process.exit(1);
});
