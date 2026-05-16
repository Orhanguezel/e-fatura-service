import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import { invoiceEvents, invoices, type Tenant } from "../../db/schema";
import { buildInvoiceRequest } from "../../domain/buildInvoiceRequest";
import { AppError } from "../../lib/errors";
import {
  cancelInvoiceSchema,
  invoiceCreateSchema,
  invoiceParamsSchema
} from "./invoiceSchemas";

export const invoiceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  function requireTenant(tenant: Tenant | undefined): Tenant {
    if (!tenant) {
      throw new AppError(
        500,
        "internal_server_error",
        "Tenant not found in request"
      );
    }

    return tenant;
  }

  function stableJson(value: unknown): string {
    return JSON.stringify(value);
  }

  fastify.post(
    "/invoices",
    {
      schema: {
        tags: ["invoices"],
        security: [{ apiKey: [] }],
        headers: {
          type: "object",
          required: ["idempotency-key"],
          properties: {
            "idempotency-key": { type: "string", minLength: 1 }
          }
        },
        body: {
          type: "object",
          required: ["buyer", "lines", "issue_date"],
          additionalProperties: false
        },
        response: {
          200: {
            type: "object",
            required: ["invoice_id", "status"],
            properties: {
              invoice_id: { type: "number" },
              status: { type: "string" },
              ettn: { type: "string" },
              invoice_number: { type: "string" }
            }
          },
          202: {
            type: "object",
            required: ["invoice_id", "status"],
            properties: {
              invoice_id: { type: "number" },
              status: { type: "string" }
            }
          },
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
      const idempotencyKey = request.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string" || idempotencyKey.length === 0) {
        throw new AppError(
          400,
          "validation_error",
          "Idempotency-Key header is required",
          { fields: ["Idempotency-Key"] }
        );
      }

      const body = invoiceCreateSchema.parse(request.body);
      const tenant = requireTenant(request.tenant);

      // 1. Idempotency Check
      const [existingInvoice] = await fastify.db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.tenantId, tenant.id),
            eq(invoices.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1);

      if (existingInvoice) {
        if (stableJson(existingInvoice.requestPayload) !== stableJson(body)) {
          throw new AppError(
            409,
            "idempotency_conflict",
            "Idempotency-Key was already used with a different payload"
          );
        }

        return reply.code(200).send({
          invoice_id: existingInvoice.id,
          status: existingInvoice.status,
          ettn: existingInvoice.ettn,
          invoice_number: existingInvoice.invoiceNumber
        });
      }

      const invoiceRequest = buildInvoiceRequest(tenant, idempotencyKey, body);

      // 3. Create Pending Invoice
      const [inserted] = await fastify.db.insert(invoices).values({
        tenantId: tenant.id,
        idempotencyKey,
        status: "pending",
        type: "earsiv",
        total: invoiceRequest.totalsTRY.gross,
        taxTotal: invoiceRequest.totalsTRY.vat,
        currency: body.currency,
        exchangeRate: body.exchange_rate ?? null,
        requestPayload: body,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const invoiceId = inserted.insertId;

      await fastify.db.insert(invoiceEvents).values({
        invoiceId,
        toStatus: "pending",
        actor: "api",
        reason: "Invoice created via API",
        createdAt: new Date()
      });

      // 4. Queue Job
      try {
        const { getInvoiceQueue } = await import("../../queue/invoiceQueue");
        await getInvoiceQueue().add("create-invoice", { invoiceId });
      } catch (error) {
        throw new AppError(
          503,
          "service_unavailable",
          "Invoice queue is unavailable",
          { cause: error instanceof Error ? error.message : "unknown" }
        );
      }

      return reply.code(202).send({
        invoice_id: invoiceId,
        status: "pending"
      });
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
          200: {
            type: "object",
            required: ["invoice_id", "status", "type", "currency", "total", "tax_total"],
            properties: {
              invoice_id: { type: "number" },
              status: { type: "string" },
              type: { type: "string" },
              ettn: { type: "string", nullable: true },
              invoice_number: { type: "string", nullable: true },
              currency: { type: "string" },
              total: { type: "string" },
              tax_total: { type: "string" },
              pdf_url: { type: "string", nullable: true },
              error_message: { type: "string", nullable: true },
              created_at: { type: "string" },
              sent_at: { type: "string", nullable: true },
              cancelled_at: { type: "string", nullable: true }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const tenant = requireTenant(request.tenant);
      const params = invoiceParamsSchema.parse(request.params);
      const [invoice] = await fastify.db
        .select()
        .from(invoices)
        .where(and(eq(invoices.tenantId, tenant.id), eq(invoices.id, params.id)))
        .limit(1);

      if (!invoice) {
        throw new AppError(404, "invoice_not_found", "Invoice not found");
      }

      return reply.send({
        invoice_id: invoice.id,
        status: invoice.status,
        type: invoice.type,
        ettn: invoice.ettn,
        invoice_number: invoice.invoiceNumber,
        currency: invoice.currency,
        total: invoice.total,
        tax_total: invoice.taxTotal,
        pdf_url: invoice.pdfPath ? `/v1/invoices/${String(invoice.id)}/pdf` : null,
        error_message: invoice.errorMessage,
        created_at: invoice.createdAt.toISOString(),
        sent_at: invoice.sentAt?.toISOString() ?? null,
        cancelled_at: invoice.cancelledAt?.toISOString() ?? null
      });
    }
  );

  fastify.get(
    "/invoices/:id/pdf",
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
        }
      }
    },
    async (request, reply) => {
      const tenant = requireTenant(request.tenant);
      const params = invoiceParamsSchema.parse(request.params);
      const [invoice] = await fastify.db
        .select()
        .from(invoices)
        .where(and(eq(invoices.tenantId, tenant.id), eq(invoices.id, params.id)))
        .limit(1);

      if (!invoice) {
        throw new AppError(404, "invoice_not_found", "Invoice not found");
      }

      if (!invoice.pdfPath) {
        throw new AppError(409, "pdf_not_ready", "Invoice PDF is not ready yet");
      }

      const { loadEnv } = await import("../../config/env");
      const env = loadEnv();

      const { InvoiceManager } = await import("../../domain/InvoiceManager");
      const manager = new InvoiceManager({
        encryptionKey: env.EFATURA_ENC_KEY,
        nilveraMockMode: env.EFATURA_NILVERA_MOCK
      });

      if (!invoice.externalId) {
        throw new AppError(409, "external_id_missing", "Invoice has no external ID");
      }

      const pdfResult = await manager.getPdf(tenant, invoice.externalId);

      if ("url" in pdfResult) {
        return reply.redirect(pdfResult.url);
      }

      return reply
        .type("application/pdf")
        .header("Content-Disposition", `attachment; filename="invoice-${String(invoice.id)}.pdf"`)
        .send(pdfResult);
    }
  );

  fastify.post(
    "/invoices/:id/cancel",
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
        body: {
          type: "object",
          required: ["reason"],
          properties: {
            reason: { type: "string", minLength: 1, maxLength: 500 }
          }
        }
      }
    },
    async (request, reply) => {
      invoiceParamsSchema.parse(request.params);
      cancelInvoiceSchema.parse(request.body);

      return reply.code(501).send({
        error: {
          code: "not_implemented",
          message: "Invoice cancellation is scheduled for phase 4",
          details: {}
        }
      });
    }
  );
};
