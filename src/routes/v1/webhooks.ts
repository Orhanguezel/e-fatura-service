import type { FastifyPluginAsync } from "fastify";

import { notImplementedResponse } from "../../lib/notImplemented";

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.post(
    "/webhooks/test",
    {
      schema: {
        tags: ["webhooks"],
        security: [{ apiKey: [] }]
      }
    },
    async (_request, reply) =>
      reply
        .code(501)
        .send(
          notImplementedResponse(
            "Webhook test delivery is scheduled for phase 3"
          )
        )
  );
};
