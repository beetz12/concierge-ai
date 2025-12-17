import { FastifyInstance } from "fastify";
import { z } from "zod";
import { generateIntakeQuestions } from "../services/intake/question-generator.js";

// Zod schemas for request validation
const generateIntakeQuestionsSchema = z.object({
  serviceType: z.string().min(1, "Service type is required"),
  problemDescription: z.string().min(1, "Problem description is required"),
  urgency: z
    .enum(["immediate", "within_24_hours", "within_2_days", "flexible"])
    .optional(),
});

export default async function intakeRoutes(fastify: FastifyInstance) {
  /**
   * POST /generate-questions
   * Generate professional intake questions based on service type and problem description
   */
  fastify.post(
    "/generate-questions",
    {
      schema: {
        description:
          "Generate professional intake questions using Gemini AI based on service type and problem description",
        tags: ["intake"],
        body: {
          type: "object",
          required: ["serviceType", "problemDescription"],
          properties: {
            serviceType: {
              type: "string",
              description: "Type of service being requested (e.g., plumber, electrician)",
            },
            problemDescription: {
              type: "string",
              description: "Description of the problem or service needed",
            },
            urgency: {
              type: "string",
              enum: ["immediate", "within_24_hours", "within_2_days", "flexible"],
              description: "Urgency level of the request",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    question: { type: "string" },
                    type: {
                      type: "string",
                      enum: ["text", "radio", "select"],
                    },
                    options: {
                      type: "array",
                      items: { type: "string" },
                    },
                    placeholder: { type: "string" },
                    required: { type: "boolean" },
                  },
                },
              },
              reasoning: { type: "string" },
              estimatedTime: { type: "string" },
            },
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
              details: { type: "array" },
            },
          },
          500: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
              questions: {
                type: "array",
                description: "Empty array as fallback",
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = generateIntakeQuestionsSchema.parse(request.body);
        const result = await generateIntakeQuestions({
          serviceType: body.serviceType,
          problemDescription: body.problemDescription,
          urgency: body.urgency,
        });
        return result;
      } catch (error: unknown) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({
            error: "Validation Error",
            details: error.errors,
          });
        }

        // Log the error
        const errorMessage = error instanceof Error ? error.message : String(error);
        fastify.log.error(error);

        // Return graceful fallback with empty questions array
        return reply.status(500).send({
          error: "Failed to generate questions",
          message: errorMessage,
          questions: [], // Fallback empty array so frontend can continue
        });
      }
    }
  );
}
