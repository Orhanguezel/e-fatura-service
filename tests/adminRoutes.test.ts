import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";

import type { Database } from "../src/db/client";
import { errorHandlerPlugin } from "../src/plugins/errorHandler";
import { adminRoutes } from "../src/routes/v1/admin";

const TOKEN = "super-secret-admin-token";

function fakeDb(result: unknown): Database {
  const q: Record<string, unknown> = {};
  for (const m of ["from", "where", "orderBy", "limit", "offset"]) {
    q[m] = () => q;
  }
  q.then = (resolve: (v: unknown) => void) => {
    resolve(result);
  };
  return { select: () => q } as unknown as Database;
}

async function buildApp(db: Database) {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(
    fp(async (fastify) => {
      fastify.decorate("db", db);
    })
  );
  await app.register(adminRoutes);
  return app;
}

beforeEach(() => {
  process.env.DATABASE_URL = "mysql://u:p@127.0.0.1:3306/db";
  process.env.EFATURA_ENC_KEY = Buffer.from(
    "12345678901234567890123456789012"
  ).toString("base64");
  process.env.EFATURA_ADMIN_TOKEN = TOKEN;
});

afterEach(() => {
  delete process.env.EFATURA_ADMIN_TOKEN;
});

describe("admin auth", () => {
  it("401 without token", async () => {
    const app = await buildApp(fakeDb([]));
    const res = await app.inject({ method: "GET", url: "/admin/invoices" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("401 with wrong token", async () => {
    const app = await buildApp(fakeDb([]));
    const res = await app.inject({
      method: "GET",
      url: "/admin/invoices",
      headers: { "x-admin-token": "nope" }
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe("admin endpoints", () => {
  it("lists invoices with valid token", async () => {
    const app = await buildApp(
      fakeDb([
        {
          id: 1,
          tenantId: 2,
          status: "approved",
          type: "earsiv",
          ettn: null,
          invoiceNumber: null,
          total: "100.00",
          currency: "TRY",
          errorMessage: null,
          attempts: 0,
          createdAt: new Date("2026-05-16T00:00:00.000Z")
        }
      ])
    );
    const res = await app.inject({
      method: "GET",
      url: "/admin/invoices?limit=10",
      headers: { "x-admin-token": TOKEN }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ items: unknown[] }>().items).toHaveLength(1);
    await app.close();
  });

  it("422 retry on non-failed invoice", async () => {
    const app = await buildApp(
      fakeDb([{ id: 5, status: "approved" }])
    );
    const res = await app.inject({
      method: "POST",
      url: "/admin/invoices/5/retry",
      headers: { "x-admin-token": TOKEN }
    });
    expect(res.statusCode).toBe(422);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      "invoice_rule_violation"
    );
    await app.close();
  });
});
