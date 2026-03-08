import { FastifyInstance } from "fastify";
import { z } from "zod";
import { ContractorCallService } from "../services/voice/contractor-call.service.js";

const e164PhoneRegex = /^\+1\d{10}$/;
const e164PhoneMessage = "Phone must be E.164 format (+1XXXXXXXXXX)";

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
        const result = await contractorCallService.dispatchCall(body);
        return result;
      } catch (error) {
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
}
