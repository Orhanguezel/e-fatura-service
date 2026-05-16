import { describe, expect, it } from "vitest";

import type { Tenant } from "../../src/db/schema";
import { AppError } from "../../src/lib/errors";
import { buildInvoiceRequest } from "../../src/domain/buildInvoiceRequest";
import type { InvoiceCreateBody } from "../../src/routes/v1/invoiceSchemas";

const tenant: Tenant = {
  id: 7,
  tenantKey: "sportoonline",
  displayName: "Sportoonline",
  vknTckn: "11111111111",
  address: "Tenant address",
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

const baseBody: InvoiceCreateBody = {
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
      name: "Item A",
      quantity: 1,
      unit: "Adet",
      unit_price: "100.00",
      vat_rate: 20,
      discount: "0.00"
    },
    {
      name: "Item B",
      quantity: 1,
      unit: "Adet",
      unit_price: "50.00",
      vat_rate: 10,
      discount: "0.00"
    }
  ],
  global_discount: "15.00",
  currency: "TRY",
  issue_date: "2026-05-16T10:00:00.000Z"
};

const [firstLine] = baseBody.lines;

if (!firstLine) {
  throw new Error("baseBody must include a first invoice line");
}

describe("buildInvoiceRequest", () => {
  it("distributes global discount and totals rounded line values", () => {
    const request = buildInvoiceRequest(tenant, "order-1", baseBody);

    expect(request.lines).toMatchObject([
      {
        name: "Item A",
        discountTRY: "10.00",
        netTRY: "90.00",
        vatTRY: "18.00",
        grossTRY: "108.00"
      },
      {
        name: "Item B",
        discountTRY: "5.00",
        netTRY: "45.00",
        vatTRY: "4.50",
        grossTRY: "49.50"
      }
    ]);
    expect(request.totalsTRY).toEqual({
      net: "135.00",
      vat: "22.50",
      gross: "157.50"
    });
  });

  it("treats shipping as a VAT-bearing line", () => {
    const request = buildInvoiceRequest(tenant, "order-2", {
      ...baseBody,
      lines: [firstLine],
      global_discount: "0.00",
      shipping: { amount: "29.90", vat_rate: 20 }
    });

    expect(request.lines.at(-1)).toMatchObject({
      name: "Kargo",
      netTRY: "29.90",
      vatTRY: "5.98",
      grossTRY: "35.88"
    });
    expect(request.totalsTRY).toEqual({
      net: "129.90",
      vat: "25.98",
      gross: "155.88"
    });
  });

  it("converts foreign currency to TRY before VAT", () => {
    const request = buildInvoiceRequest(tenant, "order-3", {
      ...baseBody,
      lines: [firstLine],
      global_discount: "0.00",
      currency: "USD",
      exchange_rate: "32.500000"
    });

    expect(request.lines[0]).toMatchObject({
      unitPriceTRY: "3250.00",
      netTRY: "3250.00",
      vatTRY: "650.00",
      grossTRY: "3900.00"
    });
    expect(request.totalsTRY.gross).toBe("3900.00");
  });

  it("rejects discounts larger than subtotal", () => {
    expect(() =>
      buildInvoiceRequest(tenant, "order-4", {
        ...baseBody,
        global_discount: "999.00"
      })
    ).toThrow(AppError);
  });
});
