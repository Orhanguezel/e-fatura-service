import { describe, expect, it } from "vitest";

import { mapInvoiceRequestToNilveraDraft } from "../../../src/domain/providers/nilvera/mapPayload";
import type { InvoiceRequest } from "../../../src/domain/types";

const request: InvoiceRequest = {
  tenantId: 1,
  idempotencyKey: "order-1",
  type: "earsiv",
  buyer: {
    type: "person",
    name: "Test",
    tcknVkn: "11111111111",
    address: "Addr",
    city: "Istanbul",
    country: "TR"
  },
  lines: [
    {
      name: "Item",
      quantity: 1,
      unit: "Adet",
      unitPriceTRY: "100.00",
      discountTRY: "0.00",
      vatRate: 20,
      netTRY: "100.00",
      vatTRY: "20.00",
      grossTRY: "120.00"
    }
  ],
  currency: "TRY",
  exchangeRate: null,
  totalsTRY: { net: "100.00", vat: "20.00", gross: "120.00" },
  issueDate: "2026-05-16T10:00:00.000Z"
};

describe("mapInvoiceRequestToNilveraDraft", () => {
  it("maps buyer, lines and TRY totals", () => {
    const payload = mapInvoiceRequestToNilveraDraft(request);

    expect(payload.ArchiveInvoice.CustomerInfo.TaxNumber).toBe("11111111111");
    expect(payload.ArchiveInvoice.InvoiceInfo.PayableAmount).toBe(120);
    expect(payload.ArchiveInvoice.InvoiceLines[0]).toMatchObject({
      Name: "Item",
      KDVPercent: 20,
      KDVTotal: 20
    });
  });
});
