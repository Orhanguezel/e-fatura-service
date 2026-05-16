import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";

import { loadEnv } from "./config/env";
import { adminAuthPlugin } from "./plugins/adminAuth";
import { authPlugin } from "./plugins/auth";
import { dbPlugin } from "./plugins/db";
import { errorHandlerPlugin } from "./plugins/errorHandler";
import { healthRoutes } from "./routes/health";
import { v1Routes } from "./routes/v1";

import type { Env } from "./config/env";

export async function buildApp(env: Env = loadEnv()) {
  const app = Fastify({
    logger: env.NODE_ENV === "production"
  });

  await app.register(sensible);
  await app.register(errorHandlerPlugin);
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW
  });
  await app.register(dbPlugin, { databaseUrl: env.DATABASE_URL });
  await app.register(authPlugin);
  await app.register(adminAuthPlugin, { adminToken: env.EFATURA_ADMIN_TOKEN });
  await app.register(
    healthRoutes,
    env.REDIS_URL ? { redisUrl: env.REDIS_URL } : {}
  );
  await app.register(v1Routes, { prefix: "/v1" });

  app.get("/admin", async (_request, reply) => {
    const html = await Bun.file(
      new URL("../admin/index.html", import.meta.url)
    ).text();
    return reply.type("text/html; charset=utf-8").send(html);
  });

  return app;
}
