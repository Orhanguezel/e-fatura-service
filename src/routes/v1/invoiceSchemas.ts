import { z } from "zod";

const decimalString = z.string().regex(/^\d+(\.\d{1,6})?$/);

export const invoiceCreateSchema = z
  .object({
    buyer: z.object({
      type: z.enum(["person", "company"]),
      name: z.string().min(1),
      tckn_vkn: z.string().min(10).max(11),
      email: z.string().email().optional(),
      address: z.string().min(1),
      city: z.string().min(1),
      country: z.string().min(1)
    }),
    lines: z
      .array(
        z.object({
          name: z.string().min(1),
          quantity: z.number().positive(),
          unit: z.string().min(1),
          unit_price: decimalString,
          vat_rate: z.number().min(0).max(100),
          discount: decimalString.default("0.00")
        })
      )
      .min(1),
    shipping: z
      .object({
        amount: decimalString,
        vat_rate: z.number().min(0).max(100)
      })
      .optional(),
    global_discount: decimalString.default("0.00"),
    currency: z.string().length(3).default("TRY"),
    exchange_rate: decimalString.nullable().optional(),
    issue_date: z.string().datetime(),
    note: z.string().optional()
  })
  .superRefine((body, ctx) => {
    if (body.currency !== "TRY" && !body.exchange_rate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "exchange_rate is required when currency is not TRY",
        path: ["exchange_rate"]
      });
    }
  });

export const cancelInvoiceSchema = z.object({
  reason: z.string().min(1).max(500)
});

export const invoiceParamsSchema = z.object({
  id: z.coerce.number().int().positive()
});

export type InvoiceCreateBody = z.infer<typeof invoiceCreateSchema>;
