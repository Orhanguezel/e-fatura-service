import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import { invoiceEvents, invoices, tenants } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { invoiceQueue } from "../../queue/invoiceQueue";

const listQuerySchema = {
  type: "object",
  properties: {
    status: { type: "string" },
    tenant_key: { type: "string" },
    page: { type: "integer", minimum: 1, default: 1 },
    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 }
  }
} as const;

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticateAdmin);

  fastify.get(
    "/admin/invoices",
    {
      schema: {
        tags: ["admin"],
        querystring: listQuerySchema
      }
    },
    async (request) => {
      const query = request.query as {
        status?: string;
        tenant_key?: string;
        page?: number;
        limit?: number;
      };
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const offset = (page - 1) * limit;

      const conditions = [];

      if (query.status) {
        conditions.push(eq(invoices.status, query.status as never));
      }

      if (query.tenant_key) {
        conditions.push(eq(tenants.tenantKey, query.tenant_key));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await fastify.db
        .select({
          id: invoices.id,
          tenant_key: tenants.tenantKey,
          idempotency_key: invoices.idempotencyKey,
          status: invoices.status,
          type: invoices.type,
          ettn: invoices.ettn,
          invoice_number: invoices.invoiceNumber,
          total: invoices.total,
          attempts: invoices.attempts,
          error_message: invoices.errorMessage,
          created_at: invoices.createdAt,
          sent_at: invoices.sentAt,
          cancelled_at: invoices.cancelledAt
        })
        .from(invoices)
        .innerJoin(tenants, eq(invoices.tenantId, tenants.id))
        .where(whereClause)
        .orderBy(desc(invoices.createdAt))
        .limit(limit)
        .offset(offset);

      const [countRow] = await fastify.db
        .select({ count: sql<number>`count(*)` })
        .from(invoices)
        .innerJoin(tenants, eq(invoices.tenantId, tenants.id))
        .where(whereClause);

      return {
        page,
        limit,
        total: countRow?.count ?? 0,
        items: rows.map((row) => ({
          ...row,
          created_at: row.created_at.toISOString(),
          sent_at: row.sent_at?.toISOString() ?? null,
          cancelled_at: row.cancelled_at?.toISOString() ?? null
        }))
      };
    }
  );

  fastify.get(
    "/admin/invoices/:id/events",
    {
      schema: {
        tags: ["admin"],
        params: {
          type: "object",
          required: ["id"],
          properties: {
            id: { type: "string", pattern: "^[0-9]+$" }
          }
        }
      }
    },
    async (request) => {
      const params = request.params as { id: string };
      const invoiceId = Number(params.id);

      const events = await fastify.db
        .select()
        .from(invoiceEvents)
        .where(eq(invoiceEvents.invoiceId, invoiceId))
        .orderBy(desc(invoiceEvents.createdAt));

      return {
        invoice_id: invoiceId,
        events: events.map((event) => ({
          id: event.id,
          from_status: event.fromStatus,
          to_status: event.toStatus,
          actor: event.actor,
          reason: event.reason,
          created_at: event.createdAt.toISOString()
        }))
      };
    }
  );

  fastify.post(
    "/admin/invoices/:id/retry",
    {
      schema: {
        tags: ["admin"],
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
      const params = request.params as { id: string };
      const invoiceId = Number(params.id);

      const [invoice] = await fastify.db
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);

      if (!invoice) {
        throw new AppError(404, "invoice_not_found", "Invoice not found");
      }

      if (invoice.status !== "failed") {
        throw new AppError(
          422,
          "invoice_rule_violation",
          "Only failed invoices can be retried"
        );
      }

      await fastify.db
        .update(invoices)
        .set({
          status: "pending",
          errorMessage: null,
          updatedAt: new Date()
        })
        .where(eq(invoices.id, invoice.id));

      await fastify.db.insert(invoiceEvents).values({
        invoiceId: invoice.id,
        fromStatus: "failed",
        toStatus: "pending",
        actor: "admin",
        reason: "Manual retry from admin",
        createdAt: new Date()
      });

      try {
        await invoiceQueue.add("create-invoice", { invoiceId: invoice.id });
      } catch {
        throw new AppError(
          503,
          "service_unavailable",
          "Invoice queue is unavailable"
        );
      }

      return reply.code(202).send({
        invoice_id: invoice.id,
        status: "pending"
      });
    }
  );
};
