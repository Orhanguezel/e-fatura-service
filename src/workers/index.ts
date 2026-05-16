import type { Env } from "../config/env";
import { closeCancelQueue } from "../queue/cancelQueue";
import { closeInvoiceQueue } from "../queue/invoiceQueue";
import { closeWebhookQueue } from "../queue/webhookQueue";
import { startCancelInvoiceWorker } from "./cancelInvoice";
import { startCreateInvoiceWorker } from "./createInvoice";
import { startDeliverWebhookWorker } from "./deliverWebhook";
import { startStatusSyncWorker } from "./syncStatus";

export type WorkersRuntime = {
  close: () => Promise<void>;
};

export async function startWorkers(env: Env): Promise<WorkersRuntime> {
  const createInvoiceRuntime = startCreateInvoiceWorker(env);
  const cancelInvoiceRuntime = startCancelInvoiceWorker(env);
  const deliverWebhookRuntime = startDeliverWebhookWorker(env);
  const statusSyncRuntime = startStatusSyncWorker(env);

  return {
    close: async () => {
      await createInvoiceRuntime.close();
      await cancelInvoiceRuntime.close();
      await deliverWebhookRuntime.close();
      await statusSyncRuntime.close();
      await closeInvoiceQueue();
      await closeWebhookQueue();
      await closeCancelQueue();
    }
  };
}
