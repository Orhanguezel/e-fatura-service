import type { InvoiceCreateBody } from "../routes/v1/invoiceSchemas";
import type { InvoiceRequest } from "./types";
import type { Tenant } from "../db/schema";
import { buildInvoiceRequest } from "./buildInvoiceRequest";

export function mapApiPayloadToInvoiceRequest(
  payload: InvoiceCreateBody,
  tenant?: Tenant,
  idempotencyKey = "test-idempotency-key"
): InvoiceRequest {
  const fallbackTenant = tenant ?? {
    id: 0,
    tenantKey: "test",
    displayName: "Test",
    vknTckn: "11111111111",
    address: "Test",
    integratorDriver: "nilvera",
    integratorCredentials: "",
    apiKeyHash: "",
    allowedIps: null,
    webhookUrl: null,
    webhookSecret: "",
    taxProfile: {},
    mode: "test",
    isActive: 1,
    createdAt: new Date(0),
    updatedAt: new Date(0)
  } satisfies Tenant;

  return buildInvoiceRequest(fallbackTenant, idempotencyKey, payload);
}
