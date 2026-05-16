import type { FastifyPluginAsync } from "fastify";

import { checkRedisHealth } from "../lib/health";

export const healthRoutes: FastifyPluginAsync<{ redisUrl?: string }> = async (
  fastify,
  options
) => {
  fastify.get(
    "/healthz",
    {
      schema: {
        tags: ["health"],
        response: {
          200: {
            type: "object",
            required: ["status", "redis", "db"],
            properties: {
              status: { type: "string" },
              redis: { type: "string" },
              db: { type: "string" }
            }
          }
        }
      }
    },
    async () => {
      await fastify.dbPool.query("SELECT 1");

      return {
        status: "ok",
        redis: await checkRedisHealth(options.redisUrl),
        db: "up"
      };
    }
  );
};
