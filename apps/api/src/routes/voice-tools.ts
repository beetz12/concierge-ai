import crypto from "node:crypto";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { isDemoMode } from "../config/demo.js";
import { getCallRuntimeConfig } from "../config/call-runtime.js";

const providerOutcomeSchema = z.object({
  sessionId: z.string().min(1),
  callStatus: z.string().min(1),
  summary: z.string().min(1),
  transcript: z.string().optional(),
  availability: z.string().optional(),
  estimatedRate: z.string().optional(),
  outcome: z.record(z.unknown()).optional(),
});

const voiceSessionSchema = z.object({
  serviceRequestId: z.string().min(1),
  providerId: z.string().min(1),
  runtimeProvider: z.string().min(1),
  status: z.string().min(1),
  activeAgent: z.string().min(1),
  metadata: z.record(z.string()).optional(),
  outcome: z.record(z.unknown()).nullable().optional(),
  startedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  closedAt: z.string().datetime().nullable().optional(),
});

const voiceEventSchema = z.object({
  serviceRequestId: z.string().min(1),
  providerId: z.string().min(1),
  eventType: z.string().min(1),
  agentRole: z.string().min(1).optional(),
  payload: z.record(z.unknown()).optional(),
});

type DemoVoiceSession = {
  id: string;
  service_request_id: string;
  provider_id: string;
  runtime_provider: string;
  status: string;
  active_agent: string;
  metadata: Record<string, string>;
  outcome: Record<string, unknown> | null;
  started_at: string;
  updated_at: string;
  closed_at: string | null;
};

