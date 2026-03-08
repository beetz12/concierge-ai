if (process.env.NODE_ENV !== "production") {
  const dotenv = await import("dotenv");
  dotenv.config({
    path: new URL("../.env", import.meta.url),
  });
}

process.env.GOOGLE_API_KEY ??= process.env.GEMINI_API_KEY;

import { once } from "node:events";
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
import { DisconnectReason, RoomEvent } from "@livekit/rtc-node";
import { RoomServiceClient } from "livekit-server-sdk";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { VoiceToolsClient } from "./backend-client.js";
import { finishCallCleanup } from "./call-cleanup.js";
import { getVoiceAgentConfig } from "./config.js";
import { parseDispatchMetadata } from "./livekit-metadata.js";
import {
  ActiveSessionRegistry,
  buildWorkerControlServer,
} from "./session-control.js";
import {
  buildFallbackCallOutcome,
  type CompletedCallOutcome,
  resolveSessionStatus,
} from "./session-finalization.js";
import { persistSessionArtifacts } from "./session-artifacts.js";
import {
  buildAgentInstructions,
  buildOpeningPrompt,
  createAgentSession,
  getWorkerRuntimeConfig,
} from "./worker-runtime.js";

const getAgentRole = (metadata: ReturnType<typeof parseDispatchMetadata>) => {
  return metadata.kind === "booking"
    ? "booking"
    : metadata.kind === "direct_task"
      ? "direct_task"
      : "qualification";
};

