import { Queue } from "bullmq";
import { type Env } from "../config/env";
import { redisConnection } from "../queue/invoiceQueue";
import { startCreateInvoiceWorker } from "./createInvoice";
import { startDeliverWebhookWorker } from "./deliverWebhook";
import { syncStatusWorker } from "./syncStatus";

export async function startWorkers(env: Env) {
  const createInvoiceRuntime = startCreateInvoiceWorker(env);
  const deliverWebhookRuntime = startDeliverWebhookWorker(env);
  
  // Register repeatable sync job
  const syncQueue = new Queue("status-sync", { connection: redisConnection });
  await syncQueue.add("sync-all", {}, {
    repeat: {
      pattern: "*/15 * * * *" // Every 15 minutes
    }
  });

  return {
    close: async () => {
      await createInvoiceRuntime.close();
      await deliverWebhookRuntime.close();
      await syncStatusWorker.close();
      await syncQueue.close();
    }
  };
}
