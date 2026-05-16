import { describe, expect, it } from "vitest";

import {
  buildWebhookBody,
  signWebhookPayload,
  verifyWebhookSignature
} from "../src/lib/webhook";

describe("webhook signing", () => {
  it("signs with sha256= prefix per API contract", () => {
    const body = buildWebhookBody({
      event: "invoice.approved",
      invoiceId: 1,
      idempotencyKey: "order-1",
      status: "approved",
      ettn: "550e8400-e29b-41d4-a716-446655440000",
      invoiceNumber: "SPO001",
      pdfUrl: "/v1/invoices/1/pdf",
      occurredAt: new Date("2026-05-16T10:01:00.000Z")
    });
    const raw = JSON.stringify(body);
    const signature = signWebhookPayload(
      "whsec-test",
      body.occurred_at,
      raw
    );

    expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    expect(
      verifyWebhookSignature("whsec-test", body.occurred_at, raw, signature)
    ).toBe(true);
  });

  it("rejects tampered payload", () => {
    const body = buildWebhookBody({
      event: "invoice.sent",
      invoiceId: 2,
      idempotencyKey: "order-2",
      status: "sent",
      ettn: null,
      invoiceNumber: null,
      pdfUrl: null
    });
    const raw = JSON.stringify(body);
    const signature = signWebhookPayload("secret", body.occurred_at, raw);

    expect(
      verifyWebhookSignature(
        "secret",
        body.occurred_at,
        `${raw}tampered`,
        signature
      )
    ).toBe(false);
  });
});
