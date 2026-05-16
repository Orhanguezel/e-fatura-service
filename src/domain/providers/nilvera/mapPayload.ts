import type { InvoiceRequest } from "../../types";

export type NilveraCreateDraftBody = {
  ArchiveInvoice: {
    InvoiceInfo: {
      InvoiceType: "SATIS";
      IssueDate: string;
      CurrencyCode: string;
      ExchangeRate: number;
      SalesPlatform: "INTERNET";
      SendType: "ELEKTRONIK";
      LineExtensionAmount: number;
      KdvTotal: number;
      PayableAmount: number;
    };
    CustomerInfo: {
      TaxNumber: string;
      Name: string;
      Address: string;
      City: string;
      Country: string;
      Mail?: string;
    };
    InvoiceLines: Array<{
      Name: string;
      Quantity: number;
      UnitType: string;
      Price: number;
      AllowanceTotal: number;
      KDVPercent: number;
      KDVTotal: number;
    }>;
    Notes?: string[];
  };
};

export function mapInvoiceRequestToNilveraDraft(
  request: InvoiceRequest
): NilveraCreateDraftBody {
  return {
    ArchiveInvoice: {
      InvoiceInfo: {
        InvoiceType: "SATIS",
        IssueDate: request.issueDate,
        CurrencyCode: "TRY",
        ExchangeRate: 1,
        SalesPlatform: "INTERNET",
        SendType: "ELEKTRONIK",
        LineExtensionAmount: Number(request.totalsTRY.net),
        KdvTotal: Number(request.totalsTRY.vat),
        PayableAmount: Number(request.totalsTRY.gross)
      },
      CustomerInfo: {
        TaxNumber: request.buyer.tcknVkn,
        Name: request.buyer.name,
        Address: request.buyer.address,
        City: request.buyer.city,
        Country: request.buyer.country,
        ...(request.buyer.email ? { Mail: request.buyer.email } : {})
      },
      InvoiceLines: request.lines.map((line) => ({
        Name: line.name,
        Quantity: line.quantity,
        UnitType: line.unit,
        Price: Number(line.unitPriceTRY),
        AllowanceTotal: Number(line.discountTRY),
        KDVPercent: line.vatRate,
        KDVTotal: Number(line.vatTRY)
      })),
      ...(request.note ? { Notes: [request.note] } : {})
    }
  };
}
