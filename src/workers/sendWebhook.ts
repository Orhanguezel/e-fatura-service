import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";

import { loadEnv, type Env } from "../config/env";
import { createDatabase } from "../db/client";
import { invoices, tenants } from "../db/schema";
import { decryptSecret } from "../lib/crypto";
import {
  buildWebhookBody,
  postWebhook,
  statusToWebhookEvent
} from "../lib/webhook";
import { redisConnection } from "../queue/invoiceQueue";

type SendWebhookJobData = {
  invoiceId: number;
};

export type WebhookWorkerRuntime = {
  worker: Worker<SendWebhookJobData>;
  close: () => Promise<void>;
};

export function startSendWebhookWorker(
  env: Env = loadEnv()
): WebhookWorkerRuntime {
  const { db, pool } = createDatabase(env.DATABASE_URL);

  const worker = new Worker<SendWebhookJobData>(
    "webhook-queue",
    async (job: Job<SendWebhookJobData>) => {
      const { invoiceId } = job.data;

      const [invoice] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, invoiceId))
        .limit(1);

      if (!invoice) return;

      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, invoice.tenantId))
        .limit(1);

      if (!tenant?.webhookUrl) return;

      const event = statusToWebhookEvent(invoice.status);

      if (!event) return;

      const webhookSecret = decryptSecret(
        tenant.webhookSecret,
        env.EFATURA_ENC_KEY
      );
      const payload = buildWebhookBody({
        event,
        invoiceId: invoice.id,
        idempotencyKey: invoice.idempotencyKey,
        status: invoice.status,
        ettn: invoice.ettn,
        invoiceNumber: invoice.invoiceNumber,
        pdfUrl: invoice.pdfPath
          ? `${env.HOST}:${String(env.PORT)}/v1/invoices/${String(invoice.id)}/pdf`
          : null
      });

      await postWebhook(tenant.webhookUrl, webhookSecret, payload);
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
