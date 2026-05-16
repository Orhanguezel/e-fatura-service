import type { Env } from "../config/env";
import { closeInvoiceQueue } from "../queue/invoiceQueue";
import { startCreateInvoiceWorker } from "./createInvoice";

export type WorkersRuntime = {
  close: () => Promise<void>;
};

export async function startWorkers(env: Env): Promise<WorkersRuntime> {
  const createInvoiceRuntime = startCreateInvoiceWorker(env);

  return {
    close: async () => {
      await createInvoiceRuntime.close();
      await closeInvoiceQueue();
    }
  };
}
