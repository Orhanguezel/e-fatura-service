# Webhook Specification (Phase 3)

> Bu doküman servis ile istemciler arasındaki asenkron bildirim protokolünü tanımlar.

## 1. Akış

1. Fatura durumu terminal bir duruma (`sent`, `approved`, `failed`, `cancelled`) ulaştığında servis bir webhook tetikler.
2. Bildirim, tenant kaydındaki `webhook_url` adresine gönderilir.
3. İstemci 2xx dönmezse, servis üstel backoff ile retry yapar (max 5 deneme).

## 2. Güvenlik (İmzalama)

İsteklerin servisten geldiğini doğrulamak için `HMAC-SHA256` kullanılır.

**Headers (API-CONTRACT D4 ile hizalı):**
- `X-Efatura-Event`: `invoice.sent` | `invoice.approved` | …
- `X-Efatura-Timestamp`: ISO-8601 UTC (`occurred_at` ile aynı)
- `X-Efatura-Signature`: `sha256=` + HMAC-SHA256(`timestamp + "." + rawBody`, decrypt(`webhook_secret`))

**Doğrulama (İstemci tarafı):**
1. Timestamp'in güncelliğini kontrol et (±5 dakika).
2. Servisle paylaşılan `webhook_secret` kullanarak imzayı hesapla ve header'daki ile karşılaştır.

## 3. Payload Formatı

```json
{
  "event": "invoice.approved",
  "invoice_id": 123,
  "idempotency_key": "order_456",
  "status": "approved",
  "ettn": "550e8400-e29b-41d4-a716-446655440000",
  "invoice_number": "ABC2026000000001",
  "pdf_url": "/v1/invoices/123/pdf",
  "occurred_at": "2026-05-16T12:10:00.000Z"
}
```

## 4. Retry Politikası

BullMQ `webhook-deliver` kuyruğu: **6 deneme** (ilk + 5 retry), gecikmeler:
`1m → 5m → 30m → 2h → 6h` (`src/lib/queueBackoff.ts`).