const extractTranscriptMessage = (item: {
  textContent?: string;
  content?: unknown[];
}) => {
  if (item.textContent && item.textContent.trim()) {
    return item.textContent.trim();
  }

  return (item.content || [])
    .map((value) => {
      if (typeof value === "string") {
        return value.trim();
      }

      if (
        value &&
        typeof value === "object" &&
        "transcript" in value &&
        typeof value.transcript === "string"
      ) {
        return value.transcript.trim();
      }

      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
};

class OutboundAssistant extends voice.Agent {
  constructor(args: {
    instructions: string;
    roomServiceClient: RoomServiceClient;
    roomName: string;
    participantIdentity: string;
    backendClient: VoiceToolsClient;
    metadata: ReturnType<typeof parseDispatchMetadata>;
    outcomeState: { latest: CompletedCallOutcome | null };
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
                "failed",
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

            args.outcomeState.latest = {
              reason,
              disposition,
              summary,
              availability: normalizedAvailability,
              estimatedRate: normalizedEstimatedRate,
              servicesOffered: normalizedServicesOffered,
            };

            try {
              await args.backendClient.upsertVoiceSession({
                sessionId: args.metadata.sessionId,
                serviceRequestId: args.metadata.serviceRequestId,
                providerId: args.metadata.providerId,
                runtimeProvider: "livekit",
                status: "completed",
                activeAgent: getAgentRole(args.metadata),
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
                agentRole: getAgentRole(args.metadata),
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
    const agentRole = getAgentRole(metadata);
    const outcomeState = {
      latest: null as CompletedCallOutcome | null,
    };
    const transcriptLines: string[] = [];
    const inFlightPersistence = new Set<Promise<unknown>>();
    let participantDisconnectReason: string | null = null;
    let finalizationTriggered = false;

    const trackPersistence = <T>(promise: Promise<T>): Promise<T> => {
      inFlightPersistence.add(promise);
      promise.finally(() => {
        inFlightPersistence.delete(promise);
      });
      return promise;
    };

    const appendVoiceEvent = (input: {
      eventType: string;
      payload?: Record<string, unknown>;
    }) => {
      return trackPersistence(
        backendClient.appendVoiceSessionEvent({
          sessionId: metadata.sessionId,
          serviceRequestId: metadata.serviceRequestId,
          providerId: metadata.providerId,
          eventType: input.eventType,
          agentRole,
          payload: input.payload,
        }).catch((error) => {
          console.error(`Failed to persist ${input.eventType} voice event`, error);
        }),
      );
    };

    await ctx.connect();
    const participant = await ctx.waitForParticipant();

    await appendVoiceEvent({
      eventType: "worker_joined",
      payload: {
        roomName,
        modelProvider: runtimeConfig.modelProvider,
      },
    });

    const session = createAgentSession(
      runtimeConfig,
      ctx.proc.userData.vad as silero.VAD,
    );

    session.on(
      voice.AgentSessionEventTypes.ConversationItemAdded,
      (event: voice.ConversationItemAddedEvent) => {
        if (event.item.role !== "assistant" && event.item.role !== "user") {
          return;
        }

        const text = extractTranscriptMessage(event.item);
        if (!text) {
          return;
        }

        transcriptLines.push(
          `${event.item.role === "assistant" ? "Assistant" : "Provider"}: ${text}`,
        );

        void appendVoiceEvent({
          eventType: "transcript_message",
          payload: {
            messageId: event.item.id || null,
            role: event.item.role,
            interrupted: Boolean(event.item.interrupted),
            createdAt: event.item.createdAt || Date.now(),
            text,
          },
        });
      },
    );

    let artifactPersistence: Promise<void> | null = null;
    const finalizeSession = (input: {
      closeReason: string;
      disconnectReason?: string | null;
      closedAt?: number;
      waitMs?: number;
    }) => {
      if (artifactPersistence) {
        return artifactPersistence;
      }

      artifactPersistence = (async () => {
        if (input.waitMs && input.waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, input.waitMs));
        }

        await Promise.allSettled([...inFlightPersistence]);

        const report = ctx.makeSessionReport(session);
        const artifacts = await persistSessionArtifacts({
          sessionId: metadata.sessionId,
          report,
          recordingsDir: config.recordingsDir,
          transcriptOverride: transcriptLines.join("\n\n"),
        });
        const transcript = artifacts.transcript.trim();
        const finalOutcome =
          outcomeState.latest ||
          buildFallbackCallOutcome({
            transcript,
            disconnectReason: input.disconnectReason || input.closeReason,
          });
        const closedAt = new Date(input.closedAt || Date.now()).toISOString();
        const sessionStatus = resolveSessionStatus(finalOutcome);

        await appendVoiceEvent({
          eventType: "session_artifacts_ready",
          payload: {
            roomName,
            closeReason: input.closeReason,
            closedAt,
            transcriptPath: artifacts.transcriptPath,
            transcriptLength: artifacts.transcript.length,
            sessionReportPath: artifacts.sessionReportPath,
            recordingPath: artifacts.recordingPath || null,
          },
        });

        if (!outcomeState.latest) {
          await appendVoiceEvent({
            eventType: "session_failed",
            payload: {
              disposition: finalOutcome.disposition,
              summary: finalOutcome.summary,
              reason: finalOutcome.reason,
              closeReason: input.closeReason,
              disconnectReason: input.disconnectReason || null,
              modelProvider: runtimeConfig.modelProvider,
            },
          });
        }

        await backendClient.upsertVoiceSession({
          sessionId: metadata.sessionId,
          serviceRequestId: metadata.serviceRequestId,
          providerId: metadata.providerId,
          runtimeProvider: "livekit",
          status: sessionStatus,
          activeAgent: agentRole,
          metadata: {
            roomName,
            modelProvider: runtimeConfig.modelProvider,
            transcriptPath: artifacts.transcriptPath,
            sessionReportPath: artifacts.sessionReportPath,
            ...(artifacts.recordingPath
              ? { recordingPath: artifacts.recordingPath }
              : {}),
          },
          outcome: {
            disposition: finalOutcome.disposition,
            summary: finalOutcome.summary,
            availability: finalOutcome.availability,
            estimatedRate: finalOutcome.estimatedRate,
            servicesOffered: finalOutcome.servicesOffered,
            reason: finalOutcome.reason,
            transcript,
            transcriptPath: artifacts.transcriptPath,
            sessionReportPath: artifacts.sessionReportPath,
            recordingPath: artifacts.recordingPath || null,
          },
          updatedAt: closedAt,
          closedAt,
        });

        await backendClient.saveProviderOutcome({
          providerId: metadata.providerId,
          sessionId: metadata.sessionId,
          callStatus: finalOutcome.disposition,
          summary: finalOutcome.summary,
          transcript,
          availability: finalOutcome.availability,
          estimatedRate: finalOutcome.estimatedRate,
          outcome: {
            disposition: finalOutcome.disposition,
            reason: finalOutcome.reason,
            servicesOffered: finalOutcome.servicesOffered,
            transcriptPath: artifacts.transcriptPath,
            sessionReportPath: artifacts.sessionReportPath,
            recordingPath: artifacts.recordingPath || null,
          },
        });
      })().catch((error) => {
        console.error("Failed to persist session artifacts", error);
      });

      return artifactPersistence;
    };

    session.on(
      voice.AgentSessionEventTypes.Close,
      (event: { reason: string; createdAt: number }) => {
        activeSessionRegistry.unregister(metadata.sessionId);
        void finalizeSession({
          closeReason: event.reason,
          disconnectReason: participantDisconnectReason,
          closedAt: event.createdAt,
        });
      },
    );

    ctx.addShutdownCallback(async () => {
      if (artifactPersistence) {
        await artifactPersistence;
      }
    });

    const agent = new OutboundAssistant({
      instructions: buildAgentInstructions(metadata),
      roomServiceClient,
      roomName,
      participantIdentity: participant.identity,
      backendClient,
      metadata,
      outcomeState,
    });

    await session.start({
      agent,
      room: ctx.room,
      record: true,
    });

    ctx.room.on(RoomEvent.ParticipantDisconnected, (remoteParticipant) => {
      if (remoteParticipant.identity !== participant.identity) {
        return;
      }

      participantDisconnectReason = remoteParticipant.disconnectReason
        ? DisconnectReason[remoteParticipant.disconnectReason] ||
          String(remoteParticipant.disconnectReason)
        : "CLIENT_INITIATED";

      void appendVoiceEvent({
        eventType: "provider_disconnected",
        payload: {
          roomName,
          participantIdentity: participant.identity,
          disconnectReason: participantDisconnectReason,
        },
      });

      if (finalizationTriggered || outcomeState.latest) {
        return;
      }

      finalizationTriggered = true;
      outcomeState.latest = buildFallbackCallOutcome({
        transcript: transcriptLines.join("\n\n"),
        disconnectReason: participantDisconnectReason,
      });

      session.shutdown({
        reason: outcomeState.latest.reason,
        drain: false,
      });

      void finalizeSession({
        closeReason: outcomeState.latest.reason,
        disconnectReason: participantDisconnectReason,
        waitMs: 7000,
      });
    });

    let paused = false;
    activeSessionRegistry.register({
      sessionId: metadata.sessionId,
      roomName,
      participantIdentity: participant.identity,
      pause: async () => {
        if (paused) {
          return;
        }

        paused = true;
        session.input.setAudioEnabled(false);
        session.output.setAudioEnabled(false);
        await session.interrupt({ force: true }).await;
        await appendVoiceEvent({
          eventType: "supervisor_paused_agent",
          payload: {
            roomName,
            participantIdentity: participant.identity,
          },
        });
      },
      resume: async () => {
        if (!paused) {
          return;
        }

        paused = false;
        session.output.setAudioEnabled(true);
        session.input.setAudioEnabled(true);
        await appendVoiceEvent({
          eventType: "supervisor_resumed_agent",
          payload: {
            roomName,
            participantIdentity: participant.identity,
          },
        });
      },
      getStatus: () => ({
        paused,
        roomName,
        participantIdentity: participant.identity,
      }),
    });

    const opening = session.generateReply({
      instructions: buildOpeningPrompt(metadata),
    });
    await opening.waitForPlayout();
  },
});

const config = getVoiceAgentConfig();
const runtimeConfig = getWorkerRuntimeConfig();
const activeSessionRegistry = new ActiveSessionRegistry();
const workerEntrypoint = process.argv[1] || "";
const isTopLevelWorkerProcess =
  /(?:^|\/)(worker\.(?:js|ts))$/.test(workerEntrypoint);

if (isTopLevelWorkerProcess) {
  const workerControlServer = buildWorkerControlServer({
    sharedSecret: config.sharedSecret,
    registry: activeSessionRegistry,
  });

  workerControlServer.listen(config.workerControlPort, config.host);
  await once(workerControlServer, "listening");
}

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: config.livekit.agentName,
    wsURL: config.livekit.url,
    apiKey: config.livekit.apiKey,
    apiSecret: config.livekit.apiSecret,
  }),
);
