import { Worker, type Job } from "bullmq";
import { eq } from "drizzle-orm";

import { loadEnv, type Env } from "../config/env";
import { createDatabase } from "../db/client";
import { invoiceEvents, invoices, tenants } from "../db/schema";
import { decryptSecret } from "../lib/crypto";
import { reliabilityBackoffStrategy, RELIABILITY_MAX_ATTEMPTS } from "../lib/queueBackoff";
import { buildWebhookPayload, signWebhook } from "../lib/webhook";
import { createRedisConnection } from "../queue/invoiceQueue";

import type { WebhookJobData } from "../queue/webhookQueue";

export type WorkerRuntime = {
  worker: Worker<WebhookJobData>;
  close: () => Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown webhook error";
}

export function startDeliverWebhookWorker(env: Env = loadEnv()): WorkerRuntime {
  const { db, pool } = createDatabase(env.DATABASE_URL);
  const redisConnection = createRedisConnection(env.REDIS_URL);

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
        return;
      }

      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, invoice.tenantId))
        .limit(1);
      if (!tenant?.webhookUrl) {
        return;
      }

      const payload = buildWebhookPayload(invoice, event);
      const rawBody = JSON.stringify(payload);
      const secret = decryptSecret(tenant.webhookSecret, env.EFATURA_ENC_KEY);
      const signature = signWebhook(payload.occurred_at, rawBody, secret);

      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, env.WEBHOOK_TIMEOUT_MS);

      try {
        const response = await fetch(tenant.webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Efatura-Event": event,
            "X-Efatura-Timestamp": payload.occurred_at,
            "X-Efatura-Signature": signature
          },
          body: rawBody,
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(
            `Webhook endpoint responded ${String(response.status)}`
          );
        }
      } finally {
        clearTimeout(timer);
      }
    },
    {
      connection: redisConnection,
      settings: { backoffStrategy: reliabilityBackoffStrategy }
    }
  );

  // Retry tükenince: alarm logu + invoice_events (actor=webhook).
  worker.on("failed", (job, error) => {
    if (!job || job.attemptsMade < RELIABILITY_MAX_ATTEMPTS) {
      return;
    }

    const message = errorMessage(error);
    worker.emit("error", new Error(`webhook exhausted: ${message}`));

    void db
      .insert(invoiceEvents)
      .values({
        invoiceId: job.data.invoiceId,
        fromStatus: null,
        toStatus: job.data.event.replace("invoice.", "") as never,
        actor: "webhook",
        reason: `Webhook delivery exhausted: ${message}`,
        createdAt: new Date()
      })
      .catch(() => undefined);
  });

  return {
    worker,
    close: async () => {
      await worker.close();
      await redisConnection.quit();
      await pool.end();
    }
  };
}
