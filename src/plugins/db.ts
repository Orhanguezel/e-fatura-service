import fp from "fastify-plugin";

import { createDatabase } from "../db/client";

export const dbPlugin = fp<{ databaseUrl: string }>(
  async (fastify, options) => {
    const { db, pool } = createDatabase(options.databaseUrl);

    fastify.decorate("db", db);
    fastify.decorate("dbPool", pool);
    fastify.addHook("onClose", async () => {
      await pool.end();
    });
  },
  { name: "db-plugin" }
);
