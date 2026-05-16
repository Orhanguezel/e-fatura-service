import { describe, expect, it } from "vitest";
import sensible from "@fastify/sensible";
import Fastify from "fastify";
import fp from "fastify-plugin";

import { errorHandlerPlugin } from "../src/plugins/errorHandler";
import { authPlugin } from "../src/plugins/auth";
import type { Database } from "../src/db/client";
import { hashApiKey, safeEqualHash } from "../src/lib/apiKey";

function createEmptyTenantDb(): Database {
  const query = {
    from: () => query,
    where: () => query,
    limit: async () => []
  };

  return {
    select: () => query
  } as unknown as Database;
}

describe("api key hashing", () => {
  it("stores only sha256 hashes", () => {
    const hash = hashApiKey("tenant-secret");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain("tenant-secret");
  });

  it("compares hashes in constant time when lengths match", () => {
    const hash = hashApiKey("tenant-secret");

    expect(safeEqualHash(hash, hashApiKey("tenant-secret"))).toBe(true);
    expect(safeEqualHash(hash, hashApiKey("other-secret"))).toBe(false);
  });

  it("rejects requests without X-Api-Key", async () => {
    const app = Fastify({ logger: false });
    await app.register(sensible);
    await app.register(errorHandlerPlugin);
    await app.register(
      fp(
        async (fastify) => {
          fastify.decorate("db", createEmptyTenantDb());
        },
        { name: "db-plugin" }
      )
    );
    await app.register(authPlugin);
    app.get("/private", { preHandler: app.authenticate }, async () => ({
      ok: true
    }));

    const response = await app.inject({ method: "GET", url: "/private" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "unauthorized",
        message: "X-Api-Key header is required",
        details: {}
      }
    });
    await app.close();
  });
});
