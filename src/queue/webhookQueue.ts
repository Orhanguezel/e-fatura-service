import { Queue } from "bullmq";

import {
  RELIABILITY_MAX_ATTEMPTS,
  reliabilityBackoffStrategy
} from "../lib/queueBackoff";
import { redisConnection } from "./invoiceQueue";

export const webhookQueue = new Queue("webhook-deliver", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: RELIABILITY_MAX_ATTEMPTS,
    backoff: { type: "custom" },
    removeOnComplete: true,
    removeOnFail: false
  }
});

export { reliabilityBackoffStrategy };
