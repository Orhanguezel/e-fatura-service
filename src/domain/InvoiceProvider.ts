import type {
  InvoiceRequest,
  InvoiceResult,
  ProviderContext
} from "./types";

export interface InvoiceProvider {
  readonly driver: string;
  create(request: InvoiceRequest, context: ProviderContext): Promise<InvoiceResult>;
  cancel(
    externalId: string,
    reason: string,
    context: ProviderContext
  ): Promise<InvoiceResult>;
  getPdf(
    externalId: string,
    context: ProviderContext
  ): Promise<Buffer | { url: string }>;
  getStatus(
    externalId: string,
    context: ProviderContext
  ): Promise<InvoiceResult["status"]>;
}
