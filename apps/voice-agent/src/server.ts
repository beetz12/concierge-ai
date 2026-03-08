import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { VoiceToolsClient } from "./backend-client.js";
import { getVoiceAgentConfig } from "./config.js";
import { VoiceObservability } from "./health.js";
import {
  buildDispatchRoomName,
  serializeDispatchMetadata,
} from "./livekit-metadata.js";
import { LiveKitTelephonyService } from "./livekit-telephony.js";
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
    kind: "qualification" | "booking";
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

    writeJson(response, 404, {
      error: "Not Found",
      message: "Route not found",
    });
  });

  return { config, server };
};
