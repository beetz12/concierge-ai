import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { AccessToken } from "livekit-server-sdk";
import { VoiceToolsClient } from "./backend-client.js";
import { getVoiceAgentConfig } from "./config.js";
import { VoiceObservability } from "./health.js";
import {
  buildDispatchRoomName,
  serializeDispatchMetadata,
} from "./livekit-metadata.js";
import { LiveKitTelephonyService } from "./livekit-telephony.js";
import { buildVoicePromptTemplate } from "./prompts/index.js";
import { VoiceSessionManager } from "./session-manager.js";

const sessionManager = new VoiceSessionManager();

const readJson = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
};

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
) => {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

export const buildVoiceAgentServer = () => {
  const config = getVoiceAgentConfig();
  const observability = new VoiceObservability();
  const backendClient = new VoiceToolsClient({
    baseUrl: config.apiBaseUrl,
    sharedSecret: config.sharedSecret,
  });
  const liveKitTelephony = new LiveKitTelephonyService(config);

  const loadSessionRoomContext = async (sessionId: string) => {
    const persisted = (await backendClient.getVoiceSession(sessionId)) as {
      session?: {
        id?: string;
        metadata?: Record<string, string>;
        service_request_id?: string;
        provider_id?: string;
      };
    };

    const session = persisted.session;
    const roomName = session?.metadata?.roomName;
    if (!session?.id || !roomName) {
      throw new Error(`Voice session ${sessionId} does not have an active LiveKit room.`);
    }

    return {
      sessionId: session.id,
      roomName,
      serviceRequestId: session.service_request_id || "",
      providerId: session.provider_id || "",
      metadata: session.metadata || {},
    };
  };

  const buildSupervisorBrowserToken = async (input: {
    sessionId: string;
    roomName: string;
    displayName?: string;
    canPublishAudio?: boolean;
  }) => {
    if (!config.livekit.apiKey || !config.livekit.apiSecret) {
      throw new Error("LiveKit credentials are missing for supervisor token generation.");
    }

    const identity = `supervisor-browser-${input.sessionId}-${Date.now()}`;
    const token = new AccessToken(config.livekit.apiKey, config.livekit.apiSecret, {
      identity,
      name: input.displayName || "Supervisor Monitor",
      ttl: "1h",
    });

    token.addGrant({
      roomJoin: true,
      room: input.roomName,
      canSubscribe: true,
      canPublish: Boolean(input.canPublishAudio),
    });

    return {
      roomName: input.roomName,
      participantIdentity: identity,
      displayName: input.displayName || "Supervisor Monitor",
      canPublishAudio: Boolean(input.canPublishAudio),
      wsUrl: config.livekit.url,
      token: await token.toJwt(),
    };
  };

  const persistSession = async (sessionId: string, eventType?: string) => {
    const session = sessionManager.getSession(sessionId);

    await backendClient.upsertVoiceSession({
      sessionId: session.id,
      serviceRequestId: session.serviceRequestId,
      providerId: session.providerId,
      runtimeProvider: session.runtimeProvider,
      status: session.status,
      activeAgent: session.activeAgent,
      metadata: session.metadata,
      outcome: session.outcome
        ? {
            disposition: session.outcome.disposition,
            summary: session.outcome.summary,
            availability: session.outcome.availability,
            estimatedRate: session.outcome.estimatedRate,
            nextStep: session.outcome.nextStep,
          }
        : null,
      startedAt: session.createdAt,
      updatedAt: session.updatedAt,
      closedAt: session.closedAt || null,
    });

    if (eventType) {
      await backendClient.appendVoiceSessionEvent({
        sessionId: session.id,
        serviceRequestId: session.serviceRequestId,
        providerId: session.providerId,
        eventType,
        agentRole: session.activeAgent,
        payload: {
          status: session.status,
          metadata: session.metadata,
          outcome: session.outcome || null,
        },
      });

      observability.record({
        timestamp: new Date().toISOString(),
        level: eventType === "fallback_triggered" ? "warn" : "info",
        eventType,
        sessionId: session.id,
        serviceRequestId: session.serviceRequestId,
        providerId: session.providerId,
        message: `Persisted voice session event: ${eventType}`,
        details: {
          status: session.status,
          activeAgent: session.activeAgent,
        },
      });
    }
  };

  const dispatchLiveKitCall = async (input: {
    kind: "qualification" | "booking" | "direct_task";
    request: {
      serviceRequestId?: string;
      providerId?: string;
      providerName?: string;
      providerPhone?: string;
      serviceNeeded?: string;
      location?: string;
      userCriteria?: string;
      urgency?: string;
      problemDescription?: string;
      clientName?: string;
      clientPhone?: string;
      clientAddress?: string;
      preferredDateTime?: string;
      additionalNotes?: string;
      mustAskQuestions?: string[];
      dealBreakers?: string[];
      taskDescription?: string;
      directTaskType?: string;
      customPrompt?: {
        systemPrompt: string;
        firstMessage?: string;
        closingScript?: string;
        contextualQuestions?: string[];
      };
    };
  }) => {
    const { kind, request } = input;

    if (!request.providerName) {
      throw new Error("providerName is required for voice dispatch");
    }

    if (!request.providerPhone) {
      throw new Error("providerPhone is required for LiveKit telephony dispatch");
    }

    const session = sessionManager.createSession({
      serviceRequestId: request.serviceRequestId || `service_request_${Date.now()}`,
      providerId: request.providerId || `provider_${Date.now()}`,
      initialAgent: kind === "booking" ? "booking" : "qualification",
      metadata: {
        providerName: request.providerName,
        providerPhone: request.providerPhone,
        serviceNeeded: request.serviceNeeded || "",
        location: request.location || "",
        preferredDateTime: request.preferredDateTime || "",
      },
    });

    await persistSession(session.id, "session_created");

    const roomName = buildDispatchRoomName(session.id);
    const dispatchMetadata = serializeDispatchMetadata({
      kind,
      sessionId: session.id,
      serviceRequestId: session.serviceRequestId,
      providerId: session.providerId,
      providerName: request.providerName,
      providerPhone: request.providerPhone,
      serviceNeeded: request.serviceNeeded || "",
      location: request.location || "",
      userCriteria: request.userCriteria,
      urgency: request.urgency,
      problemDescription: request.problemDescription,
      clientName: request.clientName,
      clientPhone: request.clientPhone,
      clientAddress: request.clientAddress,
      preferredDateTime: request.preferredDateTime,
      additionalNotes: request.additionalNotes,
      mustAskQuestions: request.mustAskQuestions,
      dealBreakers: request.dealBreakers,
      taskDescription: request.taskDescription,
      directTaskType: request.directTaskType,
      customPrompt: request.customPrompt,
    });

    const participantIdentity = `provider-${session.providerId}`;
    const telephonyDispatch = await liveKitTelephony.dispatchOutboundCall({
      roomName,
      phoneNumber: request.providerPhone,
      metadata: dispatchMetadata,
      participantIdentity,
      displayName: request.providerName,
      participantAttributes: {
        sessionId: session.id,
        providerId: session.providerId,
        serviceRequestId: session.serviceRequestId,
        kind,
      },
    });

    sessionManager.updateMetadata(session.id, {
      roomName,
      dispatchId: telephonyDispatch.dispatchId,
      participantIdentity: telephonyDispatch.participantIdentity,
    });
    await persistSession(session.id, "call_dispatched");

    return {
      success: true,
      accepted: true,
      runtimeProvider: "livekit" as const,
      dispatchId: telephonyDispatch.dispatchId,
      sessionId: session.id,
      providerId: session.providerId,
      serviceRequestId: session.serviceRequestId,
      roomName,
      participantIdentity: telephonyDispatch.participantIdentity,
    };
  };

  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method === "GET" && request.url === "/health") {
      writeJson(response, 200, observability.buildHealth(sessionManager, config.callRuntimeProvider));
      return;
    }

    if (request.headers["x-voice-agent-key"] !== config.sharedSecret) {
      writeJson(response, 401, {
        error: "Unauthorized",
        message: "Missing or invalid voice-agent credentials",
      });
      return;
    }

    if (request.method === "GET" && request.url === "/diagnostics") {
      writeJson(response, 200, {
        summary: observability.buildHealth(sessionManager, config.callRuntimeProvider),
        recentEvents: observability.getRecentEvents(),
      });
      return;
    }

    if (request.method === "GET" && request.url === "/diagnostics/failures") {
      writeJson(response, 200, {
        summary: observability.buildHealth(sessionManager, config.callRuntimeProvider),
        recentFailures: observability.getRecentFailures(),
      });
      return;
    }

    if (request.method === "POST" && request.url === "/preview/call") {
      try {
        const body = (await readJson(request)) as {
          metadata?: {
            kind: "qualification" | "booking" | "direct_task";
            providerName: string;
            providerPhone?: string;
            serviceNeeded: string;
            location: string;
            userCriteria?: string;
            urgency?: string;
            problemDescription?: string;
            clientName?: string;
            clientPhone?: string;
            clientAddress?: string;
            preferredDateTime?: string;
            additionalNotes?: string;
            mustAskQuestions?: string[];
            dealBreakers?: string[];
            taskDescription?: string;
            directTaskType?: string;
            customPrompt?: {
              systemPrompt: string;
              firstMessage?: string;
              closingScript?: string;
              contextualQuestions?: string[];
            };
          };
        };

        if (!body.metadata) {
          throw new Error("metadata is required for call preview");
        }

        const preview = buildVoicePromptTemplate(body.metadata);

        writeJson(response, 200, {
          success: true,
          preview,
        });
      } catch (error) {
        writeJson(response, 400, {
          error: "PreviewFailed",
          message: error instanceof Error ? error.message : "Failed to build call preview",
        });
      }
      return;
    }

    if (request.method === "POST" && request.url === "/dispatch/provider-call") {
      try {
        const body = (await readJson(request)) as {
          request?: {
            serviceRequestId?: string;
            providerId?: string;
            providerName?: string;
            providerPhone?: string;
            serviceNeeded?: string;
            location?: string;
            userCriteria?: string;
            urgency?: string;
            problemDescription?: string;
            clientAddress?: string;
            mustAskQuestions?: string[];
            dealBreakers?: string[];
            taskDescription?: string;
            directTaskType?: string;
            customPrompt?: {
              systemPrompt: string;
              firstMessage?: string;
              closingScript?: string;
              contextualQuestions?: string[];
            };
          };
        };

        const callRequest = body.request || {};
        const payload = await dispatchLiveKitCall({
          kind: "qualification",
          request: callRequest,
        });

        writeJson(response, 200, {
          ...payload,
        });
      } catch (error) {
        observability.record({
          timestamp: new Date().toISOString(),
          level: "error",
          eventType: "dispatch_failed",
          message: "Provider dispatch failed",
          details: {
            error: error instanceof Error ? error.message : "unknown_error",
          },
        });
        writeJson(response, 500, {
          error: "DispatchFailed",
          message: error instanceof Error ? error.message : "Provider dispatch failed",
        });
      }
      return;
    }

    if (request.method === "POST" && request.url === "/dispatch/provider-booking") {
      try {
        const body = (await readJson(request)) as {
          request?: {
            serviceRequestId?: string;
            providerId?: string;
            providerName?: string;
            providerPhone?: string;
            serviceNeeded?: string;
            location?: string;
            preferredDateTime?: string;
            clientName?: string;
            clientPhone?: string;
            clientAddress?: string;
            additionalNotes?: string;
            mustAskQuestions?: string[];
            dealBreakers?: string[];
            customPrompt?: {
              systemPrompt: string;
              firstMessage?: string;
              closingScript?: string;
              contextualQuestions?: string[];
            };
          };
        };

        const bookingRequest = body.request || {};
        const payload = await dispatchLiveKitCall({
          kind: "booking",
          request: bookingRequest,
        });

        writeJson(response, 200, {
          ...payload,
        });
      } catch (error) {
        observability.record({
          timestamp: new Date().toISOString(),
          level: "error",
          eventType: "booking_dispatch_failed",
          message: "Booking dispatch failed",
          details: {
            error: error instanceof Error ? error.message : "unknown_error",
          },
        });
        writeJson(response, 500, {
          error: "DispatchFailed",
          message: error instanceof Error ? error.message : "Booking dispatch failed",
        });
      }
      return;
    }

    if (request.method === "POST" && request.url === "/dispatch/direct-task") {
      try {
        const body = (await readJson(request)) as {
          request?: {
            serviceRequestId?: string;
            providerId?: string;
            providerName?: string;
            providerPhone?: string;
            serviceNeeded?: string;
            location?: string;
            userCriteria?: string;
            urgency?: string;
            problemDescription?: string;
            clientName?: string;
            clientPhone?: string;
            clientAddress?: string;
            additionalNotes?: string;
            mustAskQuestions?: string[];
            dealBreakers?: string[];
            taskDescription?: string;
            directTaskType?: string;
            customPrompt?: {
              systemPrompt: string;
              firstMessage?: string;
              closingScript?: string;
              contextualQuestions?: string[];
            };
          };
        };

        const taskRequest = body.request || {};
        const payload = await dispatchLiveKitCall({
          kind: "direct_task",
          request: taskRequest,
        });

        writeJson(response, 200, {
          ...payload,
        });
      } catch (error) {
        observability.record({
          timestamp: new Date().toISOString(),
          level: "error",
          eventType: "direct_task_dispatch_failed",
          message: "Direct-task dispatch failed",
          details: {
            error: error instanceof Error ? error.message : "unknown_error",
          },
        });
        writeJson(response, 500, {
          error: "DispatchFailed",
          message: error instanceof Error ? error.message : "Direct-task dispatch failed",
        });
      }
      return;
    }

    if (request.method === "POST" && request.url === "/dispatch/provider-batch") {
      try {
        const body = (await readJson(request)) as {
          requests?: Array<{
            serviceRequestId?: string;
            providerId?: string;
            providerName?: string;
            providerPhone?: string;
            serviceNeeded?: string;
            location?: string;
            userCriteria?: string;
            urgency?: string;
            problemDescription?: string;
            clientAddress?: string;
          }>;
        };

        const requests = body.requests || [];
        const dispatches = await Promise.all(requests.map(async (callRequest) => {
          if (!callRequest.providerId || !callRequest.serviceRequestId) {
            throw new Error("providerId and serviceRequestId are required for voice batch dispatch");
          }

          return dispatchLiveKitCall({
            kind: "qualification",
            request: {
              ...callRequest,
              providerId: callRequest.providerId,
              serviceRequestId: callRequest.serviceRequestId,
            },
          });
        }));

        writeJson(response, 200, {
          success: true,
          accepted: true,
          runtimeProvider: "livekit",
          dispatches,
        });
      } catch (error) {
        observability.record({
          timestamp: new Date().toISOString(),
          level: "error",
          eventType: "batch_dispatch_failed",
          message: "Batch provider dispatch failed",
          details: {
            error: error instanceof Error ? error.message : "unknown_error",
          },
        });
        writeJson(response, 400, {
          error: "ValidationError",
          message: error instanceof Error ? error.message : "Invalid batch dispatch payload",
        });
      }
      return;
    }

    const supervisorBrowserMatch =
      request.method === "POST"
        ? /^\/sessions\/([^/]+)\/supervisor\/browser-token$/.exec(request.url || "")
        : null;
    if (supervisorBrowserMatch) {
      try {
        const body = (await readJson(request)) as {
          displayName?: string;
          canPublishAudio?: boolean;
        };
        const sessionId = supervisorBrowserMatch[1] || "";
        const sessionContext = await loadSessionRoomContext(sessionId);
        const payload = await buildSupervisorBrowserToken({
          sessionId,
          roomName: sessionContext.roomName,
          displayName: body.displayName,
          canPublishAudio: body.canPublishAudio,
        });

        writeJson(response, 200, {
          success: true,
          sessionId,
          ...payload,
        });
      } catch (error) {
        writeJson(response, 400, {
          error: "SupervisorTokenFailed",
          message:
            error instanceof Error
              ? error.message
              : "Failed to generate supervisor browser token",
        });
      }
      return;
    }

    const supervisorCallMatch =
      request.method === "POST"
        ? /^\/sessions\/([^/]+)\/supervisor\/call$/.exec(request.url || "")
        : null;
    if (supervisorCallMatch) {
      try {
        const body = (await readJson(request)) as {
          phoneNumber?: string;
          displayName?: string;
        };
        if (!body.phoneNumber) {
          throw new Error("phoneNumber is required for supervisor dial-in");
        }

        const sessionId = supervisorCallMatch[1] || "";
        const sessionContext = await loadSessionRoomContext(sessionId);
        const supervisorParticipant = await liveKitTelephony.addSipParticipantToRoom({
          roomName: sessionContext.roomName,
          phoneNumber: body.phoneNumber,
          participantIdentity: `supervisor-${sessionId}`,
          displayName: body.displayName || "Supervisor",
          metadata: JSON.stringify({
            role: "supervisor",
            sessionId,
          }),
          participantAttributes: {
            role: "supervisor",
            sessionId,
            serviceRequestId: sessionContext.serviceRequestId,
            providerId: sessionContext.providerId,
          },
        });

        await backendClient.appendVoiceSessionEvent({
          sessionId,
          serviceRequestId: sessionContext.serviceRequestId,
          providerId: sessionContext.providerId,
          eventType: "supervisor_call_joined",
          agentRole: "supervisor",
          payload: {
            roomName: sessionContext.roomName,
            participantIdentity: supervisorParticipant.participantIdentity,
            phoneNumber: body.phoneNumber,
          },
        });

        writeJson(response, 200, {
          success: true,
          sessionId,
          roomName: supervisorParticipant.roomName,
          participantIdentity: supervisorParticipant.participantIdentity,
        });
      } catch (error) {
        writeJson(response, 400, {
          error: "SupervisorCallFailed",
          message:
            error instanceof Error
              ? error.message
              : "Failed to add supervisor call participant",
        });
      }
      return;
    }

    writeJson(response, 404, {
      error: "Not Found",
      message: "Route not found",
    });
  });

  return { config, server };
};
