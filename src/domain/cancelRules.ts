import type { Invoice } from "../db/schema";
import { AppError } from "../lib/errors";

export type CancelDecision = {
  action: "void" | "refund";
  targetStatus: "cancelled" | "refunded";
  type: "earsiv" | "iade";
};

/**
 * İptal/iade kararı (docs/CANCEL-RULES.md). Saf + test edilebilir.
 * Geçersiz kaynak durum / eksik entegratör referansı → 422.
 *
 * sent_at'ten geçen süre ≤ pencere → void (cancelled)
 * sent_at'ten geçen süre > pencere → refund (refunded, type=iade)
 */
export function decideCancel(
  invoice: Pick<Invoice, "status" | "externalId" | "sentAt">,
  cancelWindowDays: number,
  now: Date = new Date()
): CancelDecision {
  if (invoice.status !== "approved" && invoice.status !== "sent") {
    throw new AppError(
      422,
      "invoice_rule_violation",
      `Invoice in status "${invoice.status}" cannot be cancelled`
    );
  }

  if (!invoice.externalId || !invoice.sentAt) {
    throw new AppError(
      422,
      "invoice_rule_violation",
      "Invoice has no integrator reference yet"
    );
  }

  const elapsedDays =
    (now.getTime() - invoice.sentAt.getTime()) / 86_400_000;

  if (elapsedDays <= cancelWindowDays) {
    return { action: "void", targetStatus: "cancelled", type: "earsiv" };
  }

  return { action: "refund", targetStatus: "refunded", type: "iade" };
}
