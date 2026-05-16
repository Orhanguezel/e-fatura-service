import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";

import { loadEnv, type Env } from "../config/env";
import { createDatabase } from "../db/client";
import { invoices, tenants } from "../db/schema";
import { decryptSecret } from "../lib/crypto";
import {
  buildWebhookBodyForInvoice,
  type WebhookJobData
} from "../lib/invoiceWebhook";
import { postWebhook } from "../lib/webhook";
import { reliabilityBackoffStrategy } from "../lib/queueBackoff";
import { redisConnection } from "../queue/invoiceQueue";

export type WorkerRuntime = {
  worker: Worker<WebhookJobData>;
  close: () => Promise<void>;
};

export function startDeliverWebhookWorker(env: Env = loadEnv()): WorkerRuntime {
  const { db, pool } = createDatabase(env.DATABASE_URL);

  const worker = new Worker<WebhookJobData>(
    "webhook-deliver",
    async (job: Job<WebhookJobData>) => {
      const { invoiceId, event } = job.data;

      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);

      if (!invoice) {
        throw new Error(`Invoice ${String(invoiceId)} not found for webhook`);
      }

      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, invoice.tenantId))
        .limit(1);

      if (!tenant?.webhookUrl) {
        return;
      }

      const secret = decryptSecret(tenant.webhookSecret, env.EFATURA_ENC_KEY);
      const body = buildWebhookBodyForInvoice(
        invoice,
        event,
        env.EFATURA_PUBLIC_URL
      );

      await postWebhook(tenant.webhookUrl, secret, body);
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
