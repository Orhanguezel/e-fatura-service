import { describe, expect, it } from "vitest";

import { mapApiPayloadToInvoiceRequest } from "../../src/domain/mapApiPayload";

describe("mapApiPayloadToInvoiceRequest", () => {
  it("maps API contract body to domain request", () => {
    const mapped = mapApiPayloadToInvoiceRequest({
      buyer: {
        type: "person",
        name: "Test User",
        tckn_vkn: "11111111111",
        address: "Addr",
        city: "Istanbul",
        country: "TR"
      },
      lines: [
        {
          name: "Item",
          quantity: 2,
          unit: "Adet",
          unit_price: "50.00",
          vat_rate: 20,
          discount: "0.00"
        }
      ],
      global_discount: "0.00",
      currency: "TRY",
      issue_date: "2026-05-16T10:00:00.000Z"
    });

    expect(mapped).toMatchObject({
      type: "earsiv",
      currency: "TRY",
      buyer: { tcknVkn: "11111111111", name: "Test User" },
      lines: [
        {
          name: "Item",
          quantity: 2,
          unitPriceTRY: "50.00",
          netTRY: "100.00",
          vatTRY: "20.00",
          grossTRY: "120.00"
        }
      ],
      totalsTRY: { net: "100.00", vat: "20.00", gross: "120.00" }
    });
  });
});
