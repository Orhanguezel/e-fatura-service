import type { Tenant } from "../db/schema";
import { createProviderResolution } from "./ProviderFactory";
import type { InvoiceRequest, InvoiceResult } from "./types";

export type InvoiceManagerOptions = {
  encryptionKey: string;
  nilveraMockMode?: boolean;
};

export class InvoiceManager {
  constructor(private readonly options: InvoiceManagerOptions) {}

  private resolutionOptions(): Parameters<typeof createProviderResolution>[1] {
    return {
      encryptionKey: this.options.encryptionKey,
      ...(this.options.nilveraMockMode !== undefined
        ? { nilveraMockMode: this.options.nilveraMockMode }
        : {})
    };
  }

  async createInvoice(
    tenant: Tenant,
    request: InvoiceRequest
  ): Promise<InvoiceResult> {
    const { provider, context } = createProviderResolution(
      tenant,
      this.resolutionOptions()
    );

    return provider.create(request, context);
  }

  async syncInvoiceStatus(
    tenant: Tenant,
    externalId: string
  ): Promise<InvoiceResult["status"]> {
    const { provider, context } = createProviderResolution(
      tenant,
      this.resolutionOptions()
    );

    return provider.getStatus(externalId, context);
  }

  async getPdf(
    tenant: Tenant,
    externalId: string
  ): Promise<Buffer | { url: string }> {
    const { provider, context } = createProviderResolution(
      tenant,
      this.resolutionOptions()
    );

    return provider.getPdf(externalId, context);
  }
}
