import type { Invoice, InvoiceStatus, Tenant } from "../db/schema";
import { AppError } from "../lib/errors";

export type CancelAction = "void" | "refund";

export type CancelResolution = {
  action: CancelAction;
  targetStatus: Extract<InvoiceStatus, "cancelled" | "refunded">;
  invoiceType: "earsiv" | "iade";
};

const CANCELLABLE_STATUSES = new Set<InvoiceStatus>(["approved", "sent"]);

function cancelWindowDays(tenant: Tenant, defaultDays: number): number {
  const days = tenant.taxProfile.cancel_window_days;

  if (typeof days === "number" && days > 0) {
    return days;
  }

  return defaultDays;
}

export function resolveCancelAction(
  invoice: Invoice,
  tenant: Tenant,
  defaultWindowDays: number
): CancelResolution {
  if (!CANCELLABLE_STATUSES.has(invoice.status)) {
    throw new AppError(
      422,
      "invoice_rule_violation",
      `Invoice status "${invoice.status}" cannot be cancelled`
    );
  }

  if (!invoice.externalId || !invoice.sentAt) {
    throw new AppError(
      422,
      "invoice_rule_violation",
      "Invoice has not been sent to the integrator yet"
    );
  }

  const windowDays = cancelWindowDays(tenant, defaultWindowDays);
  const elapsedMs = Date.now() - invoice.sentAt.getTime();
  const withinWindow = elapsedMs <= windowDays * 86_400_000;

  if (withinWindow) {
    return {
      action: "void",
      targetStatus: "cancelled",
      invoiceType: "earsiv"
    };
  }

  return {
    action: "refund",
    targetStatus: "refunded",
    invoiceType: "iade"
  };
}