type DemoVoiceEvent = {
  id: string;
  session_id: string;
  service_request_id: string;
  provider_id: string;
  event_type: string;
  agent_role: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

const demoSessions = new Map<string, DemoVoiceSession>();
const demoEvents = new Map<string, DemoVoiceEvent[]>();

const secureCompare = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const requireVoiceAgentAuth = (providedSecret: string | undefined) => {
  const expectedSecret = getCallRuntimeConfig().voiceAgent.sharedSecret;
  return providedSecret ? secureCompare(providedSecret, expectedSecret) : false;
};

const createDemoServiceRequest = (serviceRequestId: string) => ({
  id: serviceRequestId,
  title: "Demo service request",
  description: "Demo request context for local voice-agent integration",
  criteria: "licensed, responsive, fair pricing",
  location: "Greenville, SC",
  status: "researching",
});

const createDemoProvider = (providerId: string) => ({
  id: providerId,
  request_id: "demo-request-001",
  name: "Demo Provider",
  phone: "+18035550100",
  rating: 4.8,
  review_count: 42,
  call_status: "queued",
});

const buildSessionPayload = (
  sessionId: string,
  body: z.infer<typeof voiceSessionSchema>,
) => ({
  id: sessionId,
  service_request_id: body.serviceRequestId,
  provider_id: body.providerId,
  runtime_provider: body.runtimeProvider,
  status: body.status,
  active_agent: body.activeAgent,
  metadata: body.metadata || {},
  outcome: body.outcome ?? null,
  started_at: body.startedAt || new Date().toISOString(),
  updated_at: body.updatedAt || new Date().toISOString(),
  closed_at: body.closedAt ?? null,
});

const buildEventPayload = (
  sessionId: string,
  body: z.infer<typeof voiceEventSchema>,
) => ({
  id: crypto.randomUUID(),
  session_id: sessionId,
  service_request_id: body.serviceRequestId,
  provider_id: body.providerId,
  event_type: body.eventType,
  agent_role: body.agentRole || null,
  payload: body.payload || {},
  created_at: new Date().toISOString(),
});

const sortEventsDescending = (events: DemoVoiceEvent[]) => {
  return [...events].sort((left, right) => right.created_at.localeCompare(left.created_at));
};

export default async function voiceToolRoutes(fastify: FastifyInstance) {
  fastify.addHook("onRequest", async (request, reply) => {
    if (
      !requireVoiceAgentAuth(request.headers["x-voice-agent-key"]?.toString())
    ) {
      reply.code(401).send({
        error: "Unauthorized",
        message: "Missing or invalid voice-agent credentials",
      });
      return;
    }
  });

  fastify.get(
    "/diagnostics/recent-events",
    {
      schema: {
        tags: ["voice-tools"],
        summary: "Fetch recent persisted voice session events",
      },
    },
    async (request, reply) => {
      const query = z.object({ limit: z.coerce.number().int().positive().max(100).optional() }).parse(request.query);
      const limit = query.limit || 20;

      if (isDemoMode()) {
        const events = sortEventsDescending([...demoEvents.values()].flat()).slice(0, limit);
        return {
          events,
          limit,
        };
      }

      const { data, error } = await request.supabase
        .from("voice_call_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        reply.code(500).send({
          error: "PersistenceFailed",
          message: "Failed to load recent voice events",
        });
        return;
      }

      return {
        events: data || [],
        limit,
      };
    },
  );

  fastify.get(
    "/diagnostics/failures",
    {
      schema: {
        tags: ["voice-tools"],
        summary: "Fetch recent persisted fallback and failure events",
      },
    },
    async (request, reply) => {
      const query = z.object({ limit: z.coerce.number().int().positive().max(100).optional() }).parse(request.query);
      const limit = query.limit || 20;

      if (isDemoMode()) {
        const failures = sortEventsDescending([...demoEvents.values()].flat())
          .filter((event) => ["fallback_triggered", "session_failed"].includes(event.event_type))
          .slice(0, limit);
        return {
          events: failures,
          limit,
        };
      }

      const { data, error } = await request.supabase
        .from("voice_call_events")
        .select("*")
        .in("event_type", ["fallback_triggered", "session_failed"])
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        reply.code(500).send({
          error: "PersistenceFailed",
          message: "Failed to load failure diagnostics",
        });
        return;
      }

      return {
        events: data || [],
        limit,
      };
    },
  );

  fastify.get(
    "/sessions/:sessionId",
    {
      schema: {
        tags: ["voice-tools"],
        summary: "Fetch a persisted voice session",
      },
    },
    async (request, reply) => {
      const params = z.object({ sessionId: z.string().min(1) }).parse(request.params);

      if (isDemoMode()) {
        const session = demoSessions.get(params.sessionId);
        if (!session) {
          reply.code(404).send({
            error: "Not Found",
            message: `Voice session not found: ${params.sessionId}`,
          });
          return;
        }

        return { session };
      }

      const { data, error } = await request.supabase
        .from("voice_call_sessions")
        .select("*")
        .eq("id", params.sessionId)
        .single();

      if (error || !data) {
        reply.code(404).send({
          error: "Not Found",
          message: `Voice session not found: ${params.sessionId}`,
        });
        return;
      }

      return { session: data };
    },
  );

  fastify.get(
    "/sessions/:sessionId/events",
    {
      schema: {
        tags: ["voice-tools"],
        summary: "Fetch persisted voice session events",
      },
    },
    async (request, reply) => {
      const params = z.object({ sessionId: z.string().min(1) }).parse(request.params);

      if (isDemoMode()) {
        return {
          sessionId: params.sessionId,
          events: demoEvents.get(params.sessionId) || [],
        };
      }

      const { data, error } = await request.supabase
        .from("voice_call_events")
        .select("*")
        .eq("session_id", params.sessionId)
        .order("created_at", { ascending: true });

      if (error) {
        reply.code(500).send({
          error: "PersistenceFailed",
          message: `Failed to load voice events for ${params.sessionId}`,
        });
        return;
      }

      return {
        sessionId: params.sessionId,
        events: data || [],
      };
    },
  );

  fastify.put(
    "/sessions/:sessionId",
    {
      schema: {
        tags: ["voice-tools"],
        summary: "Create or update persisted voice session state",
      },
    },
    async (request, reply) => {
      const params = z.object({ sessionId: z.string().min(1) }).parse(request.params);
      const body = voiceSessionSchema.parse(request.body);
      const payload = buildSessionPayload(params.sessionId, body);

      if (isDemoMode()) {
        demoSessions.set(params.sessionId, payload);
        return {
          persisted: true,
          session: payload,
        };
      }

      const { data, error } = await request.supabase
        .from("voice_call_sessions")
        .upsert(payload)
        .select("*")
        .single();

      if (error || !data) {
        reply.code(500).send({
          error: "PersistenceFailed",
          message: `Failed to persist voice session ${params.sessionId}`,
        });
        return;
      }

      return {
        persisted: true,
        session: data,
      };
    },
  );

  fastify.post(
    "/sessions/:sessionId/events",
    {
      schema: {
        tags: ["voice-tools"],
        summary: "Append a voice session event",
      },
    },
    async (request, reply) => {
      const params = z.object({ sessionId: z.string().min(1) }).parse(request.params);
      const body = voiceEventSchema.parse(request.body);
      const payload = buildEventPayload(params.sessionId, body);

      if (isDemoMode()) {
        const events = demoEvents.get(params.sessionId) || [];
        events.push(payload);
        demoEvents.set(params.sessionId, events);
        return {
          persisted: true,
          event: payload,
        };
      }

      const { data, error } = await request.supabase
        .from("voice_call_events")
        .insert(payload)
        .select("*")
        .single();

      if (error || !data) {
        reply.code(500).send({
          error: "PersistenceFailed",
          message: `Failed to persist voice event for ${params.sessionId}`,
        });
        return;
      }

      return {
        persisted: true,
        event: data,
      };
    },
  );

  fastify.get(
    "/service-requests/:serviceRequestId",
    {
      schema: {
        tags: ["voice-tools"],
        summary: "Fetch service request context for the voice-agent",
      },
    },
    async (request, reply) => {
      const params = z
        .object({ serviceRequestId: z.string().min(1) })
        .parse(request.params);

      if (isDemoMode()) {
        return { serviceRequest: createDemoServiceRequest(params.serviceRequestId) };
      }

      const { data, error } = await request.supabase
        .from("service_requests")
        .select("*")
        .eq("id", params.serviceRequestId)
        .single();

      if (error || !data) {
        reply.code(404).send({
          error: "Not Found",
          message: `Service request not found: ${params.serviceRequestId}`,
        });
        return;
      }

      return { serviceRequest: data };
    },
  );

  fastify.get(
    "/providers/:providerId",
    {
      schema: {
        tags: ["voice-tools"],
        summary: "Fetch provider context for the voice-agent",
      },
    },
    async (request, reply) => {
      const params = z.object({ providerId: z.string().min(1) }).parse(request.params);

      if (isDemoMode()) {
        return { provider: createDemoProvider(params.providerId) };
      }

      const { data, error } = await request.supabase
        .from("providers")
        .select("*")
        .eq("id", params.providerId)
        .single();

      if (error || !data) {
        reply.code(404).send({
          error: "Not Found",
          message: `Provider not found: ${params.providerId}`,
        });
        return;
      }

      return { provider: data };
    },
  );

  fastify.post(
    "/providers/:providerId/outcome",
    {
      schema: {
        tags: ["voice-tools"],
        summary: "Persist a provider call outcome from the voice-agent",
      },
    },
    async (request, reply) => {
      const params = z.object({ providerId: z.string().min(1) }).parse(request.params);
      const body = providerOutcomeSchema.parse(request.body);
      const payload = {
        call_status: body.callStatus,
        call_summary: body.summary,
        call_transcript: body.transcript || null,
        call_method: "livekit",
        called_at: new Date().toISOString(),
        last_call_at: new Date().toISOString(),
        call_result: {
          sessionId: body.sessionId,
          availability: body.availability,
          estimatedRate: body.estimatedRate,
          outcome: body.outcome || null,
        },
      };

      if (isDemoMode()) {
        return {
          providerId: params.providerId,
          persisted: true,
          provider: {
            ...createDemoProvider(params.providerId),
            ...payload,
          },
        };
      }

      const { data, error } = await request.supabase
        .from("providers")
        .update(payload)
        .eq("id", params.providerId)
        .select("*")
        .single();

      if (error || !data) {
        reply.code(500).send({
          error: "PersistenceFailed",
          message: `Failed to persist provider outcome for ${params.providerId}`,
        });
        return;
      }

      return {
        providerId: params.providerId,
        persisted: true,
        provider: data,
      };
    },
  );
}
