import { Queue } from "bullmq";

import {
  RELIABILITY_MAX_ATTEMPTS,
  reliabilityBackoffStrategy
} from "../lib/queueBackoff";
import { redisConnection } from "./invoiceQueue";

export type CancelJobData = {
  invoiceId: number;
  reason: string;
  targetStatus: "cancelled" | "refunded";
  invoiceType: "earsiv" | "iade";
};

export const cancelQueue = new Queue<CancelJobData>("invoice-cancel", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: RELIABILITY_MAX_ATTEMPTS,
    backoff: { type: "custom" },
    removeOnComplete: true,
    removeOnFail: false
  }
});

export { reliabilityBackoffStrategy };
