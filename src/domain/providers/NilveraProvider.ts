import { ProviderNotImplementedError } from "../errors";
import type { InvoiceProvider } from "../InvoiceProvider";
import {
  createNilveraClient,
  type NilveraClientFactory
} from "./nilvera/client";
import { IntegratorError, mapAxiosError } from "./nilvera/errors";
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
    private readonly testMode = true,
    private readonly clientFactory: NilveraClientFactory = createNilveraClient
  ) {}

  async create(
    request: InvoiceRequest,
    context: ProviderContext
  ): Promise<InvoiceResult> {
    if (this.apiKey.length === 0) {
      context.logger.info("[Nilvera] Using MOCK mode (empty API key)");
      return {
        externalId: "nil-mock-123",
        ettn: "550e8400-e29b-41d4-a716-446655440000",
        invoiceNumber: "MOCK2026000000001",
        status: "approved",
        pdfPath: "storage/invoices/mock.pdf",
        raw: { mock: true }
      };
    }

    const client = this.clientFactory(this.apiKey, this.baseUrl);

    try {
      // 1. Create Draft
      const createResponse = await client.post<any>("/General/EArchive/Create", {
        InvoiceInfo: {
          IssueDate: request.issueDate,
          CurrencyCode: request.currency,
          ExchangeRate: request.exchangeRate ? Number(request.exchangeRate) : 1,
          InvoiceType: "SATIS"
        },
        CustomerInfo: {
          VknTckn: request.buyer.tcknVkn,
          Title: request.buyer.name,
          Address: request.buyer.address,
          City: request.buyer.city,
          Country: request.buyer.country || "Türkiye",
          Email: request.buyer.email || ""
        },
        InvoiceLines: request.items.map((line) => ({
          Name: line.name,
          Quantity: line.quantity,
          UnitCode: line.unit || "ADET",
          UnitPrice: Number(line.unitPriceTRY),
          VatRate: line.vatRate,
          TotalDiscountTRY: Number(line.discountTRY)
        }))
      });

      const externalId = (createResponse.data.InvoiceId || createResponse.data.ID).toString();

      // 2. Approve
      const approveResponse = await client.post<any>(`/General/EArchive/${externalId}/Approve`);
      
      return {
        externalId,
        ettn: approveResponse.data.UUID || approveResponse.data.Ettn,
        invoiceNumber: approveResponse.data.InvoiceNumber,
        status: "sent",
        pdfPath: `/General/EArchive/${externalId}/Pdf`,
        raw: approveResponse.data
      };
    } catch (error: unknown) {
      throw mapAxiosError(error);
    }
  }

  async cancel(
    _externalId: string,
    _reason: string,
    _context: ProviderContext
  ): Promise<InvoiceResult> {
    throw new ProviderNotImplementedError(this.driver);
  }

  async getPdf(
    externalId: string,
    _context: ProviderContext
  ): Promise<Buffer | { url: string }> {
    return { url: `${this.baseUrl}/General/EArchive/${externalId}/Pdf` };
  }

  async getStatus(
    externalId: string,
    _context: ProviderContext
  ): Promise<InvoiceResult["status"]> {
    const client = this.clientFactory(this.apiKey, this.baseUrl);

    try {
      const response = await client.get<any>(`/General/EArchive/${externalId}`);
      const status = response.data.Status;

      if (status === "Approved") return "approved";
      if (status === "Error") return "failed";
      return "sent";
    } catch {
      return "sent";
    }
  }
}
