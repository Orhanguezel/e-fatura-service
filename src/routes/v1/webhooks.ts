import type { FastifyPluginAsync } from "fastify";

import { loadEnv } from "../../config/env";
import type { Tenant } from "../../db/schema";
import { decryptSecret } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { buildWebhookBody, postWebhook } from "../../lib/webhook";

export const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  const env = loadEnv();
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
    {
      schema: {
        tags: ["webhooks"],
        security: [{ apiKey: [] }],
        response: {
          200: {
            type: "object",
            required: ["ok"],
            properties: {
              ok: { type: "boolean" }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const tenant = requireTenant(request.tenant);

      if (!tenant.webhookUrl) {
        throw new AppError(
          422,
          "invoice_rule_violation",
          "Tenant webhook_url is not configured"
        );
      }

      const secret = decryptSecret(tenant.webhookSecret, env.EFATURA_ENC_KEY);
      const publicBase = env.EFATURA_PUBLIC_URL.replace(/\/+$/, "");
      const body = buildWebhookBody({
        event: "invoice.test",
        invoiceId: 0,
        idempotencyKey: "webhook-test",
        status: "approved",
        ettn: null,
        invoiceNumber: null,
        pdfUrl: `${publicBase}/healthz`
      });

      try {
        await postWebhook(tenant.webhookUrl, secret, body);
      } catch {
        throw new AppError(
          502,
          "webhook_unreachable",
          "Webhook endpoint did not return 2xx"
        );
      }

      return reply.send({ ok: true });
    }
  );
};
