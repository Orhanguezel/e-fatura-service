import { eq } from "drizzle-orm";
import fp from "fastify-plugin";

import { tenants } from "../db/schema";
import { hashApiKey, safeEqualHash } from "../lib/apiKey";
import { ipNotAllowed, tenantInactive, unauthorized } from "../lib/errors";

function normalizeIp(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

export const authPlugin = fp(
  async (fastify) => {
    fastify.decorate("authenticate", async (request) => {
      const apiKey = request.headers["x-api-key"];

      if (typeof apiKey !== "string" || apiKey.length === 0) {
        throw unauthorized("X-Api-Key header is required");
      }

      const apiKeyHash = hashApiKey(apiKey);
      const [tenant] = await fastify.db
        .select()
        .from(tenants)
        .where(eq(tenants.apiKeyHash, apiKeyHash))
        .limit(1);

      if (!tenant || !safeEqualHash(tenant.apiKeyHash, apiKeyHash)) {
        throw unauthorized();
      }

      if (!tenant.isActive) {
        throw tenantInactive();
      }

      const allowedIps = tenant.allowedIps
        ?.split(",")
        .map((ip) => ip.trim())
        .filter((ip) => ip.length > 0);

      if (allowedIps && allowedIps.length > 0) {
        const requestIp = normalizeIp(request.ip);

        if (!allowedIps.includes(requestIp)) {
          throw ipNotAllowed();
        }
      }

      request.tenant = tenant;
    });
  },
  { name: "auth-plugin", dependencies: ["db-plugin"] }
);
