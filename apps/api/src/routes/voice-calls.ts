import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ContractorCallService } from "../services/voice/contractor-call.service.js";
import { getCallBackend } from "../services/call-backend/index.js";
import type { CallPlan } from "../services/call-backend/types.js";
import {
  ComplianceDenyError,
  CompliantCallDispatcher,
  formatDisclosureBlock,
} from "../services/compliance/dispatch.js";
import type { ComplianceTaskType } from "../services/compliance/types.js";
import { isRedialBlocked } from "../services/dispatch/registry.js";
import { DirectTwilioClient } from "../services/notifications/direct-twilio.client.js";
import { isDemoMode } from "../config/demo.js";

const e164PhoneRegex = /^\+1\d{10}$/;
const e164PhoneMessage = "Phone must be E.164 format (+1XXXXXXXXXX)";
const sessionParamsSchema = z.object({ sessionId: z.string().min(1) });

const intakeAnswerSchema = z.object({
  questionId: z.string().optional(),
  question: z.string().min(1),
  answer: z.string().min(1),
});

const contractorCallSchema = z.object({
  mode: z.enum(["qualification", "booking", "direct_task"]).default("qualification"),
  contractorName: z.string().min(1, "Contractor name is required"),
  contractorPhone: z.string().regex(e164PhoneRegex, e164PhoneMessage),
  serviceNeeded: z.string().min(1, "Service needed is required"),
  location: z.string().min(1, "Location is required"),
  userCriteria: z.string().optional(),
  problemDescription: z.string().optional(),
  urgency: z
    .enum(["immediate", "within_24_hours", "within_2_days", "flexible"])
    .optional(),
  clientName: z.string().optional(),
  clientPhone: z.string().regex(e164PhoneRegex, e164PhoneMessage).optional(),
  clientAddress: z.string().optional(),
  preferredDateTime: z.string().optional(),
  additionalNotes: z.string().optional(),
  mustAskQuestions: z.array(z.string().min(1)).optional(),
  dealBreakers: z.array(z.string().min(1)).optional(),
  intakeAnswers: z.array(intakeAnswerSchema).optional(),
  taskDescription: z.string().optional(),
  // A human reviewed this plan (preview step) and approved dispatch. The
  // existing UI's explicit dispatch-after-preview click is that approval, so
  // omitting the field means approved; slice 8's two-gate UX sends it
  // explicitly. Sending `false` is a hard compliance deny.
  userApproved: z.boolean().optional().default(true),
});

/** R-27 static taxonomy lookup for the contractor-call modes. */
const taskTypeForMode = (
  mode: z.infer<typeof contractorCallSchema>["mode"],
): ComplianceTaskType => {
  switch (mode) {
    case "booking":
      return "appointment_booking";
    case "direct_task":
      // Buyer-side errand call (negotiate/complain/inquire on the tenant's
      // behalf) — non-solicitation per R-27.
      return "general_inquiry";
    case "qualification":
    default:
      return "availability_inquiry";
  }
};

/** Provider-agnostic view of the contractor-call input for policy evaluation. */
const buildCallPlan = (
  body: z.infer<typeof contractorCallSchema>,
): CallPlan => ({
  businessName: body.contractorName,
  phoneNumber: body.contractorPhone,
  objective: body.taskDescription || `${body.serviceNeeded} in ${body.location}`,
  context: [body.problemDescription, body.userCriteria, body.additionalNotes]
    .filter(Boolean)
    .join("\n"),
  mustAsk: body.mustAskQuestions ?? [],
  callerIdentity: body.clientName || "a client",
  callbackNumber: body.clientPhone,
  voicemailPolicy: "hang_up",
  preAuthorizations: [],
  userApproved: body.userApproved,
});

const supervisorBrowserSchema = z.object({
  displayName: z.string().min(1).optional(),
  canPublishAudio: z.boolean().optional(),
});

