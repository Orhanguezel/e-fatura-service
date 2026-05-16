import { describe, expect, it } from "vitest";

import { NilveraProvider } from "../../src/domain/providers/NilveraProvider";
import type { NilveraHttpClient } from "../../src/domain/providers/nilvera/client";
import type { InvoiceRequest, ProviderContext } from "../../src/domain/types";

const sampleRequest: InvoiceRequest = {
  tenantId: 1,
  idempotencyKey: "order-99",
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
      unitPriceTRY: "10.00",
      discountTRY: "0.00",
      vatRate: 20,
      netTRY: "10.00",
      vatTRY: "2.00",
      grossTRY: "12.00"
    }
  ],
  currency: "TRY",
  exchangeRate: null,
  totalsTRY: { net: "10.00", vat: "2.00", gross: "12.00" },
  issueDate: "2026-05-16T10:00:00.000Z"
};

const context: ProviderContext = {
  credentials: {},
  mode: "test",
  logger: { info: () => undefined, error: () => undefined }
};

describe("NilveraProvider mock mode", () => {
  it("returns approved mock invoice with ETTN", async () => {
    const provider = new NilveraProvider("", "https://apitest.nilvera.com", true);
    const result = await provider.create(sampleRequest, context);

    expect(result.status).toBe("approved");
    expect(result.ettn).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(result.invoiceNumber).toContain("MOCK");
  });
});

describe("NilveraProvider HTTP mode", () => {
  it("creates draft, confirms and maps status without network", async () => {
    const calls: string[] = [];
    const client: any = {
      post: async (url: string): Promise<{ data: any }> => {
        calls.push(`POST ${url}`);

        if (url === "/General/EArchive/Create") {
          return {
            data: {
              ID: "123",
              InvoiceId: "123"
            }
          };
        }

        if (url === "/General/EArchive/123/Approve") {
          return {
            data: {
              UUID: "550e8400-e29b-41d4-a716-446655440000",
              InvoiceNumber: "SPO202600000001"
            }
          };
        }

        return { data: {} };
      },
      get: async (url: string): Promise<{ data: any }> => {
        calls.push(`GET ${url}`);

        return {
          data: {
            Status: "Approved"
          }
        };
      }
    };
    const provider = new NilveraProvider(
      "api-key",
      "https://apitest.nilvera.com",
      false,
      () => client
    );

    const result = await provider.create(sampleRequest, context);

    expect(calls).toEqual([
      "POST /General/EArchive/Create",
      "POST /General/EArchive/123/Approve"
    ]);
    expect(result).toMatchObject({
      externalId: "550e8400-e29b-41d4-a716-446655440000",
      ettn: "550e8400-e29b-41d4-a716-446655440000",
      invoiceNumber: "SPO202600000001",
      status: "approved"
    });
  });
});
