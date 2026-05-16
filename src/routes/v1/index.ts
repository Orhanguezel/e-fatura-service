import type { FastifyPluginAsync } from "fastify";

import { invoiceRoutes } from "./invoices";

export const v1Routes: FastifyPluginAsync = async (fastify) => {
  await fastify.register(invoiceRoutes);
};
