import { Queue } from "bullmq";

import { redisConnection } from "./invoiceQueue";

export const statusSyncQueue = new Queue("status-sync", {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false
  }
});
