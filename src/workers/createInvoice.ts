import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";

import { loadEnv, type Env } from "../config/env";
import { createDatabase } from "../db/client";
import { invoices, tenants } from "../db/schema";
import { InvoiceManager } from "../domain/InvoiceManager";
import { IntegratorError } from "../domain/providers/nilvera/errors";
import { transitionInvoice } from "../lib/invoiceTransitions";
import { mapApiPayloadToInvoiceRequest } from "../domain/mapApiPayload";
import type { InvoiceResult } from "../domain/types";
import { reliabilityBackoffStrategy } from "../lib/queueBackoff";
import { redisConnection } from "../queue/invoiceQueue";
import { invoiceCreateSchema } from "../routes/v1/invoiceSchemas";

type CreateInvoiceJobData = {
  invoiceId: number;
};

export type WorkerRuntime = {
  worker: Worker<CreateInvoiceJobData>;
  close: () => Promise<void>;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown worker error";
}

export function startCreateInvoiceWorker(env: Env = loadEnv()): WorkerRuntime {
  const { db, pool } = createDatabase(env.DATABASE_URL);
  const manager = new InvoiceManager({
    encryptionKey: env.EFATURA_ENC_KEY,
    nilveraMockMode: env.EFATURA_NILVERA_MOCK
  });

  const worker = new Worker<CreateInvoiceJobData>(
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
        let sending = await transitionInvoice(db, invoice, "sending", {
          actor: "worker",
          reason: "Job started",
          notifyWebhook: false
        });

        let result: InvoiceResult;

        if (sending.externalId) {
          const status = await manager.syncInvoiceStatus(
            tenant,
            sending.externalId
          );
          result = {
            externalId: sending.externalId,
            ettn: sending.ettn,
            invoiceNumber: sending.invoiceNumber,
            status,
            pdfPath: sending.pdfPath,
            raw: { synced: true }
          };
        } else {
          const apiPayload = invoiceCreateSchema.parse(sending.requestPayload);
          const domainRequest = mapApiPayloadToInvoiceRequest(
            apiPayload,
            tenant,
            sending.idempotencyKey
          );
          result = await manager.createInvoice(tenant, domainRequest);
        }

        await transitionInvoice(db, sending, result.status, {
          actor: "worker",
          reason: "Integrator success",
          patch: {
            externalId: result.externalId,
            ettn: result.ettn,
            invoiceNumber: result.invoiceNumber,
            pdfPath: result.pdfPath,
            responsePayload: result.raw,
            sentAt: new Date(),
            errorMessage: null
          },
          notifyWebhook: true
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        const retryable =
          error instanceof IntegratorError ? error.retryable : true;

        const current =
          (
            await db
              .select()
              .from(invoices)
              .where(eq(invoices.id, invoice.id))
              .limit(1)
          )[0] ?? invoice;

        await transitionInvoice(db, current, "failed", {
          actor: "worker",
          reason: message,
          patch: {
            errorMessage: message,
            attempts: current.attempts + 1
          },
          notifyWebhook: true
        });

        if (!retryable) {
          return;
        }

        throw error;
      }
    },
    {
      connection: redisConnection,
      settings: {
        backoffStrategy: reliabilityBackoffStrategy
      }
    }
  );

  return {
    worker,
    close: async () => {
      await worker.close();
      await pool.end();
    }
  };
}
