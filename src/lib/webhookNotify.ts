import type { Env } from "../config/env";
import type { InvoiceStatus } from "../db/schema";
import { getWebhookQueue } from "../queue/webhookQueue";
import { eventForStatus } from "./webhook";

/**
 * Durum geçişinde webhook teslim işini kuyruğa atar.
 * pending/sending → event yok, no-op (idempotent: yalnız gerçek geçişte çağrılır).
 */
export async function enqueueInvoiceWebhook(
  invoiceId: number,
  status: InvoiceStatus,
  env?: Env
): Promise<void> {
  const event = eventForStatus(status);
  if (!event) {
    return;
  }

  const queue = env ? getWebhookQueue(env) : getWebhookQueue();
  await queue.add(
    "deliver",
    { invoiceId, event },
    { jobId: `wh:${String(invoiceId)}:${event}` }
  );
}
