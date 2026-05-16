# Faz 2 Spec — Provider + Builder + Worker (DONMUŞ — Codex devir)

> Branch: `feat/phase-2-nilvera` (Faz 1 PR `main`'e merge sonrası açılır).
> Claude (mimar) tasarladı; Codex implemente eder. Kaynak: [ARCHITECTURE.md](ARCHITECTURE.md)
> · [API-CONTRACT.md](API-CONTRACT.md) · [SCHEMA.md](SCHEMA.md) · [WORK-PLAN.md](WORK-PLAN.md).
> Faz 1 tipleriyle hizalı: `src/db/schema.ts`, `src/routes/v1/invoiceSchemas.ts`.
> Not: önceki taslaktaki Nilvera URL/auth bilgisi §5'e taşındı (doğrulanacak).

## Faz 2 kapsamı

`InvoiceProvider` arayüzü + DTO + `ProviderFactory` + `InvoiceManager` +
`NilveraProvider` (gerçek) + `EdmProvider` (iskelet) + tutar builder +
BullMQ `invoice-create` kuyruğu/worker'ı. Çıktı: **Nilvera sandbox'ta fatura kesilir, PDF+ETTN gelir.**

Faz 2'de YAPMA: webhook gönderimi, retry-exhausted alarmı, sync cron (Faz 3); iptal/iade (Faz 4).

---

## 1. DTO'lar — `src/domain/`

`InvoiceRequest` = normalize edilmiş, **TL'ye indirgenmiş** iç model.
`InvoiceCreateBody` (zod) → `buildInvoiceRequest()` ile üretilir.

```ts
// domain/InvoiceRequest.ts
export interface InvoiceLine {
  name: string; quantity: number; unit: string;
  unitPriceTRY: string;        // TL, 2 hane
  discountTRY: string;         // TL, 2 hane (satır indirimi + dağıtılmış global pay)
  vatRate: number;             // %
  netTRY: string;              // qty*unitPrice - discount, 2 hane
  vatTRY: string;              // round(net * rate/100, 2)
  grossTRY: string;            // net + vat
}
export interface InvoiceRequest {
  tenantId: number;
  idempotencyKey: string;
  type: "earsiv";
  buyer: { type: "person"|"company"; name: string; tcknVkn: string;
           email?: string; address: string; city: string; country: string };
  lines: InvoiceLine[];
  currency: string;            // istek para birimi (denetim/gösterim)
  exchangeRate: string|null;   // 1 birim yabancı = X TRY (currency≠TRY ise dolu)
  totalsTRY: { net: string; vat: string; gross: string };
  issueDate: string;           // ISO UTC
  note?: string;
}
```

```ts
// domain/InvoiceResult.ts
export interface InvoiceResult {
  externalId: string; ettn: string|null; invoiceNumber: string|null;
  status: "sent"|"approved"|"failed";   // 'pending' DEĞİL — pending DB durumu
  pdfPath: string|null;
  raw: Record<string, unknown>;          // entegratör ham yanıtı (response_payload)
  error?: { code: string; message: string; retryable: boolean };
}
```

## 2. Tutar Builder — `domain/buildInvoiceRequest.ts` (EN KRİTİK)

Para hesabı **serviste yeniden yapılır**, istemci toplamına güvenilmez (API-CONTRACT).
Para tipi: string-decimal; hesap `decimal.js` veya tamsayı-kuruş ile (float YASAK).

**Sıra (her satır için):**
1. `lineGross = quantity * unit_price` (yabancı para ise sonra çevrilir).
2. Satır indirimi düşülür: `afterLineDisc = lineGross - discount`.
3. **Global indirim** satırlara `afterLineDisc` oranında dağıtılır; son satıra yuvarlama artığı eklenir (toplam tutması için).
4. `net = afterLineDisc - globalDiscShare`.
5. **Para çevrimi**: `currency != TRY` ise `unitPrice/discount/net` `* exchange_rate` ile TL'ye çevrilir, **sonra** yuvarlanır.
6. `vat = round(net * vat_rate / 100, 2)` — yuvarlama **satır seviyesinde**, half-up (kuruş).
7. `gross = net + vat`.
8. **Kargo** ayrı satır gibi işlenir (`shipping.amount`, `shipping.vat_rate`).
9. Toplamlar satır toplamlarından: `totalsTRY.net/vat/gross = Σ`. `invoices.total = gross`, `invoices.tax_total = vat`.

**Yuvarlama:** her satırda 2 haneye half-up; toplam = yuvarlanmış satırların toplamı (önce-topla-sonra-yuvarla DEĞİL — GİB/UBL-TR tutarlılığı için).

**tax_profile (tenant) etkisi:** istisna/tevkifat varsa builder `vat_rate`'i 0'a çeker + istisna kodu ekler. Şema (öneri, **muhasebe teyidi ön koşul — canlı öncesi**):
```json
{ "default_vat_rate": 20,
  "exemptions": [{ "match": "kdv_haric", "code": "351", "vat_rate": 0 }],
  "withholding": null }
```
> ⚠️ `tax_profile` semantiği muhasebe danışmanı ile **canlı tek-fatura öncesi** netleştirilir. Kod default %20 ile çalışır; istisna teyit gelince doldurulur. Sandbox'ı bloke etmez.

## 3. Provider arayüzü — `domain/InvoiceProvider.ts`

Metod adları (önceki taslak `createInvoice` kullanmıştı — **`create` standardı**):
```ts
export interface InvoiceProvider {
  create(req: InvoiceRequest, ctx: ProviderCtx): Promise<InvoiceResult>;
  cancel(externalId: string, reason: string, ctx: ProviderCtx): Promise<InvoiceResult>; // Faz 4
  getPdf(externalId: string, ctx: ProviderCtx): Promise<Buffer | { url: string }>;
  getStatus(externalId: string, ctx: ProviderCtx): Promise<InvoiceResult["status"]>;     // Faz 3
}
// ProviderCtx: çözülmüş (decrypt) credential + tenant.mode (test/prod) + logger
```

## 4. ProviderFactory — `domain/ProviderFactory.ts` (D5)

`tenant.integratorDriver` → instance. Registry map; bilinmeyen driver → `integrator_error`.
- `nilvera` → `NilveraProvider` (gerçek, Faz 2).
- `edm` → `EdmProvider` — tüm metotlar `throw new NotImplementedError("edm")` (iskelet).
Credential `lib/crypto.ts` ile decrypt edilip `ProviderCtx`'e konur; loglara **yazılmaz**.

## 5. NilveraProvider — `domain/providers/NilveraProvider.ts`

- Base URL: prod `https://api.nilvera.com/`, sandbox `https://test-api.nilvera.com/`
  (`tenant.mode==="test"` → sandbox; gerçek GİB'e gitmez).
- Auth: `Authorization: Bearer {api_key}` (credential JSON: `api_key`/`base_url`/`company_vkn`).
- Akış: JSON taslak oluştur → onaya gönder/imzala (mali mühür entegratörde) → `externalId`+`ettn`+`invoiceNumber` → PDF ayrı uçtan çek → `pdfPath` (`storage/invoices/{yyyy}/{ettn}.pdf` veya servis URL'i).
- Hata eşleme: HTTP 4xx → `retryable:false` (`invoice_rule_violation`/`validation_error`); 5xx/timeout/429 → `retryable:true` (`integrator_error`).
> Üstteki URL/auth/akış önceki taslaktan geldi; **Nilvera API dokümanından** endpoint adları + payload alanları birebir doğrulanır (Faz 0 hazır, credential mevcut). Doğrulanan şema `docs/NILVERA-MAPPING.md`'ye yazılır (Codex çıktısı).

## 6. InvoiceManager — `domain/InvoiceManager.ts`

Orkestratör + durum makinesi (D6). Worker bunu çağırır.
- `create(invoiceRow)`: `pending→sending` (event log) → `ProviderFactory` → `provider.create()`.
  - Başarı → `sent` (Nilvera onayı varsa `approved`), `external_id/ettn/invoice_number/pdf_path/response_payload/sent_at` yaz.
  - **Idempotency (D3):** `external_id` zaten doluysa yeniden gönderme — sadece `getStatus()` ile senkronla.
  - Hata → `failed`, `error_message`, `attempts++`, event log; `retryable` ise worker yeniden dener.
- Geçersiz durum geçişini reddet (örn. `approved→sending` yasak). Her geçiş `invoice_events` (actor=`worker`).

## 7. Kuyruk — `src/queue/`

- `invoiceQueue.ts`: BullMQ `invoice-create` kuyruğu, **ayrı Redis** (`REDIS_URL`, scraper-redis paylaşılmaz — WORK-PLAN D7).
- `workers/createInvoice.ts`: job `{ invoiceId }`. `attempts: 5`, backoff exponential `[1m,5m,30m,2h,6h]`. Job içinde `InvoiceManager.create()`. Tükenirse `failed` kalır (alarm Faz 3).
- `POST /v1/invoices` route'u (Faz 1 stub) artık: idempotency kontrol → `invoices` `pending` insert → kuyruğa `{invoiceId}` → **202** (tekrar → 200, API-CONTRACT D3).
- Worker servis süreciyle başlar (`server.ts`) ama HTTP'den bağımsız çalışır; Redis down → `503 service_unavailable`, `/healthz` redis=down.

## 8. Test (Faz 2 — sandbox)

- **Unit (kritik):** builder — KDV/satır+global indirim/kargo/çoklu para birimi→TL, yuvarlama artığı, toplam tutması. Sınır: %0 KDV, indirim>tutar, currency≠TRY.
- **Unit:** `NilveraProvider` HTTP mock (başarı/4xx/5xx/timeout → retryable eşleme); `ProviderFactory` (edm→NotImplemented).
- **Integration:** `POST /v1/invoices` → kuyruk (test bağlantısı) → worker → `invoices.sent` assert; idempotency tekrarı 200.
- **Antigravity (kabul):** Nilvera **sandbox** ile gerçek fatura → PDF açılıyor + ETTN geçerli; kanıt rapora.

## 9. Çıktı / DoD

type-check + lint temiz, unit+integration yeşil, sandbox PDF+ETTN doğrulandı,
`docs/NILVERA-MAPPING.md` üretildi. PR → `main`. Sonra Claude Faz 3 `docs/WEBHOOK-SPEC.md`.
