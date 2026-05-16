import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import fp from "fastify-plugin";

import { errorHandlerPlugin } from "../src/plugins/errorHandler";
import { webhookRoutes } from "../src/routes/v1/webhooks";
import { encryptSecret } from "../src/lib/crypto";
import type { Tenant } from "../src/db/schema";

const ENC_KEY = Buffer.from("12345678901234567890123456789012").toString(
  "base64"
);

function tenant(webhookUrl: string | null): Tenant {
  return {
    id: 1,
    tenantKey: "sportoonline",
    webhookUrl,
    webhookSecret: encryptSecret("wh-secret", ENC_KEY)
  } as unknown as Tenant;
}

async function buildApp(t: Tenant) {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(
    fp(async (fastify) => {
      fastify.decorate("authenticate", async (request) => {
        request.tenant = t;
      });
    })
  );
  await app.register(webhookRoutes);
  return app;
}

beforeEach(() => {
  process.env.DATABASE_URL = "mysql://u:p@127.0.0.1:3306/db";
  process.env.EFATURA_ENC_KEY = ENC_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /v1/webhooks/test", () => {
  it("signs and posts; 200 when client returns 2xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const app = await buildApp(tenant("https://client.example/webhook"));
    const res = await app.inject({ method: "POST", url: "/webhooks/test" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Efatura-Signature"]).toMatch(/^sha256=/);
    expect(headers["X-Efatura-Event"]).toBe("webhook.test");
    await app.close();
  });

  it("502 webhook_unreachable when client non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 }))
    );
    const app = await buildApp(tenant("https://client.example/webhook"));
    const res = await app.inject({ method: "POST", url: "/webhooks/test" });

    expect(res.statusCode).toBe(502);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      "webhook_unreachable"
    );
    await app.close();
  });

  it("422 when tenant has no webhook_url", async () => {
    const app = await buildApp(tenant(null));
    const res = await app.inject({ method: "POST", url: "/webhooks/test" });

    expect(res.statusCode).toBe(422);
    expect(res.json<{ error: { code: string } }>().error.code).toBe(
      "invoice_rule_violation"
    );
    await app.close();
  });
});
