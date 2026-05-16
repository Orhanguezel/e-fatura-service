import { Queue, Worker } from "bullmq";
import { and, eq, isNotNull } from "drizzle-orm";

import { loadEnv, type Env } from "../config/env";
import { createDatabase } from "../db/client";
import { invoices, tenants } from "../db/schema";
import { InvoiceManager } from "../domain/InvoiceManager";
import { transitionInvoice } from "../lib/invoiceTransitions";
import { enqueueInvoiceWebhook } from "../lib/webhookNotify";
import { createRedisConnection } from "../queue/invoiceQueue";

export type WorkerRuntime = {
  worker: Worker;
  queue: Queue;
  close: () => Promise<void>;
};

const QUEUE_NAME = "status-sync";
const REPEAT_JOB = "status-sync-tick";

export function startStatusSyncWorker(env: Env = loadEnv()): WorkerRuntime {
  const { db, pool } = createDatabase(env.DATABASE_URL);
  const redisConnection = createRedisConnection(env.REDIS_URL);

  const queue = new Queue(QUEUE_NAME, { connection: redisConnection });
  void queue.upsertJobScheduler(
    REPEAT_JOB,
    { pattern: env.STATUS_SYNC_CRON },
    {
      name: REPEAT_JOB,
      opts: { removeOnComplete: true, removeOnFail: true }
    }
  );

  const manager = new InvoiceManager({
    encryptionKey: env.EFATURA_ENC_KEY,
    nilveraMockMode: env.EFATURA_NILVERA_MOCK
  });

  const worker = new Worker(
    QUEUE_NAME,
    async () => {
      const pending = await db
        .select()
        .from(invoices)
        .where(
          and(eq(invoices.status, "sent"), isNotNull(invoices.externalId))
        )
        .limit(env.STATUS_SYNC_BATCH);

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

        const status = await manager.syncInvoiceStatus(
          tenant,
          invoice.externalId
        );

        if (status === invoice.status) {
          continue;
        }

        await transitionInvoice(db, invoice, status, {
          actor: "sync-cron",
          reason: `Integrator status sync → ${status}`
        });
        await enqueueInvoiceWebhook(invoice.id, status, env);
      }
    },
    { connection: redisConnection }
  );

  return {
    worker,
    queue,
    close: async () => {
      await queue.removeJobScheduler(REPEAT_JOB);
      await worker.close();
      await queue.close();
      await redisConnection.quit();
      await pool.end();
    }
  };
}
