import type { FastifyPluginAsync } from "fastify";

import { invoiceRoutes } from "./invoices";
import { webhookRoutes } from "./webhooks";

export const v1Routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(invoiceRoutes);
  await fastify.register(webhookRoutes);
};
