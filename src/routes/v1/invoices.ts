import type { FastifyPluginAsync } from "fastify";

import {
  cancelInvoiceSchema,
  invoiceCreateSchema,
  invoiceParamsSchema
} from "./invoiceSchemas";

function notImplemented(message: string) {
  return {
    error: {
      code: "not_implemented",
      message,
      details: {}
    }
  };
}

export const invoiceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.post(
    "/invoices",
    {
      schema: {
        tags: ["invoices"],
        security: [{ apiKey: [] }]
      }
    },
    async (request, reply) => {
      invoiceCreateSchema.parse(request.body);

      if (typeof request.headers["idempotency-key"] !== "string") {
        return reply.code(400).send({
          error: {
            code: "validation_error",
            message: "Idempotency-Key header is required",
            details: {}
          }
        });
      }

      return reply
        .code(501)
        .send(notImplemented("Invoice creation is scheduled for phase 2"));
    }
  );

  fastify.get(
    "/invoices/:id",
    {
      schema: {
        tags: ["invoices"],
        security: [{ apiKey: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", pattern: "^[0-9]+$" }
          }
        },
        response: {
          501: {
            type: "object",
            required: ["error"],
            properties: {
              error: {
                type: "object",
                required: ["code", "message", "details"],
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                  details: { type: "object" }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      invoiceParamsSchema.parse(request.params);

      return reply
        .code(501)
        .send(notImplemented("Invoice read endpoint is scheduled for phase 3"));
    }
  );

  fastify.get(
    "/invoices/:id/pdf",
    {
      schema: {
        tags: ["invoices"],
        security: [{ apiKey: [] }]
      }
    },
    async (request, reply) => {
      invoiceParamsSchema.parse(request.params);

      return reply
        .code(501)
        .send(notImplemented("Invoice PDF endpoint is scheduled for phase 3"));
    }
  );

  fastify.post(
    "/invoices/:id/cancel",
    {
      schema: {
        tags: ["invoices"],
        security: [{ apiKey: [] }]
      }
    },
    async (request, reply) => {
      invoiceParamsSchema.parse(request.params);
      cancelInvoiceSchema.parse(request.body);

      return reply
        .code(501)
        .send(notImplemented("Invoice cancellation is scheduled for phase 4"));
    }
  );
};
