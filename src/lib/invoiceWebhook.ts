import type { Invoice, InvoiceStatus } from "../db/schema";
import { webhookQueue } from "../queue/webhookQueue";
import {
  buildWebhookBody,
  shouldNotifyWebhook,
  statusToWebhookEvent,
  type WebhookEventName
} from "./webhook";

export type WebhookJobData = {
  invoiceId: number;
  event: WebhookEventName;
};

export function buildPdfUrl(publicBaseUrl: string, invoiceId: number): string {
  const base = publicBaseUrl.replace(/\/+$/, "");
  return `${base}/v1/invoices/${String(invoiceId)}/pdf`;
}

export function buildWebhookBodyForInvoice(
  invoice: Invoice,
  event: WebhookEventName,
  publicBaseUrl: string
) {
  return buildWebhookBody({
    event,
    invoiceId: invoice.id,
    idempotencyKey: invoice.idempotencyKey,
    status: invoice.status,
    ettn: invoice.ettn,
    invoiceNumber: invoice.invoiceNumber,
    pdfUrl: invoice.pdfPath ? buildPdfUrl(publicBaseUrl, invoice.id) : null
  });
}

export async function enqueueInvoiceWebhook(
  invoiceId: number,
  status: InvoiceStatus
): Promise<void> {
  const event = statusToWebhookEvent(status);

  if (!event || !shouldNotifyWebhook(status)) {
    return;
  }

  await webhookQueue.add(
    "deliver",
    { invoiceId, event } satisfies WebhookJobData,
    {
      jobId: `wh-${String(invoiceId)}-${event}-${Date.now().toString()}`
    }
  );
}
