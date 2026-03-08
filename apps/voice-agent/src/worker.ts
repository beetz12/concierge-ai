if (process.env.NODE_ENV !== "production") {
  const dotenv = await import("dotenv");
  dotenv.config({
    path: new URL("../.env", import.meta.url),
  });
}

process.env.GOOGLE_API_KEY ??= process.env.GEMINI_API_KEY;

import {
  ServerOptions,
  cli,
  defineAgent,
  type JobContext,
  type JobProcess,
  llm,
  voice,
} from "@livekit/agents";
import * as silero from "@livekit/agents-plugin-silero";
import { RoomServiceClient } from "livekit-server-sdk";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { VoiceToolsClient } from "./backend-client.js";
import { finishCallCleanup } from "./call-cleanup.js";
import { getVoiceAgentConfig } from "./config.js";
import { parseDispatchMetadata } from "./livekit-metadata.js";
import {
  buildAgentInstructions,
  buildOpeningPrompt,
  createAgentSession,
  getWorkerRuntimeConfig,
} from "./worker-runtime.js";

class OutboundAssistant extends voice.Agent {
  constructor(args: {
    instructions: string;
    roomServiceClient: RoomServiceClient;
    roomName: string;
    participantIdentity: string;
    backendClient: VoiceToolsClient;
    metadata: ReturnType<typeof parseDispatchMetadata>;
  }) {
    super({
      instructions: args.instructions,
      tools: {
        finishCall: llm.tool({
          description:
            "Persist the final call result and end the phone call after your last closing sentence has finished playing.",
          parameters: z.object({
            reason: z
              .enum([
                "assistant-ended-call",
                "user-ended-call",
                "unknown-error",
              ])
              .describe("The reason for ending the call."),
            disposition: z
              .enum([
                "qualified",
                "disqualified",
                "callback_requested",
                "wrong_number",
                "failed",
              ])
              .describe("The final outcome of the call."),
            summary: z
              .string()
              .min(1)
              .describe("A concise human-readable summary of what was learned."),
            servicesOffered: z
              .array(z.string().min(1))
              .nullable()
              .optional()
              .describe("Specific services the provider said they offer."),
            estimatedRate: z
              .string()
              .nullable()
              .optional()
              .describe("The provider's quoted price or rate."),
            availability: z
              .string()
              .nullable()
              .optional()
              .describe("The earliest availability the provider gave."),
          }),
          execute: async (
            { reason, disposition, summary, servicesOffered, estimatedRate, availability },
            { ctx },
          ) => {
            await ctx.waitForPlayout();

            const normalizedServicesOffered = servicesOffered || [];
            const normalizedEstimatedRate = estimatedRate || undefined;
            const normalizedAvailability = availability || undefined;

            const completedAt = new Date().toISOString();
            const metadataUpdates: Record<string, string> = {
              roomName: args.roomName,
              modelProvider: runtimeConfig.modelProvider,
            };

            if (normalizedAvailability) {
              metadataUpdates.availability = normalizedAvailability;
            }
            if (normalizedEstimatedRate) {
              metadataUpdates.estimatedRate = normalizedEstimatedRate;
            }
            if (normalizedServicesOffered.length) {
              metadataUpdates.servicesOffered = normalizedServicesOffered.join(", ");
            }

            try {
              await args.backendClient.upsertVoiceSession({
                sessionId: args.metadata.sessionId,
                serviceRequestId: args.metadata.serviceRequestId,
                providerId: args.metadata.providerId,
                runtimeProvider: "livekit",
                status: "completed",
                activeAgent:
                  args.metadata.kind === "booking"
                    ? "booking"
                    : args.metadata.kind === "direct_task"
                      ? "direct_task"
                      : "qualification",
                metadata: metadataUpdates,
                outcome: {
                  disposition,
                  summary,
                  availability: normalizedAvailability,
                  estimatedRate: normalizedEstimatedRate,
                  servicesOffered: normalizedServicesOffered,
                  reason,
                },
                updatedAt: completedAt,
                closedAt: completedAt,
              });

              await args.backendClient.appendVoiceSessionEvent({
                sessionId: args.metadata.sessionId,
                serviceRequestId: args.metadata.serviceRequestId,
                providerId: args.metadata.providerId,
                eventType: "session_completed",
                agentRole:
                  args.metadata.kind === "booking"
                    ? "booking"
                    : args.metadata.kind === "direct_task"
                      ? "direct_task"
                      : "qualification",
                payload: {
                  disposition,
                  summary,
                  availability: normalizedAvailability || null,
                  estimatedRate: normalizedEstimatedRate || null,
                  servicesOffered: normalizedServicesOffered,
                  reason,
                  modelProvider: runtimeConfig.modelProvider,
                },
              });

              await args.backendClient.saveProviderOutcome({
                providerId: args.metadata.providerId,
                sessionId: args.metadata.sessionId,
                callStatus: disposition,
                summary,
                availability: normalizedAvailability,
                estimatedRate: normalizedEstimatedRate,
                outcome: {
                  disposition,
                  reason,
                  servicesOffered: normalizedServicesOffered,
                },
              });
            } catch (error) {
              console.error("Failed to persist final call outcome", error);
            }

            return finishCallCleanup({
              session: ctx.session,
              roomServiceClient: args.roomServiceClient,
              roomName: args.roomName,
              participantIdentity: args.participantIdentity,
              reason,
            });
          },
        }),
      },
    });
  }
}

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    if (!config.livekit.configured || !config.livekit.url || !config.livekit.apiKey || !config.livekit.apiSecret) {
      throw new Error("LiveKit worker is missing LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET.");
    }

    const metadata = parseDispatchMetadata(ctx.job.metadata);
    const backendClient = new VoiceToolsClient({
      baseUrl: config.apiBaseUrl,
      sharedSecret: config.sharedSecret,
    });
    const roomServiceClient = new RoomServiceClient(
      config.livekit.serverUrl || config.livekit.url,
      config.livekit.apiKey,
      config.livekit.apiSecret,
    );
    const roomName = ctx.room.name || `concierge-${metadata.sessionId}`;

    await ctx.connect();
    const participant = await ctx.waitForParticipant();

    await backendClient.appendVoiceSessionEvent({
      sessionId: metadata.sessionId,
      serviceRequestId: metadata.serviceRequestId,
      providerId: metadata.providerId,
      eventType: "worker_joined",
      agentRole:
        metadata.kind === "booking"
          ? "booking"
          : metadata.kind === "direct_task"
            ? "direct_task"
            : "qualification",
      payload: {
        roomName,
        modelProvider: runtimeConfig.modelProvider,
      },
    });

    const session = createAgentSession(
      runtimeConfig,
      ctx.proc.userData.vad as silero.VAD,
    );

    const agent = new OutboundAssistant({
      instructions: buildAgentInstructions(metadata),
      roomServiceClient,
      roomName,
      participantIdentity: participant.identity,
      backendClient,
      metadata,
    });

    await session.start({
      agent,
      room: ctx.room,
    });

    const opening = session.generateReply({
      instructions: buildOpeningPrompt(metadata),
    });
    await opening.waitForPlayout();
  },
});

const config = getVoiceAgentConfig();
const runtimeConfig = getWorkerRuntimeConfig();

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: config.livekit.agentName,
    wsURL: config.livekit.url,
    apiKey: config.livekit.apiKey,
    apiSecret: config.livekit.apiSecret,
  }),
);
