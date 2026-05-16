import type { InvoiceStatus } from "../db/schema";

export interface InvoiceLine {
  name: string;
  quantity: number;
  unit: string;
  unitPriceTRY: string;
  discountTRY: string;
  vatRate: number;
  netTRY: string;
  vatTRY: string;
  grossTRY: string;
}

export interface InvoiceRequest {
  tenantId: number;
  idempotencyKey: string;
  type: "earsiv";
  buyer: {
    type: "person" | "company";
    name: string;
    tcknVkn: string;
    email?: string;
    address: string;
    city: string;
    country: string;
  };
  lines: InvoiceLine[];
  currency: string;
  exchangeRate: string | null;
  totalsTRY: {
    net: string;
    vat: string;
    gross: string;
  };
  issueDate: string;
  note?: string;
}

export interface InvoiceResult {
  externalId: string;
  ettn: string | null;
  invoiceNumber: string | null;
  status: Extract<
    InvoiceStatus,
    "sent" | "approved" | "failed" | "cancelled" | "refunded"
  >;
  pdfUrl?: string;
  pdfPath: string | null;
  raw: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

export type ProviderLogger = {
  info: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
};

export type ProviderContext = {
  credentials: IntegratorCredentials;
  mode: "test" | "prod";
  logger: ProviderLogger;
};

export type IntegratorCredentials = {
  api_key?: string;
  apiKey?: string;
  base_url?: string;
  baseUrl?: string;
  company_vkn?: string;
  companyVkn?: string;
  [key: string]: unknown;
};

export function parseIntegratorCredentials(
  decryptedJson: string
): IntegratorCredentials {
  const parsed: unknown = JSON.parse(decryptedJson);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Integrator credentials must be a JSON object");
  }

  return parsed as IntegratorCredentials;
}
