import { randomUUID } from "node:crypto";

import type { InvoiceProvider } from "../InvoiceProvider";
import {
  createNilveraClient,
  normalizeNilveraBaseUrl,
  type NilveraClientFactory
} from "./nilvera/client";
import { IntegratorError, mapAxiosError } from "./nilvera/errors";
import { mapInvoiceRequestToNilveraDraft } from "./nilvera/mapPayload";
import type {
  InvoiceRequest,
  InvoiceResult,
  ProviderContext
} from "../types";

type DraftCreateResponse = {
  UUID?: string;
  InvoiceNumber?: string | null;
};

type StatusResponse = {
  StatusCode?: "unknown" | "waiting" | "succeed" | "error";
  StatusDetail?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRawRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : { value };
}

function parseDraftCreateResponse(value: unknown): DraftCreateResponse {
  if (!isRecord(value)) {
    return {};
  }

  const response: DraftCreateResponse = {};

  if (typeof value.UUID === "string") {
    response.UUID = value.UUID;
  }

  if (typeof value.InvoiceNumber === "string" || value.InvoiceNumber === null) {
    response.InvoiceNumber = value.InvoiceNumber;
  }

  return response;
}

function parseStatusResponse(value: unknown): StatusResponse {
  if (!isRecord(value)) {
    return {};
  }

  const statusCode =
    value.StatusCode === "unknown" ||
    value.StatusCode === "waiting" ||
    value.StatusCode === "succeed" ||
    value.StatusCode === "error"
      ? value.StatusCode
      : undefined;

  const response: StatusResponse = {};

  if (statusCode !== undefined) {
    response.StatusCode = statusCode;
  }

  if (typeof value.StatusDetail === "string" || value.StatusDetail === null) {
    response.StatusDetail = value.StatusDetail;
  }

  return response;
}

function parseUuid(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function mapStatusCode(code: StatusResponse["StatusCode"]): InvoiceResult["status"] {
  if (code === "succeed") {
    return "approved";
  }

  if (code === "error") {
    return "failed";
  }

  return "sent";
}

export class NilveraProvider implements InvoiceProvider {
  readonly driver = "nilvera";

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly mockMode = false,
    private readonly clientFactory: NilveraClientFactory = createNilveraClient
  ) {}

  async create(
    request: InvoiceRequest,
    context: ProviderContext
  ): Promise<InvoiceResult> {
    if (this.mockMode || this.apiKey.length === 0) {
      context.logger.info("[Nilvera] mock create", {
        idempotencyKey: request.idempotencyKey
      });
      return this.createMock(request);
    }

    const client = this.clientFactory(this.apiKey, this.baseUrl);
    const payload = mapInvoiceRequestToNilveraDraft(request);

    try {
      context.logger.info("[Nilvera] Draft/Create", {
        tenantId: request.tenantId,
        idempotencyKey: request.idempotencyKey
      });

      const createResponse = await client.post("/Draft/Create", payload);
      const createData = parseDraftCreateResponse(createResponse.data);
      const draftUuid = parseUuid(createData.UUID);

      if (!draftUuid) {
        throw new IntegratorError("Nilvera draft UUID missing in response", {
          retryable: false,
          code: "integrator_error",
          raw: createData
        });
      }

      await client.post("/Draft/ConfirmAndSend", [draftUuid]);

      let status: InvoiceResult["status"] = "sent";
      let statusDetail: string | null = null;

      try {
        const statusResponse = await client.get(
          `/Invoices/${draftUuid}/Status`
        );
        const statusData = parseStatusResponse(statusResponse.data);
        status = mapStatusCode(statusData.StatusCode);
        statusDetail = statusData.StatusDetail ?? null;
      } catch (statusError) {
        context.logger.error("[Nilvera] status poll failed after send", {
          draftUuid,
          message:
            statusError instanceof Error ? statusError.message : "unknown"
        });
      }

      return {
        externalId: draftUuid,
        ettn: draftUuid,
        invoiceNumber: createData.InvoiceNumber ?? null,
        status,
        pdfPath: `/earchive/Draft/${draftUuid}/pdf`,
        raw: {
          create: createData,
          statusDetail
        }
      };
    } catch (error) {
      if (error instanceof IntegratorError) {
        throw error;
      }

      throw mapAxiosError(error);
    }
  }

  async cancel(
    externalId: string,
    reason: string,
    context: ProviderContext
  ): Promise<InvoiceResult> {
    if (this.mockMode || this.apiKey.length === 0) {
      context.logger.info("[Nilvera] mock cancel", { externalId, reason });
      return {
        externalId,
        ettn: externalId,
        invoiceNumber: "MOCK-CANCELLED",
        status: "cancelled",
        pdfPath: null,
        raw: { mock: true, cancelReason: reason }
      };
    }

    const client = this.clientFactory(this.apiKey, this.baseUrl);

    try {
      context.logger.info("[Nilvera] Invoices/Cancel", { externalId, reason });

      const response = await client.post(`/Invoices/${externalId}/Cancel`, {
        Reason: reason
      });

      return {
        externalId,
        ettn: externalId,
        invoiceNumber: null,
        status: "cancelled",
        pdfPath: null,
        raw: asRawRecord(response.data)
      };
    } catch (error) {
      throw mapAxiosError(error);
    }
  }

  async getPdf(
    externalId: string,
    context: ProviderContext
  ): Promise<Buffer | { url: string }> {
    if (this.mockMode || this.apiKey.length === 0) {
      return { url: `${this.baseUrl}/mock/pdf/${externalId}` };
    }

    const client = this.clientFactory(this.apiKey, this.baseUrl);

    try {
      const response = await client.get(`/Draft/${externalId}/pdf`, {
        responseType: "arraybuffer"
      });

      return Buffer.from(response.data as ArrayBuffer);
    } catch (error) {
      context.logger.error("[Nilvera] PDF download failed", {
        externalId,
        message: error instanceof Error ? error.message : "unknown"
      });
      return {
        url: `${normalizeNilveraBaseUrl(this.baseUrl)}/Draft/${externalId}/pdf`
      };
    }
  }

  async getStatus(
    externalId: string,
    context: ProviderContext
  ): Promise<InvoiceResult["status"]> {
    if (this.mockMode || this.apiKey.length === 0) {
      return "approved";
    }

    const client = this.clientFactory(this.apiKey, this.baseUrl);

    try {
      const response = await client.get(
        `/Invoices/${externalId}/Status`
      );
      return mapStatusCode(parseStatusResponse(response.data).StatusCode);
    } catch (error) {
      context.logger.error("[Nilvera] getStatus failed", {
        externalId,
        message: error instanceof Error ? error.message : "unknown"
      });
      throw mapAxiosError(error);
    }
  }

  private createMock(request: InvoiceRequest): InvoiceResult {
    const ettn = randomUUID();

    return {
      externalId: ettn,
      ettn,
      invoiceNumber: `MOCK${String(request.tenantId).padStart(4, "0")}${String(Date.now())}`,
      status: "approved",
      pdfPath: `/v1/invoices/mock/${ettn}/pdf`,
      raw: { mock: true, idempotencyKey: request.idempotencyKey }
    };
  }
}
