import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";

import { loadEnv, type Env } from "../config/env";
import { createDatabase } from "../db/client";
import { invoices, tenants } from "../db/schema";
import { decideCancel } from "../domain/cancelRules";
import { InvoiceManager } from "../domain/InvoiceManager";
import { IntegratorError } from "../domain/providers/nilvera/errors";
import { transitionInvoice } from "../lib/invoiceTransitions";
import { reliabilityBackoffStrategy } from "../lib/queueBackoff";
import { enqueueInvoiceWebhook } from "../lib/webhookNotify";
import { createRedisConnection } from "../queue/invoiceQueue";

import type { CancelJobData } from "../queue/cancelQueue";

export type WorkerRuntime = {
  worker: Worker<CancelJobData>;
  close: () => Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown cancel error";
}

export function startCancelInvoiceWorker(env: Env = loadEnv()): WorkerRuntime {
  const { db, pool } = createDatabase(env.DATABASE_URL);
  const redisConnection = createRedisConnection(env.REDIS_URL);
  const manager = new InvoiceManager({
    encryptionKey: env.EFATURA_ENC_KEY,
    nilveraMockMode: env.EFATURA_NILVERA_MOCK
  });

  const worker = new Worker<CancelJobData>(
    "invoice-cancel",
    async (job: Job<CancelJobData>) => {
      const { invoiceId, reason } = job.data;

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

      // Yetkili karar worker'da yeniden hesaplanır (race-safe).
      const decision = decideCancel(
        invoice,
        env.EFATURA_CANCEL_WINDOW_DAYS
      );

      try {
        const result = await manager.cancelInvoice(
          tenant,
          invoice.externalId as string,
          reason
        );

        await transitionInvoice(db, invoice, decision.targetStatus, {
          actor: "worker",
          reason: `Cancel (${decision.action}): ${reason}`,
          patch: {
            type: decision.type,
            cancelledAt: new Date(),
            responsePayload: result.raw,
            errorMessage: null
          }
        });

        await enqueueInvoiceWebhook(invoice.id, decision.targetStatus, env);
      } catch (error: unknown) {
        const message = errorMessage(error);
        const retryable =
          error instanceof IntegratorError ? error.retryable : true;

        await transitionInvoice(db, invoice, invoice.status, {
          actor: "worker",
          reason: `Cancel failed: ${message}`,
          patch: { errorMessage: message }
        });

        if (!retryable) {
          return;
        }
        throw error;
      }
    },
    {
      connection: redisConnection,
      settings: { backoffStrategy: reliabilityBackoffStrategy }
    }
  );

  return {
    worker,
    close: async () => {
      await worker.close();
      await redisConnection.quit();
      await pool.end();
    }
  };
}
