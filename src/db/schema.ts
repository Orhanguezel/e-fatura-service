import {
  bigint,
  char,
  decimal,
  datetime,
  index,
  json,
  mysqlTable,
  text,
  tinyint,
  uniqueIndex,
  varchar
} from "drizzle-orm/mysql-core";

export const invoiceStatuses = [
  "pending",
  "sending",
  "sent",
  "approved",
  "failed",
  "cancelled",
  "refunded"
] as const;
export const invoiceTypes = ["earsiv", "iade"] as const;
export const integratorDrivers = ["nilvera", "edm"] as const;
export const tenantModes = ["test", "prod"] as const;

export type InvoiceStatus = (typeof invoiceStatuses)[number];
export type InvoiceType = (typeof invoiceTypes)[number];
export type IntegratorDriver = (typeof integratorDrivers)[number];
export type TenantMode = (typeof tenantModes)[number];

export const tenants = mysqlTable(
  "tenants",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    tenantKey: varchar("tenant_key", { length: 64 }).notNull(),
    displayName: varchar("display_name", { length: 190 }).notNull(),
    vknTckn: varchar("vkn_tckn", { length: 11 }).notNull(),
    address: varchar("address", { length: 500 }).notNull(),
    integratorDriver: varchar("integrator_driver", { length: 20 })
      .$type<IntegratorDriver>()
      .notNull()
      .default("nilvera"),
    integratorCredentials: text("integrator_credentials").notNull(),
    apiKeyHash: char("api_key_hash", { length: 64 }).notNull(),
    allowedIps: varchar("allowed_ips", { length: 500 }),
    webhookUrl: varchar("webhook_url", { length: 500 }),
    webhookSecret: text("webhook_secret").notNull(),
    taxProfile: json("tax_profile").$type<Record<string, unknown>>().notNull(),
    mode: varchar("mode", { length: 10 })
      .$type<TenantMode>()
      .notNull()
      .default("test"),
    isActive: tinyint("is_active").notNull().default(1),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull()
  },
  (table) => [
    uniqueIndex("tenants_tenant_key_unique").on(table.tenantKey),
    uniqueIndex("tenants_api_key_hash_unique").on(table.apiKeyHash)
  ]
);

export const invoices = mysqlTable(
  "invoices",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    tenantId: bigint("tenant_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    idempotencyKey: varchar("idempotency_key", { length: 190 }).notNull(),
    status: varchar("status", { length: 20 })
      .$type<InvoiceStatus>()
      .notNull()
      .default("pending"),
    type: varchar("type", { length: 10 })
      .$type<InvoiceType>()
      .notNull()
      .default("earsiv"),
    externalId: varchar("external_id", { length: 190 }),
    ettn: char("ettn", { length: 36 }),
    invoiceNumber: varchar("invoice_number", { length: 32 }),
    currency: char("currency", { length: 3 }).notNull().default("TRY"),
    exchangeRate: decimal("exchange_rate", { precision: 15, scale: 6 }),
    total: decimal("total", { precision: 15, scale: 2 }).notNull(),
    taxTotal: decimal("tax_total", { precision: 15, scale: 2 }).notNull(),
    requestPayload: json("request_payload").$type<Record<string, unknown>>().notNull(),
    responsePayload: json("response_payload").$type<Record<string, unknown> | null>(),
    errorMessage: text("error_message"),
    attempts: tinyint("attempts", { unsigned: true }).notNull().default(0),
    pdfPath: varchar("pdf_path", { length: 500 }),
    sentAt: datetime("sent_at", { mode: "date", fsp: 3 }),
    cancelledAt: datetime("cancelled_at", { mode: "date", fsp: 3 }),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull(),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull()
  },
  (table) => [
    uniqueIndex("invoices_tenant_id_idempotency_key_unique").on(
      table.tenantId,
      table.idempotencyKey
    ),
    index("invoices_tenant_id_status_idx").on(
      table.tenantId,
      table.status
    ),
    index("invoices_external_id_idx").on(table.externalId)
  ]
);

export const invoiceEvents = mysqlTable(
  "invoice_events",
  {
    id: bigint("id", { mode: "number", unsigned: true })
      .autoincrement()
      .primaryKey(),
    invoiceId: bigint("invoice_id", { mode: "number", unsigned: true })
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    fromStatus: varchar("from_status", { length: 20 }).$type<InvoiceStatus>(),
    toStatus: varchar("to_status", { length: 20 }).$type<InvoiceStatus>().notNull(),
    actor: varchar("actor", { length: 40 }).notNull(),
    reason: varchar("reason", { length: 500 }),
    meta: json("meta").$type<Record<string, unknown> | null>(),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull()
  },
  (table) => [
    index("invoice_events_invoice_id_created_at_idx").on(
      table.invoiceId,
      table.createdAt
    )
  ]
);

export type Tenant = typeof tenants.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type InvoiceEvent = typeof invoiceEvents.$inferSelect;
