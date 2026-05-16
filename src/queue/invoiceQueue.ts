import { Queue } from "bullmq";
import { Redis } from "ioredis";

import { loadEnv } from "../config/env";
import { RELIABILITY_MAX_ATTEMPTS } from "../lib/queueBackoff";

const env = loadEnv();

export const redisConnection = new Redis(env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null
});

export const invoiceQueue = new Queue("invoice-create", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: RELIABILITY_MAX_ATTEMPTS,
    backoff: { type: "custom" },
    removeOnComplete: true,
    removeOnFail: false
  }
});
