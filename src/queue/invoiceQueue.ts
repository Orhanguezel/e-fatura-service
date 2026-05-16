import { Queue } from "bullmq";
import { Redis } from "ioredis";

import { loadEnv } from "../config/env";

const env = loadEnv();

export const redisConnection = new Redis(env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null
});

export const invoiceQueue = new Queue("invoice-create", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 5000
    },
    removeOnComplete: true,
    removeOnFail: false
  }
});
