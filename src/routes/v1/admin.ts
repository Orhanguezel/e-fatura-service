import { and, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import { loadEnv } from "../../config/env";
import { invoiceEvents, invoices } from "../../db/schema";
import { safeEqualSecrets } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { transitionInvoice } from "../../lib/invoiceTransitions";
import { adminListQuerySchema, invoiceParamsSchema } from "./invoiceSchemas";

/**
 * Admin uçları: tenant `X-Api-Key` DEĞİL, `X-Admin-Token` ile korunur
 * (= env.EFATURA_ADMIN_TOKEN, commit edilmez). docs/CANCEL-RULES.md §Admin.
 */
export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", async (request) => {
    const configured = loadEnv().EFATURA_ADMIN_TOKEN;
    const provided = request.headers["x-admin-token"];

    if (
      !configured ||
      typeof provided !== "string" ||
      !safeEqualSecrets(provided, configured)
    ) {
      throw new AppError(401, "unauthorized", "Invalid or missing admin token");
    }
  });

  fastify.get("/admin/invoices", async (request) => {
    const query = adminListQuerySchema.parse(request.query);
    const filters = [
      ...(query.status ? [eq(invoices.status, query.status)] : []),
      ...(query.tenant_id ? [eq(invoices.tenantId, query.tenant_id)] : [])
    ];

    const rows = await fastify.db
      .select()
      .from(invoices)
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(invoices.id))
      .limit(query.limit)
      .offset(query.offset);

    return {
      items: rows.map((invoice) => ({
        invoice_id: invoice.id,
        tenant_id: invoice.tenantId,
        status: invoice.status,
        type: invoice.type,
        ettn: invoice.ettn,
        invoice_number: invoice.invoiceNumber,
        total: invoice.total,
        currency: invoice.currency,
        error_message: invoice.errorMessage,
        attempts: invoice.attempts,
        created_at: invoice.createdAt.toISOString()
      })),
      limit: query.limit,
      offset: query.offset
    };
  });

  fastify.post("/admin/invoices/:id/retry", async (request, reply) => {
    const params = invoiceParamsSchema.parse(request.params);

    const [invoice] = await fastify.db
      .select()
      .from(invoices)
      .where(eq(invoices.id, params.id))
      .limit(1);

    if (!invoice) {
      throw new AppError(404, "invoice_not_found", "Invoice not found");
    }

    if (invoice.status !== "failed") {
      throw new AppError(
        422,
        "invoice_rule_violation",
        `Only failed invoices can be retried (current: ${invoice.status})`
      );
    }

    await transitionInvoice(fastify.db, invoice, "pending", {
      actor: "admin",
      reason: "Manual retry",
      patch: { errorMessage: null }
    });

    const { getInvoiceQueue } = await import("../../queue/invoiceQueue");
    await getInvoiceQueue().add("create-invoice", { invoiceId: invoice.id });

    return reply.code(202).send({ invoice_id: invoice.id, status: "pending" });
  });

  fastify.get("/admin/invoices/:id/events", async (request) => {
    const params = invoiceParamsSchema.parse(request.params);

    const rows = await fastify.db
      .select()
      .from(invoiceEvents)
      .where(eq(invoiceEvents.invoiceId, params.id))
      .orderBy(desc(invoiceEvents.id));

    return {
      items: rows.map((event) => ({
        from_status: event.fromStatus,
        to_status: event.toStatus,
        actor: event.actor,
        reason: event.reason,
        created_at: event.createdAt.toISOString()
      }))
    };
  });
};
