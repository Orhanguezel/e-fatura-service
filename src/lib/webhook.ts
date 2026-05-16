import { createHmac, timingSafeEqual } from "node:crypto";

import type { Invoice, InvoiceStatus } from "../db/schema";

/** API-CONTRACT §Webhook: durum → event eşlemesi. */
export const WEBHOOK_EVENT_BY_STATUS = {
  sent: "invoice.sent",
  approved: "invoice.approved",
  failed: "invoice.failed",
  cancelled: "invoice.cancelled",
  refunded: "invoice.refunded"
} as const;

export type WebhookEvent =
  (typeof WEBHOOK_EVENT_BY_STATUS)[keyof typeof WEBHOOK_EVENT_BY_STATUS];

/** pending/sending webhook tetiklemez → null. */
export function eventForStatus(status: InvoiceStatus): WebhookEvent | null {
  return status in WEBHOOK_EVENT_BY_STATUS
    ? WEBHOOK_EVENT_BY_STATUS[status as keyof typeof WEBHOOK_EVENT_BY_STATUS]
    : null;
}

export interface WebhookPayload {
  event: WebhookEvent | "webhook.test";
  invoice_id: number;
  idempotency_key: string;
  status: InvoiceStatus;
  ettn: string | null;
  invoice_number: string | null;
  pdf_url: string;
  occurred_at: string;
}

export function buildWebhookPayload(
  invoice: Invoice,
  event: WebhookEvent | "webhook.test",
  occurredAt: Date = new Date()
): WebhookPayload {
  return {
    event,
    invoice_id: invoice.id,
    idempotency_key: invoice.idempotencyKey,
    status: invoice.status,
    ettn: invoice.ettn,
    invoice_number: invoice.invoiceNumber,
    pdf_url: `/v1/invoices/${String(invoice.id)}/pdf`,
    occurred_at: occurredAt.toISOString()
  };
}

/**
 * API-CONTRACT D4: `sha256=` + HMAC-SHA256(`timestamp + "." + rawBody`, secret).
 */
export function signWebhook(
  timestamp: string,
  rawBody: string,
  secret: string
): string {
  const mac = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return `sha256=${mac}`;
}

/** Sabit-zaman doğrulama (istemci tarafı simetrisi + test). */
export function verifyWebhookSignature(
  timestamp: string,
  rawBody: string,
  secret: string,
  signature: string
): boolean {
  const expected = signWebhook(timestamp, rawBody, secret);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  if (a.byteLength !== b.byteLength) {
    return false;
  }

  return timingSafeEqual(a, b);
}
