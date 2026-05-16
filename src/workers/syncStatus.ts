import { Worker } from "bullmq";
import { and, eq, isNotNull } from "drizzle-orm";

import { loadEnv, type Env } from "../config/env";
import { createDatabase } from "../db/client";
import { invoices, tenants } from "../db/schema";
import { InvoiceManager } from "../domain/InvoiceManager";
import { transitionInvoice } from "../lib/invoiceTransitions";
import { redisConnection } from "../queue/invoiceQueue";

export type WorkerRuntime = {
  worker: Worker;
  close: () => Promise<void>;
};

export function startSyncStatusWorker(env: Env = loadEnv()): WorkerRuntime {
  const { db, pool } = createDatabase(env.DATABASE_URL);
  const manager = new InvoiceManager({
    encryptionKey: env.EFATURA_ENC_KEY,
    nilveraMockMode: env.EFATURA_NILVERA_MOCK
  });

  const worker = new Worker(
    "status-sync",
    async () => {
      const pendingInvoices = await db
        .select()
        .from(invoices)
        .where(and(eq(invoices.status, "sent"), isNotNull(invoices.externalId)))
        .limit(env.STATUS_SYNC_BATCH_SIZE);

      for (const invoice of pendingInvoices) {
        if (!invoice.externalId) continue;

        const [tenant] = await db
          .select()
          .from(tenants)
          .where(eq(tenants.id, invoice.tenantId))
          .limit(1);

        if (!tenant) continue;

        try {
          const newStatus = await manager.syncInvoiceStatus(
            tenant,
            invoice.externalId
          );

          if (newStatus !== invoice.status) {
            await transitionInvoice(db, invoice, newStatus, {
              actor: "sync-worker",
              reason: "Status synced with integrator",
              notifyWebhook: true
            });
          }
        } catch (error) {
          console.error(
            `Failed to sync status for invoice ${String(invoice.id)}:`,
            error
          );
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