const supervisorCallSchema = z.object({
  phoneNumber: z.string().regex(e164PhoneRegex, e164PhoneMessage),
  displayName: z.string().min(1).optional(),
});

const sendSmsBodySchema = z.object({
  to: z.string().regex(e164PhoneRegex, e164PhoneMessage),
  body: z.string().min(1).max(1600),
  mediaUrl: z.array(z.string().url()).max(10).optional(),
});

const smsStatusParamsSchema = z.object({
  messageSid: z.string().regex(/^SM[a-f0-9]{32}$/, "Invalid Twilio message SID"),
});

const conversationQuerySchema = z.object({
  phone: z.string().regex(e164PhoneRegex, e164PhoneMessage),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
});

const normalizeIntakeAnswers = (
  body: z.infer<typeof contractorCallSchema>,
): z.infer<typeof contractorCallSchema> => ({
  ...body,
  intakeAnswers: body.intakeAnswers?.map((answer, index) => ({
    ...answer,
    questionId: answer.questionId || `intake-${index + 1}`,
  })),
});

export default async function voiceCallRoutes(fastify: FastifyInstance) {
  const contractorCallService = new ContractorCallService({
    supabase: fastify.supabase,
  });
  // Resolve the CALL_BACKEND-selected adapter (validates the id at startup and
  // exposes the capabilities used to gate optional endpoints below). Non-livekit
  // backends (retell/vapi/mock) do not support LiveKit supervision/pause, so
  // those endpoints return 501 and never touch the LiveKit service.
  const callBackend = getCallBackend({ supabase: fastify.supabase });
  // Compliance gate (slice 6): every dispatch is policy-evaluated BEFORE any
  // backend call, with authorization + audit rows written via service role.
  const complianceDispatcher = new CompliantCallDispatcher({
    supabase: fastify.supabase,
    backend: callBackend,
  });

  fastify.post(
    "/preview-call",
    {
      schema: {
        tags: ["voice"],
        summary: "Preview a contractor call plan before dispatch",
      },
    },
    async (request, reply) => {
      try {
        const body = normalizeIntakeAnswers(contractorCallSchema.parse(request.body));
        const preview = await contractorCallService.previewCall(body);
        return {
          success: true,
          ...preview,
        };
      } catch (error) {
        reply.code(400).send({
          error: "PreviewFailed",
          message: error instanceof Error ? error.message : "Failed to preview contractor call",
        });
      }
    },
  );

  fastify.post(
    "/call-contractor",
    {
      schema: {
        tags: ["voice"],
        summary: "Create records and dispatch a contractor call",
      },
    },
    async (request, reply) => {
      try {
        const body = normalizeIntakeAnswers(contractorCallSchema.parse(request.body));

        // Demo mode has no database and simulates calls; the compliance gate
        // only governs real dispatches.
        if (isDemoMode()) {
          return await contractorCallService.dispatchCall(body);
        }

        if (!request.auth?.orgId) {
          return reply.code(403).send({
            error: "OrganizationRequired",
            message: "Dispatching calls requires an organization context",
          });
        }

        // 24h same-number redial guard (mirrors the dispatch route): a voice
        // retry to a number this org already dialed inside the window is denied
        // by the compliance engine before any backend call.
        const redialBlocked = isRedialBlocked(
          request.auth.orgId,
          body.contractorPhone,
        );

        // Policy-evaluate before dispatch: throws ComplianceDenyError (and
        // writes the deny audit row) when any policy check fails.
        const authorization = await complianceDispatcher.authorize(
          {
            plan: buildCallPlan(body),
            orgId: request.auth.orgId,
            userId: request.auth.userId,
            taskType: taskTypeForMode(body.mode),
            channel: "voice",
          },
          { redialBlocked },
        );

        // Merge the engine's ordered disclosure lines into the prompt
        // variables the voice agent renders (R-12).
        const disclosureNotes = formatDisclosureBlock(
          authorization.decision.disclosureLines,
        );
        const result = await contractorCallService.dispatchCall(
          {
            ...body,
            additionalNotes: [body.additionalNotes, disclosureNotes]
              .filter(Boolean)
              .join("\n\n"),
          },
          request.auth.orgId,
        );

        await complianceDispatcher.recordDispatchedCall(
          authorization.auditId,
          result.sessionId,
        );
        return result;
      } catch (error) {
        if (error instanceof ComplianceDenyError) {
          return reply.code(403).send({
            error: "ComplianceDenied",
            reasons: error.reasons,
            policyVersion: error.decision.policyVersion,
            message: error.message,
          });
        }
        reply.code(400).send({
          error: "DispatchFailed",
          message: error instanceof Error ? error.message : "Failed to dispatch contractor call",
        });
      }
    },
  );

  fastify.get(
    "/calls/:sessionId",
    {
      schema: {
        tags: ["voice"],
        summary: "Fetch normalized contractor call status and result",
      },
    },
    async (request, reply) => {
      try {
        const params = z.object({ sessionId: z.string().min(1) }).parse(request.params);
        const status = await contractorCallService.getCallStatus(params.sessionId);
        return {
          success: true,
          ...status,
        };
      } catch (error) {
        reply.code(404).send({
          error: "NotFound",
          message: error instanceof Error ? error.message : "Contractor call not found",
        });
      }
    },
  );

  fastify.post(
    "/calls/:sessionId/supervisor/browser-token",
    {
      schema: {
        tags: ["voice"],
        summary: "Create a LiveKit browser token for live call monitoring",
      },
    },
    async (request, reply) => {
      if (!callBackend.capabilities.supportsSupervision) {
        return reply.code(501).send({
          error: "SupervisionUnsupported",
          message: `Live supervision is not supported by the ${callBackend.id} call backend`,
        });
      }
      try {
        const params = sessionParamsSchema.parse(request.params);
        const body = supervisorBrowserSchema.parse(request.body ?? {});
        const result = await contractorCallService.createSupervisorBrowserToken({
          sessionId: params.sessionId,
          displayName: body.displayName,
          canPublishAudio: body.canPublishAudio,
        });
        return {
          success: true,
          ...result,
        };
      } catch (error) {
        reply.code(400).send({
          error: "SupervisorTokenFailed",
          message:
            error instanceof Error
              ? error.message
              : "Failed to create supervisor browser token",
        });
      }
    },
  );

  fastify.post(
    "/calls/:sessionId/supervisor/call",
    {
      schema: {
        tags: ["voice"],
        summary: "Dial a supervisor into the active LiveKit call",
      },
    },
    async (request, reply) => {
      if (!callBackend.capabilities.supportsSupervision) {
        return reply.code(501).send({
          error: "SupervisionUnsupported",
          message: `Live supervisor dial-in is not supported by the ${callBackend.id} call backend`,
        });
      }
      try {
        const params = sessionParamsSchema.parse(request.params);
        const body = supervisorCallSchema.parse(request.body);
        const result = await contractorCallService.addSupervisorCall({
          sessionId: params.sessionId,
          phoneNumber: body.phoneNumber,
          displayName: body.displayName,
        });
        return {
          success: true,
          ...result,
        };
      } catch (error) {
        reply.code(400).send({
          error: "SupervisorCallFailed",
          message:
            error instanceof Error
              ? error.message
              : "Failed to dial supervisor into live call",
        });
      }
    },
  );

  fastify.post(
    "/calls/:sessionId/pause",
    {
      schema: {
        tags: ["voice"],
        summary: "Pause the active voice agent so a supervisor can listen or speak",
      },
    },
    async (request, reply) => {
      if (!callBackend.capabilities.supportsPause) {
        return reply.code(501).send({
          error: "PauseUnsupported",
          message: `Pause is not supported by the ${callBackend.id} call backend`,
        });
      }
      try {
        const params = sessionParamsSchema.parse(request.params);
        const result = await contractorCallService.controlActiveCall({
          sessionId: params.sessionId,
          action: "pause",
        });
        return {
          success: true,
          ...result,
        };
      } catch (error) {
        reply.code(400).send({
          error: "PauseFailed",
          message:
            error instanceof Error ? error.message : "Failed to pause active call",
        });
      }
    },
  );

  fastify.post(
    "/calls/:sessionId/resume",
    {
      schema: {
        tags: ["voice"],
        summary: "Resume the paused voice agent",
      },
    },
    async (request, reply) => {
      if (!callBackend.capabilities.supportsPause) {
        return reply.code(501).send({
          error: "ResumeUnsupported",
          message: `Resume is not supported by the ${callBackend.id} call backend`,
        });
      }
      try {
        const params = sessionParamsSchema.parse(request.params);
        const result = await contractorCallService.controlActiveCall({
          sessionId: params.sessionId,
          action: "resume",
        });
        return {
          success: true,
          ...result,
        };
      } catch (error) {
        reply.code(400).send({
          error: "ResumeFailed",
          message:
            error instanceof Error ? error.message : "Failed to resume active call",
        });
      }
    },
  );

  fastify.post(
    "/sms/send",
    {
      schema: {
        tags: ["voice"],
        summary: "Send an SMS or MMS message to any phone number via Twilio",
      },
    },
    async (request, reply) => {
      try {
        const body = sendSmsBodySchema.parse(request.body);
        const twilioClient = new DirectTwilioClient(fastify.log);
        if (!twilioClient.isAvailable()) {
          return reply.code(503).send({
            error: "TwilioNotConfigured",
            message: "Twilio credentials are not configured",
          });
        }
        const result = await twilioClient.sendRawSms(body);
        if (!result.success) {
          return reply.code(502).send({
            error: "SmsSendFailed",
            message: result.error || "Failed to send SMS",
          });
        }
        return {
          success: true,
          messageSid: result.messageSid,
          messageStatus: result.messageStatus,
        };
      } catch (error) {
        reply.code(400).send({
          error: "SmsSendFailed",
          message: error instanceof Error ? error.message : "Failed to send SMS",
        });
      }
    },
  );

  fastify.get(
    "/sms/:messageSid/status",
    {
      schema: {
        tags: ["voice"],
        summary: "Check delivery status of a sent SMS by Twilio message SID",
      },
    },
    async (request, reply) => {
      try {
        const params = smsStatusParamsSchema.parse(request.params);
        const twilioClient = new DirectTwilioClient(fastify.log);
        const result = await twilioClient.getMessageStatus(params.messageSid);
        if (!result.success) {
          return reply.code(502).send({
            error: "StatusCheckFailed",
            message: result.errorMessage || "Failed to check message status",
          });
        }
        return result;
      } catch (error) {
        reply.code(400).send({
          error: "StatusCheckFailed",
          message: error instanceof Error ? error.message : "Invalid request",
        });
      }
    },
  );

  fastify.get(
    "/sms/conversation",
    {
      schema: {
        tags: ["voice"],
        summary: "List SMS conversation with a phone number (sent and received messages)",
      },
    },
    async (request, reply) => {
      try {
        const query = conversationQuerySchema.parse(request.query);
        const twilioClient = new DirectTwilioClient(fastify.log);
        if (!twilioClient.isAvailable()) {
          return reply.code(503).send({
            error: "TwilioNotConfigured",
            message: "Twilio credentials are not configured",
          });
        }
        const result = await twilioClient.listMessages(query.phone, query.limit);
        if (!result.success) {
          return reply.code(502).send({
            error: "ConversationFetchFailed",
            message: result.error || "Failed to fetch conversation",
          });
        }
        return {
          success: true,
          messages: result.messages,
          count: result.messages.length,
        };
      } catch (error) {
        reply.code(400).send({
          error: "ConversationFetchFailed",
          message: error instanceof Error ? error.message : "Invalid request",
        });
      }
    },
  );
}
