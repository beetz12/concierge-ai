import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

export interface ActiveSessionHandle {
  sessionId: string;
  roomName: string;
  participantIdentity: string;
  pause(): Promise<void>;
  resume(): Promise<void>;
  getStatus(): {
    paused: boolean;
    roomName: string;
    participantIdentity: string;
  };
}

export class ActiveSessionRegistry {
  private readonly sessions = new Map<string, ActiveSessionHandle>();

  register(handle: ActiveSessionHandle) {
    this.sessions.set(handle.sessionId, handle);
  }

  unregister(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  get(sessionId: string): ActiveSessionHandle {
    const handle = this.sessions.get(sessionId);
    if (!handle) {
      throw new Error(`Active session not found: ${sessionId}`);
    }

    return handle;
  }

  async pause(sessionId: string) {
    const handle = this.get(sessionId);
    await handle.pause();
    return handle.getStatus();
  }

  async resume(sessionId: string) {
    const handle = this.get(sessionId);
    await handle.resume();
    return handle.getStatus();
  }
}

const writeJson = (
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
) => {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
};

const getPathSessionId = (pathname: string): string | null => {
  const match = /^\/sessions\/([^/]+)(?:\/(pause|resume))?$/.exec(pathname);
  return match?.[1] || null;
};

const getAction = (pathname: string): "pause" | "resume" | null => {
  const match = /^\/sessions\/[^/]+\/(pause|resume)$/.exec(pathname);
  return (match?.[1] as "pause" | "resume" | undefined) || null;
};

export const buildWorkerControlServer = (input: {
  sharedSecret: string;
  registry: ActiveSessionRegistry;
}) => {
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");

    if (request.headers["x-voice-agent-key"] !== input.sharedSecret) {
      writeJson(response, 401, {
        error: "Unauthorized",
        message: "Missing or invalid voice-agent credentials",
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      writeJson(response, 200, {
        ok: true,
        activeSessions: input.registry ? "available" : "unavailable",
      });
      return;
    }

    const sessionId = getPathSessionId(url.pathname);
    if (!sessionId) {
      writeJson(response, 404, {
        error: "NotFound",
        message: "Route not found",
      });
      return;
    }

    if (request.method === "GET") {
      try {
        const status = input.registry.get(sessionId).getStatus();
        writeJson(response, 200, {
          success: true,
          sessionId,
          ...status,
        });
      } catch (error) {
        writeJson(response, 404, {
          error: "NotFound",
          message: error instanceof Error ? error.message : "Active session not found",
        });
      }
      return;
    }

    if (request.method === "POST") {
      try {
        const action = getAction(url.pathname);
        if (!action) {
          throw new Error("Unsupported control action");
        }

        const status =
          action === "pause"
            ? await input.registry.pause(sessionId)
            : await input.registry.resume(sessionId);

        writeJson(response, 200, {
          success: true,
          sessionId,
          action,
          ...status,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to control active session";
        const statusCode = /not found/i.test(message) ? 404 : 400;
        writeJson(response, statusCode, {
          error: "ControlFailed",
          message,
        });
      }
      return;
    }

    writeJson(response, 405, {
      error: "MethodNotAllowed",
      message: "Unsupported method",
    });
  });
};
