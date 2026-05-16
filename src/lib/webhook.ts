import { createHmac, timingSafeEqual } from "node:crypto";

import axios from "axios";

import type { InvoiceStatus } from "../db/schema";

export type WebhookEventName =
  | "invoice.sent"
  | "invoice.approved"
  | "invoice.failed"
  | "invoice.cancelled"
  | "invoice.refunded"
  | "invoice.test";

export type WebhookBody = {
  event: WebhookEventName;
  invoice_id: number;
  idempotency_key: string;
  status: InvoiceStatus;
  ettn: string | null;
  invoice_number: string | null;
  pdf_url: string | null;
  occurred_at: string;
};

const NOTIFY_STATUSES = new Set<InvoiceStatus>([
  "sent",
  "approved",
  "failed",
  "cancelled",
  "refunded"
]);

export function statusToWebhookEvent(
  status: InvoiceStatus
): WebhookEventName | null {
  switch (status) {
    case "sent":
      return "invoice.sent";
    case "approved":
      return "invoice.approved";
    case "failed":
      return "invoice.failed";
    case "cancelled":
      return "invoice.cancelled";
    case "refunded":
      return "invoice.refunded";
    default:
      return null;
  }
}

export function shouldNotifyWebhook(status: InvoiceStatus): boolean {
  return NOTIFY_STATUSES.has(status);
}

export function buildWebhookBody(input: {
  event: WebhookEventName;
  invoiceId: number;
  idempotencyKey: string;
  status: InvoiceStatus;
  ettn: string | null;
  invoiceNumber: string | null;
  pdfUrl: string | null;
  occurredAt?: Date;
}): WebhookBody {
  return {
    event: input.event,
    invoice_id: input.invoiceId,
    idempotency_key: input.idempotencyKey,
    status: input.status,
    ettn: input.ettn,
    invoice_number: input.invoiceNumber,
    pdf_url: input.pdfUrl,
    occurred_at: (input.occurredAt ?? new Date()).toISOString()
  };
}

export function signWebhookPayload(
  secret: string,
  timestamp: string,
  rawBody: string
): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return `sha256=${digest}`;
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
  signatureHeader: string
): boolean {
  const expected = signWebhookPayload(secret, timestamp, rawBody);
  const left = Buffer.from(expected);
  const right = Buffer.from(signatureHeader);

  if (left.byteLength !== right.byteLength) {
    return false;
  }

  return timingSafeEqual(left, right);
}

export async function postWebhook(
  url: string,
  secret: string,
  body: WebhookBody
): Promise<void> {
  const rawBody = JSON.stringify(body);
  const timestamp = body.occurred_at;
  const signature = signWebhookPayload(secret, timestamp, rawBody);

  await axios.post(url, rawBody, {
    headers: {
      "Content-Type": "application/json",
      "X-Efatura-Event": body.event,
      "X-Efatura-Timestamp": timestamp,
      "X-Efatura-Signature": signature
    },
    timeout: 15_000,
    validateStatus: (status) => status >= 200 && status < 300
  });
}
