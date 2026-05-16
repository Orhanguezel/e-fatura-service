import type { FastifyPluginAsync } from "fastify";

function notImplemented(message: string) {
  return {
    error: {
      code: "not_implemented",
      message,
      details: {}
    }
  };
}

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
        .send(notImplemented("Webhook test delivery is scheduled for phase 3"))
  );
};
