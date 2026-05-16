# e-fatura-service — API Kontratı v1 (DONMUŞ — Faz 1)

> Bu kontrat Faz 1 sonunda kilitlenir. Faz 5 (sportoonline ince istemci) buna
> karşı **mock servisle paralel** geliştirilir. Değişiklik = yeni sürüm (`/v2`).
> Karar referansları WORK-PLAN.md §2 (D1–D4).

## Genel

- Base: `https://efatura.guezelwebdesign.com` (prod), `http://localhost:<port>` (dev).
- İçerik tipi: `application/json; charset=utf-8` (PDF hariç).
- Tüm tarihler ISO-8601 UTC (`2026-05-16T10:00:00.000Z`).
- Para alanları string-decimal (`"199.90"`) — float yuvarlama yok.

### Kimlik & başlıklar

| Header | Zorunlu | Açıklama |
|---|---|---|
| `X-Api-Key` | evet | Tenant API anahtarı. Servis sha256'sını `tenants.api_key_hash` ile eşler (D2). |
| `Idempotency-Key` | `POST /v1/invoices`'te evet | Genelde `order_id`. `UNIQUE(tenant_id, key)` (D3). |
| `Content-Type` | gövde varsa evet | `application/json` |

IP allowlist tanımlıysa (D2) ve istek dışı IP'den ise `403 ip_not_allowed`.

### Hata zarfı (tüm 4xx/5xx)

```json
{ "error": { "code": "string_snake_case", "message": "okunur açıklama", "details": {} } }
```

| HTTP | code | Durum |
|---|---|---|
| 400 | `validation_error` | gövde/şema hatalı (`details` alan listesi) |
| 401 | `unauthorized` | X-Api-Key yok/yanlış |
| 403 | `ip_not_allowed` | IP allowlist reddi |
| 403 | `tenant_inactive` | Tenant pasif |
| 404 | `invoice_not_found` | id bu tenant'a ait değil/yok |
| 409 | `idempotency_conflict` | aynı key farklı payload ile geldi |
| 422 | `invoice_rule_violation` | iptal süresi geçti, geçersiz VKN vb. |
| 429 | `rate_limited` | rate limit |
| 502 | `integrator_error` | entegratör/GİB hatası (retry edilebilir) |
| 503 | `service_unavailable` | kuyruk/redis down |

---

## `POST /v1/invoices` — Fatura oluştur

Asenkron. Servis kaydı `pending` açar, kuyruğa atar, hemen döner (satış akışı bloke olmaz).

**İstek gövdesi:**
```json
{
  "buyer": {
    "type": "person | company",
    "name": "Ad Soyad / Ünvan",
    "tckn_vkn": "11111111111",
    "email": "musteri@example.com",
    "address": "Açık adres",
    "city": "İstanbul",
    "country": "Türkiye"
  },
  "lines": [
    { "name": "Ürün A", "quantity": 2, "unit": "Adet",
      "unit_price": "100.00", "vat_rate": 20, "discount": "0.00" }
  ],
  "shipping": { "amount": "29.90", "vat_rate": 20 },
  "global_discount": "0.00",
  "currency": "TRY",
  "exchange_rate": null,
  "issue_date": "2026-05-16T10:00:00.000Z",
  "note": "Sipariş #1234"
}
```
Kurallar: `currency != TRY` ise `exchange_rate` zorunlu; sonuç fatura TL (D8).
Tutar matematiği serviste yeniden hesaplanır (istemci toplamına güvenilmez).

**Yanıt — yeni (202):**
```json
{ "invoice_id": 123, "status": "pending", "idempotency_key": "order-1234" }
```
**Yanıt — tekrar/aynı key+aynı payload (200):** mevcut kaydın güncel durumu (aynı şema, gerçek `status`). Farklı payload → `409 idempotency_conflict` (D3).

---

## `GET /v1/invoices/{id}` — Durum sorgu (idempotent poll)

**200:**
```json
{
  "invoice_id": 123, "status": "approved", "type": "earsiv",
  "ettn": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "invoice_number": "SPO2026000001234",
  "currency": "TRY", "total": "229.90", "tax_total": "38.32",
  "pdf_url": "/v1/invoices/123/pdf",
  "error_message": null,
  "created_at": "...", "sent_at": "...", "cancelled_at": null
}
```

## `GET /v1/invoices/{id}/pdf` — PDF

- Hazırsa `302` → imzalı geçici URL **veya** `200 application/pdf` (binary).
- Henüz yoksa `409 pdf_not_ready`.

## `POST /v1/invoices/{id}/cancel` — İptal / iade

**İstek:** `{ "reason": "Müşteri iadesi" }`
İptal süresi içindeyse iptal, geçtiyse iade faturası — kural serviste (D6, Faz 4).
**202:** `{ "invoice_id": 123, "status": "cancelled | refunded | pending" }`
Süre/muhasebe ihlali → `422 invoice_rule_violation`.

## `POST /v1/webhooks/test` — Callback doğrulama

Tenant `webhook_url`'ine imzalı test POST'u atar; istemci 2xx dönerse `200 { "ok": true }`, dönmezse `502 webhook_unreachable`.

## `GET /healthz` — Liveness

`200 { "status": "ok", "redis": "up", "db": "up" }`. PM2/Nginx kullanır, auth yok.

---

## Webhook: servis → istemci

`sent | approved | failed | cancelled | refunded` geçişinde tenant `webhook_url`'ine POST.

**Başlıklar:**
| Header | Açıklama |
|---|---|
| `X-Efatura-Event` | `invoice.sent` … |
| `X-Efatura-Timestamp` | ISO-8601 UTC; istemci ±5dk dışını reddetmeli (replay, D4) |
| `X-Efatura-Signature` | `sha256=` + HMAC-SHA256(`timestamp + "." + rawBody`, `webhook_secret`) |

**Gövde:**
```json
{
  "event": "invoice.approved",
  "invoice_id": 123,
  "idempotency_key": "order-1234",
  "status": "approved",
  "ettn": "f47ac10b-...",
  "invoice_number": "SPO2026000001234",
  "pdf_url": "/v1/invoices/123/pdf",
  "occurred_at": "2026-05-16T10:01:00.000Z"
}
```
İstemci 2xx dönmezse üstel retry (1m,5m,30m,2h,6h; 5 deneme). İstemci ayrıca
`GET /v1/invoices/{id}` ile poll edebilir (varsayılan: webhook, poll fallback).

İstemci doğrulama: timestamp tazeliği → imza eşit (sabit-zaman karşılaştırma) → `idempotency_key` ile siparişi eşle → durumu/pdf'i güncelle (idempotent; tekrar gelen aynı event no-op).

---

## Mock notu (Faz 5 paralel geliştirme)

sportoonline ekibi bu kontrata karşı bir mock e-fatura-service ile geliştirir:
`POST /v1/invoices` → 202; kısa süre sonra `invoice.approved` webhook'u +
`GET` poll cevabı. Gerçek servis Faz 2 sonrası bağlanır — kontrat değişmez.
