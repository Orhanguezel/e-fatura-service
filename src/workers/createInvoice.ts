import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";

import { loadEnv } from "../config/env";
import { createDatabase } from "../db/client";
import { invoiceEvents, invoices, tenants } from "../db/schema";
import { InvoiceManager } from "../domain/InvoiceManager";
import { mapApiPayloadToInvoiceRequest } from "../domain/mapApiPayload";
import { invoiceCreateSchema } from "../routes/v1/invoiceSchemas";
import { redisConnection } from "../queue/invoiceQueue";

const env = loadEnv();
const { db } = createDatabase(env.DATABASE_URL);
const manager = new InvoiceManager(env.EFATURA_ENC_KEY);

type CreateInvoiceJobData = {
  invoiceId: number;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown worker error";
}

export const createInvoiceWorker = new Worker<CreateInvoiceJobData>(
  "invoice-create",
  async (job: Job<CreateInvoiceJobData>) => {
    const { invoiceId } = job.data;

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!invoice) {
      throw new Error(`Invoice ${String(invoiceId)} not found`);
    }

    const [tenant] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.id, invoice.tenantId))
      .limit(1);

    if (!tenant) {
      throw new Error(`Tenant ${String(invoice.tenantId)} not found`);
    }

    try {
      await db
        .update(invoices)
        .set({ status: "sending", updatedAt: new Date() })
        .where(eq(invoices.id, invoice.id));

      await db.insert(invoiceEvents).values({
        invoiceId: invoice.id,
        fromStatus: invoice.status,
        toStatus: "sending",
        actor: "system-worker",
        reason: "Job started",
        createdAt: new Date()
      });

      const apiPayload = invoiceCreateSchema.parse(invoice.requestPayload);
      const domainRequest = mapApiPayloadToInvoiceRequest(
        apiPayload,
        tenant,
        invoice.idempotencyKey
      );
      const result = await manager.createInvoice(tenant, domainRequest);

      await db
        .update(invoices)
        .set({
          status: result.status,
          externalId: result.externalId,
          ettn: result.ettn,
          invoiceNumber: result.invoiceNumber,
          pdfPath: result.pdfPath,
          responsePayload: result.raw,
          sentAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(invoices.id, invoice.id));

      await db.insert(invoiceEvents).values({
        invoiceId: invoice.id,
        fromStatus: "sending",
        toStatus: result.status,
        actor: "system-worker",
        reason: "Integrator success",
        createdAt: new Date()
      });
    } catch (error: unknown) {
      const message = getErrorMessage(error);

      await db
        .update(invoices)
        .set({
          status: "failed",
          errorMessage: message,
          updatedAt: new Date()
        })
        .where(eq(invoices.id, invoice.id));

      await db.insert(invoiceEvents).values({
        invoiceId: invoice.id,
        fromStatus: "sending",
        toStatus: "failed",
        actor: "system-worker",
        reason: message,
        createdAt: new Date()
      });

      throw error;
    }
  },
  { connection: redisConnection }
);
