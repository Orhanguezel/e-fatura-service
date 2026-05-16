import { Worker } from "bullmq";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { loadEnv, type Env } from "../config/env";
import { createDatabase } from "../db/client";
import { invoices, tenants } from "../db/schema";
import { InvoiceManager } from "../domain/InvoiceManager";
import { transitionInvoice } from "../lib/invoiceTransitions";
import { redisConnection } from "../queue/invoiceQueue";
import { statusSyncQueue } from "../queue/statusSyncQueue";

export type WorkerRuntime = {
  worker: Worker;
  close: () => Promise<void>;
};

export async function startSyncStatusWorker(
  env: Env = loadEnv()
): Promise<WorkerRuntime> {
  const { db, pool } = createDatabase(env.DATABASE_URL);
  const manager = new InvoiceManager({
    encryptionKey: env.EFATURA_ENC_KEY,
    nilveraMockMode: env.EFATURA_NILVERA_MOCK
  });

  await statusSyncQueue.add(
    "tick",
    {},
    {
      repeat: { every: env.STATUS_SYNC_INTERVAL_MS },
      jobId: "status-sync-cron"
    }
  );

  const worker = new Worker(
    "status-sync",
    async () => {
      const pending = await db
        .select()
        .from(invoices)
        .where(
          and(
            inArray(invoices.status, ["sent", "sending"]),
            isNotNull(invoices.externalId)
          )
        )
        .limit(env.STATUS_SYNC_BATCH_SIZE);

      for (const invoice of pending) {
        if (!invoice.externalId) {
          continue;
        }

        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, invoice.tenantId))
          .limit(1);

        if (!tenant) {
          continue;
        }

        try {
          const remoteStatus = await manager.syncInvoiceStatus(
            tenant,
            invoice.externalId
          );

          if (remoteStatus === invoice.status) {
            continue;
          }

          await transitionInvoice(db, invoice, remoteStatus, {
            actor: "sync-cron",
            reason: "Nilvera status sync",
            notifyWebhook: true
          });
        } catch {
          // Per-invoice errors should not stop the cron batch
        }
      }
    },
    { connection: redisConnection }
  );

  return {
    worker,
    close: async () => {
      await worker.close();
      await pool.end();
    }
  };
}
