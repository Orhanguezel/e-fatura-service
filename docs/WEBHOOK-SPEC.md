# Faz 3 Spec — Webhook + Idempotency + Retry + Status Sync (DONMUŞ — Codex devir)

> Branch: `codex/phase-3-reliability` (Faz 2 `main`'e merge edildi → buradan aç).
> Claude (mimar) sahiplendi; Codex implemente eder; Claude review + merge.
> Otorite: **[API-CONTRACT.md](API-CONTRACT.md) (DONMUŞ)** §"Webhook" · D3/D4 ·
> [WORK-PLAN.md](WORK-PLAN.md) · [SCHEMA.md](SCHEMA.md).
> Not: Codex'in erken taslağı girdi olarak alındı; bu sürüm otorite.

## Faz 3 kapsamı (yalnız bunlar)

Faz 2'nin asenkron akışını **güvenilir** hale getirir:
1. Servis→istemci **webhook gönderimi** (imzalı, retry'li).
2. **Idempotency** sağlamlaştırma (D3) — tekrar istek/tekrar event no-op.
3. **Retry/backoff** tükenme + alarm.
4. **Status sync cron** — GİB/entegratör durum senkronu.

**Faz 3'te YAPMA** (scope-creep tekrarı yasak — REVIEW-FAZ2 B2):
- İptal/iade mantığı + admin panel → **Faz 4** (`docs/CANCEL-RULES.md` Claude üretecek).
- sportoonline istemci → Faz 5 (`HANDOFF-FAZ5-SPORTOONLINE.md`).
- API-CONTRACT'ı değiştirme (donmuş). docs/ yazma (Claude lane'i).

## 1. Webhook gönderimi

Tetik: `invoices.status` geçişte (`sent`, `approved`, `failed`, `cancelled`,
`refunded`). `InvoiceManager` durum geçişi sonrası `webhook-deliver` kuyruğuna
iş atar (HTTP akışını bloke etmez).

**Modül-seviyesi yan etki YASAK** (REVIEW-FAZ2 B1): kuyruk/worker lazy factory
(`getWebhookQueue()` / `startDeliverWebhookWorker()`), `invoiceQueue.ts` deseni.
Test importu yan etkisiz; `bun run test` tam suite yeşil kalmalı.

### Başlıklar (API-CONTRACT D4 — birebir)
| Header | Değer |
|---|---|
| `X-Efatura-Event` | `invoice.sent` \| `invoice.approved` \| `invoice.failed` \| `invoice.cancelled` \| `invoice.refunded` |
| `X-Efatura-Timestamp` | ISO-8601 UTC (= `occurred_at`) |
| `X-Efatura-Signature` | `sha256=` + HMAC-SHA256(`timestamp + "." + rawBody`, decrypt(`tenant.webhook_secret`)) |

`webhook_secret` `lib/crypto.ts` ile decrypt edilir; loglara yazılmaz.

### Gövde (API-CONTRACT ile birebir)
```json
{
  "event": "invoice.approved",
  "invoice_id": 123,
  "idempotency_key": "order-1234",
  "status": "approved",
  "ettn": "550e8400-e29b-41d4-a716-446655440000",
  "invoice_number": "SPO2026000001234",
  "pdf_url": "/v1/invoices/123/pdf",
  "occurred_at": "2026-05-16T10:01:00.000Z"
}
```

### `POST /v1/webhooks/test` (Faz 1 stub → gerçekleştir)
Tenant `webhook_url`'ine imzalı test POST'u; istemci 2xx → `200 {ok:true}`,
değilse `502 webhook_unreachable` (API-CONTRACT).

## 2. Retry / Backoff

`webhook-deliver` BullMQ: **6 deneme** (ilk + 5 retry), gecikme
`1m → 5m → 30m → 2h → 6h` (`src/lib/queueBackoff.ts` — Faz 2'de var, paylaş).
İstemci 2xx dönmezse retry. Tükenirse: `invoice_events`'e
`actor='webhook'`, `reason` log + alarm (log seviyesi `error`; alarm kanalı
env'de opsiyonel, yoksa structured log yeter).

## 3. Idempotency sağlamlaştırma (D3)

- `POST /v1/invoices` tekrar (aynı `tenant_id`+`idempotency_key`): mevcut kaydı
  **200** döner, yeni iş atmaz; farklı payload → `409 idempotency_conflict`.
- Webhook gönderimi idempotent: aynı (`invoice_id`,`event`) tekrar tetiklenirse
  istemciye net tek sonuç; istemci tarafı no-op (API-CONTRACT istemci notu).
- `createInvoice` worker: `external_id` doluysa yeniden gönderme, sadece sync.

## 4. Status Sync Cron — `workers/syncStatus.ts`

Repeatable BullMQ job (`status-sync`). **Lazy factory** (import-time yan etki yok).
- Periyot: env `STATUS_SYNC_CRON` (default `*/15 * * * *`).
- Hedef: `status='sent'` ve `external_id` dolu (henüz `approved`/`failed` değil)
  faturalar. Tenant provider `getStatus(externalId)` → durum güncelle, geçiş
  `invoice_events` (`actor='sync-cron'`), gerekiyorsa webhook tetikle.
- Sayfalama + tenant başına rate-limit (entegratör API'sini yormasın).

## 5. Veri / durum

Yeni tablo YOK (SCHEMA.md yeterli). `invoice_events.actor`:
`worker` | `webhook` | `sync-cron` | `admin`. Şema değişimi gerekirse
`db/seed/sql/0XX_*.sql` (ALTER yasak — CLAUDE.md).

## 6. Test (DoD)

- Unit: imza üretimi/doğrulama (geçerli/bozuk/eski timestamp ±5dk).
- Unit: backoff gecikme dizisi; retry tükenme → event log.
- Integration: durum geçişi → `webhook-deliver` → fake istemci 2xx/5xx →
  retry assert; `POST /webhooks/test` happy/unreachable.
- Integration: idempotency tekrarı (200) + farklı payload (409).
- Sync cron: `sent` → provider mock `approved` → `invoices` güncel + event.
- **`bun run build` + `bun run lint` + `bun run test` (tam suite) YEŞİL** —
  modül yan etkisi yok (B1 tekrarı yasak).

## 7. Süreç (branch izolasyonu — WORK-PLAN §1)

Codex `codex/phase-3-reliability`'de çalışır; `docs/` yazmaz; API-CONTRACT'a
dokunmaz. Bitince Claude review (`REVIEW-FAZ3.md`) → yeşilse `main`'e merge (Claude).
Redis/sandbox gerektiren E2E kanıtı `VERIFY-FAZ3.md` checklist'ine işlenir.
