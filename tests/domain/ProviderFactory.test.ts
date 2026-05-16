import { describe, expect, it } from "vitest";

import type { Tenant } from "../../src/db/schema";
import { ProviderNotImplementedError } from "../../src/domain/errors";
import { createInvoiceProvider } from "../../src/domain/ProviderFactory";
import { EdmProvider } from "../../src/domain/providers/EdmProvider";
import { NilveraProvider } from "../../src/domain/providers/NilveraProvider";
import type { InvoiceRequest, ProviderContext } from "../../src/domain/types";
import { encryptSecret } from "../../src/lib/crypto";

const encKey = Buffer.from("12345678901234567890123456789012").toString(
  "base64"
);

function tenantWithDriver(driver: "nilvera" | "edm"): Tenant {
  const now = new Date();
  return {
    id: 1,
    tenantKey: "test",
    displayName: "Test",
    vknTckn: "11111111111",
    address: "Addr",
    integratorDriver: driver,
    integratorCredentials: encryptSecret(
      JSON.stringify({
        apiKey: "nil-test-key",
        baseUrl: "https://sandbox.nilvera.test"
      }),
      encKey
    ),
    apiKeyHash: "a".repeat(64),
    allowedIps: null,
    webhookUrl: null,
    webhookSecret: encryptSecret("whsec", encKey),
    taxProfile: {},
    mode: "test",
    isActive: 1,
    createdAt: now,
    updatedAt: now
  };
}

const sampleRequest: InvoiceRequest = {
  tenantId: 1,
  idempotencyKey: "order-1",
  type: "earsiv",
  buyer: {
    type: "person",
    name: "Test Customer",
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
  totalsTRY: {
    net: "100.00",
    vat: "20.00",
    gross: "120.00"
  },
  issueDate: "2026-05-16T10:00:00.000Z"
};

const providerContext: ProviderContext = {
  credentials: {},
  mode: "test",
  logger: {
    info: () => undefined,
    error: () => undefined
  }
};

describe("ProviderFactory", () => {
  it("resolves NilveraProvider for nilvera driver", () => {
    const provider = createInvoiceProvider(tenantWithDriver("nilvera"), {
      encryptionKey: encKey
    });

    expect(provider).toBeInstanceOf(NilveraProvider);
    expect(provider.driver).toBe("nilvera");
  });

  it("resolves EdmProvider skeleton for edm driver", () => {
    const provider = createInvoiceProvider(tenantWithDriver("edm"), {
      encryptionKey: encKey
    });

    expect(provider).toBeInstanceOf(EdmProvider);
  });

  it("EdmProvider throws ProviderNotImplementedError on create", async () => {
    const provider = createInvoiceProvider(tenantWithDriver("edm"), {
      encryptionKey: encKey
    });

    await expect(provider.create(sampleRequest, providerContext)).rejects.toBeInstanceOf(
      ProviderNotImplementedError
    );
  });
});
