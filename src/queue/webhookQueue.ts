import { Queue } from "bullmq";
import type { Redis } from "ioredis";

import { loadEnv } from "../config/env";
import { RELIABILITY_MAX_ATTEMPTS } from "../lib/queueBackoff";
import { createRedisConnection } from "./invoiceQueue";

import type { Env } from "../config/env";
import type { WebhookEvent } from "../lib/webhook";

export type WebhookJobData = { invoiceId: number; event: WebhookEvent };
export type WebhookQueue = Queue<WebhookJobData>;

let webhookQueue: WebhookQueue | null = null;
let webhookRedis: Redis | null = null;

export function createWebhookQueue(connection: Redis): WebhookQueue {
  return new Queue<WebhookJobData>("webhook-deliver", {
    connection,
    defaultJobOptions: {
      attempts: RELIABILITY_MAX_ATTEMPTS,
      backoff: { type: "custom" },
      removeOnComplete: true,
      removeOnFail: false
    }
  });
}

export function getWebhookQueue(env: Env = loadEnv()): WebhookQueue {
  if (!webhookRedis) {
    webhookRedis = createRedisConnection(env.REDIS_URL);
  }

  if (!webhookQueue) {
    webhookQueue = createWebhookQueue(webhookRedis);
  }

  return webhookQueue;
}

export async function closeWebhookQueue(): Promise<void> {
  await webhookQueue?.close();
  webhookQueue = null;

  await webhookRedis?.quit();
  webhookRedis = null;
}
