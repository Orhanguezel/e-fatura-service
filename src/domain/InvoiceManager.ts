import type { Tenant } from "../db/schema";
import { createProviderResolution } from "./ProviderFactory";
import type { InvoiceRequest, InvoiceResult } from "./types";

export class InvoiceManager {
  constructor(private readonly encryptionKey: string) {}

  async createInvoice(
    tenant: Tenant,
    request: InvoiceRequest
  ): Promise<InvoiceResult> {
    const { provider, context } = createProviderResolution(tenant, {
      encryptionKey: this.encryptionKey
    });

    return provider.create(request, context);
  }
}
