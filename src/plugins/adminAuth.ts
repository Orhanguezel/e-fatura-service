import fp from "fastify-plugin";

import { AppError } from "../lib/errors";

export const adminAuthPlugin = fp<{ adminToken: string }>(
  async (fastify, options) => {
    fastify.decorate("authenticateAdmin", async (request) => {
      const token = request.headers["x-admin-token"];

      if (typeof token !== "string" || token.length === 0) {
        throw new AppError(401, "unauthorized", "X-Admin-Token header is required");
      }

      if (token !== options.adminToken) {
        throw new AppError(401, "unauthorized", "Invalid admin token");
      }
    });
  },
  { name: "admin-auth-plugin" }
);
