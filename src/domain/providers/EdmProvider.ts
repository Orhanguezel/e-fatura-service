import { ProviderNotImplementedError } from "../errors";
import type { InvoiceProvider } from "../InvoiceProvider";
import type {
  InvoiceRequest,
  InvoiceResult,
  ProviderContext
} from "../types";

export class EdmProvider implements InvoiceProvider {
  readonly driver = "edm";

  async create(
    _request: InvoiceRequest,
    _context: ProviderContext
  ): Promise<InvoiceResult> {
    throw new ProviderNotImplementedError(this.driver);
  }

  async cancel(
    _externalId: string,
    _reason: string,
    _context: ProviderContext
  ): Promise<InvoiceResult> {
    throw new ProviderNotImplementedError(this.driver);
  }

  async getPdf(
    _externalId: string,
    _context: ProviderContext
  ): Promise<Buffer | { url: string }> {
    throw new ProviderNotImplementedError(this.driver);
  }

  async getStatus(
    _externalId: string,
    _context: ProviderContext
  ): Promise<InvoiceResult["status"]> {
    throw new ProviderNotImplementedError(this.driver);
  }
}
