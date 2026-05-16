import { describe, expect, it } from "vitest";

import { invoiceCreateSchema } from "../src/routes/v1/invoiceSchemas";

describe("invoiceCreateSchema", () => {
  const base = {
    buyer: {
      type: "person" as const,
      name: "Test User",
      tckn_vkn: "11111111111",
      address: "Addr",
      city: "Istanbul",
      country: "Turkiye"
    },
    lines: [
      {
        name: "Item",
        quantity: 1,
        unit: "Adet",
        unit_price: "100.00",
        vat_rate: 20,
        discount: "0.00"
      }
    ],
    issue_date: "2026-05-16T10:00:00.000Z"
  };

  it("accepts TRY without exchange_rate", () => {
    expect(
      invoiceCreateSchema.parse({ ...base, currency: "TRY" })
    ).toMatchObject({ currency: "TRY" });
  });

  it("requires exchange_rate for non-TRY currency", () => {
    expect(() =>
      invoiceCreateSchema.parse({ ...base, currency: "USD" })
    ).toThrow();
  });

  it("accepts foreign currency with exchange_rate", () => {
    expect(
      invoiceCreateSchema.parse({
        ...base,
        currency: "USD",
        exchange_rate: "32.500000"
      })
    ).toMatchObject({ currency: "USD", exchange_rate: "32.500000" });
  });
});
