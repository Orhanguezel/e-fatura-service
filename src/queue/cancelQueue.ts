import { Queue } from "bullmq";
import type { Redis } from "ioredis";

import { loadEnv } from "../config/env";
import { RELIABILITY_MAX_ATTEMPTS } from "../lib/queueBackoff";
import { createRedisConnection } from "./invoiceQueue";

import type { Env } from "../config/env";

export type CancelJobData = { invoiceId: number; reason: string };
export type CancelQueue = Queue<CancelJobData>;

let cancelQueue: CancelQueue | null = null;
let cancelRedis: Redis | null = null;

export function createCancelQueue(connection: Redis): CancelQueue {
  return new Queue<CancelJobData>("invoice-cancel", {
    connection,
    defaultJobOptions: {
      attempts: RELIABILITY_MAX_ATTEMPTS,
      backoff: { type: "custom" },
      removeOnComplete: true,
      removeOnFail: false
    }
  });
}

export function getCancelQueue(env: Env = loadEnv()): CancelQueue {
  if (!cancelRedis) {
    cancelRedis = createRedisConnection(env.REDIS_URL);
  }

  if (!cancelQueue) {
    cancelQueue = createCancelQueue(cancelRedis);
  }

  return cancelQueue;
}

export async function closeCancelQueue(): Promise<void> {
  await cancelQueue?.close();
  cancelQueue = null;

  await cancelRedis?.quit();
  cancelRedis = null;
}
