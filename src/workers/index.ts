import type { Env } from "../config/env";
import { startCancelInvoiceWorker } from "./cancelInvoice";
import { startCreateInvoiceWorker } from "./createInvoice";
import { startDeliverWebhookWorker } from "./deliverWebhook";
import { startSyncStatusWorker } from "./syncStatus";

export type WorkersRuntime = {
  close: () => Promise<void>;
};

export async function startWorkers(env: Env): Promise<WorkersRuntime> {
  const runtimes = [
    startCreateInvoiceWorker(env),
    startCancelInvoiceWorker(env),
    startDeliverWebhookWorker(env)
  ];

  if (env.SYNC_STATUS_ENABLED) {
    runtimes.push(startSyncStatusWorker(env));
  }

  return {
    close: async () => {
      await Promise.all(runtimes.map((runtime) => runtime.close()));
    }
  };
}
