import { Queue } from "bullmq";
import { Redis } from "ioredis";

import { loadEnv } from "../config/env";
import { RELIABILITY_MAX_ATTEMPTS } from "../lib/queueBackoff";

import type { Env } from "../config/env";

export type InvoiceQueue = Queue<{ invoiceId: number }>;

let invoiceQueue: InvoiceQueue | null = null;
let redisConnection: Redis | null = null;

export function createRedisConnection(redisUrl: Env["REDIS_URL"]): Redis {
  return new Redis(redisUrl || "redis://127.0.0.1:6379", {
    maxRetriesPerRequest: null
  });
}

export function createInvoiceQueue(connection: Redis): InvoiceQueue {
  return new Queue<{ invoiceId: number }>("invoice-create", {
    connection,
    defaultJobOptions: {
      attempts: RELIABILITY_MAX_ATTEMPTS,
      backoff: { type: "custom" },
      removeOnComplete: true,
      removeOnFail: false
    }
  });
}

export function getInvoiceQueue(env: Env = loadEnv()): InvoiceQueue {
  if (!redisConnection) {
    redisConnection = createRedisConnection(env.REDIS_URL);
  }

  if (!invoiceQueue) {
    invoiceQueue = createInvoiceQueue(redisConnection);
  }

  return invoiceQueue;
}

export async function closeInvoiceQueue(): Promise<void> {
  await invoiceQueue?.close();
  invoiceQueue = null;

  await redisConnection?.quit();
  redisConnection = null;
}
