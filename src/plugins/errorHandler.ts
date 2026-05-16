import fp from "fastify-plugin";
import { ZodError } from "zod";

import { AppError } from "../lib/errors";

function getStatusCode(error: unknown): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return 500;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected server error";
}

export const errorHandlerPlugin = fp(async (fastify) => {
  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "validation_error",
          message: "Validation failed",
          details: { issues: error.issues }
        }
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details
        }
      });
    }

    const statusCode = getStatusCode(error);
    const codeByStatus: Record<number, string> = {
      401: "unauthorized",
      403: "ip_not_allowed",
      404: "invoice_not_found",
      429: "rate_limited"
    };

    return reply.status(statusCode).send({
      error: {
        code:
          codeByStatus[statusCode] ??
          (statusCode >= 500 ? "internal_server_error" : "request_error"),
        message:
          statusCode >= 500
            ? "Unexpected server error"
            : getErrorMessage(error),
        details: {}
      }
    });
  });
});
