import { eq } from "drizzle-orm";

import type { Database } from "../db/client";
import {
  invoiceEvents,
  invoices,
  type Invoice,
  type InvoiceStatus
} from "../db/schema";
import { enqueueInvoiceWebhook } from "./invoiceWebhook";

export async function transitionInvoice(
  db: Database,
  invoice: Invoice,
  toStatus: InvoiceStatus,
  options: {
    actor: string;
    reason: string;
    patch?: Partial<{
      externalId: string | null;
      ettn: string | null;
      invoiceNumber: string | null;
      pdfPath: string | null;
      errorMessage: string | null;
      responsePayload: Record<string, unknown> | null;
      sentAt: Date | null;
      attempts: number;
    }>;
    notifyWebhook?: boolean;
  }
): Promise<Invoice> {
  const fromStatus = invoice.status;

  if (fromStatus === toStatus && !options.patch) {
    return invoice;
  }

  const now = new Date();

  await db
    .update(invoices)
    .set({
      status: toStatus,
      updatedAt: now,
      ...(options.patch?.externalId !== undefined
        ? { externalId: options.patch.externalId }
        : {}),
      ...(options.patch?.ettn !== undefined ? { ettn: options.patch.ettn } : {}),
      ...(options.patch?.invoiceNumber !== undefined
        ? { invoiceNumber: options.patch.invoiceNumber }
        : {}),
      ...(options.patch?.pdfPath !== undefined
        ? { pdfPath: options.patch.pdfPath }
        : {}),
      ...(options.patch?.errorMessage !== undefined
        ? { errorMessage: options.patch.errorMessage }
        : {}),
      ...(options.patch?.responsePayload !== undefined
        ? { responsePayload: options.patch.responsePayload }
        : {}),
      ...(options.patch?.sentAt !== undefined
        ? { sentAt: options.patch.sentAt }
        : {}),
      ...(options.patch?.attempts !== undefined
        ? { attempts: options.patch.attempts }
        : {})
    })
    .where(eq(invoices.id, invoice.id));

  await db.insert(invoiceEvents).values({
    invoiceId: invoice.id,
    fromStatus,
    toStatus,
    actor: options.actor,
    reason: options.reason,
    createdAt: now
  });

  const updated: Invoice = {
    ...invoice,
    status: toStatus,
    updatedAt: now,
    ...(options.patch ?? {})
  };

  if (options.notifyWebhook !== false && fromStatus !== toStatus) {
    await enqueueInvoiceWebhook(invoice.id, toStatus);
  }

  return updated;
}
