/**
 * Global error handler + not-found handler.
 *
 * Every unhandled error from a route lands here so the API returns a
 * consistent JSON envelope { statusCode, error, message, requestId } instead
 * of leaking stack traces or Fastify's default shape. Known domain errors are
 * mapped to their proper status codes; anything unmapped becomes a 500 whose
 * details are logged (with the request id) and reported to Sentry, but never
 * echoed to the client.
 */
import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";
import { ComplianceDenyError } from "../services/compliance/dispatch.js";
import { CallGuardError } from "../services/call-backend/retell/guards.js";
import { captureException } from "../config/observability.js";

interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string;
  requestId: string;
  /** Present only for validation errors, to aid the caller. */
  details?: unknown;
}

const STATUS_TEXT: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
};

const CALL_GUARD_STATUS: Record<string, number> = {
  user_approval_required: 403,
  invalid_phone_number: 400,
  redial_blocked: 403,
};

const errorHandlerPlugin = async (fastify: FastifyInstance): Promise<void> => {
  fastify.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const envelope: ErrorEnvelope = {
      statusCode: 404,
      error: "Not Found",
      message: `Route ${request.method} ${request.url} not found`,
      requestId: request.id,
    };
    reply.code(404).send(envelope);
  });

  fastify.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      const requestId = request.id;

      // 1) Zod validation errors -> 400 with field details.
      if (error instanceof ZodError) {
        request.log.info(
          { err: error, requestId },
          "Request rejected: validation error",
        );
        return reply.code(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Request validation failed",
          requestId,
          details: error.issues,
        } satisfies ErrorEnvelope);
      }

      // 2) Compliance policy denial -> 403.
      if (error instanceof ComplianceDenyError) {
        request.log.warn(
          { requestId, reasons: error.reasons },
          "Request denied by compliance policy",
        );
        return reply.code(403).send({
          statusCode: 403,
          error: "ComplianceDenied",
          message: error.message,
          requestId,
        } satisfies ErrorEnvelope);
      }

      // 3) Call safety guard -> 400/403 by code.
      if (error instanceof CallGuardError) {
        const status = CALL_GUARD_STATUS[error.code] ?? 400;
        request.log.warn(
          { requestId, code: error.code },
          "Request refused by call guard",
        );
        return reply.code(status).send({
          statusCode: status,
          error: "CallGuardRefused",
          message: error.message,
          requestId,
        } satisfies ErrorEnvelope);
      }

      // 4) Fastify/HTTP errors that already carry a statusCode (rate limit,
      // body-parse, schema validation, thrown httpErrors, etc.).
      const rawStatus =
        typeof error.statusCode === "number" ? error.statusCode : 500;
      const statusCode = rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;

      if (statusCode >= 500) {
        // Server faults: log the full error, report to Sentry, hide details.
        request.log.error(
          { err: error, requestId, url: request.url, method: request.method },
          "Unhandled server error",
        );
        captureException(error, {
          requestId,
          url: request.url,
          method: request.method,
        });
        return reply.code(statusCode).send({
          statusCode,
          error: STATUS_TEXT[statusCode] ?? "Internal Server Error",
          message:
            "An unexpected error occurred. Reference the request id when " +
            "reporting this issue.",
          requestId,
        } satisfies ErrorEnvelope);
      }

      // 4xx client errors: safe to surface the message.
      request.log.info(
        { err: error, requestId, statusCode },
        "Request failed with client error",
      );
      return reply.code(statusCode).send({
        statusCode,
        error: STATUS_TEXT[statusCode] ?? error.name ?? "Error",
        message: error.message || "Request failed",
        requestId,
      } satisfies ErrorEnvelope);
    },
  );
};

export default fp(errorHandlerPlugin, {
  name: "error-handler",
  fastify: ">=5.x",
});
