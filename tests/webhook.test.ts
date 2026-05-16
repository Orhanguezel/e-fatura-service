import { describe, expect, it } from "vitest";

import type { Invoice } from "../src/db/schema";
import {
  buildWebhookPayload,
  eventForStatus,
  signWebhook,
  verifyWebhookSignature
} from "../src/lib/webhook";

const baseInvoice = {
  id: 42,
  idempotencyKey: "order-42",
  status: "approved",
  ettn: "550e8400-e29b-41d4-a716-446655440000",
  invoiceNumber: "SPO2026000000042"
} as unknown as Invoice;

describe("webhook signing", () => {
  it("produces deterministic sha256= HMAC over timestamp.rawBody", () => {
    const sig = signWebhook("2026-05-16T10:00:00.000Z", '{"a":1}', "secret");
    expect(sig).toBe(
      signWebhook("2026-05-16T10:00:00.000Z", '{"a":1}', "secret")
    );
    expect(sig.startsWith("sha256=")).toBe(true);
  });

  it("verifies valid signature and rejects tampered body/secret", () => {
    const ts = "2026-05-16T10:00:00.000Z";
    const body = '{"event":"invoice.approved"}';
    const sig = signWebhook(ts, body, "shared-secret");

    expect(verifyWebhookSignature(ts, body, "shared-secret", sig)).toBe(true);
    expect(verifyWebhookSignature(ts, '{"x":1}', "shared-secret", sig)).toBe(
      false
    );
    expect(verifyWebhookSignature(ts, body, "wrong-secret", sig)).toBe(false);
  });
});

describe("event mapping", () => {
  it("maps terminal-ish statuses, ignores pending/sending", () => {
    expect(eventForStatus("sent")).toBe("invoice.sent");
    expect(eventForStatus("approved")).toBe("invoice.approved");
    expect(eventForStatus("failed")).toBe("invoice.failed");
    expect(eventForStatus("cancelled")).toBe("invoice.cancelled");
    expect(eventForStatus("refunded")).toBe("invoice.refunded");
    expect(eventForStatus("pending")).toBeNull();
    expect(eventForStatus("sending")).toBeNull();
  });
});

describe("payload builder", () => {
  it("matches API-CONTRACT shape", () => {
    const at = new Date("2026-05-16T10:01:00.000Z");
    const payload = buildWebhookPayload(baseInvoice, "invoice.approved", at);

    expect(payload).toEqual({
      event: "invoice.approved",
      invoice_id: 42,
      idempotency_key: "order-42",
      status: "approved",
      ettn: "550e8400-e29b-41d4-a716-446655440000",
      invoice_number: "SPO2026000000042",
      pdf_url: "/v1/invoices/42/pdf",
      occurred_at: "2026-05-16T10:01:00.000Z"
    });
  });
});
