# Yeni Tenant Ekleme Runbook (portföy projeleri → e-fatura-service)

> Merkezi servis multi-tenant: her proje bir **tenant**. Yeni proje
> e-Arşiv isterse **çekirdek/altyapı değişmez**; tenant kaydı + ince istemci.
> İlk uygulayan: **GoldMoodAstro** (sportoonline'dan sonra).

## Karar matrisi — iş/idari (Faz 0 tekrarı GEREKİR Mİ?)

| Durum | Faz 0 | Maliyet |
|---|---|---|
| **Aynı firma/VKN** (sportoonline ile) | ❌ Tekrar YOK | Ek sözleşme/mükellefiyet yok; mevcut Nilvera hesabı kapsar |
| Farklı firma/VKN | ✅ Yeni Faz 0 (`FAZ-0-ONKOSULLAR.md`) | Ayrı Nilvera hesabı + mükellefiyet |

> **GoldMoodAstro: aynı firma/VKN** (kullanıcı teyidi 2026-05-16) → Faz 0 tekrarı
> yok. Sportoonline tenant'ının Nilvera credential'ı aynı; yalnız yeni tenant_key.

## Adımlar

### 1. Tenant kaydı (servis DB)
- `tenants` satırı: `tenant_key` (örn. `goldmoodastro`), VKN/ünvan/adres
  (aynı firma → sportoonline ile aynı VKN), `integrator_driver` (`nilvera`),
  `integrator_credentials` (aynı firma → aynı Nilvera key, **şifreli**),
  `webhook_url` (projenin callback'i), `webhook_secret` (yeni üret),
  `api_key` (yeni üret, hash'lenir), `tax_profile`, `mode`.
- ALTER yok (CLAUDE.md): seed SQL deseni veya admin ile eklenir.
- Çıktı: projeye özel `X-Api-Key` + `webhook_secret`.

### 2. İnce istemci — **projenin stack'ine göre** (kod kopyası DEĞİL, desen aynı)

| Proje | Stack | İstemci |
|---|---|---|
| sportoonline | Laravel | `App\Services\EInvoiceClient` (PHP) — `HANDOFF-FAZ5-SPORTOONLINE.md` |
| **GoldMoodAstro** | **Bun + TS** (Fastify ailesi) | TS HTTP client — ayrı HANDOFF (aşağıda) |

Her istemci aynı **donmuş API-CONTRACT**'a konuşur:
`POST /v1/invoices` (X-Api-Key + Idempotency-Key=order/ödeme id), webhook imza
doğrulama (HMAC D4: `sha256=`+HMAC(`ts.rawBody`, secret), ±300s), `e_invoices`
özet tablo (projenin DB'sinde, ALTER yok), config bloğu (`.env`, commit yok).

Bileşenler (her stack'te muadili):
- HTTP client: `create/getStatus/getPdf/cancel`
- Satış/ödeme tamamlandı tetiği → kuyruk/job → servise `create`
- Webhook endpoint (`/webhooks/einvoice`) — imza doğrula → özet güncelle (idempotent)
- `e_invoices` özet tablo migration
- `EINVOICE_ENABLED=false` ile deploy → servis canlı olunca aç

### 3. Doğrulama
- Sandbox tenant + test ödemesi → PDF+ETTN, iptal/iade, webhook, idempotency.
- Mali müşavir KDV/senaryo teyidi (aynı firma → sportoonline ile aynı profil
  büyük olasılıkla; yine de proje gelir modeli farklıysa gözden geçir).

## GoldMoodAstro — özel notlar

- **Gelir modeli:** web/site ödemesi (Iyzico/Stripe) — sportoonline'a en yakın;
  ödeme tamamlanınca fatura. (Mobil in-app satın alma DEĞİL → Apple/Google
  merchant-of-record komplikasyonu yok.)
- **Stack:** backend Bun+TS → istemci TS; sportoonline Laravel kodunun **kopyası
  değil**, aynı kontrat/desenin TS muadili. Ayrı HANDOFF spec'i Claude üretir.
- **Sıra/gate:** ⏸ **Sportoonline Nilvera'da canlı (gerçek fatura teyitli)
  OLMADAN goldmoodastro'ya BAŞLAMA** (kullanıcı kararı 2026-05-16). Şimdilik
  yalnız plan; sportoonline yeşil → goldmoodastro tenant + TS istemci sırada.
- Proje içi plan: `goldmoodastro/doc/E-ARSIV-PLAN.md` (bu runbook'un projeye
  özel özeti).

## Sonraki tenant'lar
Kamanilan, GZLTemizlik, konigsmassage… aynı runbook. Aynı firma/VKN ise Faz 0
yok; farklıysa `FAZ-0-ONKOSULLAR.md`. Servis çekirdeği her zaman dokunulmaz.
