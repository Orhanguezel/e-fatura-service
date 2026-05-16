import type { FastifyPluginAsync } from "fastify";

import { adminRoutes } from "./admin";
import { invoiceRoutes } from "./invoices";
import { webhookRoutes } from "./webhooks";

export const v1Routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(invoiceRoutes);
  await fastify.register(webhookRoutes);
  await fastify.register(adminRoutes);
};
