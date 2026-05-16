# Nilvera Mapping — Faz 2

> **Durum:** API uçları Nilvera GitBook ile doğrulandı (2026-05-16).
> **Antigravity:** sandbox E2E kanıtı `docs/VERIFY-FAZ2.md` checklist'ine göre bekliyor.

## Kaynaklar

- Genel API: https://developer.nilvera.com/
- Taslak oluştur: https://developer.nilvera.com/api/e-arsiv-api/taslak-faturalar/taslak-olusturur
- Onayla gönder: https://developer.nilvera.com/api/e-arsiv-api/taslak-faturalar/taslagi-onaylayip-gonderir
- Statü: https://developer.nilvera.com/api/e-arsiv-api/e-arsiv-faturalar/faturanin-statu-bilgilerini-getirir
- Taslak PDF: https://developer.nilvera.com/api/e-arsiv-api/taslak-faturalar/taslagin-pdfi-getirilir

## Ortam ve auth

| Ortam | Base URL |
|---|---|
| Test | `https://apitest.nilvera.com` |
| Canlı | `https://api.nilvera.com` |

Tüm e-arşiv uçları `{base}/earchive/...` altındadır. Kod `base_url` sonuna `/earchive` ekler.

```http
Authorization: Bearer <API KEY>
Content-Type: application/json
```

Tenant credential JSON:

```json
{
  "api_key": "...",
  "base_url": "https://apitest.nilvera.com",
  "company_vkn": "..."
}
```

Alias: `apiKey`, `baseUrl`, `companyVkn`. Credential loglanmaz.

## Akış (kod)

```
POST /earchive/Draft/Create          → { UUID, InvoiceNumber? }
POST /earchive/Draft/ConfirmAndSend  → body: ["<uuid>"]
GET  /earchive/Invoices/{UUID}/Status → StatusCode: succeed|waiting|error
GET  /earchive/Draft/{UUID}/pdf      → PDF binary
```

`NilveraProvider.create()` bu sırayı uygular. `StatusCode === succeed` → `approved`.

## İç model eşlemesi

`buildInvoiceRequest()` → `InvoiceRequest` (TL, satır KDV) → `mapInvoiceRequestToNilveraDraft()`:

| InvoiceRequest | Nilvera |
|---|---|
| `buyer.tcknVkn` | `CustomerInfo.TaxNumber` |
| `buyer.name` | `CustomerInfo.Name` |
| `lines[].unitPriceTRY` | `InvoiceLines[].Price` |
| `lines[].vatTRY` | `InvoiceLines[].KDVTotal` |
| `totalsTRY.gross` | `InvoiceInfo.PayableAmount` |

## Mock mod

`EFATURA_NILVERA_MOCK=true` veya test tenant + boş `api_key` → onaylı mock ETTN (unit/CI). Sandbox kabulü için **kapalı** olmalı.

## Antigravity sonrası

Checklist doldurulunca bu dosyaya örnek başarılı `UUID` / payload notu eklenebilir (credential içermez).
