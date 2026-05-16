import { AppError } from "../lib/errors";
import type { Tenant } from "../db/schema";
import type { InvoiceCreateBody } from "../routes/v1/invoiceSchemas";
import type { InvoiceLine, InvoiceRequest } from "./types";

const UNIT = 1_000_000n;
const CENT_UNIT = 10_000n;

type SourceLine = {
  name: string;
  quantity: number;
  unit: string;
  unitPrice: bigint;
  gross: bigint;
  lineDiscount: bigint;
  afterLineDiscount: bigint;
  vatRate: number;
};

function parseDecimal(value: string): bigint {
  const [wholePart = "0", fractionPart = ""] = value.split(".");
  const paddedFraction = fractionPart.padEnd(6, "0").slice(0, 6);

  return BigInt(wholePart) * UNIT + BigInt(paddedFraction);
}

function numberToDecimalUnits(value: number): bigint {
  return parseDecimal(value.toString());
}

function roundDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

function multiplyDecimal(left: bigint, right: bigint): bigint {
  return roundDiv(left * right, UNIT);
}

function toTryUnits(sourceUnits: bigint, exchangeRate: bigint | null): bigint {
  return exchangeRate ? multiplyDecimal(sourceUnits, exchangeRate) : sourceUnits;
}

function unitsToCents(units: bigint): bigint {
  return roundDiv(units, CENT_UNIT);
}

function vatCents(netCents: bigint, vatRate: number): bigint {
  const rate = numberToDecimalUnits(vatRate);
  return roundDiv(netCents * rate, 100n * UNIT);
}

function formatCents(cents: bigint): string {
  const sign = cents < 0n ? "-" : "";
  const abs = cents < 0n ? -cents : cents;
  const whole = abs / 100n;
  const fraction = (abs % 100n).toString().padStart(2, "0");

  return `${sign}${whole.toString()}.${fraction}`;
}

function buildSourceLines(body: InvoiceCreateBody): SourceLine[] {
  const itemLines = body.lines.map((line) => {
    const unitPrice = parseDecimal(line.unit_price);
    const gross = multiplyDecimal(unitPrice, numberToDecimalUnits(line.quantity));
    const lineDiscount = parseDecimal(line.discount);
    const afterLineDiscount = gross - lineDiscount;

    if (afterLineDiscount < 0n) {
      throw new AppError(
        422,
        "invoice_rule_violation",
        `Discount exceeds line total for "${line.name}"`
      );
    }

    return {
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice,
      gross,
      lineDiscount,
      afterLineDiscount,
      vatRate: line.vat_rate
    };
  });

  if (!body.shipping) {
    return itemLines;
  }

  const shippingAmount = parseDecimal(body.shipping.amount);

  return [
    ...itemLines,
    {
      name: "Kargo",
      quantity: 1,
      unit: "Adet",
      unitPrice: shippingAmount,
      gross: shippingAmount,
      lineDiscount: 0n,
      afterLineDiscount: shippingAmount,
      vatRate: body.shipping.vat_rate
    }
  ];
}

function distributeGlobalDiscount(lines: SourceLine[], globalDiscount: bigint): bigint[] {
  const subtotal = lines.reduce(
    (sum, line) => sum + line.afterLineDiscount,
    0n
  );

  if (globalDiscount > subtotal) {
    throw new AppError(
      422,
      "invoice_rule_violation",
      "Global discount exceeds invoice subtotal"
    );
  }

  if (globalDiscount === 0n || subtotal === 0n) {
    return lines.map(() => 0n);
  }

  let distributed = 0n;

  return lines.map((line, index) => {
    if (index === lines.length - 1) {
      return globalDiscount - distributed;
    }

    const share = roundDiv(globalDiscount * line.afterLineDiscount, subtotal);
    distributed += share;

    return share;
  });
}

function buildLine(
  line: SourceLine,
  globalDiscountShare: bigint,
  exchangeRate: bigint | null
): InvoiceLine {
  const totalDiscount = line.lineDiscount + globalDiscountShare;
  const netSource = line.afterLineDiscount - globalDiscountShare;
  const netCents = unitsToCents(toTryUnits(netSource, exchangeRate));
  const vat = vatCents(netCents, line.vatRate);
  const gross = netCents + vat;

  return {
    name: line.name,
    quantity: line.quantity,
    unit: line.unit,
    unitPriceTRY: formatCents(unitsToCents(toTryUnits(line.unitPrice, exchangeRate))),
    discountTRY: formatCents(unitsToCents(toTryUnits(totalDiscount, exchangeRate))),
    vatRate: line.vatRate,
    netTRY: formatCents(netCents),
    vatTRY: formatCents(vat),
    grossTRY: formatCents(gross)
  };
}

function sumMoney(lines: InvoiceLine[], key: "netTRY" | "vatTRY" | "grossTRY"): string {
  const cents = lines.reduce((sum, line) => sum + parseDecimal(line[key]) / CENT_UNIT, 0n);

  return formatCents(cents);
}

export function buildInvoiceRequest(
  tenant: Tenant,
  idempotencyKey: string,
  body: InvoiceCreateBody
): InvoiceRequest {
  const exchangeRate =
    body.currency === "TRY" ? null : parseDecimal(body.exchange_rate ?? "0");
  const sourceLines = buildSourceLines(body);
  const globalDiscountShares = distributeGlobalDiscount(
    sourceLines,
    parseDecimal(body.global_discount)
  );
  const lines = sourceLines.map((line, index) =>
    buildLine(line, globalDiscountShares[index] ?? 0n, exchangeRate)
  );

  return {
    tenantId: tenant.id,
    idempotencyKey,
    type: "earsiv",
    buyer: {
      type: body.buyer.type,
      name: body.buyer.name,
      tcknVkn: body.buyer.tckn_vkn,
      ...(body.buyer.email ? { email: body.buyer.email } : {}),
      address: body.buyer.address,
      city: body.buyer.city,
      country: body.buyer.country
    },
    lines,
    currency: body.currency,
    exchangeRate: body.exchange_rate ?? null,
    totalsTRY: {
      net: sumMoney(lines, "netTRY"),
      vat: sumMoney(lines, "vatTRY"),
      gross: sumMoney(lines, "grossTRY")
    },
    issueDate: body.issue_date,
    ...(body.note ? { note: body.note } : {})
  };
}
