import { ProviderNotImplementedError } from "../errors";
import type { InvoiceProvider } from "../InvoiceProvider";
import type {
  InvoiceRequest,
  InvoiceResult,
  ProviderContext
} from "../types";

export class NilveraProvider implements InvoiceProvider {
  readonly driver = "nilvera";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly testMode = true
  ) {}

  async create(
    request: InvoiceRequest,
    context: ProviderContext
  ): Promise<InvoiceResult> {
    const authMode = this.apiKey.length > 0 ? "configured" : "missing";

    context.logger.info("Nilvera invoice create requested", {
      tenantId: request.tenantId,
      mode: this.testMode ? "test" : "prod",
      baseUrl: this.baseUrl,
      authMode
    });

    return {
      externalId: "nil-mock-123",
      ettn: "550e8400-e29b-41d4-a716-446655440000",
      invoiceNumber: "ABC2026000000001",
      status: "sent",
      pdfPath: "storage/invoices/2026/550e8400-e29b-41d4-a716-446655440000.pdf",
      raw: {
        provider: this.driver,
        sandbox: this.testMode,
        lineCount: request.lines.length
      }
    };
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
