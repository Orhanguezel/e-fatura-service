import { describe, expect, it } from "vitest";

import type { Invoice, Tenant } from "../../src/db/schema";
import { AppError } from "../../src/lib/errors";
import { resolveCancelAction } from "../../src/domain/cancelRules";

const tenant: Tenant = {
  id: 1,
  tenantKey: "test",
  displayName: "Test",
  vknTckn: "11111111111",
  address: "Addr",
  integratorDriver: "nilvera",
  integratorCredentials: "",
  apiKeyHash: "a".repeat(64),
  allowedIps: null,
  webhookUrl: null,
  webhookSecret: "",
  taxProfile: {},
  mode: "test",
  isActive: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0)
};

function invoice(overrides: Partial<Invoice>): Invoice {
  return {
    id: 10,
    tenantId: 1,
    idempotencyKey: "order-1",
    status: "approved",
    type: "earsiv",
    externalId: "ext-1",
    ettn: "550e8400-e29b-41d4-a716-446655440000",
    invoiceNumber: "INV1",
    currency: "TRY",
    exchangeRate: null,
    total: "100.00",
    taxTotal: "20.00",
    requestPayload: {},
    responsePayload: null,
    errorMessage: null,
    attempts: 0,
    pdfPath: null,
    sentAt: new Date(),
    cancelledAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides
  };
}

describe("resolveCancelAction", () => {
  it("voids within cancel window", () => {
    const result = resolveCancelAction(
      invoice({ sentAt: new Date() }),
      tenant,
      7
    );

    expect(result).toEqual({
      action: "void",
      targetStatus: "cancelled",
      invoiceType: "earsiv"
    });
  });

  it("refunds after cancel window", () => {
    const oldSent = new Date(Date.now() - 10 * 86_400_000);
    const result = resolveCancelAction(
      invoice({ sentAt: oldSent }),
      tenant,
      7
    );

    expect(result).toEqual({
      action: "refund",
      targetStatus: "refunded",
      invoiceType: "iade"
    });
  });

  it("rejects pending invoices", () => {
    expect(() =>
      resolveCancelAction(invoice({ status: "pending", sentAt: null }), tenant, 7)
    ).toThrow(AppError);
  });
});
