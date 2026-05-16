import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";

import { loadEnv, type Env } from "../config/env";
import { createDatabase } from "../db/client";
import { invoices, tenants } from "../db/schema";
import { InvoiceManager } from "../domain/InvoiceManager";
import { IntegratorError } from "../domain/providers/nilvera/errors";
import { transitionInvoice } from "../lib/invoiceTransitions";
import { reliabilityBackoffStrategy } from "../lib/queueBackoff";
import type { CancelJobData } from "../queue/cancelQueue";
import { redisConnection } from "../queue/invoiceQueue";

export type WorkerRuntime = {
  worker: Worker<CancelJobData>;
  close: () => Promise<void>;
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown cancel error";
}

export function startCancelInvoiceWorker(env: Env = loadEnv()): WorkerRuntime {
  const { db, pool } = createDatabase(env.DATABASE_URL);
  const manager = new InvoiceManager({
    encryptionKey: env.EFATURA_ENC_KEY,
    nilveraMockMode: env.EFATURA_NILVERA_MOCK
  });

  const worker = new Worker<CancelJobData>(
    "invoice-cancel",
    async (job: Job<CancelJobData>) => {
      const { invoiceId, reason, targetStatus, invoiceType } = job.data;

      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);

      if (!invoice?.externalId) {
        throw new Error(`Invoice ${String(invoiceId)} not found or not sent`);
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
        const result = await manager.cancelInvoice(
          tenant,
          invoice.externalId,
          reason
        );

        await transitionInvoice(db, invoice, targetStatus, {
          actor: "worker",
          reason: `Cancel (${invoiceType}): ${reason}`,
          patch: {
            type: invoiceType,
            responsePayload: result.raw,
            cancelledAt: new Date()
          },
          notifyWebhook: true
        });
      } catch (error: unknown) {
        const message = getErrorMessage(error);
        const retryable =
          error instanceof IntegratorError ? error.retryable : true;

        await transitionInvoice(db, invoice, "failed", {
          actor: "worker",
          reason: `Cancel failed: ${message}`,
          patch: { errorMessage: message },
          notifyWebhook: false
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
