# Webhook Specification (Phase 3)

> Bu doküman servis ile istemciler arasındaki asenkron bildirim protokolünü tanımlar.

## 1. Akış

1. Fatura durumu terminal bir duruma (`sent`, `approved`, `failed`, `cancelled`) ulaştığında servis bir webhook tetikler.
2. Bildirim, tenant kaydındaki `webhook_url` adresine gönderilir.
3. İstemci 2xx dönmezse, servis üstel backoff ile retry yapar (max 5 deneme).

## 2. Güvenlik (İmzalama)

İsteklerin servisten geldiğini doğrulamak için `HMAC-SHA256` kullanılır.

**Headers:**
- `X-Efatura-Signature`: `HMAC-SHA256(timestamp + "." + body, tenant.webhook_secret)`
- `X-Efatura-Timestamp`: Unix timestamp (saniye).

**Doğrulama (İstemci tarafı):**
1. Timestamp'in güncelliğini kontrol et (±5 dakika).
2. Servisle paylaşılan `webhook_secret` kullanarak imzayı hesapla ve header'daki ile karşılaştır.

## 3. Payload Formatı

```json
{
  "invoice_id": 123,
  "idempotency_key": "order_456",
  "status": "approved",
  "ettn": "550e8400-e29b-41d4-a716-446655440000",
  "invoice_number": "ABC2026000000001",
  "pdf_url": "https://efatura.guezelwebdesign.com/v1/invoices/123/pdf",
  "error_message": null,
  "timestamp": "2026-05-16T12:10:00Z"
}
```

## 4. Retry Politikası

BullMQ `webhook-queue` kullanılacak:
- Deneme 1: Hemen
- Deneme 2: 1 dk sonra
- Deneme 3: 5 dk sonra
- Deneme 4: 30 dk sonra
- Deneme 5: 2 saat sonra
