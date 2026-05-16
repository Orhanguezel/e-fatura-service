import type { FastifyPluginAsync } from "fastify";

import { loadEnv } from "../../config/env";
import type { Tenant } from "../../db/schema";
import { decryptSecret } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { signWebhook } from "../../lib/webhook";

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  function requireTenant(tenant: Tenant | undefined): Tenant {
    if (!tenant) {
      throw new AppError(
        500,
        "internal_server_error",
        "Tenant not found in request"
      );
    }
    return tenant;
  }

  fastify.post(
    "/webhooks/test",
    { schema: { tags: ["webhooks"], security: [{ apiKey: [] }] } },
    async (request, reply) => {
      const tenant = requireTenant(request.tenant);

      if (!tenant.webhookUrl) {
        throw new AppError(
          422,
          "invoice_rule_violation",
          "Tenant has no webhook_url configured"
        );
      }

      const env = loadEnv();
      const occurredAt = new Date().toISOString();
      const payload = {
        event: "webhook.test" as const,
        tenant: tenant.tenantKey,
        occurred_at: occurredAt
      };
      const rawBody = JSON.stringify(payload);
      const secret = decryptSecret(tenant.webhookSecret, env.EFATURA_ENC_KEY);
      const signature = signWebhook(occurredAt, rawBody, secret);

      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, env.WEBHOOK_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(tenant.webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Efatura-Event": "webhook.test",
            "X-Efatura-Timestamp": occurredAt,
            "X-Efatura-Signature": signature
          },
          body: rawBody,
          signal: controller.signal
        });
      } catch (error: unknown) {
        throw new AppError(
          502,
          "webhook_unreachable",
          error instanceof Error ? error.message : "Webhook endpoint unreachable"
        );
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        throw new AppError(
          502,
          "webhook_unreachable",
          `Webhook endpoint responded ${String(response.status)}`
        );
      }

      return reply.code(200).send({ ok: true });
    }
  );
};
